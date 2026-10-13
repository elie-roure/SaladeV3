import { describe, expect, it } from 'vitest'
import {
  complete, createTournament, encounters, history, isScore, makeRound, repeats, standings, validateTournament,
  type Round, type Tournament,
} from './tournament'

const players = ['Alice', 'Benoît', 'Chloé', 'David', 'Emma']
const fixture = (): Tournament => ({
  version: 1, players: [...players], courts: 1, duration: 300, totalRounds: 3,
  finished: false, timer: { remaining: 300000, deadline: null },
  rounds: [
    { matches: [{ teams: [[0, 1], [2, 3]], score: [5, 25] }], bench: [4] },
    { matches: [{ teams: [[0, 1], [2, 3]], score: [0, 0] }], bench: [4] },
    { matches: [{ teams: [[0, 2], [1, 4]], score: [7, null] }], bench: [3] },
  ],
})

describe('rotation des doubles', () => {
  it.each([[4, 1], [5, 1], [7, 1], [8, 2], [12, 2], [13, 3], [32, 8], [128, 32]])(
    'répartit %i joueurs sur %i terrains sans doublon et équilibre les pauses',
    (count, courts) => {
      const names = Array.from({ length: count }, (_, i) => `Joueur ${i}`)
      const rounds: Round[] = []
      let seed = 17
      const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
      for (let i = 0; i < 20; i++) {
        const round = makeRound(names, courts, rounds, random)
        const ids = round.matches.flatMap(match => match.teams.flat()).concat(round.bench)
        expect(round.matches).toHaveLength(courts)
        expect(ids).toHaveLength(count)
        expect(new Set(ids).size).toBe(count)
        round.matches.forEach(match => { match.score = [5, 25] })
        rounds.push(round)
        const counts = history(names, rounds).played
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
        expect(validateTournament({ ...fixture(), players: names, courts, totalRounds: 20, rounds }).rounds).toHaveLength(i + 1)
      }
    },
  )
  it('signale les partenaires et adversaires déjà rencontrés', () => {
    const data = fixture()
    expect(repeats(players, data.rounds.slice(0, 1), data.rounds[1])).toEqual({ partners: 2, opponents: 4 })
  })
  it('rejette un effectif incompatible avec les terrains', () => {
    expect(() => createTournament({ players, courts: 2, duration: 300, totalRounds: 3 })).toThrow('8 joueurs')
  })
})

describe('classement et récapitulatif', () => {
  it('accepte 5–25, 125–0 et les égalités, pas les scores négatifs ou décimaux', () => {
    expect([0, 5, 25, 125].every(isScore)).toBe(true)
    expect([-1, 1.5, NaN, Infinity, null].some(isScore)).toBe(false)
    expect(complete(fixture().rounds[2].matches[0])).toBe(false)
  })
  it('classe par moyenne puis différence moyenne, avec ex aequo', () => {
    const rows = standings(players, fixture().rounds)
    expect(rows[0]).toMatchObject({ name: 'Chloé', played: 2, points: 25, rank: 1 })
    expect(rows[1]).toMatchObject({ name: 'David', rank: 1 })
    expect(rows.find(row => row.name === 'Emma')).toMatchObject({ played: 0, rank: null })
    const rounds: Round[] = [
      { matches: [{ teams: [[0, 1], [2, 3]], score: [10, 25] }], bench: [4] },
      { matches: [{ teams: [[0, 2], [3, 4]], score: [10, 5] }], bench: [1] },
    ]
    const result = standings(players, rounds)
    expect(result.find(row => row.name === 'Alice')!.rank).toBeLessThan(result.find(row => row.name === 'Benoît')!.rank!)
  })
  it('agrège les rôles et les répétitions uniquement pour les matchs complets', () => {
    const data = fixture()
    expect(encounters(players, data.rounds)[0]).toEqual({
      id: 0, name: 'Alice', played: 2,
      partners: [{ id: 1, name: 'Benoît', count: 2 }],
      opponents: [{ id: 2, name: 'Chloé', count: 2 }, { id: 3, name: 'David', count: 2 }],
    })
    data.rounds[2].matches[0].score[1] = 30
    const rows = encounters(players, data.rounds)
    expect(rows[0].partners.find(person => person.id === 2)?.count).toBe(1)
    expect(rows[0].opponents.find(person => person.id === 1)?.count).toBe(1)
    for (const row of rows) {
      expect(row.partners.reduce((sum, p) => sum + p.count, 0)).toBe(row.played)
      expect(row.opponents.reduce((sum, p) => sum + p.count, 0)).toBe(row.played * 2)
      for (const role of ['partners', 'opponents'] as const) for (const person of row[role]) {
        expect(rows[person.id][role].find(p => p.id === row.id)?.count).toBe(person.count)
      }
    }
  })
})

describe('compatibilité des sauvegardes HTML v1', () => {
  it('restaure un ancien export sans modifier les équipes, scores ou chrono', () => {
    const data = fixture()
    expect(validateTournament(JSON.parse(JSON.stringify(data)))).toEqual(data)
  })
  it.each([
    (data: Tournament) => { data.rounds[0].matches[0].score[0] = null },
    (data: Tournament) => { data.rounds[0].bench = [0] },
    (data: Tournament) => { data.players[0] = 'Benoît' },
    (data: Tournament) => { data.timer.remaining = -1 },
    (data: Tournament) => { data.rounds[0].matches[0].score[0] = 1.5 },
    (data: Tournament) => { data.finished = true },
  ])('rejette une sauvegarde incohérente (%#)', mutate => {
    const data = fixture()
    mutate(data)
    expect(() => validateTournament(data)).toThrow()
  })
  it.each([null, {}, { version: 1 }, { version: 2 }, { players: [null] }])('rejette une structure invalide (%#)', data => {
    expect(() => validateTournament(data)).toThrow()
  })
})
