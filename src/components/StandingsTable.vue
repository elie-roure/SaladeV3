<script setup lang="ts">
import type { standings } from '../domain/tournament'

defineProps<{ rows: ReturnType<typeof standings> }>()
const format = (value: number) => value.toLocaleString('fr', { maximumFractionDigits: 2 })
</script>

<template>
  <div class="card ranking">
    <h2>Classement individuel</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col">#</th><th scope="col">Joueur</th><th scope="col">Moy.</th><th scope="col">MJ</th><th scope="col">Δ / MJ</th></tr></thead>
        <tbody id="ranking">
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.rank ?? '—' }}</td><td>{{ row.name }}</td>
            <td>{{ row.played ? format(row.points / row.played) : '—' }}</td><td>{{ row.played }}</td>
            <td>{{ row.played ? format(row.difference / row.played) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small muted">MJ = matchs avec score validé. Moy. = points / MJ. Δ / MJ = différence de points moyenne. Les scores des deux équipes doivent être saisis pour compter.</p>
  </div>
</template>
