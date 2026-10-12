import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('.', import.meta.url)),
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.spec.ts', 'tests/contract/**/*.spec.ts'],
    // Los componentes usan el `useI18n()` auto-importado de Nuxt (F5); fuera
    // del runtime de Nuxt hay que proveerlo. Ver tests/setup/i18n.ts.
    setupFiles: ['tests/setup/i18n.ts'],
  },
})
