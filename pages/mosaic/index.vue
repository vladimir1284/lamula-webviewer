<script setup lang="ts">
// Raíz de /mosaic: redirige a /mosaic/{domain}/{product} (vista live) —
// mismo patrón que pages/index.vue, sin prefs persistidas todavía (D43/P4
// recorta localStorage de esta vista, ver machines/mosaic-viewer.ts).
import { onMounted } from 'vue'

const N0B = 153
const { data: domains, error: domainsError } = await useFetch('/api/mosaic/domains')
const { data: products } = await useFetch('/api/products')

onMounted(() => {
  const rasterProducts = products.value?.filter(p => p.kind === 'raster') ?? []
  const domain = domains.value?.[0]?.domain_id
  const product = rasterProducts.some(p => p.code === N0B) ? N0B : rasterProducts[0]?.code

  if (domain && product != null) {
    navigateTo(`/mosaic/${domain}/${product}`, { replace: true })
  }
})
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-900 text-slate-100">
    <header class="flex items-center gap-2.5 border-b border-slate-700 px-4 py-2">
      <AppLogo :size="22" class="text-teal-400" />
      <h1 class="text-lg font-bold">LAMULA Mosaico</h1>
    </header>
    <main class="flex flex-1 items-center justify-center">
      <p
        v-if="domainsError"
        data-testid="mosaic-domains-error"
        class="rounded bg-amber-900/40 p-3 text-sm text-amber-200"
      >
        Dominios de mosaico no disponibles: {{ domainsError.statusMessage ?? domainsError.message }}
      </p>
      <p v-else class="text-sm text-slate-400">Cargando…</p>
    </main>
  </div>
</template>
