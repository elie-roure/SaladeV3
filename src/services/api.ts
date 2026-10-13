import { validateTournament, type Tournament } from '../domain/tournament'

export interface User { id: string; email: string; role: 'admin' | 'organizer' }
export interface Account extends User { active: boolean }
export interface Summary { id: string; name: string; revision: number; updated_at: string }
export interface Document extends Summary { data: Tournament }
export class ApiError extends Error {
  constructor(readonly status: number, text: string) { super(text) }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse serveur invalide.')
  return value as Record<string, unknown>
}
async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Volant-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const error = object(value).error
    throw new ApiError(response.status, typeof error === 'string' ? error : 'La requête a échoué.')
  }
  return value
}
function user(value: unknown): User {
  const data = object(value)
  if (typeof data.id !== 'string' || typeof data.email !== 'string' || !['admin', 'organizer'].includes(String(data.role))) throw new Error('Compte serveur invalide.')
  return { id: data.id, email: data.email, role: data.role === 'admin' ? 'admin' : 'organizer' }
}
function summary(value: unknown): Summary {
  const data = object(value)
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.revision !== 'number' ||
    !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.updated_at !== 'string') throw new Error('Tournoi serveur invalide.')
  return { id: data.id, name: data.name, revision: data.revision, updated_at: data.updated_at }
}
function document(value: unknown): Document {
  return { ...summary(value), data: validateTournament(object(value).data) }
}
export const api = {
  async session(): Promise<User | null> {
    const data = object(await request('/session'))
    return data.user === null ? null : user(data.user)
  },
  async login(email: string, password: string) { return user(object(await request('/login', 'POST', { email, password })).user) },
  async accept(token: string, password: string) { return user(object(await request('/accept-invitation', 'POST', { token, password })).user) },
  async logout() { await request('/logout', 'POST', {}) },
  async list(): Promise<Summary[]> {
    const rows = object(await request('/tournaments')).tournaments
    if (!Array.isArray(rows)) throw new Error('Liste des tournois invalide.')
    return rows.map(summary)
  },
  async get(id: string) { return document(await request(`/tournaments/${encodeURIComponent(id)}`)) },
  async create(name: string, data: Tournament) { return document(await request('/tournaments', 'POST', { name, data })) },
  async save(doc: Document, data: Tournament) {
    return document(await request(`/tournaments/${encodeURIComponent(doc.id)}`, 'PUT', { name: doc.name, revision: doc.revision, data }))
  },
  async accounts(): Promise<Account[]> {
    const rows = object(await request('/users')).users
    if (!Array.isArray(rows)) throw new Error('Liste des comptes invalide.')
    return rows.map(value => {
      const active = object(value).active
      if (typeof active !== 'boolean') throw new Error('Statut du compte invalide.')
      return { ...user(value), active }
    })
  },
  async invitation(email: string, kind: 'invite' | 'reset') {
    const data = object(await request('/invitations', 'POST', { email, kind }))
    if (typeof data.url !== 'string') throw new Error('Lien serveur invalide.')
    return data.url
  },
  async setActive(id: string, active: boolean) { await request(`/users/${encodeURIComponent(id)}`, 'PATCH', { active }) },
}
