// Serveur de test isolé : aucune connexion à la base de production.
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { QueryResultRow } from 'pg'
import { createServer } from './app'
import { migrate, type Database } from './database'
import { hashPassword } from './crypto'

const postgres = new PGlite()
const db: Database = {
  async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    const result = await postgres.query<Row>(sql, values)
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
  },
}
await migrate(db)
await db.query('INSERT INTO users(id,email,role,password_hash) VALUES($1,$2,$3,$4)', [
  randomUUID(), 'admin@example.test', 'admin', await hashPassword('Test-only-password-123'),
])
const server = createServer(db, { origin: 'http://127.0.0.1:3001', production: false, dist: path.resolve('dist') })
  .listen(3001, '127.0.0.1', () => console.info('Serveur PostgreSQL de test sur 127.0.0.1:3001'))
process.once('SIGTERM', () => server.close(() => { void postgres.close() }))
