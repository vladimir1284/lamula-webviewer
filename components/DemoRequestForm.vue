<script setup lang="ts">
// Solicitud de acceso al demo (lamula-jobs D20). Campos aprobados el 2026-11-07; lo manda a /api/demo/request.
import { computed, ref } from 'vue'

const { t } = useI18n()
const hasSiteKey = computed(() => !!useRuntimeConfig().public.turnstileSiteKey)
const INTERESES = ['huracan', 'dia', 'propias', 'otra'] as const

const f = ref({ email: '', org: '', cargo: '', radar: '', comentario: '', interes: [] as string[], acepta: false })
const turnstile = ref<string | null>(null)
const widget = ref<{ reset: () => void }>()
const busy = ref(false)
const sent = ref(false)
const err = ref('')

const ready = computed(() => !!f.value.email && !!f.value.org && f.value.interes.length > 0 && f.value.acepta
  && (!hasSiteKey.value || !!turnstile.value))

async function submit() {
  err.value = ''
  busy.value = true
  try {
    await $fetch('/api/demo/request', {
      method: 'POST',
      body: { ...f.value, acepta_aviso: f.value.acepta, turnstile: turnstile.value ?? '' },
    })
    sent.value = true
  }
  catch (e) {
    const x = e as { statusCode?: number }
    err.value = x.statusCode === 429 ? t('job.reqTooMany') : x.statusCode === 403 ? t('job.reqCaptcha') : x.statusCode === 422 ? t('job.reqInvalid') : t('job.reqError')
    widget.value?.reset() // el token de Turnstile solo vale una vez
  }
  finally { busy.value = false }
}
</script>

<template>
  <p v-if="sent" role="status" class="rounded border px-3 py-2" data-testid="req-sent">
    {{ t('job.reqSent') }}
  </p>
  <form v-else class="flex flex-col gap-3" data-testid="req-form" @submit.prevent="submit">
    <label class="flex flex-col text-sm">{{ t('job.reqEmail') }}
      <input v-model="f.email" type="email" required autocomplete="email" class="rounded border px-3 py-2" data-testid="req-email">
    </label>
    <label class="flex flex-col text-sm">{{ t('job.reqOrg') }}
      <input v-model="f.org" required autocomplete="organization" class="rounded border px-3 py-2" data-testid="req-org">
    </label>
    <label class="flex flex-col text-sm">{{ t('job.reqCargo') }}
      <input v-model="f.cargo" autocomplete="organization-title" class="rounded border px-3 py-2">
    </label>
    <fieldset class="flex flex-col gap-1 text-sm">
      <legend class="mb-1">
        {{ t('job.reqInterest') }}
      </legend>
      <label v-for="i in INTERESES" :key="i" class="flex items-center gap-2">
        <input v-model="f.interes" type="checkbox" :value="i" :data-testid="`req-int-${i}`"> {{ t(`job.reqInt_${i}`) }}
      </label>
    </fieldset>
    <label class="flex flex-col text-sm">{{ t('job.reqRadar') }}
      <input v-model="f.radar" class="rounded border px-3 py-2">
    </label>
    <label class="flex flex-col text-sm">{{ t('job.reqComment') }}
      <textarea v-model="f.comentario" rows="3" maxlength="2000" class="rounded border px-3 py-2" />
    </label>
    <label class="flex items-start gap-2 text-sm">
      <input v-model="f.acepta" type="checkbox" class="mt-1" data-testid="req-accept"> {{ t('job.reqAccept') }}
    </label>
    <TurnstileWidget ref="widget" v-model="turnstile" />
    <p v-if="err" role="alert" class="text-sm text-red-600" data-testid="req-error">
      {{ err }}
    </p>
    <button type="submit" :disabled="busy || !ready" class="rounded border px-4 py-2" data-testid="req-submit">
      {{ t('job.reqSubmit') }}
    </button>
  </form>
</template>
