export type Team = [number, number]
export type Score = number | null
export interface Match {
  teams: [Team, Team]
  score: [Score, Score]
}
export interface Round {
  matches: Match[]
  bench: number[]
}
export interface Timer {
  remaining: number
  deadline: number | null
}
export interface Tournament {
  version: 1
  players: string[]
  courts: number
  duration: number
  totalRounds: number
  rounds: Round[]
  finished: boolean
  timer: Timer
}
export interface Settings {
  players: string[]
  courts: number
  duration: number
  totalRounds: number
}
export interface Encounter {
  id: number
  name: string
  count: number
}
export const MAX_SCORE = Math.floor(Number.MAX_SAFE_INTEGER / 400)
export const isScore = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_SCORE
export const complete = (match: Match): boolean => match.score.every(isScore)
const pairKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`

export function history(players: string[], rounds: Pick<Round, 'matches'>[]) {
  const played = Array<number>(players.length).fill(0)
  const partners = new Map<string, number>()
  const opponents = new Map<string, number>()
  const add = (map: Map<string, number>, a: number, b: number) =>
    map.set(pairKey(a, b), (map.get(pairKey(a, b)) ?? 0) + 1)
  for (const round of rounds) for (const match of round.matches) {
    for (const team of match.teams) {
      team.forEach(id => played[id]++)
      add(partners, ...team)
    }
    for (const a of match.teams[0]) for (const b of match.teams[1]) add(opponents, a, b)
  }
  return { played, partners, opponents }
}

export function validateSettings(settings: Settings): void {
  const { players, courts, duration, totalRounds } = settings
  if (players.length < 4 || players.length > 128) throw new Error('Inscrivez entre 4 et 128 joueurs.')
  if (players.some(name => !name.trim() || name.length > 80)) throw new Error('Chaque nom doit contenir entre 1 et 80 caractères.')
  if (new Set(players.map(name => name.trim().toLocaleLowerCase('fr'))).size !== players.length) {
    throw new Error('Chaque joueur doit avoir un nom distinct. Ajoutez une initiale pour les homonymes.')
  }
  if (!Number.isInteger(courts) || courts < 1 || courts > 32) throw new Error('Choisissez entre 1 et 32 terrains.')
  if (courts * 4 > players.length) throw new Error(`Il faut ${courts * 4} joueurs pour ${courts} terrains. Réduisez le nombre de terrains ou ajoutez des joueurs.`)
  if (!Number.isInteger(duration) || duration < 6 || duration > 10800) throw new Error('La durée doit être comprise entre 0,1 et 180 minutes.')
  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 100) throw new Error('Choisissez entre 1 et 100 manches.')
}

export function makeRound(players: string[], courts: number, rounds: Round[], random = Math.random): Round {
  if (!Number.isInteger(courts) || courts < 1 || courts * 4 > players.length) throw new Error('Nombre de terrains incompatible avec les joueurs.')
  const h = history(players, rounds)
  let best: Round | undefined
  let bestCost = Infinity
  const shuffle = (list: number[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    const ids = shuffle(players.map((_, i) => i))
    ids.sort((a, b) => h.played[a] - h.played[b])
    const active = shuffle(ids.slice(0, courts * 4))
    const matches: Match[] = []
    let cost = 0
    for (let i = 0; i < active.length; i += 4) {
      const teams: [Team, Team] = [[active[i], active[i + 1]], [active[i + 2], active[i + 3]]]
      for (const team of teams) {
        const previous = h.partners.get(pairKey(...team)) ?? 0
        if (previous) cost += 8 * (2 * previous + 1)
      }
      for (const a of teams[0]) for (const b of teams[1]) {
        const previous = h.opponents.get(pairKey(a, b)) ?? 0
        if (previous) cost += 2 * (2 * previous + 1)
      }
      matches.push({ teams, score: [null, null] })
    }
    if (cost < bestCost) {
      best = { matches, bench: ids.slice(courts * 4) }
      bestCost = cost
    }
    if (cost === 0) break
  }
  if (!best) throw new Error('Impossible de générer cette manche.')
  return best
}

export function createTournament(settings: Settings): Tournament {
  validateSettings(settings)
  return {
    version: 1, ...settings, players: [...settings.players],
    rounds: [makeRound(settings.players, settings.courts, [])],
    finished: false, timer: { remaining: settings.duration * 1000, deadline: null },
  }
}

export function repeats(players: string[], rounds: Round[], round: Round) {
  const h = history(players, rounds)
  let partners = 0
  let opponents = 0
  for (const match of round.matches) {
    for (const team of match.teams) if (h.partners.has(pairKey(...team))) partners++
    for (const a of match.teams[0]) for (const b of match.teams[1]) if (h.opponents.has(pairKey(a, b))) opponents++
  }
  return { partners, opponents }
}

export function standings(players: string[], rounds: Round[]) {
  const rows = players.map((name, id) => ({ id, name, played: 0, points: 0, difference: 0, rank: null as number | null }))
  for (const round of rounds) for (const match of round.matches) {
    const [left, right] = match.score
    if (!isScore(left) || !isScore(right)) continue
    const scores = [left, right]
    match.teams.forEach((team, side) => team.forEach(id => {
      rows[id].played++
      rows[id].points += scores[side]
      rows[id].difference += scores[side] - scores[1 - side]
    }))
  }
  const compare = (a: typeof rows[number], b: typeof rows[number]) => {
    if (!a.played || !b.played) return Number(!!b.played) - Number(!!a.played)
    return b.points / b.played - a.points / a.played || b.difference / b.played - a.difference / a.played
  }
  rows.sort((a, b) => compare(a, b) || a.name.localeCompare(b.name, 'fr'))
  rows.forEach((row, i) => { row.rank = !row.played ? null : i && compare(row, rows[i - 1]) === 0 ? rows[i - 1].rank : i + 1 })
  return rows
}

export function encounters(players: string[], rounds: Round[]) {
  const h = history(players, rounds.map(round => ({ matches: round.matches.filter(complete) })))
  const rows = players.map((name, id) => ({
    id, name, played: h.played[id], partners: [] as Encounter[], opponents: [] as Encounter[],
  }))
  for (const field of ['partners', 'opponents'] as const) {
    for (const [pair, count] of h[field]) {
      const [a, b] = pair.split(':').map(Number)
      rows[a][field].push({ id: b, name: players[b], count })
      rows[b][field].push({ id: a, name: players[a], count })
    }
    for (const row of rows) row[field].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }
  return rows
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

// Reconstruire les données importées évite de faire confiance à leur structure.
export function validateTournament(data: unknown, now = Date.now()): Tournament {
  const fail = (): never => { throw new Error('Sauvegarde invalide ou incompatible. Le tournoi actuel est conservé.') }
  if (!record(data) || data.version !== 1 || !Array.isArray(data.players)) return fail()
  const players: string[] = []
  for (const name of data.players) {
    if (typeof name !== 'string') return fail()
    players.push(name)
  }
  if (!integer(data.courts, 1, 32) || !integer(data.duration, 6, 10800) || !integer(data.totalRounds, 1, 100)) return fail()
  validateSettings({ players, courts: data.courts, duration: data.duration, totalRounds: data.totalRounds })
  if (!Array.isArray(data.rounds) || !data.rounds.length || data.rounds.length > data.totalRounds || typeof data.finished !== 'boolean') return fail()
  const rounds: Round[] = []
  const validId = (id: unknown): id is number => integer(id, 0, players.length - 1)
  for (const raw of data.rounds) {
    if (!record(raw) || !Array.isArray(raw.matches) || raw.matches.length !== data.courts || !Array.isArray(raw.bench)) return fail()
    const bench: number[] = []
    for (const id of raw.bench) { if (!validId(id)) return fail(); bench.push(id) }
    const matches: Match[] = []
    const ids = [...bench]
    for (const match of raw.matches) {
      if (!record(match) || !Array.isArray(match.teams) || match.teams.length !== 2 || !Array.isArray(match.score) || match.score.length !== 2) return fail()
      const parseTeam = (team: unknown): Team => {
        if (!Array.isArray(team) || team.length !== 2 || !validId(team[0]) || !validId(team[1])) return fail()
        return [team[0], team[1]]
      }
      const teams: [Team, Team] = [parseTeam(match.teams[0]), parseTeam(match.teams[1])]
      const scoreValue = (value: unknown): Score => value === null || isScore(value) ? value : fail()
      matches.push({ teams, score: [scoreValue(match.score[0]), scoreValue(match.score[1])] })
      ids.push(...teams[0], ...teams[1])
    }
    if (ids.length !== players.length || new Set(ids).size !== ids.length) return fail()
    rounds.push({ matches, bench })
  }
  if (rounds.slice(0, -1).some(round => !round.matches.every(complete))) return fail()
  if (data.finished && (rounds.length !== data.totalRounds || !rounds[rounds.length - 1].matches.every(complete))) return fail()
  const timer = data.timer
  if (!record(timer) || typeof timer.remaining !== 'number' || !Number.isFinite(timer.remaining) || timer.remaining < 0 || timer.remaining > data.duration * 1000) return fail()
  if (timer.deadline !== null && (!integer(timer.deadline, 1, now + data.duration * 1000 + 1000) || !Number.isSafeInteger(timer.deadline))) return fail()
  if (data.finished && timer.deadline !== null) return fail()
  return {
    version: 1, players, courts: data.courts, duration: data.duration, totalRounds: data.totalRounds,
    rounds, finished: data.finished, timer: { remaining: timer.remaining, deadline: timer.deadline },
  }
}
