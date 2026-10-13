<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ remaining: number; duration: number; running: boolean; finished: boolean; round: number }>()
const emit = defineEmits<{ toggle: []; reset: [] }>()
const clock = computed(() => {
  const seconds = Math.ceil(props.remaining / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
const status = computed(() => props.finished ? 'Tournoi terminé' : props.running ? 'Manche en cours'
  : props.remaining === 0 ? 'Temps écoulé — saisissez les scores'
    : props.remaining < props.duration * 1000 ? 'En pause' : 'Prêt à démarrer')
const button = computed(() => props.running ? 'Pause' : props.remaining > 0 && props.remaining < props.duration * 1000 ? 'Reprendre' : 'Démarrer')
</script>

<template>
  <div class="card timer">
    <h2>Chrono · manche {{ round }}</h2>
    <div id="clock" role="timer" aria-live="off">{{ clock }}</div>
    <div id="timer-status" role="status">{{ status }}</div>
    <div class="actions">
      <button id="timer-toggle" type="button" :disabled="finished || remaining === 0" @click="emit('toggle')">{{ button }}</button>
      <button id="timer-reset" type="button" :disabled="finished" @click="emit('reset')">Réinitialiser</button>
    </div>
    <p class="timer-note">À zéro, arrêtez les échanges puis saisissez les scores. Le chrono ne déclenche pas la rotation.</p>
  </div>
</template>
