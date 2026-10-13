import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  complete, createTournament, encounters, isScore, makeRound, repeats, standings, validateTournament,
  type Score, type Settings, type Tournament,
} from '../domain/tournament'

export const STORAGE_KEY = 'volant.tournament.v1'
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export interface RemotePersistence {
  initial: Tournament | null
  persist: (data: Tournament) => Promise<void>
}
export function useTournament(remote?: RemotePersistence) {
  const state = ref<Tournament | null>(null)
  const viewedRound = ref(0)
  const error = ref('')
  const saved = ref(true)
  const now = ref(Date.now())
  const editing = ref(false)
  const invalidScores = ref(new Set<string>())
  const pendingSaves = ref(0)
  let saveChain = Promise.resolve()
  let blocked = false
  let interval: ReturnType<typeof setInterval> | undefined
  const remaining = computed(() => {
    const timer = state.value?.timer
    return timer ? timer.deadline === null ? timer.remaining : Math.max(0, timer.deadline - now.value) : 0
  })
  const running = computed(() => state.value?.timer.deadline != null)
  const currentRound = computed(() => state.value?.rounds[viewedRound.value])
  const ranking = computed(() => state.value ? standings(state.value.players, state.value.rounds) : [])
  const recap = computed(() => state.value ? encounters(state.value.players, state.value.rounds) : [])
  const repeated = computed(() => state.value && currentRound.value
    ? repeats(state.value.players, state.value.rounds.slice(0, viewedRound.value), currentRound.value)
    : { partners: 0, opponents: 0 })
  const completeCount = computed(() => state.value?.rounds.at(-1)?.matches.filter(complete).length ?? 0)
  const canAdvance = computed(() => !!state.value && !state.value.finished && !running.value &&
    viewedRound.value === state.value.rounds.length - 1 &&
    completeCount.value === state.value.courts && !invalidScores.value.size)
  const saveStatus = computed(() => pendingSaves.value ? 'Enregistrement sur le serveur…'
    : !saved.value ? 'Non sauvegardé — exportez une copie'
      : remote ? 'Enregistré sur le serveur' : 'Sauvegardé dans ce navigateur')

  function report(value: unknown) { error.value = message(value) }
  function save() {
    if (!state.value) return
    if (remote) {
      const snapshot = validateTournament(JSON.parse(JSON.stringify(state.value)))
      pendingSaves.value++
      saveChain = saveChain.then(async () => {
        if (blocked) return
        try { await remote.persist(snapshot); saved.value = true }
        catch (cause) {
          blocked = true
          saved.value = false
          report(`${message(cause)} Exportez une copie, puis rechargez le tournoi depuis le serveur. Les écritures sont suspendues pour éviter toute perte.`)
        }
      }).finally(() => { pendingSaves.value-- })
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      saved.value = true
    } catch (cause) {
      saved.value = false
      report(`La sauvegarde locale a échoué : ${message(cause)}. Exportez une copie avant de fermer cette page.`)
    }
  }
  function tick() {
    now.value = Date.now()
    if (state.value && running.value && remaining.value === 0) {
      state.value.timer = { remaining: 0, deadline: null }
      if (!remote) save()
    }
  }
  function load() {
    if (remote) {
      state.value = remote.initial ? validateTournament(remote.initial) : null
      viewedRound.value = state.value ? state.value.rounds.length - 1 : 0
      tick()
      return
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        state.value = validateTournament(JSON.parse(stored))
        viewedRound.value = state.value.rounds.length - 1
        tick()
      }
    } catch (cause) {
      report(`Impossible de restaurer la sauvegarde : ${message(cause)}. Elle n'a pas été effacée. Vous pouvez importer une copie ou créer un nouveau tournoi pour la remplacer.`)
    }
  }
  function start(settings: Settings) {
    try {
      const next = createTournament(settings)
      state.value = next
      viewedRound.value = 0
      editing.value = false
      invalidScores.value.clear()
      error.value = ''
      now.value = Date.now()
      save()
    } catch (cause) { report(cause) }
  }
  function updateScore(matchIndex: number, side: 0 | 1, value: Score, badInput: boolean) {
    if (!state.value || !currentRound.value) return
    const key = `${matchIndex}:${side}`
    const historical = viewedRound.value < state.value.rounds.length - 1
    if (badInput || historical && value === null || value !== null && !isScore(value)) {
      invalidScores.value.add(key)
      report(historical && value === null
        ? 'Une manche passée doit conserver ses deux scores. Cette modification vide n’a pas été sauvegardée.'
        : 'Le score doit être un entier positif ou nul, dans la plage numérique prise en charge. Aucun plafond à 21. Cette modification n’a pas été sauvegardée.')
      return
    }
    invalidScores.value.delete(key)
    if (!invalidScores.value.size && saved.value) error.value = ''
    currentRound.value.matches[matchIndex].score[side] = value
    if (state.value.finished && !state.value.rounds.at(-1)?.matches.every(complete)) state.value.finished = false
    save()
  }
  function selectRound(index: number) {
    if (!state.value || !Number.isInteger(index) || index < 0 || index >= state.value.rounds.length) {
      report('Cette manche n’existe pas.')
      return
    }
    viewedRound.value = index
    invalidScores.value.clear()
    if (saved.value) error.value = ''
  }
  function advance() {
    if (!state.value || !canAdvance.value) { report('Complétez les scores et mettez le chrono en pause avant de continuer.'); return }
    if (state.value.rounds.length === state.value.totalRounds) {
      tick()
      state.value.finished = true
      state.value.timer = { remaining: remaining.value, deadline: null }
    } else {
      state.value.rounds.push(makeRound(state.value.players, state.value.courts, state.value.rounds))
      state.value.timer = { remaining: state.value.duration * 1000, deadline: null }
      viewedRound.value = state.value.rounds.length - 1
    }
    save()
  }
  function toggleTimer() {
    tick()
    if (!state.value || state.value.finished || remaining.value === 0) return
    const ms = remaining.value
    state.value.timer = running.value ? { remaining: ms, deadline: null } : { remaining: ms, deadline: now.value + ms }
    save()
  }
  function resetTimer() {
    if (!state.value || state.value.finished) return
    if (!window.confirm('Réinitialiser le chrono de la dernière manche ? Les scores seront conservés.')) return
    state.value.timer = { remaining: state.value.duration * 1000, deadline: null }
    save()
  }
  function prepareNew() {
    if (state.value && !window.confirm(remote ? 'Préparer un nouveau tournoi partagé ? Le tournoi actuel sera conservé sur le serveur.' : 'Préparer un nouveau tournoi ? Exportez le tournoi actuel avant de le remplacer.')) return
    editing.value = true
  }
  function resume() { editing.value = false }
  async function importFile(file: File) {
    try {
      if (file.size > 2000000) throw new Error('Le fichier dépasse la taille autorisée de 2 Mo.')
      const next = validateTournament(JSON.parse(await file.text()))
      if (!window.confirm(remote ? 'Importer ce tournoi ? Il remplacera le contenu du tournoi partagé ouvert. Si vous êtes sur un nouveau tournoi, il sera créé sur le serveur.' : 'Restaurer ce tournoi ? Il remplacera la sauvegarde de ce navigateur.')) return
      state.value = next
      viewedRound.value = next.rounds.length - 1
      invalidScores.value.clear()
      editing.value = false
      error.value = ''
      tick()
      save()
    } catch (cause) { report(`Import impossible : ${message(cause)}`) }
  }
  function exportFile() {
    if (!state.value) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.value, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `salade-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  onMounted(() => { load(); interval = setInterval(tick, 250) })
  onUnmounted(() => { if (interval) clearInterval(interval) })
  return {
    state, viewedRound, error, saved, editing, invalidScores, pendingSaves, remaining, running, currentRound,
    ranking, recap, repeated, completeCount, canAdvance, saveStatus,
    start, updateScore, selectRound, advance, toggleTimer, resetTimer, prepareNew, resume, importFile, exportFile,
  }
}
