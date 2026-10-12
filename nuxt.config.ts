// Namespaces de i18n (F5). Añadir uno = añadir el fichero en i18n/locales/es/
// y en i18n/locales/en/, y listarlo acá; scripts/check-i18n.mjs exige que los
// dos idiomas tengan exactamente las mismas claves.
const LOCALE_FILES = [
  'admin.json',
  'app.json',
  'charts.json',
  'chip.json',
  'common.json',
  'data.json',
  'feedback.json',
  'export.json',
  'layers.json',
  'locale.json',
  'map.json',
  'mosaic.json',
  'prefs.json',
  'products.json',
  'status.json',
  'timeline.json',
  'vcp.json',
]

export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',

  // Título, descripción y los og/twitter que los repiten viven en el catálogo
  // i18n y los pone `app.vue` con `useHead` (F5). Acá quedan solo los
  // metadatos independientes del idioma.
  app: {
    head: {
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0f172a' },

        // Open Graph / Facebook
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/og-image.png' },

        // Twitter
        { name: 'twitter:card', content: 'summary_large_image' },
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
    '@nuxtjs/i18n',
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@primevue/nuxt-module',
  ],

  // F5 — catálogo es+en con locale en la URL.
  //
  // `prefix_except_default` con `defaultLocale: 'es'`: los deep links que ya
  // circulan (`/BYX/N0B/20260711T030818`, con su query de capas) NO cambian —
  // son contrato de facto desde D23 y la gente los pega en chat. El inglés
  // vive bajo `/en/...`. Sin colisión con `pages/[site]`: los site_id del feed
  // son ICAO de 3 letras (BYX, AMX, HDC, JUA) y `/en` tiene 2 — canario en
  // tests/unit/i18n-routes.spec.ts por si algún día entra un sitio de 2.
  //
  // `fallbackLocale: 'es'` (en i18n/i18n.config.ts) evita imprimir la clave
  // cruda si falta una traducción; la paridad de claves la vigila
  // scripts/check-i18n.mjs en CI, que es donde debe fallar.
  i18n: {
    // Un catálogo por NAMESPACE, no un JSON gigante por idioma: con 24
    // componentes por migrar, un `es.json` de mil líneas es irrevisable en un
    // diff y serializa el trabajo (dos cambios a la vez chocan siempre).
    // Cada fichero mantiene su clave raíz dentro (`prefs.json` contiene
    // `{"prefs": {…}}`), porque el módulo los funde en la raíz del catálogo.
    locales: [
      { code: 'es', language: 'es-ES', name: 'Español', files: LOCALE_FILES.map(f => `es/${f}`) },
      { code: 'en', language: 'en-US', name: 'English', files: LOCALE_FILES.map(f => `en/${f}`) },
    ],
    defaultLocale: 'es',
    strategy: 'prefix_except_default',
    // Origen canónico para los `hreflang` alternos y el `canonical`. NO se
    // fija acá: `nuxt.config.ts` se evalúa en BUILD, así que un
    // `process.env` aquí hornea el valor de la máquina que construye la
    // imagen, no el del despliegue. El módulo publica esta opción en
    // `runtimeConfig.public.i18n.baseUrl`, así que el dominio se inyecta en
    // ARRANQUE con `NUXT_PUBLIC_I18N_BASE_URL=https://<dominio del viewer>`.
    // Vacío = i18n omite los hreflang y avisa en cada SSR.
    // `lazy` ya no es opción en @nuxtjs/i18n v10: la carga diferida de los
    // catálogos es el comportamiento por defecto. `vueI18n` se resuelve
    // relativo a i18n/ (restructureDir), no a la raíz del repo.
    vueI18n: 'i18n.config.ts',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'lamula_i18n',
      // Solo en `/`: un deep link compartido debe abrirse en el idioma que
      // dice su URL, no en el del navegador de quien lo recibe.
      redirectOn: 'root',
      alwaysRedirect: false,
    },
  },

  // Server Node normal en el Swarm (Cloudflare pasa a ser solo DNS/CDN
  // delante, orange-cloud) — Postgres directo por red interna, sin
  // binding ni Pages Functions. Ver docs/arquitectura.md y el plan de
  // migración D1→Postgres.
  nitro: {
    preset: 'node-server',
  },

  typescript: {
    strict: true,
  },

  runtimeConfig: {
    // NUXT_DAL_ADAPTER=fixture → DAL sirve grabaciones commiteadas (decisión 3)
    dalAdapter: '',
    // Postgres self-hosted en el Swarm — NUXT_PG_* sobreescribe cada uno.
    pgHost: '',
    pgPort: '5432',
    pgDatabase: '',
    pgUser: '',
    pgPassword: '',
    pgWriteUser: '',
    pgWritePassword: '',
    adminToken: '',
    feedbackWebhookUrl: '',
    turnstileSecret: '',
    turnstileDisabled: '',
    // NUXT_CORS_ORIGINS — orígenes permitidos en /api/feedback**, separados por comas
    // (decisión 50). Vacío = sin CORS, como antes.
    // Producción: https://process.ladetec.com (solo ese; los previews de Pages quedan fuera).
    corsOrigins: '',
    public: {
      // NUXT_PUBLIC_R2_BASE_URL — origen público del bucket R2 (cog_url)
      r2BaseUrl: 'https://nexrad-raster.ladetec.com',
      turnstileSiteKey: '',
      buildId: process.env.GIT_SHA || 'dev',
      cartoApiKey: process.env.NUXT_PUBLIC_CARTO_API_KEY || 'cb1_4iib_1_1dfa4e98cff8bebc4902181e',
    },
  },

  // Decisión 14: PrimeVue v4 unstyled, Tailwind como capa de estilos.
  primevue: {
    options: {
      unstyled: true,
    },
  },
})
