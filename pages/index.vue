<script setup lang="ts">
// La raíz solo redirige al viewer: /{site}/{product} (vista live; el time
// resuelto se materializa allí con replace). Client-side porque las prefs
// de localStorage no existen en SSR. Prefs validadas contra el catálogo —
// una selección persistida que ya no existe (radar retirado, código
// reasignado) no debe romper la redirección.
import { onMounted } from 'vue'
import { loadPrefs } from '../composables/useViewerPrefs'

const N0B = 153
const { data: radars, error: radarsError } = await useFetch('/api/radars')
const { data: products } = await useFetch('/api/products')

onMounted(() => {
  const rasterProducts = products.value?.filter(p => p.kind === 'raster') ?? []
  const prefs = loadPrefs()

  const site = radars.value?.some(r => r.site_id === prefs?.site)
    ? prefs!.site
    : radars.value?.[0]?.site_id

  const product = rasterProducts.some(p => p.code === prefs?.product)
    ? prefs!.product
    : rasterProducts.some(p => p.code === N0B)
      ? N0B
      : rasterProducts[0]?.code

  if (site && product != null) {
    navigateTo(`/${site}/${product}`, { replace: true })
  }
})
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-900 text-slate-100">
    <header class="flex items-baseline gap-4 border-b border-slate-700 px-4 py-2">
      <h1 class="text-lg font-bold">LAMULA WebViewer</h1>
    </header>
    <main class="flex flex-1 items-center justify-center">
      <p
        v-if="radarsError"
        data-testid="radars-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
      >
        D1 no disponible: {{ radarsError.statusMessage ?? radarsError.message }}
      </p>
      <p v-else class="text-sm text-slate-400">Cargando…</p>
    </main>
  </div>
</template>
