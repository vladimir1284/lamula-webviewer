<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  FeedbackContext,
  FeedbackKind,
  FeedbackProfile,
  FeedbackRole,
  FeedbackSubmission,
  FeedbackThreadItem,
} from '#shared/contract'
import { FEEDBACK_KINDS, FEEDBACK_ROLES } from '#shared/contract'

const props = defineProps<{
  open: boolean
  activeTab: 'submit' | 'mine'
  profile?: FeedbackProfile
  items: FeedbackThreadItem[]
  mapContext?: FeedbackContext
  submitting: boolean
  submissionError?: string | null
}>()

const emit = defineEmits<{
  close: []
  'switch-tab': [tab: 'submit' | 'mine']
  submit: [payload: FeedbackSubmission]
  'mark-read': []
}>()

const dialogRef = ref<HTMLDialogElement>()

const role = ref<FeedbackRole>(props.profile?.role ?? 'meteorologo')
const roleOther = ref(props.profile?.roleOther ?? '')
const kind = ref<FeedbackKind>('mejora')
const rating = ref<number | null>(null)
const message = ref('')

const showAboutMe = ref(false)
const displayName = ref(props.profile?.displayName ?? '')
const email = ref(props.profile?.email ?? '')
const organization = ref(props.profile?.organization ?? '')
const country = ref(props.profile?.country ?? '')

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    if (!dialogRef.value?.open) dialogRef.value?.showModal()
  }
  else {
    if (dialogRef.value?.open) dialogRef.value?.close()
  }
})

watch(() => props.activeTab, (tab) => {
  if (tab === 'mine') {
    emit('mark-read')
  }
})

function onRoleChange(e: Event) {
  role.value = (e.target as HTMLSelectElement).value as FeedbackRole
}

function onKindChange(e: Event) {
  kind.value = (e.target as HTMLSelectElement).value as FeedbackKind
}

function setRating(val: number) {
  rating.value = rating.value === val ? null : val
}

const canSubmit = computed(() => {
  if (role.value === 'otro' && !roleOther.value.trim()) return false
  if (!message.value.trim()) return false
  return !props.submitting
})

function onSubmit() {
  if (!canSubmit.value) return

  const payload: FeedbackSubmission = {
    role: role.value,
    roleOther: role.value === 'otro' ? roleOther.value.trim() : null,
    kind: kind.value,
    rating: rating.value,
    message: message.value.trim(),
    profile: {
      role: role.value,
      roleOther: role.value === 'otro' ? roleOther.value.trim() : null,
      displayName: displayName.value.trim() || null,
      email: email.value.trim() || null,
      organization: organization.value.trim() || null,
      country: country.value.trim() || null,
    },
    context: props.mapContext,
  }

  emit('submit', payload)
}
</script>

<template>
  <dialog
    ref="dialogRef"
    data-testid="feedback-dialog"
    aria-labelledby="feedback-dialog-title"
    class="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/70"
    @cancel.prevent="emit('close')"
  >
    <div class="flex items-center justify-between border-b border-slate-800 px-5 py-4">
      <h2 id="feedback-dialog-title" class="text-base font-bold text-slate-100">
        Opinión y Sugerencias
      </h2>
      <button
        type="button"
        data-testid="feedback-dialog-close"
        class="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-slate-800 px-5">
      <button
        type="button"
        data-testid="feedback-tab-submit"
        class="border-b-2 py-2.5 px-3 text-sm font-semibold transition-colors"
        :class="activeTab === 'submit' ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-200'"
        @click="emit('switch-tab', 'submit')"
      >
        Enviar opinión
      </button>
      <button
        type="button"
        data-testid="feedback-tab-mine"
        class="border-b-2 py-2.5 px-3 text-sm font-semibold transition-colors"
        :class="activeTab === 'mine' ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-200'"
        @click="emit('switch-tab', 'mine')"
      >
        Mis mensajes ({{ items.length }})
      </button>
    </div>

    <!-- Tab 1: Formulario -->
    <div v-if="activeTab === 'submit'" class="space-y-4 p-5 text-sm">
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-slate-400 font-medium">Ocupación / Perfil <span class="text-teal-400">*</span></span>
          <select
            :value="role"
            data-testid="feedback-role-select"
            class="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100 focus:border-teal-400 focus:outline-none"
            @change="onRoleChange"
          >
            <option v-for="r in FEEDBACK_ROLES" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="mb-1 block text-slate-400 font-medium">Tipo de mensaje</span>
          <select
            :value="kind"
            data-testid="feedback-kind-select"
            class="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100 focus:border-teal-400 focus:outline-none"
            @change="onKindChange"
          >
            <option v-for="k in FEEDBACK_KINDS" :key="k" :value="k">
              {{ k }}
            </option>
          </select>
        </label>
      </div>

      <label v-if="role === 'otro'" class="block">
        <span class="mb-1 block text-slate-400 font-medium">Especificar ocupación <span class="text-teal-400">*</span></span>
        <input
          v-model="roleOther"
          type="text"
          class="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-100 focus:border-teal-400 focus:outline-none"
          placeholder="Ej: Aficionado a la meteorología"
        >
      </label>

      <div>
        <span class="mb-1 block text-slate-400 font-medium">Valoración (opcional)</span>
        <div class="flex items-center gap-1">
          <button
            v-for="star in 5"
            :key="star"
            type="button"
            :data-testid="`rating-star-${star}`"
            class="text-xl transition-transform hover:scale-110"
            :class="(rating && star <= rating) ? 'text-amber-400' : 'text-slate-600'"
            @click="setRating(star)"
          >
            ★
          </button>
        </div>
      </div>

      <label class="block">
        <span class="mb-1 block text-slate-400 font-medium">Mensaje <span class="text-teal-400">*</span></span>
        <textarea
          v-model="message"
          data-testid="feedback-message-input"
          rows="4"
          class="w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-slate-100 placeholder-slate-500 focus:border-teal-400 focus:outline-none"
          placeholder="Escribe aquí tu opinión, reporte de bug o sugerencia..."
        />
      </label>

      <!-- Sobre ti (Plegable) -->
      <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <button
          type="button"
          class="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-400 hover:text-slate-200"
          @click="showAboutMe = !showAboutMe"
        >
          <span>Contacto opcional (sobre ti)</span>
          <span>{{ showAboutMe ? '▲' : '▼' }}</span>
        </button>

        <div v-if="showAboutMe" class="mt-3 grid grid-cols-2 gap-3 text-xs">
          <label class="block">
            <span class="mb-1 block text-slate-400">Nombre</span>
            <input
              v-model="displayName"
              type="text"
              class="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-100"
            >
          </label>
          <label class="block">
            <span class="mb-1 block text-slate-400">Email</span>
            <input
              v-model="email"
              type="email"
              class="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-100"
            >
          </label>
          <label class="block">
            <span class="mb-1 block text-slate-400">Institución</span>
            <input
              v-model="organization"
              type="text"
              class="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-100"
            >
          </label>
          <label class="block">
            <span class="mb-1 block text-slate-400">País</span>
            <input
              v-model="country"
              type="text"
              class="w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-slate-100"
            >
          </label>
        </div>
      </div>

      <p v-if="submissionError" class="rounded bg-red-900/60 p-2 text-xs text-red-200">
        {{ submissionError }}
      </p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="rounded-lg px-4 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="feedback-submit-btn"
          :disabled="!canSubmit"
          class="rounded-lg bg-teal-600 px-5 py-2 font-bold text-slate-950 transition-colors hover:bg-teal-500 disabled:opacity-50"
          @click="onSubmit"
        >
          {{ submitting ? 'Enviando...' : 'Enviar opinión' }}
        </button>
      </div>
    </div>

    <!-- Tab 2: Mis mensajes -->
    <div v-else-if="activeTab === 'mine'" class="max-h-96 overflow-y-auto space-y-3 p-5 text-sm">
      <p v-if="items.length === 0" class="py-6 text-center text-slate-500">
        Aún no has enviado mensajes desde este navegador.
      </p>

      <div
        v-for="item in items"
        :key="item.id"
        data-testid="feedback-item-thread"
        class="rounded-lg border border-slate-800 bg-slate-800/60 p-4 space-y-2"
      >
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span class="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-200 uppercase">{{ item.kind }}</span>
          <span>{{ item.createdAt.slice(0, 16).replace('T', ' ') }}</span>
        </div>

        <p class="text-slate-200 whitespace-pre-wrap">{{ item.message }}</p>

        <!-- Respuestas del administrador -->
        <div v-if="item.replies.length > 0" class="mt-3 space-y-2 border-t border-slate-700/60 pt-2 pl-3">
          <div
            v-for="reply in item.replies"
            :key="reply.id"
            class="rounded bg-slate-900/80 p-2.5 text-xs text-teal-200 border-l-2 border-teal-400"
          >
            <div class="flex justify-between font-bold text-teal-400 mb-1">
              <span>{{ reply.author }}</span>
              <span class="text-[10px] text-slate-500">{{ reply.createdAt.slice(0, 16).replace('T', ' ') }}</span>
            </div>
            <p class="whitespace-pre-wrap text-slate-200">{{ reply.body }}</p>
          </div>
        </div>
      </div>
    </div>
  </dialog>
</template>
