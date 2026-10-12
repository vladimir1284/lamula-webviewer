// Los componentes llaman al `useI18n()` auto-importado de @nuxtjs/i18n, que
// no existe fuera del runtime de Nuxt. Aquí se expone un global equivalente
// montado sobre el catálogo REAL (`i18n/locales/es.json`): así un test de
// componente falla si una clave no existe, en vez de pasar contra un stub que
// devuelve la clave. `setLocale` sí es stub — navega, y la navegación no es
// asunto de un test de componente.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { vi } from 'vitest'

// Los catálogos están partidos por namespace (un fichero por dominio), así
// que se funden en memoria en vez de importarse uno a uno: añadir un
// namespace no debe obligar a tocar este fichero.
// `process.cwd()` y no `import.meta.url`: bajo el entorno happy-dom de vitest
// `import.meta.url` no llega como URL file:// y `new URL(...).pathname` sale
// resuelto contra la raíz del sistema de ficheros.
const LOCALES_DIR = join(process.cwd(), 'i18n', 'locales')

function loadLocale(code: string): Record<string, unknown> {
  const dir = join(LOCALES_DIR, code)
  const merged: Record<string, unknown> = {}
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    Object.assign(merged, JSON.parse(readFileSync(join(dir, f), 'utf8')))
  }
  return merged
}

const es = loadLocale('es')
const en = loadLocale('en')

const LOCALES = [
  { code: 'es', language: 'es-ES', name: 'Español' },
  { code: 'en', language: 'en-US', name: 'English' },
] as const

type LocaleCode = (typeof LOCALES)[number]['code']

// `createI18n` se invoca a través de una firma laxa a propósito. Dos motivos,
// los dos de tipos y ninguno de runtime: (1) los catálogos se leen de disco,
// así que los genéricos no pueden inferir el esquema desde un literal; y
// (2) @nuxtjs/i18n augmenta globalmente el esquema de vue-i18n con los
// `language` declarados en nuxt.config.ts ('en-US'), de modo que un
// `messages` con claves 'es'/'en' nunca satisface ese tipo global.
const createLooseI18n = createI18n as unknown as (options: Record<string, unknown>) => { global: unknown }

const i18n = createLooseI18n({
  legacy: false,
  locale: 'es',
  fallbackLocale: 'es',
  messages: { es, en },
})

// Los catálogos se leen de disco en tiempo de ejecución, así que `createI18n`
// no puede inferir ni las claves ni el tipo de `locale` (con `legacy: false`
// es un ref, pero el tipo público es la unión de los dos modos). El cast
// describe lo que de verdad devuelve en este modo.
const composer = i18n.global as unknown as {
  t: (...args: unknown[]) => string
  te: (key: string, locale?: string) => boolean
  n: (...args: unknown[]) => string
  d: (...args: unknown[]) => string
  locale: { value: LocaleCode }
}

const locale = ref<LocaleCode>('es')
export const setLocaleSpy = vi.fn((code: LocaleCode) => {
  locale.value = code
  composer.locale.value = code
})

vi.stubGlobal('useI18n', () => ({
  t: composer.t,
  te: composer.te,
  n: composer.n,
  d: composer.d,
  locale,
  locales: computed(() => LOCALES),
  setLocale: setLocaleSpy,
}))
