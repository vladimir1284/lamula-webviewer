<script setup lang="ts">
// Ícono circular por capa para los pills de LayersMenu.vue (rediseño D36,
// referencia image.png). Sin material fotográfico real disponible para
// sat/viento/rayos (nunca entran a un golden — ver CLAUDE.md); en vez de
// mezclar una foto (celdas) con dibujos para las otras 3, las 4 se generan
// igual, con los colores REALES de cada capa: paleta NWS de reflectividad
// (shared/products/defs/n0b.ts) para celdas, la rampa blanco→amarillo→
// naranja→púrpura de utils/lightning/anim.ts para rayos.
defineProps<{
  kind: 'sat' | 'cells' | 'wind' | 'lightning'
}>()
</script>

<template>
  <svg
    width="36"
    height="36"
    viewBox="0 0 36 36"
    aria-hidden="true"
    class="shrink-0"
  >
    <template v-if="kind === 'sat'">
      <defs>
        <radialGradient id="li-sat-bg" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stop-color="#64748b" />
          <stop offset="100%" stop-color="#0f172a" />
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill="url(#li-sat-bg)" />
      <ellipse cx="14" cy="15" rx="9" ry="6" fill="#e2e8f0" opacity="0.9" />
      <ellipse cx="22" cy="20" rx="7" ry="5" fill="#f8fafc" opacity="0.75" />
      <ellipse cx="12" cy="23" rx="6" ry="4" fill="#cbd5e1" opacity="0.6" />
    </template>

    <template v-else-if="kind === 'cells'">
      <defs>
        <radialGradient id="li-cells-bg" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stop-color="#fdf802" />
          <stop offset="45%" stop-color="#fd9500" />
          <stop offset="75%" stop-color="#01c501" />
          <stop offset="100%" stop-color="#019ff4" />
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill="url(#li-cells-bg)" />
      <circle cx="18" cy="18" r="4" fill="#fd0000" opacity="0.85" />
    </template>

    <template v-else-if="kind === 'wind'">
      <defs>
        <linearGradient id="li-wind-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2dd4bf" />
          <stop offset="100%" stop-color="#0f766e" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill="url(#li-wind-bg)" />
      <path
        d="M9 14c8-4 14 1 12 6-1.5 3.7-6 3-6-0.5 0-2.5 3-3 5-1"
        fill="none"
        stroke="#f0fdfa"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <path
        d="M8 21c5-2.2 9 0.3 8 3.6"
        fill="none"
        stroke="#f0fdfa"
        stroke-width="1.6"
        stroke-linecap="round"
        opacity="0.85"
      />
    </template>

    <template v-else>
      <defs>
        <radialGradient id="li-lightning-bg" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="35%" stop-color="#ffeb3b" />
          <stop offset="70%" stop-color="#ff9800" />
          <stop offset="100%" stop-color="#9c27b0" />
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill="url(#li-lightning-bg)" />
      <path d="M19 7 11 20h6l-2 9 10-14h-6z" fill="#1e293b" opacity="0.9" />
    </template>
  </svg>
</template>
