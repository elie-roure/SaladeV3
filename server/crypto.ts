import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}
export const token = () => randomBytes(32).toString('hex')
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')
export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128
}
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await derive(password, salt)
  return `${salt}:${derived.toString('hex')}`
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, hash] = encoded.split(':')
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false
  const derived = await derive(password, salt)
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived)
}
