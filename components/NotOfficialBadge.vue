<script setup lang="ts">
// Aviso fijo del plano demo (lamula-jobs): los productos salen de una reproducción propia del procesamiento de radar
// y no son del NWS. Va siempre visible —sin botón de cerrar— y no tapa controles: debajo de la marca en pantalla ancha, al borde inferior en móvil.
const { t } = useI18n()
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0.5 z-30 flex justify-center px-2 md:bottom-auto md:top-14 md:px-3">
    <p role="note" data-testid="not-official" class="max-w-md rounded-full bg-amber-950/85 px-3 py-0.5 text-center text-[10px] font-medium leading-tight md:py-1 md:text-xs text-amber-100 shadow ring-1 ring-inset ring-amber-300/30">
      {{ t('job.notOfficialBadge') }}
    </p>
  </div>
</template>
