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

  runtimeConfig: {
    // NUXT_DAL_ADAPTER=fixture → DAL sirve grabaciones commiteadas (decisión 3)
    dalAdapter: '',
    public: {
      // NUXT_PUBLIC_R2_BASE_URL — origen público del bucket R2 (cog_url)
      r2BaseUrl: '',
    },
  },

  // Decisión 14: PrimeVue v4 unstyled, Tailwind como capa de estilos.
  primevue: {
    options: {
      unstyled: true,
    },
  },
})
