export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',

  // Solo dev (nunca llega al build de Pages): /cogs proxya a serve-cogs.mjs
  // para que los COGs sean same-origin — con NUXT_PUBLIC_R2_BASE_URL=/cogs
  // basta tunelizar el puerto 3000 (un cog_url absoluto a 127.0.0.1:8790 no
  // resuelve desde un navegador remoto). allowedHosts: el host de un túnel
  // (devtunnels, cloudflared, ngrok) no es localhost y Vite lo bloquearía.
  $development: {
    routeRules: {
      '/cogs/**': { proxy: 'http://127.0.0.1:8790/**' },
    },
    vite: {
      server: {
        allowedHosts: true,
      },
    },
  },

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
      r2BaseUrl: 'https://nexrad-raster.ladetec.com',
    },
  },

  // Decisión 14: PrimeVue v4 unstyled, Tailwind como capa de estilos.
  primevue: {
    options: {
      unstyled: true,
    },
  },
})
