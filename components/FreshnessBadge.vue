<script setup lang="ts">
import { computed } from 'vue'
import { minutesSince, freshnessParts } from '~/utils/freshness'

const props = defineProps<{ lastSeenAt: string }>()

const { t } = useI18n()

const minutes = computed(() => minutesSince(props.lastSeenAt))
const stale = computed(() => minutes.value > 30)
// El índice de plural es el valor ABSOLUTO: con el reloj adelantado los
// minutos salen negativos y vue-i18n elegiría mal la forma.
const label = computed(() => {
  const { unit, value } = freshnessParts(minutes.value)
  return t(`common.freshness.${unit}`, { n: value }, Math.abs(value))
})
</script>

<template>
  <span
    class="ml-2 whitespace-nowrap rounded px-2 py-0.5 text-xs"
    :class="stale ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'"
  >
    {{ label }}
  </span>
</template>
