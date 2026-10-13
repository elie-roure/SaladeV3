import 'dotenv/config'
import pg from 'pg'

export interface Database {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>
}
export function connectDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est obligatoire.')
  const connection = new URL(process.env.DATABASE_URL)
  const production = process.env.NODE_ENV === 'production'
  const ca = process.env.PG_CA_CERT
  if (production || ca) {
    // Les options SSL dans l'URL peuvent remplacer celles de pg, y compris le CA.
    for (const option of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) connection.searchParams.delete(option)
  }
  return new pg.Pool({
    connectionString: connection.toString(),
    max: 5,
    ...(production || ca ? { ssl: { ...(ca ? { ca } : {}), rejectUnauthorized: true } } : {}),
  })
}
export async function migrate(db: Database) {
  for (const statement of [
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','organizer')), active BOOLEAN NOT NULL DEFAULT TRUE,
      auth_version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      auth_version INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS invitations (
      token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','organizer')),
      kind TEXT NOT NULL CHECK (kind IN ('invite','reset')), expires_at TIMESTAMPTZ NOT NULL,
      created_by UUID REFERENCES users(id)
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS invitations_email_unique ON invitations(email)',
    `CREATE TABLE IF NOT EXISTS tournaments (
      id UUID PRIMARY KEY, name TEXT NOT NULL, data JSONB NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID NOT NULL REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS request_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    )`,
  ]) await db.query(statement)
}
