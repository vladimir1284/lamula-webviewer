<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    theme?: 'light' | 'dark' | 'auto'
  }>(),
  {
    modelValue: null,
    theme: 'dark',
  },
)

const emit = defineEmits<{
  'update:modelValue': [token: string | null]
  error: [err: unknown]
  expire: []
}>()

const config = useRuntimeConfig()
const siteKey = computed(() => config.public.turnstileSiteKey || '')

const containerRef = ref<HTMLDivElement>()
const widgetId = ref<string | null>(null)

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: (err?: unknown) => void
          theme?: 'light' | 'dark' | 'auto'
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]',
    )

    if (existingScript) {
      if (window.turnstile) {
        resolve()
      }
      else {
        const prevOnload = window.onloadTurnstileCallback
        window.onloadTurnstileCallback = () => {
          if (prevOnload) prevOnload()
          resolve()
        }
      }
      return
    }

    window.onloadTurnstileCallback = () => {
      resolve()
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit'
    script.async = true
    script.defer = true
    script.onerror = err => reject(err)
    document.head.appendChild(script)
  })
}

async function renderWidget() {
  if (!siteKey.value || !containerRef.value) return
  try {
    await loadTurnstileScript()
    if (!window.turnstile || !containerRef.value) return

    if (widgetId.value !== null) {
      window.turnstile.remove(widgetId.value)
      widgetId.value = null
    }

    widgetId.value = window.turnstile.render(containerRef.value, {
      sitekey: siteKey.value,
      theme: props.theme,
      callback: (token: string) => {
        emit('update:modelValue', token)
      },
      'expired-callback': () => {
        emit('update:modelValue', null)
        emit('expire')
      },
      'error-callback': (err?: unknown) => {
        emit('update:modelValue', null)
        emit('error', err)
      },
    })
  }
  catch (err) {
    emit('error', err)
  }
}

function reset() {
  if (widgetId.value !== null && window.turnstile) {
    window.turnstile.reset(widgetId.value)
  }
  emit('update:modelValue', null)
}

defineExpose({
  reset,
})

onMounted(() => {
  if (siteKey.value) {
    renderWidget()
  }
})

onUnmounted(() => {
  if (widgetId.value !== null && window.turnstile) {
    window.turnstile.remove(widgetId.value)
    widgetId.value = null
  }
})

watch(() => props.modelValue, (val) => {
  if (!val && widgetId.value !== null && window.turnstile) {
    window.turnstile.reset(widgetId.value)
  }
})
</script>

<template>
  <div v-if="siteKey" class="my-2 flex justify-center min-h-[65px]">
    <div ref="containerRef" data-testid="turnstile-container" />
  </div>
</template>
