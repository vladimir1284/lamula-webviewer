// Config de vue-i18n (la parte que no es del módulo Nuxt).
//
// `fallbackLocale: 'es'` es red de seguridad de producción, no permiso para
// dejar claves sin traducir: una clave que falte en `en` muestra español en
// vez de la clave cruda. La paridad es+en la exige CI (scripts/check-i18n.mjs).
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'es',
  // Un `$t` sobre una clave inexistente debe gritar en dev, no en silencio.
  missingWarn: import.meta.dev,
  fallbackWarn: false,
}))
