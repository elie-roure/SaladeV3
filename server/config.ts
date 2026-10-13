import 'dotenv/config'

export function configuration() {
  if (!process.env.APP_ORIGIN) throw new Error('APP_ORIGIN est obligatoire (URL publique exacte).')
  const url = new URL(process.env.APP_ORIGIN)
  if (url.origin !== process.env.APP_ORIGIN) throw new Error('APP_ORIGIN ne doit contenir ni chemin ni barre finale.')
  const production = process.env.NODE_ENV === 'production'
  if (production && url.protocol !== 'https:') throw new Error('HTTPS est obligatoire en production.')
  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT invalide.')
  return { origin: url.origin, production, port }
}
