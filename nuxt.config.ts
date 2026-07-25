export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',

  app: {
    head: {
      title: 'LAMULA WebViewer — Visualizador Radar NEXRAD',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Visualizador Web de productos de radar NEXRAD Level III con OpenLayers WebGL' },
        { name: 'theme-color', content: '#0f172a' },

        // Open Graph / Facebook
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'LAMULA WebViewer — Radar NEXRAD' },
        { property: 'og:description', content: 'Visualizador Web de productos de radar NEXRAD Level III con OpenLayers WebGL' },
        { property: 'og:image', content: '/og-image.png' },

        // Twitter
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'LAMULA WebViewer — Radar NEXRAD' },
        { name: 'twitter:description', content: 'Visualizador Web de productos de radar NEXRAD Level III con OpenLayers WebGL' },
        { name: 'twitter:image', content: '/og-image.png' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

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
        // worktrees viejos de sesiones de agentes bajo .claude/worktrees traen
        // su propio node_modules, y .nuxt/dist es build output propio de Nuxt
        // (no código fuente) — sin excluirlos, chokidar agota
        // fs.inotify.max_user_watches (ENOSPC) y el dev server muere
        watch: {
          ignored: ['**/.claude/**', '**/.nuxt/dist/**'],
        },
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
