<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import App from './App.vue'
import AccessForm from './components/AccessForm.vue'
import { api, type Account, type Document, type Summary, type User } from './services/api'
import type { Tournament } from './domain/tournament'
import type { RemotePersistence } from './composables/useTournament'

const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true'
const user = ref<User | null>(null)
const loading = ref(!localOnly)
const busy = ref(false)
const saving = ref(false)
const error = ref('')
const invitation = ref(new URLSearchParams(location.hash.slice(1)).get('invitation') ?? '')
const tournaments = ref<Summary[]>([])
const accounts = ref<Account[]>([])
const selected = ref<Document | null>(null)
const opened = ref(false)
const appKey = ref(0)
const tournamentName = ref('')
const inviteEmail = ref('')
const inviteKind = ref<'invite' | 'reset'>('invite')
const inviteLink = ref('')
const adminOpen = ref(false)
let persistChain = Promise.resolve()
const remote = computed<RemotePersistence>(() => ({ initial: selected.value?.data ?? null, persist }))

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = ''
  try { await action() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { busy.value = false }
}
async function refreshList() { tournaments.value = await api.list() }
async function authenticated(account: User) {
  user.value = account
  invitation.value = ''
  history.replaceState(null, '', location.pathname + location.search)
  await refreshList()
}
async function login(email: string, password: string) { await run(async () => authenticated(await api.login(email, password))) }
async function accept(password: string) { await run(async () => authenticated(await api.accept(invitation.value, password))) }
function cancelInvitation() {
  invitation.value = ''
  history.replaceState(null, '', location.pathname + location.search)
}
async function persist(data: Tournament) {
  const result = selected.value ? await api.save(selected.value, data) : await api.create(tournamentName.value, data)
  selected.value = result
}
// L'interface de navigation attend la dernière écriture confirmée avant de quitter.
function queuedPersist(data: Tournament) {
  const promise = persistChain.then(() => persist(data))
  persistChain = promise.catch(cause => {
    error.value = cause instanceof Error ? cause.message : String(cause)
  })
  return promise
}
const persistence = computed<RemotePersistence>(() => ({ ...remote.value, persist: queuedPersist }))
async function open(id: string) {
  await run(async () => {
    await persistChain
    selected.value = await api.get(id)
    tournamentName.value = selected.value.name
    opened.value = true
    appKey.value++
  })
}
function create() {
  if (!tournamentName.value.trim() || tournamentName.value.trim().length > 100) {
    error.value = 'Le nom du tournoi doit contenir entre 1 et 100 caractères.'
    return
  }
  selected.value = null
  opened.value = true
  appKey.value++
}
async function back() {
  if (!confirm('Revenir à la liste ? Exportez une copie si des modifications ne sont pas enregistrées.')) return
  await run(async () => {
    await persistChain
    opened.value = false
    await refreshList()
    if (adminOpen.value) accounts.value = await api.accounts()
  })
}
async function reload() {
  if (!selected.value || !confirm('Recharger le tournoi du serveur ? Les modifications locales non enregistrées seront perdues. Exportez-les avant de continuer.')) return
  await open(selected.value.id)
}
async function logout() {
  if (opened.value && !confirm('Se déconnecter ? Exportez vos modifications si elles ne sont pas enregistrées.')) return
  await run(async () => {
    await persistChain
    await api.logout()
    user.value = null
    opened.value = false
    selected.value = null
    tournaments.value = []
    accounts.value = []
    adminOpen.value = false
    inviteLink.value = ''
  })
}
async function toggleAdmin() {
  await run(async () => { accounts.value = await api.accounts(); adminOpen.value = !adminOpen.value })
}
async function invite() {
  if (inviteKind.value === 'reset' && !confirm('Créer un lien de réinitialisation pour ce compte ? Le mot de passe actuel ne changera qu’après utilisation du lien.')) return
  await run(async () => { inviteLink.value = await api.invitation(inviteEmail.value, inviteKind.value) })
}
async function active(account: Account) {
  if (!confirm(`${account.active ? 'Désactiver' : 'Réactiver'} l’accès de ${account.email} ?`)) return
  await run(async () => { await api.setActive(account.id, !account.active); accounts.value = await api.accounts() })
}
onMounted(async () => {
  if (localOnly) return
  await run(async () => { user.value = await api.session(); if (user.value) await refreshList() })
  loading.value = false
})
</script>

<template>
  <App v-if="localOnly" />
  <template v-else>
    <div v-if="error" class="error account-error" role="alert">{{ error }}</div>
    <main v-if="loading"><p role="status">Vérification de votre accès…</p></main>
    <AccessForm v-else-if="!user || invitation" :busy="busy" :invitation="invitation" @login="login" @accept="accept" @cancel="cancelInvitation" />
    <template v-else>
      <div class="account-bar">
        <span>{{ user.email }} · {{ user.role === 'admin' ? 'Administrateur' : 'Organisateur' }}</span>
        <div class="actions">
          <button v-if="opened" type="button" :disabled="busy || saving" @click="back">Tous les tournois</button>
          <button v-if="opened && selected" type="button" :disabled="busy || saving" @click="reload">Recharger depuis le serveur</button>
          <button v-if="user.role === 'admin' && !opened" type="button" :disabled="busy" @click="toggleAdmin">Gérer les accès</button>
          <button type="button" :disabled="busy || saving" @click="logout">Se déconnecter</button>
        </div>
      </div>
      <template v-if="opened">
        <div class="shared-title"><strong>{{ tournamentName }}</strong><span class="small muted">Tournoi partagé · rechargez pour voir les modifications des autres organisateurs.</span></div>
        <App :key="appKey" :remote="persistence" @saving="saving = $event" />
      </template>
      <main v-else>
        <div class="eyebrow">Espace privé</div><h1>Vos tournois partagés.</h1>
        <p class="muted">Tous les organisateurs autorisés peuvent consulter et modifier ces tournois.</p>
        <section v-if="adminOpen" class="card admin-panel">
          <h2>Gérer les accès</h2>
          <form class="fields" @submit.prevent="invite">
            <div><label for="invite-email">E-mail de l’organisateur</label><input id="invite-email" v-model="inviteEmail" type="email" required maxlength="254"></div>
            <div><label for="invite-kind">Type de lien</label><select id="invite-kind" v-model="inviteKind"><option value="invite">Invitation</option><option value="reset">Réinitialisation du mot de passe</option></select></div>
            <button type="submit" :disabled="busy">Créer le lien privé</button>
          </form>
          <div v-if="inviteLink" class="notice"><label for="invite-link">À transmettre uniquement au destinataire — valide 48 h, usage unique</label><input id="invite-link" :value="inviteLink" readonly @focus="($event.target as HTMLInputElement).select()"></div>
          <ul class="account-list"><li v-for="account in accounts" :key="account.id"><span>{{ account.email }} · {{ account.role }} · {{ account.active ? 'Actif' : 'Désactivé' }}</span><button v-if="account.role !== 'admin'" type="button" :disabled="busy" @click="active(account)">{{ account.active ? 'Désactiver' : 'Réactiver' }}</button></li></ul>
        </section>
        <section class="card">
          <h2>Ouvrir un tournoi</h2>
          <button type="button" :disabled="busy" @click="run(refreshList)">Actualiser la liste</button>
          <p v-if="!tournaments.length" class="muted">Aucun tournoi pour le moment.</p>
          <ul class="tournament-list"><li v-for="item in tournaments" :key="item.id"><span><strong>{{ item.name }}</strong><br><span class="small muted">Modifié le {{ new Date(item.updated_at).toLocaleString('fr') }} · version {{ item.revision }}</span></span><button type="button" :disabled="busy" @click="open(item.id)">Ouvrir</button></li></ul>
        </section>
        <form class="card create-shared" @submit.prevent="create">
          <h2>Nouveau tournoi partagé</h2><label for="tournament-name">Nom du tournoi</label><input id="tournament-name" v-model="tournamentName" maxlength="100" required>
          <p class="small muted">Vous pourrez configurer les joueurs ou importer une sauvegarde JSON existante.</p>
          <button class="primary" type="submit" :disabled="busy">Préparer le tournoi</button>
        </form>
      </main>
    </template>
  </template>
</template>
