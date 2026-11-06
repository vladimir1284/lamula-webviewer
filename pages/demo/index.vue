<script setup lang="ts">
// Selector del plano demo (lamula-jobs, F4): token de acceso → caso preparado o radar/día/rango → estimación → lanzar.
// Todo pasa por /api/demo/*, que pone el token desde una cookie httpOnly; esta página nunca lo reenvía.
import { computed, ref } from 'vue'

interface Caso { id: string, titulo: string, icao: string, desde: string, hasta: string }
interface Vol { key: string, bytes: number, time: string }
interface Detalle { id: string, volumes: Vol[], estimate: { n_volumes: number, bytes: number, minutos: number } }

const { t } = useI18n()
const localePath = useLocalePath()
const token = ref('')
const entered = ref(false)
const casos = ref<Caso[]>([])
const err = ref('')
const busy = ref(false)

const day = ref(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10))
const sites = ref<string[] | null>(null)
const site = ref('')
const vols = ref<Vol[]>([])
const iFrom = ref(0)
const iTo = ref(0)

const picked = computed(() => vols.value.slice(Math.min(iFrom.value, iTo.value), Math.max(iFrom.value, iTo.value) + 1))
const MIN_POR_VOLUMEN = 80 / 12 // el mismo que catalogo.py: no se inventa otra estimación
const estimate = computed(() => ({
  n: picked.value.length,
  min: Math.round(picked.value.length * MIN_POR_VOLUMEN),
  mb: Math.round(picked.value.reduce((a, v) => a + v.bytes, 0) / 1e6),
}))

function msg(e: unknown): string {
  const x = e as { statusCode?: number, statusMessage?: string }
  if (x.statusCode === 409) return t('job.selBusy')
  if (x.statusCode === 429) return t('job.selQuota')
  return t('job.selError', { msg: x.statusMessage ?? String(e) })
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  err.value = ''
  busy.value = true
  try { return await fn() }
  catch (e) { err.value = msg(e) }
  finally { busy.value = false }
}

async function enter() {
  err.value = ''
  busy.value = true
  try {
    await $fetch('/api/demo/session', { method: 'POST', body: { token: token.value.trim() } })
    casos.value = await $fetch<Caso[]>('/api/demo/catalog/cases')
    entered.value = true
  }
  catch (e) {
    err.value = (e as { statusCode?: number }).statusCode === 401 ? t('job.selTokenBad') : msg(e)
  }
  finally { busy.value = false }
}

async function loadSites() {
  sites.value = null
  vols.value = []
  const r = await guard(() => $fetch<{ sites: string[] }>('/api/demo/catalog/sites', { query: { day: day.value } }))
  if (r) { sites.value = r.sites; site.value = r.sites[0] ?? ''; if (site.value) await loadVols() }
}

async function loadVols() {
  const r = await guard(() => $fetch<{ volumes: Vol[] }>('/api/demo/catalog/volumes', { query: { site: site.value, day: day.value } }))
  if (r) { vols.value = r.volumes; iFrom.value = 0; iTo.value = Math.min(11, r.volumes.length - 1) }
}

async function launch(icao: string, keys: string[]) {
  const r = await guard(() => $fetch<{ result_token: string }>('/api/demo/jobs', { method: 'POST', body: { icao, source_keys: keys } }))
  if (r) await navigateTo(localePath(`/j/${r.result_token}`))
}

async function launchCase(c: Caso) {
  const d = await guard(() => $fetch<Detalle>(`/api/demo/catalog/cases/${c.id}`))
  if (d) await launch(c.icao, d.volumes.map(v => v.key))
}
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
    <h1 class="text-2xl font-semibold">
      {{ t('job.selTitle') }}
    </h1>

    <form v-if="!entered" class="flex gap-2" @submit.prevent="enter">
      <input v-model="token" type="password" autocomplete="off" :placeholder="t('job.selToken')" :aria-label="t('job.selToken')" class="flex-1 rounded border px-3 py-2" data-testid="demo-token">
      <button type="submit" :disabled="busy || !token" class="rounded border px-4 py-2" data-testid="demo-enter">
        {{ t('job.selTokenGo') }}
      </button>
    </form>

    <template v-else>
      <section>
        <h2 class="mb-2 font-medium">
          {{ t('job.selCases') }}
        </h2>
        <ul class="flex flex-col gap-2">
          <li v-for="c in casos" :key="c.id">
            <button type="button" :disabled="busy" class="w-full rounded border px-3 py-2 text-left" :data-testid="`demo-case-${c.id}`" @click="launchCase(c)">
              <span class="font-medium">{{ c.titulo }}</span>
              <span class="block text-xs opacity-70">{{ c.icao }} · {{ c.desde.slice(0, 16).replace('T', ' ') }} → {{ c.hasta.slice(0, 16).replace('T', ' ') }} UTC</span>
            </button>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="font-medium">
          {{ t('job.selCustom') }}
        </h2>
        <div class="flex items-end gap-2">
          <label class="flex flex-col text-sm">{{ t('job.selDay') }}
            <input v-model="day" type="date" class="rounded border px-2 py-1" data-testid="demo-day">
          </label>
          <button type="button" :disabled="busy || !day" class="rounded border px-3 py-1" data-testid="demo-load" @click="loadSites">
            {{ t('job.selLoad') }}
          </button>
        </div>
        <p v-if="sites && !sites.length">
          {{ t('job.selNoSites') }}
        </p>
        <template v-if="sites?.length">
          <label class="flex flex-col text-sm">{{ t('job.selSite') }}
            <select v-model="site" class="rounded border px-2 py-1" data-testid="demo-site" @change="loadVols">
              <option v-for="s in sites" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <div v-if="vols.length" class="flex gap-2">
            <label class="flex flex-1 flex-col text-sm">{{ t('job.selFrom') }}
              <select v-model.number="iFrom" class="rounded border px-2 py-1" data-testid="demo-from">
                <option v-for="(v, i) in vols" :key="v.key" :value="i">{{ v.time.slice(11, 16) }}</option>
              </select>
            </label>
            <label class="flex flex-1 flex-col text-sm">{{ t('job.selTo') }}
              <select v-model.number="iTo" class="rounded border px-2 py-1" data-testid="demo-to">
                <option v-for="(v, i) in vols" :key="v.key" :value="i">{{ v.time.slice(11, 16) }}</option>
              </select>
            </label>
          </div>
          <p v-if="picked.length" class="text-sm" data-testid="demo-estimate">
            {{ t('job.selEstimate', estimate) }}
          </p>
          <button type="button" :disabled="busy || !picked.length" class="rounded border px-4 py-2" data-testid="demo-launch" @click="launch(site, picked.map(v => v.key))">
            {{ busy ? t('job.selLaunching') : t('job.selLaunch') }}
          </button>
        </template>
      </section>
    </template>

    <p v-if="err" role="alert" class="text-sm text-red-600" data-testid="demo-error">
      {{ err }}
    </p>
    <p class="text-xs opacity-60">
      {{ t('job.notOfficial') }}
    </p>
  </main>
</template>
