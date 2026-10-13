<script setup lang="ts">
// Título, descripción y `<html lang>` salen del catálogo i18n (F5), no de
// `nuxt.config.ts`: allí quedan solo los metadatos que no dependen del idioma
// (favicons, og:image, theme-color). `useLocaleHead` añade además los
// `hreflang` alternos de cada locale, que es lo que hace compartible un deep
// link en el idioma correcto.
const { t } = useI18n()
const localeHead = useLocaleHead()

useHead(() => ({
  ...localeHead.value,
  title: t('app.title'),
  meta: [
    ...(localeHead.value.meta ?? []),
    { name: 'description', content: t('app.description') },
    { property: 'og:title', content: t('app.shortTitle') },
    { property: 'og:description', content: t('app.description') },
    { name: 'twitter:title', content: t('app.shortTitle') },
    { name: 'twitter:description', content: t('app.description') },
  ],
}))
</script>

<template>
  <NuxtPage />
</template>
