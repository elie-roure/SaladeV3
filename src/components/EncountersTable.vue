<script setup lang="ts">
import type { encounters } from '../domain/tournament'

defineProps<{ rows: ReturnType<typeof encounters> }>()
const roles = ['partners', 'opponents'] as const
</script>

<template>
  <section class="card encounters" aria-labelledby="encounters-title">
    <h2 id="encounters-title">Avec qui et contre qui ?</h2>
    <p id="encounters-help" class="small muted">Récapitulatif de toutes les manches du tournoi, uniquement pour les matchs dont les deux scores sont saisis. Le compteur « 2× » indique deux matchs avec ce partenaire ou contre cet adversaire. Sur mobile, faites défiler le tableau horizontalement.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Tableau des partenaires et adversaires">
      <table aria-describedby="encounters-help">
        <thead><tr><th scope="col">Joueur</th><th scope="col">Matchs joués</th><th scope="col">Avec (partenaires)</th><th scope="col">Contre (adversaires)</th></tr></thead>
        <tbody id="encounters">
          <tr v-for="row in rows" :key="row.id">
            <th scope="row">{{ row.name }}</th><td>{{ row.played }}</td>
            <td v-for="role in roles" :key="role">
              <span v-if="!row[role].length" class="muted">—</span>
              <span v-for="person in row[role]" :key="person.id" class="encounter-person">
                {{ person.name }} <span class="pill" :aria-label="`${person.count} rencontre${person.count > 1 ? 's' : ''}`">{{ person.count }}×</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
