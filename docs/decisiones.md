# Decisiones de diseño

Decisiones confirmadas de la reconciliación del plan original (*LAMULA-WebViewer — Project Plan*, que asumía FastAPI + PostgreSQL + GeoTIFF por FTP) con la realidad de ejecución: Cloudflare Pages con D1/R2 compartidos con [nexrad-l3-pipeline](https://github.com/vladimir1284/nexrad-l3-pipeline). No re-litigar sin motivo.

## Confirmadas

1. **Nuxt 3 sobre Cloudflare Pages, un solo deploy.** D1 solo se lee vía binding de Worker/Pages Functions (misma cuenta Cloudflare), así que el backend pasa a las server routes de Nuxt (Nitro preset `cloudflare-pages`). Alternativas descartadas: SPA + Pages Functions sueltas (dos capas menos integradas), Worker Hono separado + SPA (dos deploys, CORS interno).

2. **SSR encendido, mapa client-only.** OpenLayers no se renderiza en servidor; el SSR aporta shell, meta tags y resolución de deep links. En Nuxt el costo marginal es bajo (`<ClientOnly>` alrededor del mapa). No es un requisito que justifique complejidad extra — si estorba, se degrada a SPA sin cambiar arquitectura.

3. **DAL con dos adaptadores.** Live (server routes → binding D1 + URLs R2) y fixture (respuestas grabadas + COGs golden en el repo, switch por env). Es lo que permite CI determinista, desarrollo offline y — estratégicamente — apuntar el mismo viewer al contrato de LAMULA-Ingest (PostgreSQL + HTTP) en el futuro escribiendo solo un adaptador.

4. **Renderizado desde datos, no desde píxeles.** El COG trae niveles crudos uint8 + `value_scale`/`value_offset`; la paleta se aplica en el cliente como color ramp WebGL. La paleta es fuente única para raster y leyenda; el valor bajo el cursor es posible; cambiar paleta no regenera nada.

5. **Paletas versionadas en este repo, no en la base.** No existe (a propósito) tabla `palette` en D1. Módulo TS por `product_code` con colores, stops, unidad y ticks. Coherente con "paleta en cliente": el pipeline no sabe de presentación. Igual para nombre display, categoría y rango de cada producto — catálogo estático del viewer keyed por `code`; D1 `products` solo aporta code/mnemonic/unit/kind.

6. **Radar-agnóstico, proyección dinámica.** Ningún radar ni endpoint hardcodeado. `radars.proj4` se registra tal cual (`proj4.defs` + `register`); el catálogo, el switch de radares y la frescura ("minutos desde último scan") salen de la tabla `radars`.

7. **Base Web Mercator + OSM.** Los radares del demo son Florida/Puerto Rico; la base Lambert-conformal de Cuba (EPSG:2085) del legado no aplica. Cuando el viewer se apunte a radares cubanos, la base vuelve como configuración, no como código.

8. **Storm charts vía extensión del pipeline (acordada).** El parser actual de NST solo extrae posición + vector movimiento. El tabular de NST trae POH/POSH/tamaño de granizo/VIL/dBZ máx/top por celda, y los packets 23/24 del symbology traen posiciones pasadas/pronóstico. El pipeline se extiende para volcar eso en `phenomena.attrs` (JSON — cero migración D1). Los charts de tendencia se construyen cliente-side como serie temporal por `cell_id` (estable entre volúmenes) consultando `phenomena` cross-volumen. Las claves de `attrs` por `kind` se documentan como parte del contrato.

9. **VWP sin componente vertical.** D1 trae dir/speed/rms/height por nivel; u/v se derivan en cliente, `w` no existe en el contrato. Barbas y tabla completas; si el canvas legado usaba w, esa serie se omite.

10. **Oracle de regresión visual: goldens propios + QGIS.** Los PNGs del legado (radares cubanos, productos retirados del feed) no sirven de oracle píxel-a-píxel para el demo. Verdad de referencia: screenshots golden propios (COG conocido + paleta → render esperado, Playwright) y validación cruzada en QGIS — el mismo mecanismo que la puerta F6 del pipeline. La fidelidad al legado se valida cualitativamente por el experto de dominio (misma semántica de paleta/leyenda), no por diff de píxeles.

11. **Timeline asume ventana de retención de 72 h.** El pipeline barre datos a los 3 días; el date picker y la UX del timeline lo hacen explícito en vez de mostrar días vacíos.

12. **Mosaico en alcance.** N capas WebGLTile (una por radar, cada una en su AEQD) reproyectadas en GPU sobre la vista común. Sin servidor de tiles: es la misma maquinaria de la vista single-radar, multiplicada.

13. **Demo público, sin auth.** Los datos NEXRAD son públicos; solo se expone el viewer. Si más adelante hace falta gatear el acceso, Cloudflare Access delante de Pages es cero código.

14. **PrimeVue v4 (unstyled + Tailwind) como librería de componentes.** La app es pesada en DataTable, DatePicker y Slider; batteries-included gana sobre shadcn-vue aquí. Tailwind sigue siendo la capa de estilos.

15. **i18n: `@nuxtjs/i18n`, es + en**, locale en URL, catálogo extensible.

16. **Charts de tormenta y VWP: canvas/SVG propio portado del legado.** La matemática validada (barbas, geometría az/range, trends) se porta de Svelte a composables Vue; no se introduce librería de charts.

17. **Solo lectura, por disciplina.** D1 no tiene roles: el contrato es que este proyecto solo ejecuta `SELECT` y las migraciones viven en `db/` del pipeline. Cualquier cambio de schema es una migración negociada allí.

18. **Todo el estado de la interfaz con XState (v5 + `@xstate/vue`), URL como fuente de verdad.** Decisión tomada al arrancar F3, amplía el stack fijado y aplica retroactivamente a F2. Las máquinas viven en `machines/` (puras, testeables con `createActor` sin DOM); los componentes las consumen vía `useSelector`. La URL manda sobre lo compartible (`/{site}/{product}/{time}` + query): los cambios de ruta —incluido back/forward— entran a la máquina como eventos, y las transiciones que cambian la selección navegan como efecto (push/replace). Cada máquina se documenta con un diagrama Mermaid en [Máquinas de estado](maquinas-estado.md), actualizado en el mismo commit que toca la máquina.

19. **Datetime compacto (`YYYYMMDDTHHMMSS`) en el path de la ruta, no el ISO con `:`.** El `:` del ISO es hostil a proxies/copy-paste; el formato compacto conserva el orden lexicográfico y su conversión con el ISO naive del contrato es 1:1 (`shared/url/time-path.ts`). Sin datetime en el path = vista live (closest a "ahora"), materializada con `replace` al `vol_time` resuelto en cuanto se conoce — la URL nunca queda apuntando a un instante que no sea exactamente el frame mostrado.

20. **Huecos de la timeline: umbral relativo a la cadencia real, no fijo.** Un intervalo se marca como hueco cuando excede `max(2×mediana de los intervalos, 10 min)` (`utils/timeline/gaps.ts`). Un umbral fijo (p.ej. "todo intervalo > 10 min") marcaría huecos falsos en radares con cadencia lenta legítima; uno puramente relativo (solo 2×mediana) sería demasiado sensible en series muy densas. Con menos de 3 `vol_time` no hay señal suficiente para una mediana — no se computan huecos.

21. **Animación: pool de una `WebGLTileLayer` por frame, no una sola capa con `setSource()`.** Verificado contra `ol` 10.9.0: `setSource()` dispone las texturas cacheadas de la capa (parpadeo en cada frame); N capas con el mismo `className`/zIndex contiguo comparten un solo contexto WebGL, así que el pool no choca con el límite de contextos del navegador. Prefetch en segundo plano se logra con `visible:true, opacity:0` (sí carga tiles, no se ve) y swap instantáneo cuando ya está en GPU. "Frame listo" se lee de `layer.getRenderer().renderComplete` (propiedad semi-pública del renderer, no de la API documentada de `ol`) — protegido por un test canario (`tests/unit/render-complete-canary.spec.ts`) que debe fallar primero si un upgrade de `ol` la renombra o la quita; el plan B documentado es volver a `rendercomplete` secuencial del mapa (más lento, 100% API pública).

22. **F4 recortado: dBZ máx en lugar de VIL/top/granizo por celda.** Acordado con el pipeline (jul-2026, `db/README.md` de aquel repo): los productos SS (62) y HI (59) **no fluyen** en el bucket de Unidata (sondeo con tormentas activas) y el NST no trae esos campos — la tabla "STORM CELL ATTRIBUTES" de los visores clásicos es un compuesto cliente de STI+SS+HI. Consecuencia: la tabla de celdas ordena por `dbz_max` (faltantes al final — el GAB de NST pagina de a 6 celdas), la tendencia grafica `dbz_max` + `dbz_max_height_kft`, y la señal TVS es la columna `tvs` del NMD (no hay markers de granizo). Si esas claves aterrizan algún día, `shared/contract/attrs.ts` suma claves opcionales sin migración ni cambio estructural. VIL y echo top sí existen como productos raster de grilla (DVL, EET).

23. **Estado de overlays en query params: `?layers=cells,meso`, `?panel=cells|trend|vwp`, `?cell=<ID>`.** Extiende la decisión 18 (URL manda): defaults "off" — las URLs de F3 y los goldens existentes no cambian de comportamiento; valores inválidos degradan al default sin anular la ruta. Los cambios entran por eventos raíz de `viewerMachine` (`TOGGLE_LAYER`/`SELECT_PANEL`/`SELECT_CELL`) con assign optimista + acción inyectable `syncOverlayQuery` (replace **inmediato**, sin el debounce de `?opacity` — son acciones discretas, no un slider). Un cambio solo-query reentra por `ROUTE_CHANGED` y cae en el guard `sameFrame`: el raster no reparpadea.

24. **Join temporal de fenómenos/VWP: índice de times + join en cliente, no endpoint `closest`.** Los fenómenos y el VWP tienen vol_times propios que solo coinciden con los productos volumétricos; los frames N0B/N0G intermedios no tienen fila exacta. Endpoints nuevos `GET /api/{phenomena,vwp}/times?site&day` (`SELECT DISTINCT vol_time`, cubierto por `idx_*_lookup`); el cliente casa el frame mostrado con `nearestWithin(times, t, 600 s)` (empate → anterior, la regla de `pickClosest`) y pega a los endpoints por vol_time exacto existentes — inmutables una vez escritos ⇒ cache cliente por vol_time sin invalidación. Fuera de tolerancia el overlay se **limpia** (estado visible), nunca celdas de otro momento como actuales. Descartados: batch `/day` (un día real de tormenta ≈ cientos de volúmenes × decenas de filas) y `closest?t` (un `t` arbitrario por frame = cache pobre + roundtrip por frame de animación).

25. **Matemática de barbas/u-v/tracks reimplementada desde cero, con tests (desviación parcial de la decisión 16).** El legado VestaWeb2 no estaba disponible para portar; u/v desde dir/velocidad y la descomposición de barbas WMO son matemática estándar (`utils/wind/`, `tests/unit/wind.spec.ts`). Sigue vigente el resto de la 16: cero librería de charts — **SVG propio** (declarativo y testeable en happy-dom, a diferencia de canvas). La semántica de los tracks SCIT (`past` reciente→viejo, `movement_deg` convención "desde") se **dedujo de las grabaciones reales** y está protegida por un test canario de continuidad geométrica (`tests/unit/tracks.spec.ts`); su confirmación por el experto es parte de la puerta M4 — si la convención resultara otra, solo cambian `utils/overlay/tracks.ts` y su test.

26. **Panel derecho colapsable con rail de tabs (Celdas / Tendencia / VWP).** Segundo `aside` a la derecha del mapa (~384 px), mapa dominante; el rail (36 px) queda siempre visible. Estado en la URL (decisión 23). Tabla HTML nativa + Tailwind — PrimeVue sigue instalado pero sin uso: no introducir un patrón nuevo de componentes en F4. Consecuencia aceptada: el rail estrecha el mapa en toda vista, lo que regeneró los baselines de los goldens (mismo render, 36 px menos de ancho).

27. **`overlayMachine` separada, no una tercera región de `viewerMachine`.** Patrón `animationMachine` (orquestación por la página con watchers): (a) el vol_time efectivo durante la animación vive en la página (`times[activeFrameIndex]`), fuera de `viewerMachine`; (b) el ensombrecido por región de XState v5 encarece cada evento compartido en una máquina paralela que crece; (c) el overlay tiene ciclo de vida propio (caches por vol_time, gating por toggles) que no debe reiniciarse con el del raster. En `overlayMachine` **ningún evento se maneja en la raíz** — todo a nivel de región, con las dos sutilezas de la difusión de eventos documentadas en [Máquinas de estado](maquinas-estado.md).

28. **Preferencias de usuario (alcance del radar / unidades / hora) en `lamula:prefs` v2, jamás en la URL.** Son preferencias de display personales, no estado compartible — la línea de la decisión 18 (compartible → URL) las manda a localStorage; a diferencia del locale (decisión 15), no cambian *qué* se ve sino *cómo se formatea*. Detalles y descartes:
    - **Contexto de `viewerMachine` con eventos raíz** (`PREFS_LOADED`/`SET_PREF`), no máquina aparte: el criterio de la 27 no aplica — las prefs no tienen ciclo de vida (sin fetch/cache) y `persistPrefs` ya estaba inyectado. Los valores iniciales del contexto son placeholders SSR deterministas; los reales entran post-mount.
    - **Default del reloj = hora local** (zona del navegador vía `Intl`; los días/agrupación de la timeline siguen en UTC — el día UTC es clave de partición de datos, reagrupar por día local exigiría fetch cross-día). Consecuencia aceptada: flash UTC→local de un frame en cada carga — el server no conoce la zona del navegador.
    - **Conversión de unidades solo-texto** (`utils/units.ts`): kft→km, kt→km/h en tablas, charts, leyenda y cursor (mapa passthrough — dBZ/mm/kg/m² y unidades futuras pasan intactas). Las **barbas WMO siguen siempre en kt** (convención meteorológica; banderín = 50 kt) igual que la matemática interna. Consecuencia: ticks no redondos en la leyenda SI (20 kt → 37 km/h) — preferible a duplicar paletas; si el experto lo veta, el fallback es convertir solo el cursor.
    - **Diálogo `<dialog>` nativo**, no PrimeVue (la 26 sigue vigente): unstyled sin design tokens obliga a escribir el mismo CSS, y `showModal()` da top-layer/focus-trap/Esc gratis. Reversible si las preferencias crecen.
    - Migración v1→v2 de `lamula:prefs` en memoria al leer (rellena defaults, conserva lo guardado); shape inválido o versión desconocida degradan a `null` como siempre.

29. **Capa opcional de viento animado (partículas GFS 10 m), fuente externa vía el pipeline.** No existe viento vectorial en grilla en el stack (N0G es velocidad radial escalar; VWP es un perfil puntual): el dato lo ingiere un **job nuevo en nexrad-l3-pipeline** desde NOMADS (spec entregada en [pipeline-viento.md](pipeline-viento.md) — tabla `wind_grids`, JSON u/v por sitio en R2, ciclos 00/06/12/18Z × f000–f012 → valid_times horarios en las 72 h). Decisiones y descartes:
    - **GFS 0.25°, no HRRR**: HRRR es CONUS-only y no cubre JUA — rompería el principio radar-agnóstico.
    - **velocity-JSON, no binario**: 49×49 puntos ≈ 30 KB (~10 KB gzip) — un decoder binario no se paga; fixtures legibles.
    - **Render propio canvas 2D** (`utils/wind/{grid,particles}.ts` + `utils/map/wind-layer.ts`, algoritmo earth.nullschool, RNG con seed): `ol-wind` lleva ~2 años sin release y sin evidencia de compat OL ≥9; línea de la decisión 25. Canvas 2D y no WebGL: no compite con el contexto del frame-pool y SwiftShader (CI) lo rasteriza. zIndex 15 (sobre raster y máscara — el viento cubre ±6°, más allá del alcance del radar —, bajo fenómenos).
    - **Región `wind` en `overlayMachine`** con índice propio (`/api/wind/times`, día **±2 h**) + `nearestWithin` con tolerancia **1 h** (3 h dejaría viento de otra masa de aire como actual) + cache por `r2_key` (el ciclo va en la key ⇒ inmutable). `'wind'` entra en `OVERLAY_LAYERS` (`?layers=wind` — toda la plomería URL sale gratis) pero NO en `PHENOMENA_LAYERS`: activar viento no fetchea fenómenos.
    - **Oculta durante la reproducción de la animación** (mismo contrato que el satélite): partículas de un ciclo fijo mientras los frames barren horas serían un sinsentido; al pausar vuelve con el grid del frame en reposo (cache lo hace instantáneo).
    - **Fixtures sintéticas** (`scripts/make-wind-fixture.mjs`: campo analítico flujo+vórtice, data-driven sobre las grabaciones) y DDL en `tests/contract/proposed/` — NO en `tests/contract/schema/` (el drift check byte a byte rompería CI) — hasta que el pipeline mergee su migración. Goldens intactos: default off y la capa jamás entra en screenshot-diff (e2e funcional con readback del canvas + unit deterministas por seed).

30. **Catálogo de mapas base con nombres por encima de las capas.** Los nombres de lugares de OSM van horneados en los tiles — quedan bajo raster/viento/cobertura. Solución: catálogo `shared/basemaps.ts` (`osm` default + variantes CARTO `voyager`/`positron`/`dark`) donde las variantes CARTO usan el par `*_nolabels` (base, zIndex 0) + `*_only_labels` (capa de nombres, zIndex 18: sobre raster 5, cobertura 10 y viento 15, bajo fenómenos 20 — las celdas de tormenta siempre ganan). Detalles y descartes:
    - **Nunca labels duplicados**: con base OSM no se superpone capa de nombres (fuentes/posiciones distintas a las horneadas); quien quiera nombres arriba elige una variante CARTO.
    - **`base` reutiliza la plomería existente** (query `?base` + `lamula:prefs` + contexto de `viewerMachine`): solo se amplió la unión (`'osm' | 'off'` → catálogo) y se añadió `SELECT_BASE` (patrón `SET_OPACITY`: persistPrefs + syncQuery). `'off'` se conserva para goldens/e2e y no aparece en el selector.
    - **Tiles raster de CARTO** (gratis con atribución OSM+CARTO), no vector tiles con estilo partido: fuera del stack (OL + tiles raster) por un solo requisito. `{r}` retina se resuelve con `devicePixelRatio` al crear la fuente (OL no expande ese token).
    - Sin migración de prefs: v2 sigue válida, el validador acepta el catálogo ampliado.

## Qué murió del plan original (y por qué)

| Ítem del plan original | Destino | Motivo |
|---|---|---|
| Backend FastAPI + Python 3.12 + Uvicorn | **Muerto** | D1 se lee por binding de Worker; el backend es TypeScript en el edge (server routes de Nuxt) |
| PostgreSQL como store de metadata | **Sustituido por D1** | Compartida con nexrad-l3-pipeline; schema migrable a PostgreSQL si esto pasa a producción con LAMULA-Ingest |
| Gap FTP ↔ HTTP range (§6, "decision to confirm") | **Resuelto** | R2 sirve COGs con CORS + range requests; la opción (a) del plan es la realidad desde el día uno |
| Fallback titiler / rio-tiler server-side | **Innecesario** | Sin el gap FTP, el fallback pierde su razón; los COG están bajo el cap de textura WebGL (peor caso 3680×3680) |
| Tabla `palette` en la base | **Muerta** | Paletas en el repo del viewer (decisión 5) |
| `product_def` rico (nombre, categoría, rango, ref. paleta) | **Catálogo estático del viewer** | D1 `products` es mínimo a propósito |
| Base cartográfica Cuba EPSG:2085 | **Diferida a config** | Radares demo en Florida/PR (decisión 7) |
| Oracle visual = PNGs legados | **Sustituido** | Radares y productos distintos; goldens propios + QGIS (decisión 10) |
| Auth de sesión ligera | **Sin auth** | Demo público (decisión 13) |
| Restos de Svelte en el texto ("SvelteKit server routes", "runes", "svelte-i18n") | **Purgados** | Inconsistencias de redacción del plan original; la decisión Vue 3 ya estaba tomada |

## Riesgos residuales

1. **Fidelidad del render GeoTIFF** (riesgo #1 del plan original, sigue vivo): el color-mapping WebGL debe reproducir la semántica de las paletas legadas sobre productos nuevos. Mitigación: es la primera rebanada vertical (F2), goldens desde el día uno, validación QGIS del experto de dominio.
2. **Co-evolución del contrato**: el schema D1 lo posee el pipeline. La extensión de `attrs` aterrizó recortada (decisión 22) y sus claves son contrato documentado en ambos repos; el riesgo residual es la semántica de tracks deducida de las grabaciones (decisión 25, pendiente del experto en M4). Mitigación: contract tests versionados que fallan CI ante drift + test canario de continuidad de tracks; cambios = migración negociada.
3. **Rendimiento WebGL en hardware objetivo** con animación multi-frame y mosaico multi-radar. Mitigación: prefetch medido en F3, presupuesto de frames en la puerta de F5; el fallback server-side queda documentado como stage 2, no construido.
4. **Límites del tier gratuito de Cloudflare** (D1 lecturas/día, requests de Functions) bajo uso de demo público. Mitigación: caching de respuestas API (`Cache-Control` en server routes — las listas de datetimes y el catálogo cambian lento), medición en F6.
