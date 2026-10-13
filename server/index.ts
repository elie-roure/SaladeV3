import path from 'node:path'
import { createServer } from './app'
import { configuration } from './config'
import { connectDatabase } from './database'

const config = configuration()
const db = connectDatabase()
await db.query('SELECT 1')
const server = createServer(db, { ...config, dist: path.resolve('dist') }).listen(config.port, '0.0.0.0', () => {
  console.info(`Serveur Salade sur le port ${config.port}`)
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => { void db.end().then(() => process.exit(0)) })
    setTimeout(() => process.exit(1), 10000).unref()
  })
}
