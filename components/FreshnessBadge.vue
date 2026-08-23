<script setup lang="ts">
import { computed } from 'vue'
import { minutesSince, formatFreshness } from '~/utils/freshness'

const props = defineProps<{ lastSeenAt: string }>()

const minutes = computed(() => minutesSince(props.lastSeenAt))
const stale = computed(() => minutes.value > 30)
const label = computed(() => formatFreshness(minutes.value))
</script>

<template>
  <span
    class="ml-2 rounded px-2 py-0.5 text-xs"
    :class="stale ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'"
  >
    {{ label }}
  </span>
</template>
