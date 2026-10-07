<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { FeedbackAdminItem, FeedbackStatus } from '#shared/contract'
import { FEEDBACK_ROLES, FEEDBACK_STATUSES } from '#shared/contract'

useHead({
  title: 'Gestión de Feedback — Admin LAMULA',
  meta: [{ name: 'robots', content: 'noindex' }],
})

const items = ref<FeedbackAdminItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const selectedStatus = ref<string>('')
const selectedRole = ref<string>('')

const replyingId = ref<string | null>(null)
const replyText = ref('')
const submittingReply = ref(false)

async function loadFeedback() {
  loading.value = true
  error.value = null
  try {
    const query: Record<string, string> = {}
    if (selectedStatus.value) query.status = selectedStatus.value
    if (selectedRole.value) query.role = selectedRole.value

    items.value = await $fetch<FeedbackAdminItem[]>('/api/admin/feedback', { query })
  }
  catch (err: unknown) {
    const errorObj = err as { statusCode?: number; statusMessage?: string; message?: string }
    if (errorObj.statusCode === 401) {
      await navigateTo('/admin/login')
    }
    else {
      error.value = errorObj.statusMessage || errorObj.message || 'Error cargando feedback'
    }
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadFeedback()
})

async function onUpdateStatus(id: string, newStatus: FeedbackStatus) {
  try {
    await $fetch(`/api/admin/feedback/${id}/status`, {
      method: 'POST',
      body: { status: newStatus },
    })
    await loadFeedback()
  }
  catch (err: unknown) {
    const errorObj = err as { statusMessage?: string; message?: string }
    alert(errorObj.statusMessage || errorObj.message || 'Error actualizando estado')
  }
}

async function onSendReply(id: string) {
  if (!replyText.value.trim() || submittingReply.value) return

  submittingReply.value = true
  try {
    await $fetch(`/api/admin/feedback/${id}/reply`, {
      method: 'POST',
      body: { body: replyText.value.trim(), author: 'Equipo LAMULA' },
    })
    replyText.value = ''
    replyingId.value = null
    await loadFeedback()
  }
  catch (err: unknown) {
    const errorObj = err as { statusMessage?: string; message?: string }
    alert(errorObj.statusMessage || errorObj.message || 'Error enviando respuesta')
  }
  finally {
    submittingReply.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 p-6">
    <div class="mx-auto max-w-6xl space-y-6">
      <header class="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 class="text-xl font-bold text-teal-400">
            Administración de Feedback
          </h1>
          <p class="text-xs text-slate-400">
            Revisa y responde opiniones de usuarios de LAMULA WebViewer.
          </p>
        </div>
        <button
          type="button"
          class="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          @click="loadFeedback"
        >
          🔄 Refrescar
        </button>
      </header>

      <!-- Filtros -->
      <div class="flex gap-4 bg-slate-900 p-4 rounded-lg border border-slate-800 text-xs">
        <label class="block">
          <span class="block text-slate-400 mb-1">Estado</span>
          <select v-model="selectedStatus" class="rounded bg-slate-800 border border-slate-700 p-1.5 text-slate-100" @change="loadFeedback">
            <option value="">Todos los estados</option>
            <option v-for="s in FEEDBACK_STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label class="block">
          <span class="block text-slate-400 mb-1">Ocupación / Rol</span>
          <select v-model="selectedRole" class="rounded bg-slate-800 border border-slate-700 p-1.5 text-slate-100" @change="loadFeedback">
            <option value="">Todas las ocupaciones</option>
            <option v-for="r in FEEDBACK_ROLES" :key="r" :value="r">{{ r }}</option>
          </select>
        </label>
      </div>

      <p v-if="loading" class="text-xs text-slate-400 py-6 text-center">
        Cargando mensajes...
      </p>
      <p v-else-if="error" class="text-xs text-red-400 py-6 text-center">
        {{ error }}
      </p>
      <p v-else-if="items.length === 0" class="text-xs text-slate-500 py-6 text-center">
        No hay mensajes registrados con estos filtros.
      </p>

      <!-- Lista de items -->
      <div v-else class="space-y-4">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3"
        >
          <div class="flex items-start justify-between text-xs border-b border-slate-800/80 pb-3">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-bold text-teal-300 text-sm capitalize">{{ item.user.role }}</span>
                <span v-if="item.user.roleOther" class="text-slate-400">({{ item.user.roleOther }})</span>
                <span class="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 uppercase">{{ item.kind }}</span>
                <span v-if="item.rating" class="text-amber-400">★ {{ item.rating }}/5</span>
              </div>
              <div class="text-slate-400 text-[11px]">
                <span v-if="item.user.displayName">{{ item.user.displayName }} · </span>
                <span v-if="item.user.email">{{ item.user.email }} · </span>
                <span v-if="item.user.organization">{{ item.user.organization }} · </span>
                <span v-if="item.user.country">{{ item.user.country }}</span>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <span class="text-slate-500 text-[11px]">{{ item.createdAt.slice(0, 16).replace('T', ' ') }}</span>
              <select
                :value="item.status"
                class="rounded bg-slate-800 border border-slate-700 p-1 text-xs text-slate-200"
                @change="onUpdateStatus(item.id, ($event.target as HTMLSelectElement).value as FeedbackStatus)"
              >
                <option v-for="s in FEEDBACK_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>

          <!-- Mensaje principal -->
          <p class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
            {{ item.message }}
          </p>

          <!-- Contexto capturado -->
          <details v-if="item.context && Object.keys(item.context).length > 0" class="text-xs text-slate-500">
            <summary class="cursor-pointer hover:text-slate-300">
              Contexto del mapa (site, producto, URL, visor)
            </summary>
            <pre class="mt-2 rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-400 overflow-x-auto">{{ JSON.stringify(item.context, null, 2) }}</pre>
          </details>

          <!-- Respuestas existentes -->
          <div v-if="item.replies.length > 0" class="border-t border-slate-800 pt-3 space-y-2">
            <div
              v-for="r in item.replies"
              :key="r.id"
              class="rounded bg-slate-950 p-3 text-xs border-l-2 border-teal-500"
            >
              <div class="flex justify-between font-bold text-teal-400 mb-1">
                <span>{{ r.author }}</span>
                <span class="text-[10px] text-slate-500">{{ r.createdAt.slice(0, 16).replace('T', ' ') }} {{ r.readAt ? '(Leído)' : '(Pendiente)' }}</span>
              </div>
              <p class="text-slate-300 whitespace-pre-wrap">
                {{ r.body }}
              </p>
            </div>
          </div>

          <!-- Caja para responder -->
          <div class="pt-2">
            <button
              v-if="replyingId !== item.id"
              type="button"
              class="text-xs text-teal-400 font-semibold hover:underline"
              @click="replyingId = item.id; replyText = ''"
            >
              💬 Responder a este usuario
            </button>

            <div v-else class="space-y-2 mt-2">
              <textarea
                v-model="replyText"
                rows="2"
                class="w-full rounded border border-slate-700 bg-slate-800 p-2 text-xs text-slate-100 placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                placeholder="Escribe la respuesta oficial para el usuario..."
              />
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
                  @click="replyingId = null"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  :disabled="!replyText.trim() || submittingReply"
                  class="rounded bg-teal-600 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-teal-500 disabled:opacity-50"
                  @click="onSendReply(item.id)"
                >
                  Enviar respuesta
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
