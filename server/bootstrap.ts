import { connectDatabase, migrate } from './database'
import { configuration } from './config'
import { hashToken, normalizeEmail, token } from './crypto'

const email = normalizeEmail(process.env.ADMIN_EMAIL)
if (!email) throw new Error('ADMIN_EMAIL doit contenir une adresse valide.')
const config = configuration()
const reset = process.argv.includes('--reset')
const db = connectDatabase()
try {
  await migrate(db)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE users, invitations IN EXCLUSIVE MODE')
    const admins = await client.query<{ id: string; email: string; active: boolean }>("SELECT id,email,active FROM users WHERE role='admin'")
    if (!reset && admins.rows.length) throw new Error('Un administrateur existe déjà. Aucun compte modifié.')
    if (reset && !admins.rows.some(admin => admin.email === email && admin.active)) throw new Error('ADMIN_EMAIL ne correspond pas à un administrateur actif.')
    await client.query("DELETE FROM invitations WHERE email=$1 OR (role='admin' AND kind='invite')", [email])
    const raw = token()
    await client.query(
      "INSERT INTO invitations (token_hash,email,role,kind,expires_at) VALUES ($1,$2,'admin',$3,NOW()+INTERVAL '48 hours')",
      [hashToken(raw), email, reset ? 'reset' : 'invite'],
    )
    await client.query('COMMIT')
    console.info(`Lien administrateur privé (48 h, usage unique) : ${config.origin}/#invitation=${raw}`)
  } catch (cause) { await client.query('ROLLBACK'); throw cause }
  finally { client.release() }
} finally { await db.end() }
