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
2. **Co-evolución del contrato**: el schema D1 lo posee el pipeline y aún evoluciona (extensión de `attrs` acordada). Mitigación: contract tests versionados en este repo que fallan CI ante drift; claves de `attrs` documentadas en el contrato; cambios = migración negociada.
3. **Rendimiento WebGL en hardware objetivo** con animación multi-frame y mosaico multi-radar. Mitigación: prefetch medido en F3, presupuesto de frames en la puerta de F5; el fallback server-side queda documentado como stage 2, no construido.
4. **Límites del tier gratuito de Cloudflare** (D1 lecturas/día, requests de Functions) bajo uso de demo público. Mitigación: caching de respuestas API (`Cache-Control` en server routes — las listas de datetimes y el catálogo cambian lento), medición en F6.
