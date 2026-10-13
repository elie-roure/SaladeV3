import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Root from './Root.vue'
import { api, type Document } from './services/api'
import { createTournament } from './domain/tournament'

vi.mock('./services/api', () => ({
  api: {
    session: vi.fn(), login: vi.fn(), accept: vi.fn(), logout: vi.fn(), list: vi.fn(),
    get: vi.fn(), create: vi.fn(), save: vi.fn(), accounts: vi.fn(), invitation: vi.fn(), setActive: vi.fn(),
  },
}))
const admin = { id: 'admin-id', email: 'admin@example.com', role: 'admin' as const }
const doc = (): Document => ({
  id: 'tournament-id', name: 'Tournoi club', revision: 1, updated_at: new Date().toISOString(),
  data: createTournament({ players: ['Alice', 'Bob', 'Camille', 'David'], courts: 1, duration: 300, totalRounds: 3 }),
})
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  history.replaceState(null, '', '/')
  vi.mocked(api.session).mockResolvedValue(null)
  vi.mocked(api.list).mockResolvedValue([])
  vi.mocked(api.accounts).mockResolvedValue([{ ...admin, active: true }])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; history.replaceState(null, '', '/') })
async function boot() { wrapper = mount(Root); await flushPromises(); return wrapper }

describe('espace privé Vue', () => {
  it('montre uniquement la connexion avant authentification', async () => {
    const app = await boot()
    expect(app.find('#email').exists()).toBe(true)
    expect(app.find('#names').exists()).toBe(false)
    expect(api.list).not.toHaveBeenCalled()
  })
  it('signale une panne de session sans afficher les tournois', async () => {
    vi.mocked(api.session).mockRejectedValue(new Error('Serveur indisponible'))
    const app = await boot()
    expect(app.get('[role="alert"]').text()).toContain('Serveur indisponible')
    expect(app.find('#names').exists()).toBe(false)
  })
  it('connecte l’organisateur, ouvre un tournoi partagé et sauvegarde les scores', async () => {
    const data = doc()
    vi.mocked(api.login).mockResolvedValue(admin)
    vi.mocked(api.list).mockResolvedValue([data])
    vi.mocked(api.get).mockResolvedValue(data)
    vi.mocked(api.save).mockImplementation(async (previous, next) => ({ ...previous, data: next, revision: previous.revision + 1 }))
    const app = await boot()
    await app.get('#email').setValue('admin@example.com')
    await app.get('#password').setValue('Mot-de-passe-long-123')
    await app.get('form').trigger('submit')
    await flushPromises()
    expect(api.login).toHaveBeenCalledWith('admin@example.com', 'Mot-de-passe-long-123')
    await app.get('.tournament-list button').trigger('click')
    await flushPromises()
    await app.get('#score-0-0').setValue(25)
    await flushPromises()
    expect(api.save).toHaveBeenCalledOnce()
    expect(app.text()).toContain('Enregistré sur le serveur')
  })
  it('garde un lien d’invitation même si un autre compte est connecté', async () => {
    history.replaceState(null, '', '/#invitation=private-token')
    vi.mocked(api.session).mockResolvedValue(admin)
    vi.mocked(api.accept).mockResolvedValue({ ...admin, email: 'new@example.com', role: 'organizer' })
    const app = await boot()
    expect(app.find('#password-confirmation').exists()).toBe(true)
    await app.get('#password').setValue('Nouveau-mot-de-passe-123')
    await app.get('#password-confirmation').setValue('Nouveau-mot-de-passe-123')
    await app.get('form').trigger('submit')
    await flushPromises()
    expect(api.accept).toHaveBeenCalledWith('private-token', 'Nouveau-mot-de-passe-123')
    expect(location.hash).toBe('')
    expect(app.text()).toContain('new@example.com')
  })
  it('permet à l’administrateur de générer un lien privé', async () => {
    vi.mocked(api.session).mockResolvedValue(admin)
    vi.mocked(api.invitation).mockResolvedValue('https://volant.example.com/#invitation=secret')
    const app = await boot()
    await app.findAll('button').find(button => button.text() === 'Gérer les accès')!.trigger('click')
    await flushPromises()
    await app.get('#invite-email').setValue('new@example.com')
    await app.get('.admin-panel form').trigger('submit')
    await flushPromises()
    expect(api.invitation).toHaveBeenCalledWith('new@example.com', 'invite')
    expect(app.get('#invite-link').element).toHaveProperty('value', 'https://volant.example.com/#invitation=secret')
  })
})
