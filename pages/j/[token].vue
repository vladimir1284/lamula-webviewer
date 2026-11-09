<script setup lang="ts">
// Pantalla de estado de un job del plano demo (lamula-jobs). Consulta /api/job/<token> —que además fija la cookie
// con la que el DAL saca las credenciales— y, en cuanto el job ya publicó el primer lote (hay radar), abre el visor.
// El visor sigue el último producto en modo vivo, así que los siguientes lotes aparecen solos.
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface JobStatus {
  state: string
  vol_from: string | null
  vol_to: string | null
  site_id: string | null
  product: number | null
}

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const status = ref<JobStatus | null>(null)
const problem = ref<'notFound' | 'unreachable' | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let gone = false

async function poll() {
  try {
    status.value = await $fetch<JobStatus>(`/api/job/${route.params.token}`)
    problem.value = null
    if (status.value.site_id && status.value.product && status.value.state !== 'failed') {
      await navigateTo(localePath(`/${status.value.site_id}/${status.value.product}`), { replace: true })
      return
    }
  }
  catch (e) {
    const code = (e as { statusCode?: number }).statusCode
    problem.value = code === 404 ? 'notFound' : 'unreachable'
    if (code === 404) return
  }
  if (!gone && status.value?.state !== 'failed') timer = setTimeout(poll, 4000)
}

onMounted(poll)
onBeforeUnmount(() => {
  gone = true
  clearTimeout(timer)
})

const message = computed(() => {
  if (problem.value) return t(`job.${problem.value}`)
  const s = status.value?.state
  if (s === 'failed') return t('job.failed')
  if (s === 'ready') return t('job.ready')
  return s === 'queued' || s === 'claimed' || !s ? t('job.queued') : t('job.running')
})
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
    <h1 class="text-2xl font-semibold">
      {{ t('job.title') }}
    </h1>
    <p role="status" aria-live="polite" data-testid="job-status">
      {{ message }}
    </p>
    <p v-if="status?.vol_from && status?.vol_to" class="text-sm opacity-70">
      {{ t('job.window', { from: status.vol_from.slice(0, 16).replace('T', ' '), to: status.vol_to.slice(0, 16).replace('T', ' ') }) }}
    </p>
    <p class="text-xs opacity-60">
      {{ t('job.notOfficial') }}
    </p>
  </main>
</template>
