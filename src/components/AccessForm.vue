<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ invitation: string; busy: boolean }>()
const emit = defineEmits<{ login: [email: string, password: string]; accept: [password: string]; cancel: [] }>()
const email = ref('')
const password = ref('')
const confirmation = ref('')
const formError = ref('')
function accept() {
  if (password.value !== confirmation.value) { formError.value = 'Les mots de passe ne correspondent pas.'; return }
  formError.value = ''
  emit('accept', password.value)
}
</script>

<template>
  <header><div class="bar"><div class="brand">salade<span>.</span></div><span class="tag">Accès privé</span></div></header>
  <main class="access">
    <div class="card">
      <div class="eyebrow">Organisateurs</div>
      <h1>{{ invitation ? 'Bienvenue.' : 'Connexion.' }}</h1>
      <p class="muted">{{ invitation ? 'Choisissez un mot de passe pour activer votre invitation ou réinitialiser votre accès.' : 'Connectez-vous pour retrouver les tournois partagés.' }}</p>
      <form @submit.prevent="invitation ? accept() : emit('login', email, password)">
        <div v-if="!invitation" class="field"><label for="email">E-mail</label><input id="email" v-model="email" type="email" autocomplete="username" maxlength="254" required></div>
        <div class="field"><label for="password">Mot de passe</label><input id="password" v-model="password" type="password" :autocomplete="invitation ? 'new-password' : 'current-password'" minlength="12" maxlength="128" required></div>
        <div v-if="invitation" class="field"><label for="password-confirmation">Confirmer le mot de passe</label><input id="password-confirmation" v-model="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <p class="small muted">Entre 12 et 128 caractères. Mot de passe oublié ? Demandez un lien de réinitialisation à l’administrateur.</p>
        <div class="actions"><button class="primary" type="submit" :disabled="busy">{{ busy ? 'Connexion…' : invitation ? 'Activer mon accès' : 'Se connecter' }}</button><button v-if="invitation" type="button" :disabled="busy" @click="emit('cancel')">Annuler</button></div>
      </form>
      <p class="small muted access-note">Pas d’inscription publique. Seuls les organisateurs invités peuvent accéder aux tournois.</p>
    </div>
  </main>
</template>
