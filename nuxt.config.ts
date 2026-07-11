export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',

  modules: [
    '@nuxt/eslint',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@primevue/nuxt-module',
  ],

  // Corre como Pages Functions en el edge; D1 llega por binding
  // (event.context.cloudflare.env.DB). Ver docs/arquitectura.md.
  nitro: {
    preset: 'cloudflare-pages',
  },

  typescript: {
    strict: true,
  },

  // Decisión 14: PrimeVue v4 unstyled, Tailwind como capa de estilos.
  primevue: {
    options: {
      unstyled: true,
    },
  },
})
