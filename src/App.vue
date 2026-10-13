<script setup lang="ts">
import { watch } from 'vue'
import { useTournament, type RemotePersistence } from './composables/useTournament'
import TournamentSetup from './components/TournamentSetup.vue'
import MatchCard from './components/MatchCard.vue'
import TournamentTimer from './components/TournamentTimer.vue'
import StandingsTable from './components/StandingsTable.vue'
import EncountersTable from './components/EncountersTable.vue'

const props = defineProps<{ remote?: RemotePersistence }>()
const emit = defineEmits<{ saving: [pending: boolean] }>()
const {
  state, viewedRound, error, editing, invalidScores, pendingSaves, currentRound, remaining, running,
  ranking, recap, repeated, completeCount, canAdvance, saveStatus,
  start, updateScore, selectRound, advance, toggleTimer, resetTimer, prepareNew, resume, importFile, exportFile,
} = useTournament(props.remote)
watch(pendingSaves, value => emit('saving', value > 0), { flush: 'sync', immediate: true })
function select(event: Event) {
  if (event.target instanceof HTMLSelectElement) selectRound(Number(event.target.value))
}
</script>

<template>
  <header><div class="bar"><div class="brand">salade<span>.</span></div><span class="tag">Doubles · Partenaires tournants</span></div></header>
  <main>
    <div v-if="error" id="error" class="error" role="alert">{{ error }}</div>
    <TournamentSetup v-if="!state || editing" :previous="state" :shared="!!remote" @start="start" @import="importFile" @resume="resume" />
    <section v-else-if="currentRound" id="tournament">
      <div id="tournament-status" class="eyebrow">{{ state.finished ? 'Tournoi terminé' : 'Le tournoi est lancé' }}</div>
      <h1>À vous de jouer.</h1>
      <p class="muted">{{ state.players.length }} joueurs · {{ state.courts }} terrain{{ state.courts > 1 ? 's' : '' }} · {{ (state.duration / 60).toLocaleString('fr') }} min par manche · {{ state.totalRounds }} manches prévues</p>
      <div class="dashboard">
        <div>
          <div class="round-head">
            <h2 id="round-title">Manche {{ viewedRound + 1 }} / {{ state.totalRounds }}</h2>
            <select id="round-select" :value="viewedRound" aria-label="Afficher une manche" @change="select">
              <option v-for="(_, i) in state.rounds" :key="i" :value="i">Manche {{ i + 1 }}</option>
            </select>
          </div>
          <div v-if="viewedRound !== state.rounds.length - 1" class="notice">Vous consultez une manche passée. Ses scores restent modifiables ; le chrono concerne toujours la dernière manche.</div>
          <div v-if="repeated.partners || repeated.opponents" class="notice">
            Cette rotation comporte {{ repeated.partners }} paire(s) de partenaires et {{ repeated.opponents }} rencontre(s) entre adversaires déjà vus. La recherche privilégie la diversité et l'équilibre des pauses, sans garantir une rotation optimale.
          </div>
          <div class="matches">
            <MatchCard v-for="(match, i) in currentRound.matches" :key="`${viewedRound}:${i}`" :match="match"
              :index="i" :players="state.players" :invalid="invalidScores" @score="(side, value, bad) => updateScore(i, side, value, bad)" />
          </div>
          <div class="card bench"><h3>Au repos cette manche</h3><p class="muted">{{ currentRound.bench.length ? currentRound.bench.map(id => state!.players[id]).join(' · ') : 'Personne : tout le monde joue !' }}</p></div>
          <p class="small muted">
            <template v-if="state.finished">Tournoi terminé. Vous pouvez encore corriger les scores et exporter la sauvegarde.</template>
            <template v-else>{{ completeCount }} / {{ state.courts }} scores complets pour la dernière manche. Saisissez les deux scores de chaque terrain avant de continuer.</template>
          </p>
          <button id="next-round" class="primary" type="button" :disabled="!canAdvance" @click="advance">{{ state.rounds.length === state.totalRounds ? 'Terminer le tournoi' : 'Manche suivante' }}</button>
        </div>
        <aside class="sidebar">
          <TournamentTimer :remaining="remaining" :duration="state.duration" :running="running" :finished="state.finished"
            :round="state.rounds.length" @toggle="toggleTimer" @reset="resetTimer" />
          <StandingsTable :rows="ranking" />
        </aside>
      </div>
      <EncountersTable :rows="recap" />
      <div class="actions footer-actions">
        <button id="export" type="button" @click="exportFile">Exporter la sauvegarde</button>
        <button v-if="!remote" id="new-tournament" type="button" @click="prepareNew">Nouveau tournoi</button>
        <span class="small muted">{{ saveStatus }}</span>
      </div>
    </section>
  </main>
</template>
