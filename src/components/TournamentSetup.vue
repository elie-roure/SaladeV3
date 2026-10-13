<script setup lang="ts">
import { ref } from 'vue'
import type { Settings, Tournament } from '../domain/tournament'

const props = defineProps<{ previous: Tournament | null; shared?: boolean }>()
const emit = defineEmits<{ start: [settings: Settings]; import: [file: File]; resume: [] }>()
const names = ref(props.previous?.players.join('\n') ?? '')
const courts = ref(props.previous?.courts ?? 2)
const minutes = ref(props.previous ? props.previous.duration / 60 : 5)
const totalRounds = ref(props.previous?.totalRounds ?? 8)
function submit() {
  emit('start', {
    players: names.value.split(/\r?\n/).map(name => name.trim()).filter(Boolean),
    courts: Number(courts.value), duration: Math.round(Number(minutes.value) * 60), totalRounds: Number(totalRounds.value),
  })
}
function importFile(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  if (file) emit('import', file)
  input.value = ''
}
</script>

<template>
  <section>
    <div class="eyebrow">Un terrain. Des rencontres.</div>
    <h1>Changez de partenaire.<br>Multipliez les échanges.</h1>
    <p class="muted">Un chrono, des équipes qui tournent et des points sans limite à 21.</p>
    <div class="setup-grid">
      <form id="setup-form" class="card" @submit.prevent="submit">
        <h2>Préparer le tournoi</h2>
        <label for="names">Joueurs — un nom par ligne</label>
        <textarea id="names" v-model="names" rows="9" placeholder="Camille&#10;Alex&#10;Sam&#10;Lou" required />
        <p class="muted small">Au moins 4 joueurs. Utilisez des noms distincts pour les homonymes.</p>
        <div class="fields">
          <div><label for="courts">Terrains</label><input id="courts" v-model.number="courts" type="number" min="1" max="32" step="1" required></div>
          <div><label for="minutes">Minutes / manche</label><input id="minutes" v-model.number="minutes" type="number" min="0.1" max="180" step="0.1" required></div>
          <div><label for="rounds">Manches</label><input id="rounds" v-model.number="totalRounds" type="number" min="1" max="100" step="1" required></div>
        </div>
        <div class="actions">
          <button class="primary" type="submit">Créer le tournoi</button>
          <button type="button" @click="names = 'Camille\nAlex\nSam\nLou\nCharlie\nMorgan\nSacha\nNoa\nJules\nLéa\nRobin\nInès'">Essayer avec 12 joueurs</button>
          <button v-if="previous" type="button" @click="emit('resume')">Revenir au tournoi actuel</button>
        </div>
      </form>
      <aside class="card">
        <h2>Le jeu, simplement.</h2>
        <ol class="rules">
          <li>Les équipes de doubles sont attribuées à chaque manche.</li>
          <li>Lancez le chrono commun à tous les terrains.</li>
          <li>À la fin du temps, saisissez les scores : <strong>5–25 est parfaitement valide.</strong></li>
          <li>Passez à la manche suivante pour changer les équipes.</li>
        </ol>
        <p class="small muted">Les rotations cherchent à éviter les partenaires et adversaires déjà rencontrés. Les pauses sont équilibrées. Des répétitions peuvent être inévitables ; la recherche ne garantit pas une rotation optimale.</p>
        <p class="small muted">Classement : moyenne des points marqués par match terminé, puis différence de points moyenne. Chaque joueur reçoit les points de son équipe.</p>
        <p class="small muted">Le récapitulatif liste les partenaires et adversaires avec le nombre de rencontres. Seuls les matchs avec les deux scores saisis sont comptés.</p>
        <p v-if="shared" class="small muted">Les modifications sont enregistrées sur le serveur et accessibles aux organisateurs autorisés. Exportez une copie si l’enregistrement échoue. Rechargez pour voir les modifications d’un autre appareil.</p>
        <p v-else class="small muted">Sauvegarde automatique dans ce navigateur, sans compte ni partage en ligne. Exportez une copie pour conserver ou transférer le tournoi.</p>
        <label for="import-file">Restaurer une sauvegarde JSON</label>
        <input id="import-file" type="file" accept=".json,application/json" @change="importFile">
      </aside>
    </div>
  </section>
</template>
