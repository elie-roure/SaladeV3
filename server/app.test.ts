// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { createServer } from './app'
import { migrate, type Database } from './database'
import { hashPassword, hashToken, token } from './crypto'
import { createTournament } from '../src/domain/tournament'

const postgres = new PGlite()
const db: Database = {
  async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    const result = await postgres.query<Row>(sql, values)
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
  },
}
const origin = 'http://127.0.0.1:5173'
const app = createServer(db, { origin, production: false })
const headers = { Origin: origin, 'X-Volant-Request': '1' }
let adminCookie = ''
let organizerCookie = ''
let adminId = ''
let organizerId = ''
let passwordHash = ''
const password = 'Une-phrase-secrete-123'
const tournament = () => createTournament({ players: ['Alice', 'Bob', 'Camille', 'David'], courts: 1, duration: 300, totalRounds: 8 })
beforeAll(async () => { await migrate(db); passwordHash = await hashPassword(password) }, 30000)
beforeEach(async () => {
  await db.query('TRUNCATE sessions,invitations,tournaments,request_limits,users CASCADE')
  adminId = randomUUID()
  organizerId = randomUUID()
  for (const [id, email, role] of [[adminId, 'admin@example.com', 'admin'], [organizerId, 'org@example.com', 'organizer']]) {
    await db.query('INSERT INTO users(id,email,role,password_hash) VALUES($1,$2,$3,$4)', [id, email, role, passwordHash])
  }
  for (const [id, assign] of [
    [adminId, (value: string) => { adminCookie = value }],
    [organizerId, (value: string) => { organizerCookie = value }],
  ] as const) {
    const raw = token()
    await db.query("INSERT INTO sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,1,NOW()+INTERVAL '1 day')", [hashToken(raw), id])
    assign(`volant_session=${raw}`)
  }
})
afterAll(async () => { await postgres.close() })

describe('accès privé et sessions PostgreSQL', () => {
  it('refuse les tournois aux visiteurs et les comptes aux organisateurs', async () => {
    await request(app).get('/api/tournaments').expect(401)
    await request(app).get('/api/users').set('Cookie', organizerCookie).expect(403)
    await request(app).post('/api/invitations').set(headers).set('Cookie', organizerCookie).send({ email: 'new@example.com', kind: 'invite' }).expect(403)
    await request(app).get('/api/session').expect(200, { user: null })
  })
  it('connecte un compte et détruit sa session à la déconnexion', async () => {
    const agent = request.agent(app)
    const response = await agent.post('/api/login').set(headers).send({ email: 'ADMIN@example.com', password }).expect(200)
    expect(response.body.user).toEqual({ id: adminId, email: 'admin@example.com', role: 'admin' })
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly')
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict')
    expect(response.body).not.toHaveProperty('token')
    await agent.get('/api/tournaments').expect(200)
    await agent.post('/api/logout').set(headers).send({}).expect(200)
    await agent.get('/api/tournaments').expect(401)
  })
  it('refuse un mauvais mot de passe et limite les tentatives en base', async () => {
    await request(app).post('/api/login').set(headers).send({ email: 'admin@example.com', password: 'Mauvaise-phrase-123' }).expect(401)
    await db.query('UPDATE request_limits SET count=20')
    await request(app).post('/api/login').set(headers).send({ email: 'admin@example.com', password }).expect(429)
  })
  it('refuse les mutations sans origine et en provenance d’un autre site', async () => {
    await request(app).post('/api/logout').send({}).expect(403)
    await request(app).post('/api/logout').set({ ...headers, Origin: 'https://other.example.com' }).send({}).expect(403)
    await request(app).post('/api/logout').set('Origin', origin).send({}).expect(403)
  })
  it('utilise un cookie Secure en production', async () => {
    const secureApp = createServer(db, { origin: 'https://volant.example.com', production: true })
    const response = await request(secureApp).post('/api/login').set({ ...headers, Origin: 'https://volant.example.com', 'X-Forwarded-Proto': 'https' }).send({ email: 'admin@example.com', password }).expect(200)
    expect(response.headers['set-cookie'][0]).toContain('Secure')
    await request(secureApp).get('/').expect(308).expect('Location', 'https://volant.example.com/')
  })
})

describe('invitations, récupération et révocation', () => {
  it('renouvelle atomiquement un lien et invalide le précédent', async () => {
    const first = await request(app).post('/api/invitations').set(headers).set('Cookie', adminCookie).send({ email: 'new@example.com', kind: 'invite' }).expect(201)
    const second = await request(app).post('/api/invitations').set(headers).set('Cookie', adminCookie).send({ email: 'new@example.com', kind: 'invite' }).expect(201)
    const oldToken = new URL(first.body.url).hash.replace('#invitation=', '')
    const newToken = new URL(second.body.url).hash.replace('#invitation=', '')
    await request(app).post('/api/accept-invitation').set(headers).send({ token: oldToken, password }).expect(400)
    await request(app).post('/api/accept-invitation').set(headers).send({ token: newToken, password }).expect(200)
  })
  it('crée une invitation à usage unique avec un mot de passe haché', async () => {
    const result = await request(app).post('/api/invitations').set(headers).set('Cookie', adminCookie).send({ email: 'new@example.com', kind: 'invite' }).expect(201)
    const raw = new URL(result.body.url).hash.replace('#invitation=', '')
    const agent = request.agent(app)
    await agent.post('/api/accept-invitation').set(headers).send({ token: raw, password }).expect(200)
    await agent.get('/api/tournaments').expect(200)
    await request(app).post('/api/accept-invitation').set(headers).send({ token: raw, password }).expect(400)
    const resultUser = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email=$1', ['new@example.com'])
    expect(resultUser.rows[0].password_hash).not.toBe(password)
    expect((await db.query('SELECT * FROM invitations')).rows).toHaveLength(0)
  })
  it('rejette un lien expiré et un mot de passe trop court', async () => {
    const raw = token()
    await db.query("INSERT INTO invitations(token_hash,email,role,kind,expires_at) VALUES($1,'new@example.com','organizer','invite',NOW()-INTERVAL '1 hour')", [hashToken(raw)])
    await request(app).post('/api/accept-invitation').set(headers).send({ token: raw, password }).expect(400)
    await request(app).post('/api/accept-invitation').set(headers).send({ token: raw, password: 'short' }).expect(400)
  })
  it('réinitialise le mot de passe et invalide les anciennes sessions', async () => {
    const result = await request(app).post('/api/invitations').set(headers).set('Cookie', adminCookie).send({ email: 'org@example.com', kind: 'reset' }).expect(201)
    const raw = new URL(result.body.url).hash.replace('#invitation=', '')
    const newPassword = 'Nouvelle-phrase-secrete-123'
    await request(app).post('/api/accept-invitation').set(headers).send({ token: raw, password: newPassword }).expect(200)
    await request(app).get('/api/tournaments').set('Cookie', organizerCookie).expect(401)
    await request(app).post('/api/login').set(headers).send({ email: 'org@example.com', password }).expect(401)
    await request(app).post('/api/login').set(headers).send({ email: 'org@example.com', password: newPassword }).expect(200)
  })
  it('désactive immédiatement un organisateur sans pouvoir désactiver l’administrateur', async () => {
    await request(app).patch(`/api/users/${adminId}`).set(headers).set('Cookie', adminCookie).send({ active: false }).expect(400)
    await request(app).patch(`/api/users/${organizerId}`).set(headers).set('Cookie', adminCookie).send({ active: false }).expect(200)
    await request(app).get('/api/tournaments').set('Cookie', organizerCookie).expect(401)
    await request(app).post('/api/login').set(headers).send({ email: 'org@example.com', password }).expect(401)
  })
})

describe('tournois partagés et conflits', () => {
  it('partage un tournoi entre deux organisateurs et bloque l’écrasement d’une version périmée', async () => {
    const result = await request(app).post('/api/tournaments').set(headers).set('Cookie', adminCookie).send({ name: 'Tournoi club', data: tournament() }).expect(201)
    const doc = result.body
    expect(doc.revision).toBe(1)
    const other = await request(app).get(`/api/tournaments/${doc.id}`).set('Cookie', organizerCookie).expect(200)
    expect(other.body.data).toEqual(doc.data)
    doc.data.rounds[0].matches[0].score = [5, 25]
    await request(app).put(`/api/tournaments/${doc.id}`).set(headers).set('Cookie', organizerCookie).send({ name: doc.name, data: doc.data, revision: 1 }).expect(200)
    const conflict = await request(app).put(`/api/tournaments/${doc.id}`).set(headers).set('Cookie', adminCookie).send({ name: doc.name, data: tournament(), revision: 1 }).expect(409)
    expect(conflict.body.error).toContain('autre organisateur')
    const latest = await request(app).get(`/api/tournaments/${doc.id}`).set('Cookie', adminCookie).expect(200)
    expect(latest.body.revision).toBe(2)
    expect(latest.body.data.rounds[0].matches[0].score).toEqual([5, 25])
  })
  it('rejette les tournois invalides et les identifiants malformés', async () => {
    await request(app).post('/api/tournaments').set(headers).set('Cookie', adminCookie).send({ name: 'Test', data: {} }).expect(400)
    await request(app).get('/api/tournaments/not-a-uuid').set('Cookie', adminCookie).expect(400)
    expect((await db.query('SELECT * FROM tournaments')).rows).toHaveLength(0)
  })
})
