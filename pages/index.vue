<script setup lang="ts">
const { data: radars, error } = await useFetch('/api/radars')
</script>

<template>
  <main class="min-h-screen bg-slate-900 p-8 text-slate-100">
    <h1 class="text-3xl font-bold">LAMULA WebViewer</h1>
    <p class="mt-2 text-slate-400">
      F0 — andamiaje. Nuxt 3 sobre Cloudflare Pages.
    </p>

    <section data-testid="radars" aria-label="Radares" class="mt-8">
      <h2 class="text-xl font-semibold">Radares (D1)</h2>

      <p
        v-if="error"
        data-testid="radars-error"
        class="mt-2 rounded bg-amber-900/40 p-3 text-amber-200"
      >
        D1 no disponible: {{ error.statusMessage ?? error.message }}
      </p>

      <p
        v-else-if="!radars?.length"
        data-testid="radars-empty"
        class="mt-2 text-slate-400"
      >
        Sin radares en la tabla.
      </p>

      <ul v-else data-testid="radars-list" class="mt-2 space-y-1">
        <li v-for="radar in radars" :key="radar.site_id">
          <span class="font-mono">{{ radar.icao ?? radar.site_id }}</span>
          ({{ radar.lat.toFixed(2) }}, {{ radar.lon.toFixed(2) }})
          <FreshnessBadge :last-seen-at="radar.last_seen_at" />
        </li>
      </ul>
    </section>
  </main>
</template>
