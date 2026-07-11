# Validaciones manuales

Parte manual de cada puerta del [plan de implementación](plan-implementacion.md). Las ejecuta el experto de dominio / QA; el resultado se registra en el PR que cierra la fase.

## F0 — Andamiaje

1. Abrir la URL del deploy de Pages: el esqueleto carga.
2. `GET /api/health` responde con la lista de radares de la D1 real y su `last_seen_at`.
3. Abrir un PR trivial: aparece el preview deployment con URL propia.

## F1 — Contrato + DAL

1. Con `DAL=fixture`, la app arranca sin red (solo assets locales) y las rutas API devuelven las fixtures.
2. Con `DAL=live`, las mismas rutas devuelven datos de la D1 del demo.
3. Editar a mano una fixture (renombrar una columna) → el contract test falla con mensaje claro.

## F2 — Mapa + raster (la validación crítica)

1. Abrir N0B del volumen más reciente de cada radar del demo.
2. Abrir el **mismo COG** en QGIS con la misma paleta cargada (archivo QML generado desde el catálogo de paletas del viewer).
3. Comparar lado a lado: geolocalización (costa, fronteras), extensión del producto, colores por rango de valores, tratamiento de nodata (0) y range folded (1).
4. Mover el cursor sobre zonas de eco conocidas: el valor físico mostrado coincide con el pixel identificado en QGIS (± redondeo de nivel).
5. Repetir en corto para los otros 6 productos raster (EET, DVL, DAA, DU3, DTA, N0G — atención al range folded en N0G).
6. Cotejo cualitativo con el viewer legado: la semántica de paleta/leyenda de reflectividad se corresponde con la esperada por el experto (no hay comparación píxel a píxel — radares y productos distintos).

## F3 — Selección + timeline + animación

1. Copiar la URL de una vista (radar+producto+frame+overlays) y pegarla en otro navegador/incógnito: vista idéntica.
2. Animar 20 frames de N0B: sin stutter perceptible en el hardware de referencia del equipo.
3. Elegir un día con huecos de datos (o simularlo con fixtures): los huecos se ven marcados en el timeline, no rompen la animación.
4. Verificar que el date picker no ofrece fechas fuera de la ventana de 72 h.
5. Radar sin datos recientes (si lo hay): el semáforo de frescura lo señala.

## F4 — Fenómenos + VWP

1. Con un episodio convectivo real capturado como fixture: las celdas aparecen en las posiciones esperadas, con tracks pasado/pronóstico orientados según el movimiento conocido.
2. La tabla de celdas ordena por VIL y sus valores coinciden con el tabular NST crudo (cotejo manual de 2–3 celdas).
3. Charts de tendencia de una celda seguida ≥ 4 volúmenes: la serie es continua y coherente (sin saltos por confusión de `cell_id`).
4. Markers de meso/TVS/granizo con atributos legibles en el popup.
5. VWP: barbas y tabla contra el tabular crudo del producto NVW del mismo volumen (dirección/velocidad por altura, 2–3 niveles cotejados a mano).

## F5 — Mosaico + i18n + pulido

1. Mosaico con los 3 radares del demo: los solapes entre radares se ven razonables (sin costuras violentas), la animación mantiene fluidez.
2. Cambiar `es` ↔ `en` desde la URL y desde el selector: todo el chrome cambia; ningún string queda en el idioma anterior.
3. Recorrido con teclado por los controles principales; contraste de la leyenda sobre ambos temas.
4. Abrir en un móvil real: layout usable, controles alcanzables.

## F6 — Validación E2E (M5)

1. **Semana de operación**: el experto usa el viewer contra el pipeline vivo a diario; se registra cada incidencia; cero bloqueantes al cierre.
2. Al menos un episodio convectivo real observado en vivo con storm + VWP correctos.
3. Deploy desde cero en un proyecto Pages limpio siguiendo solo la documentación: funciona sin pasos no documentados.
4. Revisión de consumo del tier gratuito (lecturas D1, requests) tras la semana de uso: dentro de presupuesto.
