import { connectDatabase, migrate } from './database'

const db = connectDatabase()
try { await migrate(db); console.info('Schéma PostgreSQL prêt.') }
finally { await db.end() }
