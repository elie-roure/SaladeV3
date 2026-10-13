import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { STORAGE_KEY } from './composables/useTournament'
import { createTournament, validateTournament, type Tournament } from './domain/tournament'

let wrapper: VueWrapper | undefined
const fixture = () => createTournament({ players: ['Alice <&>', 'Benoît', 'Chloé', 'David', 'Emma'], courts: 1, duration: 6, totalRounds: 2 })
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T12:00:00Z'))
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); localStorage.clear() })
async function boot(data?: Tournament) {
  if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  wrapper = mount(App)
  await flushPromises()
  return wrapper
}
const stored = () => validateTournament(JSON.parse(localStorage.getItem(STORAGE_KEY)!))

describe('application Vue', () => {
  it('enregistre les tournois partagés sans toucher au stockage local', async () => {
    const persist = vi.fn<(data: Tournament) => Promise<void>>().mockResolvedValue(undefined)
    wrapper = mount(App, { props: { remote: { initial: fixture(), persist } } })
    await flushPromises()
    await wrapper.get('#score-0-0').setValue(5)
    await wrapper.get('#score-0-1').setValue(25)
    await flushPromises()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist.mock.calls[0][0].rounds[0].matches[0].score).toEqual([5, null])
    expect(persist.mock.calls[1][0].rounds[0].matches[0].score).toEqual([5, 25])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(wrapper.text()).toContain('Enregistré sur le serveur')
  })
  it('suspend les écritures après un conflit et garde les données exportables', async () => {
    const persist = vi.fn<(data: Tournament) => Promise<void>>().mockRejectedValue(new Error('Conflit de version'))
    wrapper = mount(App, { props: { remote: { initial: fixture(), persist } } })
    await flushPromises()
    await wrapper.get('#score-0-0').setValue(5)
    await flushPromises()
    await wrapper.get('#score-0-1').setValue(25)
    await flushPromises()
    expect(persist).toHaveBeenCalledOnce()
    expect(wrapper.get('#error').text()).toContain('Conflit de version')
    expect(wrapper.text()).toContain('Non sauvegardé')
    expect(wrapper.find('#export').exists()).toBe(true)
    expect(wrapper.get('#score-0-1').element).toHaveProperty('value', '25')
  })
  it('crée un tournoi depuis le formulaire et affiche tous les composants', async () => {
    const app = await boot()
    await app.get('#names').setValue('Alice\nBenoît\nChloé\nDavid\nEmma')
    await app.get('#courts').setValue(1)
    await app.get('#setup-form').trigger('submit')
    expect(app.findAll('.match')).toHaveLength(1)
    expect(app.findAll('#encounters tr')).toHaveLength(5)
    expect(app.findAll('#ranking tr')).toHaveLength(5)
    expect(stored().players).toHaveLength(5)
  })
  it('restaure un chrono en cours, gère la pause et expire après rechargement', async () => {
    const app = await boot(fixture())
    await app.get('#timer-toggle').trigger('click')
    expect(stored().timer.deadline).not.toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    await app.get('#timer-toggle').trigger('click')
    expect(stored().timer.remaining).toBe(4000)
    await app.get('#timer-toggle').trigger('click')
    wrapper?.unmount()
    wrapper = undefined
    await vi.advanceTimersByTimeAsync(5000)
    const restored = await boot()
    expect(restored.get('#clock').text()).toBe('00:00')
    expect(restored.get('#timer-status').text()).toContain('Temps écoulé')
    expect(stored().timer.deadline).toBeNull()
  })
  it('actualise scores, classement, récapitulatif et rotations sans double comptage', async () => {
    const app = await boot(fixture())
    await app.get('#score-0-0').setValue(5)
    expect(app.get('#next-round').attributes('disabled')).toBeDefined()
    await app.get('#score-0-1').setValue(25)
    expect(app.get('#next-round').attributes('disabled')).toBeUndefined()
    expect(app.get('#encounters').text()).toContain('1×')
    expect(app.findAll('#encounters tr').filter(row => row.findAll('td')[0].text() === '1')).toHaveLength(4)
    expect(app.get('#encounters').find('th').text()).toBe('Alice <&>')
    expect(app.find('#encounters script').exists()).toBe(false)
    await app.get('#next-round').trigger('click')
    expect(stored().rounds).toHaveLength(2)
    await app.get('#score-0-0').setValue(125)
    await app.get('#score-0-1').setValue(0)
    const recap = app.get('#encounters').text()
    await app.get('#next-round').trigger('click')
    expect(app.get('#tournament-status').text()).toBe('Tournoi terminé')
    await app.get('#round-select').setValue('0')
    await app.get('#score-0-0').setValue(30)
    expect(app.get('#encounters').text()).toBe(recap)
    await app.get('#score-0-0').setValue('')
    expect(app.get('#error').text()).toContain('manche passée')
    expect(stored().rounds[0].matches[0].score[0]).toBe(30)
    expect(() => validateTournament(stored())).not.toThrow()
  })
  it('retire les rencontres si un score de la dernière manche est effacé', async () => {
    const app = await boot(fixture())
    await app.get('#score-0-0').setValue(5)
    await app.get('#score-0-1').setValue(25)
    await app.get('#score-0-1').setValue('')
    expect(app.get('#encounters').text()).not.toContain('1×')
    expect(app.get('#next-round').attributes('disabled')).toBeDefined()
  })
  it('signale les scores invalides sans modifier la sauvegarde', async () => {
    const app = await boot(fixture())
    const backup = localStorage.getItem(STORAGE_KEY)
    await app.get('#score-0-0').setValue(-1)
    expect(app.get('#error').text()).toContain('entier')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(backup)
  })
  it('signale une erreur de sauvegarde et conserve le tournoi utilisable', async () => {
    const app = await boot(fixture())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Stockage refusé') })
    await app.get('#score-0-0').setValue(5)
    expect(app.get('#error').text()).toContain('Stockage refusé')
    expect(app.text()).toContain('Non sauvegardé')
    expect(app.find('#tournament').exists()).toBe(true)
  })
  it('permet de revenir au tournoi actuel après préparation d’un nouveau', async () => {
    const app = await boot(fixture())
    const backup = localStorage.getItem(STORAGE_KEY)
    await app.get('#new-tournament').trigger('click')
    expect(app.find('#setup-form').exists()).toBe(true)
    await app.get('button:last-child').trigger('click')
    expect(app.find('#tournament').exists()).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(backup)
  })
  it('importe un export v1 et rejette un import corrompu sans écraser le tournoi', async () => {
    const app = await boot()
    const input = app.get('#import-file').element
    const data = fixture()
    const file = { size: 100, text: async () => JSON.stringify(data) }
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await app.get('#import-file').trigger('change')
    await flushPromises()
    expect(stored()).toEqual(data)
    await app.get('#new-tournament').trigger('click')
    const backup = localStorage.getItem(STORAGE_KEY)
    const invalid = { size: 10, text: async () => '{"version":1}' }
    Object.defineProperty(app.get('#import-file').element, 'files', { configurable: true, value: [invalid] })
    await app.get('#import-file').trigger('change')
    await flushPromises()
    expect(app.get('#error').text()).toContain('Import impossible')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(backup)
  })
  it('exporte le format v1 sans modifier le tournoi', async () => {
    const app = await boot(fixture())
    const backup = stored()
    const create = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:volant-test')
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = vi.fn()
    })
    let filename = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download
    })
    try {
      await app.get('#export').trigger('click')
      expect(create).toHaveBeenCalledOnce()
      expect(create.mock.calls[0][0].type).toBe('application/json')
      expect(click).toHaveBeenCalledOnce()
      expect(filename).toBe('salade-2026-10-12.json')
      expect(stored()).toEqual(backup)
      await vi.advanceTimersByTimeAsync(1000)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:volant-test')
    } finally { vi.unstubAllGlobals() }
  })
  it('ne remplace pas le tournoi si une restauration est annulée', async () => {
    const app = await boot(fixture())
    await app.get('#new-tournament').trigger('click')
    const backup = localStorage.getItem(STORAGE_KEY)
    vi.mocked(window.confirm).mockReturnValue(false)
    Object.defineProperty(app.get('#import-file').element, 'files', {
      configurable: true, value: [{ size: 100, text: async () => JSON.stringify(fixture()) }],
    })
    await app.get('#import-file').trigger('change')
    await flushPromises()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(backup)
    expect(app.find('#setup-form').exists()).toBe(true)
  })
  it('signale une sauvegarde corrompue sans la supprimer', async () => {
    localStorage.setItem(STORAGE_KEY, '{"version":1}')
    const app = await boot()
    expect(app.get('#error').text()).toContain('Impossible de restaurer')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"version":1}')
    expect(app.find('#setup-form').exists()).toBe(true)
  })
})
