<script setup lang="ts">
import type { Match, Score } from '../domain/tournament'

defineProps<{ match: Match; players: string[]; index: number; invalid: Set<string> }>()
const emit = defineEmits<{ score: [side: 0 | 1, value: Score, badInput: boolean] }>()
const sides = [0, 1] as const
function update(event: Event, side: 0 | 1) {
  const input = event.target
  if (input instanceof HTMLInputElement) emit('score', side, input.value === '' ? null : Number(input.value), input.validity.badInput)
}
</script>

<template>
  <article class="card match">
    <div class="court-head"><h3>Terrain {{ index + 1 }}</h3><span class="pill">Double</span></div>
    <div class="court-surface" aria-hidden="true">
      <div class="badminton-court">
        <span class="court-line singles-sidelines"></span>
        <span class="court-line long-service left"></span>
        <span class="court-line long-service right"></span>
        <span class="court-line short-service left"></span>
        <span class="court-line short-service right"></span>
        <span class="court-line center-service left"></span>
        <span class="court-line center-service right"></span>
        <span class="court-net"></span>
        <div v-for="side in sides" :key="side" class="court-pair" :class="side === 0 ? 'left' : 'right'">
          <span v-for="(id, position) in match.teams[side]" :key="id" class="court-player" :class="position === 0 ? 'front' : 'back'">
            {{ players[id].trim().charAt(0).toLocaleUpperCase('fr') }}
          </span>
        </div>
      </div>
    </div>
    <div class="teams">
      <template v-for="side in sides" :key="side">
        <span v-if="side" class="versus">VS</span>
        <div class="team">
          <span v-for="id in match.teams[side]" :key="id" class="player">{{ players[id] }}</span>
          <label class="small team-label" :class="side === 0 ? 'team-left' : 'team-right'" :for="`score-${index}-${side}`">Points équipe {{ side + 1 }}</label>
          <input :id="`score-${index}-${side}`" class="score" type="number" min="0" step="1" inputmode="numeric"
            placeholder="—" :value="match.score[side] ?? ''" :aria-invalid="invalid.has(`${index}:${side}`)"
            :aria-label="`Score terrain ${index + 1}, ${match.teams[side].map(id => players[id]).join(' et ')}`"
            @input="update($event, side)">
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
      .court-surface {
        padding:14px;
        margin-bottom:20px;
        background:#123f37;
        border-radius:12px;
        box-shadow:inset 0 1px 4px #0003;
        pointer-events:none;
      }
      .badminton-court {
        position:relative;
        aspect-ratio:13.4 / 6.1;
        border:2px solid #eaf5e8;
        background:linear-gradient(90deg, #267b60 50%, #237357 50%);
      }
      .court-line { position:absolute; display:block; border-color:#eaf5e8; border-style:solid; border-width:0; }
      /* Tracé horizontal : terrain 13,40 × 6,10 m ; simple 5,18 m ; services 0,76 et 1,98 m. */
      .singles-sidelines { inset:7.54% 0; border-top-width:1px; border-bottom-width:1px; }
      .long-service { top:0; bottom:0; border-left-width:1px; }
      .long-service.left { left:5.67%; }
      .long-service.right { right:5.67%; }
      .short-service { top:0; bottom:0; border-left-width:1px; }
      .short-service.left { left:35.22%; }
      .short-service.right { right:35.22%; }
      .center-service { top:50%; width:35.22%; border-top-width:1px; }
      .center-service.left { left:0; }
      .center-service.right { right:0; }
      .court-net {
        position:absolute;
        left:50%;
        top:-6px;
        bottom:-6px;
        width:3px;
        transform:translateX(-50%);
        background:repeating-linear-gradient(to bottom, #fff 0 3px, #123f37 3px 5px);
        box-shadow:0 0 0 1px #ffffff50, 3px 0 3px #0002;
      }
      .court-net::before,.court-net::after {
        content:'';
        position:absolute;
        left:50%;
        transform:translateX(-50%);
        width:7px;
        height:7px;
        border-radius:50%;
        background:#fff;
      }
      .court-net::before { top:-3px; }
      .court-net::after { bottom:-3px; }
      .court-pair { position:absolute; inset:0; }
      .court-player {
        position:absolute;
        display:grid;
        place-items:center;
        width:24px;
        height:24px;
        transform:translate(-50%, -50%);
        border-radius:50%;
        border:2px solid white;
        font-size:11px;
        font-weight:800;
        line-height:1;
        box-shadow:0 2px 5px #0004;
      }
      .court-pair.left .court-player { left:23%; background:#f9e6a7; color:#4b3710; }
      .court-pair.right .court-player { left:77%; background:#d9ebff; color:#173d63; }
      .court-player.front { top:28%; }
      .court-player.back { top:72%; }
      .team-label { margin-top:10px; border-radius:6px; padding:4px; }
      .team-left { background:#fff3ce; color:#4b3710; }
      .team-right { background:#e8f2ff; color:#173d63; }
</style>
