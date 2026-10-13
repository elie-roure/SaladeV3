import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { validateTournament } from '../src/domain/tournament'
import type { Database } from './database'
import { hashPassword, hashToken, normalizeEmail, token, validPassword, verifyPassword } from './crypto'

export interface User { id: string; email: string; role: 'admin' | 'organizer' }
interface Account extends User { password_hash: string; active: boolean }
export interface ServerConfig { origin: string; production: boolean; dist?: string }
const cookieName = 'volant_session'
const sessionSeconds = 7 * 24 * 60 * 60
const tokenPattern = /^[a-f0-9]{64}$/
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}
const reject = (status: number, message: string): never => { throw new HttpError(status, message) }
function sessionToken(req: Request) {
  const found = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))
  const value = found?.slice(cookieName.length + 1)
  return value && tokenPattern.test(value) ? value : null
}
function nameValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 ? value.trim() : reject(400, 'Le nom du tournoi doit contenir entre 1 et 100 caractères.')
}
function dataValue(value: unknown) {
  try { return validateTournament(value) }
  catch (cause) { return reject(400, cause instanceof Error ? cause.message : 'Tournoi invalide.') }
}
export function createServer(db: Database, config: ServerConfig) {
  const app = express()
  app.disable('x-powered-by')
  // Heroku termine HTTPS au proxy directement devant le dyno.
  if (config.production) app.set('trust proxy', 1)
  app.use((req, res, next) => {
    if (config.production && !req.secure) { res.redirect(308, config.origin + req.originalUrl); return }
    next()
  })
  app.use(helmet())
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })
  app.use('/api', express.json({ limit: '2mb' }))
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers.origin !== config.origin || req.headers['x-volant-request'] !== '1' || !req.is('application/json'))) {
      return next(new HttpError(403, 'Origine de la requête refusée.'))
    }
    next()
  })
  async function user(req: Request): Promise<User | null> {
    const value = sessionToken(req)
    if (!value) return null
    const result = await db.query<User>(
      `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE AND s.auth_version = u.auth_version`,
      [hashToken(value)],
    )
    return result.rows[0] ?? null
  }
  async function authorized(req: Request, admin = false): Promise<User> {
    const account = await user(req)
    if (!account) return reject(401, 'Connectez-vous pour accéder à cette application.')
    if (admin && account.role !== 'admin') return reject(403, 'Accès réservé à l’administrateur.')
    return account
  }
  async function rateLimit(req: Request) {
    await db.query('DELETE FROM request_limits WHERE expires_at < NOW()')
    const key = hashToken(`${req.ip}:authentication`)
    const result = await db.query<{ count: number }>(
      `INSERT INTO request_limits (key, count, expires_at) VALUES ($1,1,NOW() + INTERVAL '15 minutes')
       ON CONFLICT (key) DO UPDATE SET count = request_limits.count + 1 RETURNING count`, [key],
    )
    if (result.rows[0].count > 20) return reject(429, 'Trop de tentatives. Réessayez dans 15 minutes.')
  }
  async function issueSession(id: string, res: Response) {
    const value = token()
    await db.query('DELETE FROM sessions WHERE expires_at < NOW()')
    await db.query(
      `INSERT INTO sessions (token_hash,user_id,auth_version,expires_at)
       SELECT $1,id,auth_version,NOW() + INTERVAL '7 days' FROM users WHERE id = $2`,
      [hashToken(value), id],
    )
    res.cookie(cookieName, value, { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/', maxAge: sessionSeconds * 1000 })
  }
  app.get('/api/health', async (_req, res) => { await db.query('SELECT 1'); res.json({ status: 'ok' }) })
  app.get('/api/session', async (req, res) => res.json({ user: await user(req) }))
  app.post('/api/login', async (req, res) => {
    await rateLimit(req)
    const email = normalizeEmail(req.body?.email)
    const password: unknown = req.body?.password
    if (!email || !validPassword(password)) return reject(401, 'E-mail ou mot de passe incorrect.')
    const result = await db.query<Account>('SELECT id,email,role,password_hash,active FROM users WHERE email=$1', [email])
    const account = result.rows[0]
    // Même coût de dérivation pour un compte inexistant.
    const hash = account?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`
    if (!await verifyPassword(password, hash) || !account?.active) return reject(401, 'E-mail ou mot de passe incorrect.')
    await issueSession(account.id, res)
    res.json({ user: { id: account.id, email: account.email, role: account.role } })
  })
  app.post('/api/logout', async (req, res) => {
    const value = sessionToken(req)
    if (value) await db.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(value)])
    res.clearCookie(cookieName, { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' })
    res.json({ ok: true })
  })
  app.post('/api/accept-invitation', async (req, res) => {
    await rateLimit(req)
    const raw: unknown = req.body?.token
    const password: unknown = req.body?.password
    if (typeof raw !== 'string' || !tokenPattern.test(raw) || !validPassword(password)) return reject(400, 'Lien invalide ou mot de passe hors limites (12 à 128 caractères).')
    const invite = await db.query<{ email: string; role: User['role']; kind: string }>(
      'SELECT email,role,kind FROM invitations WHERE token_hash=$1 AND expires_at>NOW()', [hashToken(raw)],
    )
    const entry = invite.rows[0]
    if (!entry) return reject(400, 'Invitation invalide, expirée ou déjà utilisée.')
    const passwordHash = await hashPassword(password)
    let result
    if (entry.kind === 'reset') {
      result = await db.query<User>(
        `WITH consumed AS (DELETE FROM invitations WHERE token_hash=$1 AND expires_at>NOW() RETURNING email)
         UPDATE users SET password_hash=$2, auth_version=auth_version+1
         FROM consumed WHERE users.email=consumed.email AND users.active=TRUE RETURNING users.id,users.email,users.role`,
        [hashToken(raw), passwordHash],
      )
    } else {
      result = await db.query<User>(
        `WITH consumed AS (DELETE FROM invitations WHERE token_hash=$1 AND expires_at>NOW() RETURNING email,role)
         INSERT INTO users (id,email,role,password_hash) SELECT $2,email,role,$3 FROM consumed RETURNING id,email,role`,
        [hashToken(raw), randomUUID(), passwordHash],
      )
    }
    const account = result.rows[0]
    if (!account) return reject(400, 'Invitation invalide, expirée ou déjà utilisée.')
    await db.query('DELETE FROM invitations WHERE email=$1', [account.email])
    await issueSession(account.id, res)
    res.json({ user: account })
  })
  app.get('/api/users', async (req, res) => {
    await authorized(req, true)
    res.json({ users: (await db.query('SELECT id,email,role,active FROM users ORDER BY email')).rows })
  })
  app.post('/api/invitations', async (req, res) => {
    const admin = await authorized(req, true)
    const email = normalizeEmail(req.body?.email)
    const kind = req.body?.kind
    if (!email || !['invite', 'reset'].includes(kind)) return reject(400, 'E-mail ou type de lien invalide.')
    const existing = (await db.query<Account>('SELECT id,email,role,active,password_hash FROM users WHERE email=$1', [email])).rows[0]
    if (kind === 'invite' && existing) return reject(409, 'Ce compte existe déjà. Utilisez un lien de réinitialisation.')
    if (kind === 'reset' && (!existing || !existing.active)) return reject(400, 'Ce compte n’existe pas ou est désactivé.')
    const raw = token()
    await db.query('DELETE FROM invitations WHERE expires_at<NOW()')
    await db.query(
      `INSERT INTO invitations (token_hash,email,role,kind,expires_at,created_by) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '48 hours',$5)
       ON CONFLICT (email) DO UPDATE SET token_hash=EXCLUDED.token_hash,role=EXCLUDED.role,kind=EXCLUDED.kind,
         expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by`,
      [hashToken(raw), email, existing?.role ?? 'organizer', kind, admin.id],
    )
    res.status(201).json({ url: `${config.origin}/#invitation=${raw}`, expiresInHours: 48 })
  })
  app.patch('/api/users/:id', async (req, res) => {
    const admin = await authorized(req, true)
    if (!uuidPattern.test(String(req.params.id)) || typeof req.body?.active !== 'boolean') return reject(400, 'Compte ou statut invalide.')
    if (req.params.id === admin.id) return reject(400, 'Vous ne pouvez pas désactiver votre propre compte.')
    const result = await db.query('UPDATE users SET active=$1,auth_version=auth_version+1 WHERE id=$2 AND role=$3 RETURNING id', [req.body.active, req.params.id, 'organizer'])
    if (!result.rows.length) return reject(404, 'Compte organisateur introuvable.')
    await db.query('DELETE FROM invitations WHERE email=(SELECT email FROM users WHERE id=$1)', [req.params.id])
    res.json({ ok: true })
  })
  app.get('/api/tournaments', async (req, res) => {
    await authorized(req)
    res.json({ tournaments: (await db.query('SELECT id,name,revision,updated_at FROM tournaments ORDER BY updated_at DESC')).rows })
  })
  app.post('/api/tournaments', async (req, res) => {
    const account = await authorized(req)
    const name = nameValue(req.body?.name)
    const data = dataValue(req.body?.data)
    const result = await db.query(
      'INSERT INTO tournaments (id,name,data,updated_by) VALUES ($1,$2,$3,$4) RETURNING id,name,data,revision,updated_at',
      [randomUUID(), name, JSON.stringify(data), account.id],
    )
    res.status(201).json(result.rows[0])
  })
  app.get('/api/tournaments/:id', async (req, res) => {
    await authorized(req)
    if (!uuidPattern.test(String(req.params.id))) return reject(400, 'Identifiant de tournoi invalide.')
    const result = await db.query('SELECT id,name,data,revision,updated_at FROM tournaments WHERE id=$1', [req.params.id])
    if (!result.rows.length) return reject(404, 'Tournoi introuvable.')
    res.json(result.rows[0])
  })
  app.put('/api/tournaments/:id', async (req, res) => {
    const account = await authorized(req)
    if (!uuidPattern.test(String(req.params.id)) || !Number.isSafeInteger(req.body?.revision) || req.body.revision < 1) return reject(400, 'Identifiant ou version invalide.')
    const name = nameValue(req.body?.name)
    const data = dataValue(req.body?.data)
    const result = await db.query(
      `UPDATE tournaments SET name=$1,data=$2,revision=revision+1,updated_at=NOW(),updated_by=$3
       WHERE id=$4 AND revision=$5 RETURNING id,name,data,revision,updated_at`,
      [name, JSON.stringify(data), account.id, req.params.id, req.body.revision],
    )
    if (!result.rows.length) return reject(409, 'Ce tournoi a été modifié par un autre organisateur. Exportez vos modifications puis rechargez la version du serveur.')
    res.json(result.rows[0])
  })
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route introuvable.')))
  if (config.dist) {
    app.use(express.static(config.dist))
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(config.dist!, 'index.html')))
  }
  const errors: ErrorRequestHandler = (cause: unknown, _req, res, _next) => {
    if (cause instanceof HttpError) { res.status(cause.status).json({ error: cause.message }); return }
    if (cause instanceof SyntaxError) { res.status(400).json({ error: 'JSON invalide.' }); return }
    if (typeof cause === 'object' && cause !== null && 'type' in cause && cause.type === 'entity.too.large') {
      res.status(413).json({ error: 'La requête dépasse la limite de 2 Mo.' }); return
    }
    // Ne pas journaliser le corps des requêtes : il peut contenir des identifiants.
    console.error('Échec de la requête API', cause instanceof Error ? cause.name : 'Erreur inconnue')
    res.status(500).json({ error: 'Erreur serveur. Réessayez ; vos modifications ne sont pas confirmées.' })
  }
  app.use(errors)
  return app
}
