<script setup lang="ts">
import { ref } from 'vue'

useHead({
  title: 'Admin Login — LAMULA WebViewer',
  meta: [{ name: 'robots', content: 'noindex' }],
})

const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function onLogin() {
  if (!password.value.trim() || loading.value) return

  loading.value = true
  error.value = null

  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo('/admin/feedback')
  }
  catch (err: unknown) {
    const errorObj = err as { statusMessage?: string; message?: string }
    error.value = errorObj.statusMessage || errorObj.message || 'Contraseña incorrecta'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 p-4">
    <div class="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <h1 class="text-lg font-bold text-teal-400 mb-1">
        Administración LAMULA
      </h1>
      <p class="text-xs text-slate-400 mb-6">
        Inicia sesión con la contraseña de administrador.
      </p>

      <form class="space-y-4" @submit.prevent="onLogin">
        <div>
          <label class="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
          <input
            v-model="password"
            type="password"
            data-testid="admin-password-input"
            class="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none"
            placeholder="••••••••"
          >
        </div>

        <p v-if="error" class="text-xs text-red-400 font-semibold">
          {{ error }}
        </p>

        <button
          type="submit"
          data-testid="admin-login-btn"
          :disabled="loading || !password.trim()"
          class="w-full rounded-lg bg-teal-600 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-teal-500 disabled:opacity-50"
        >
          {{ loading ? 'Ingresando...' : 'Iniciar sesión' }}
        </button>
      </form>
    </div>
  </div>
</template>
