# Plan: feedback de usuarios con perfil, persistencia y respuestas

!!! success "Estado: implementado (decisión 39, PR #11, mergeado)"
    Queda como documento de trabajo original — las fases describen lo que se pidió ejecutar, no
    siempre lo que terminó construido al pie de la letra. Diferencias reales con lo planeado,
    verificadas contra el código:

    - **Fase 1 (migración):** no quedó como runbook manual de `psql` — `0001_feedback.sql` se
      aplica **on-boot** vía `server/plugins/migrate-feedback.ts` (SQL embebido en el plugin, no
      leído de disco: el contenedor de producción solo empaqueta `.output/`). Mantenerlo en sync
      manual con el `.sql` versionado es responsabilidad de quien toque el schema. Razón y
      decisión completa en [decisión 39](decisiones.md).
    - **Fase 4 (`feedbackMachine`):** quedó en **cuatro** regiones paralelas (`identity`,
      `dialog`, `form`, `thread`), no tres — el diálogo abierto/cerrado se separó de `form` en vez
      de vivir dentro; no hay región `nudge` aparte, esa política vive dentro de `identity`. Ver
      [Máquinas de estado](maquinas-estado.md#feedbackmachine) (añadido ahí; faltaba en el commit
      original, contra la convención del propio `CLAUDE.md`).
    - **Fase 5 (`FeedbackDialog.vue`):** el aviso de que `TabModal.vue` ya no existe (nota dejada
      en la Fase 5 de abajo) sigue siendo correcto — la lógica de tabs se copió inline de
      `DataModal.vue`, como anticipaba el aviso.
    - **Fase 7 (documentación):** `docs/feedback.md` (schema/GRANTs/env vars/runbook) **nunca se
      creó** — esa referencia no existe en el repo; lo más cercano es el resumen en `CLAUDE.md`.
      `runtimeConfig.public.buildId` sí se añadió a `nuxt.config.ts`, pero el `ARG GIT_SHA` del
      Dockerfile planeado en la Fase 3/5 **no se añadió** — el build de producción no pasa
      `GIT_SHA`, así que `buildId` queda siempre en `'dev'` en el contexto automático adjunto al
      feedback. Pendiente si se quiere que el campo sirva para algo.

    No re-litigar las decisiones de diseño sin motivo — siguen vigentes, igual que en
    [Decisiones de diseño](decisiones.md).

## Contexto

El viewer es un demo que se enseña a profesores, meteorólogos de centros, investigadores y
aficionados. Hoy no hay forma de que ninguno deje una opinión: lo que se aprende del uso real
se pierde. Hace falta (a) recoger feedback dentro de la app, (b) saber **a qué se dedica** quien
lo deja, para pesar cada sugerencia por perfil, (c) guardarlo en base de datos, no solo en el
navegador, y (d) poder **responder** a cada recomendación y que el usuario vea la respuesta al
volver. Un pill flotante da el acceso permanente; un popup ocasional (no insistente) lo recuerda
a quien no lo vio.

Esto introduce **la primera escritura a base de datos del proyecto**. Hoy no existe ninguna:
cero `*.post.ts`, cero `readBody`, `Dal` sin métodos mutadores, y `server/dal/live.ts:1` lleva
escrito "solo SELECT — decisión 17".

## Decisión de arquitectura (nueva, D39 — primer número libre en `docs/decisiones.md`)

La regla "jamás escribe en Postgres" existe para proteger **el contrato del pipeline**, no para
prohibir que el viewer tenga datos propios. Se acota, no se rompe:

- El schema `public` (tablas del pipeline) sigue siendo **solo `SELECT`**, y ahora lo hace
  cumplir la base de datos, no una convención: el rol actual no recibe permisos de escritura.
- El feedback vive en un schema nuevo **`viewer`**, propiedad de ESTE repo, con sus migraciones
  en `db/viewer_migrations/` y un rol propio con CRUD **solo** en `viewer`.
- `scripts/check-contract-drift.sh` y `tests/contract/schema/0001_init.sql` **no se tocan**:
  siguen vigilando solo el contrato del pipeline.
- `FeedbackDal` es una interfaz **aparte** de `Dal`. `tests/unit/dal.spec.ts` (puerta M1) y su
  test de paridad quedan intactos.

## Fase 1 — Schema y permisos

`db/viewer_migrations/0001_feedback.sql` (nuevo directorio, se aplica a mano en el despliegue):

```sql
CREATE SCHEMA IF NOT EXISTS viewer;

CREATE TABLE IF NOT EXISTS viewer.feedback_users (
  token_hash   TEXT PRIMARY KEY,                  -- sha256 hex del token del navegador
  role         TEXT NOT NULL CHECK (role IN
                 ('profesor','meteorologo','investigador','estudiante','aficionado','otro')),
  role_other   TEXT,
  display_name TEXT, email TEXT, organization TEXT, country TEXT, locale TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS viewer.feedback (
  id         BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL REFERENCES viewer.feedback_users(token_hash) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('mejora','bug','dato','otro')),
  rating     SMALLINT CHECK (rating BETWEEN 1 AND 5),
  message    TEXT NOT NULL,
  context    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- captura automática del mapa
  status     TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN
                 ('nuevo','leido','respondido','cerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON viewer.feedback (token_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_triage ON viewer.feedback (status, created_at DESC);

CREATE TABLE IF NOT EXISTS viewer.feedback_replies (
  id          BIGSERIAL PRIMARY KEY,
  feedback_id BIGINT NOT NULL REFERENCES viewer.feedback(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT 'LAMULA',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ                          -- NULL = pendiente → badge en el pill
);
CREATE INDEX IF NOT EXISTS idx_reply_feedback ON viewer.feedback_replies (feedback_id, created_at);
```

**Identidad sin cuentas.** El navegador genera un token aleatorio de 32 bytes
(`crypto.getRandomValues` → base64url) y lo guarda en `localStorage`. El servidor solo almacena
`sha256(token)`. El token viaja en la cabecera `x-feedback-token`, **nunca en la query string**
(no acaba en logs ni en `Referer`). Sin token no se puede leer el hilo de otro. Un UUID "público"
como identificador sería adivinable/enumerable: por eso token secreto + hash, no id.

**GRANTs** (a ejecutar una vez en el VPS, documentar en `docs/feedback.md`):

```sql
CREATE ROLE viewer_rw LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA viewer TO viewer_rw;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA viewer TO viewer_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA viewer TO viewer_rw;
-- y NO se le concede nada sobre public
```

## Fase 2 — Contrato y DAL de feedback

- `shared/contract/feedback.ts` (nuevo), exportado desde el barrel `shared/contract/index.ts:1`.
  Misma convención que `shared/contract/schemas.ts`: tuplas `as const` + tipo derivado
  (`FEEDBACK_ROLES`, `FEEDBACK_KINDS`, `FEEDBACK_STATUSES`) y esquemas `zFeedbackProfile`,
  `zFeedbackSubmission`, `zFeedbackContext`, `zFeedbackThread`, `zAdminReply`. Los enums Zod se
  construyen desde las tuplas, como `z.enum(WIND_LEVELS)` en `shared/contract/schemas.ts`.
- `server/dal/feedback-types.ts`: interfaz `FeedbackDal` — `upsertUser`, `createFeedback`,
  `listMine(tokenHash)`, `markRepliesRead(tokenHash)`, `listAll(filters)`, `addReply`,
  `setStatus`.
- `server/dal/feedback-live.ts`: implementación sobre `PgLike` (`server/dal/types.ts:61`),
  placeholders `$1,$2,…`, `INSERT … RETURNING id`, upsert con
  `ON CONFLICT (token_hash) DO UPDATE`.
- `server/dal/feedback-memory.ts`: adaptador para `NUXT_DAL_ADAPTER=fixture` — `Map` en memoria,
  volátil. Es lo que permite que el e2e ejercite el flujo completo sin Postgres. (Grabar feedback
  real en `server/dal/fixtures/` no tiene sentido: es dato de escritura, no una grabación.)
- `server/dal/feedback.ts`: factory `useFeedbackDal(event)`, espejo de `useDal`
  (`server/dal/index.ts:14-39`), con la misma degradación a **503 con mensaje explícito** si falta
  config.

**Refactor obligatorio en `server/dal/pg.ts:17`.** Hoy el cliente es un singleton con `??=` que
**ignora la config después de la primera llamada**. Con dos roles (lectura en `public`, escritura
en `viewer`) eso devolvería la conexión equivocada. Cambiar a un `Map` cacheada por
`${host}:${port}/${db}@${user}`. Nuevas env vars en `runtimeConfig` (`nuxt.config.ts:80-91`):
`pgWriteUser`, `pgWritePassword` (si están vacías, el feedback queda deshabilitado y los
endpoints responden 503 — el viewer sigue funcionando entero).

## Fase 3 — Endpoints

Patrón idéntico al existente (`server/api/wind/times.get.ts`): `parseQueryParams` /
`readValidatedBody` con Zod, sin try/catch, `createError` para los fallos.

| Ruta | Qué hace |
|---|---|
| `POST /api/feedback` | Verifica Turnstile, rate-limit, upsert de perfil, inserta feedback, dispara webhook. `201` |
| `GET /api/feedback/mine` | Cabecera `x-feedback-token` → hilos con respuestas. `Cache-Control: no-store` |
| `POST /api/feedback/mine/read` | Marca `read_at` de las respuestas del token (un GET no debe mutar) |
| `GET /api/admin/feedback` | Lista con filtros `status`/`role`, paginada |
| `POST /api/admin/feedback/[id]/reply` | Inserta respuesta y pasa `status` a `respondido` |
| `POST /api/admin/feedback/[id]/status` | Cambia estado (`leido`/`cerrado`) |
| `POST /api/admin/login` | Compara con `NUXT_ADMIN_TOKEN` usando `timingSafeEqual`, setea cookie httpOnly+secure+SameSite=Lax |

`server/middleware/admin.ts` (nuevo, primer middleware del repo): protege `/api/admin/**` y
devuelve 401 sin cookie válida.

**Validación de body nueva en el repo.** `server/dal/params.ts:5` solo valida query. Añadir ahí
mismo un `parseBody(event, schema)` hermano, con el mismo formato de error 400 por campo
(`params.ts:8`), para no inventar un segundo estilo.

**Turnstile** (skill `turnstile-spin` disponible). `NUXT_PUBLIC_TURNSTILE_SITE_KEY` +
`NUXT_TURNSTILE_SECRET`. Sin site key el widget no se monta y el servidor no verifica — eso es lo
que mantiene el e2e determinista y el dev offline. **Falla cerrado**: en producción
(`NUXT_DAL_ADAPTER` distinto de `fixture`) sin secreto configurado, `POST /api/feedback` responde
503 en vez de aceptar sin captcha; el bypass exige `NUXT_TURNSTILE_DISABLED=1` explícito.
Rate-limit en memoria por IP y por token (p. ej. 5/hora): un solo contenedor, se pierde al
reiniciar — suficiente, y no añade Redis.

**Aviso de feedback nuevo.** `NUXT_FEEDBACK_WEBHOOK_URL`: un POST JSON genérico, fire-and-forget,
cuyo fallo **nunca** rompe el envío del usuario. Sirve tal cual para la API de Telegram, un webhook
de Slack/Discord o ntfy, sin código por proveedor ni decidir credenciales ahora. *Asunción a
confirmar: no hay canal de alertas preexistente que reutilizar.* No se envía email al usuario
cuando respondes: la respuesta se lee en la app (badge).

## Fase 4 — Estado de cliente

`composables/useFeedbackIdentity.ts`, calcado de `composables/useViewerPrefs.ts` (funciones puras,
guarda `typeof localStorage === 'undefined'`, `try/catch` silencioso, campo `v` versionado con
migración en memoria). **Clave propia `lamula:feedback`**, no dentro de `lamula:prefs` — las prefs
son ajustes de display con su propia escalera de versiones v1→v5; mezclarlas la ensucia.

```ts
{ v: 1, token: string, profile?: FeedbackProfile,
  nudge: { shownCount: number, snoozeUntil: number | null, submitted: boolean } }
```

`machines/feedback.ts` (XState v5, decisión 18/27): máquina **propia**, orquestada por la página
con watchers, igual que `overlayMachine` — tiene ciclo de vida propio (identidad, envío, hilo) y
no debe reiniciarse con el del raster. Regiones paralelas `identity` / `form` / `thread` / `nudge`.
Siguiendo la lección anotada en `machines/overlay.ts:16-23`: **ningún evento en la raíz**, todo a
nivel de región. El estado **no va a la URL** (no es compartible — mismo criterio que la D28 para
las prefs).

`utils/feedback/nudge.ts`: política pura con reloj inyectado (mismo patrón que
`utils/lightning/anim.ts`), así los tests son deterministas sin tocar el reloj:

- No aparece nunca antes de **90 s de uso real** de la sesión (no al primer paint: pedir opinión
  antes de que la app haya dado valor es justo lo "pesado" que hay que evitar).
- Máximo **3 veces en la vida** del navegador; "más tarde" pospone 3 días, "no, gracias" 7 días.
- Tras enviar feedback **no vuelve a aparecer jamás**. El pill se queda siempre.

## Fase 5 — UI

- **Pill**: una pastilla más en el rail derecho de `LayersMenu.vue:86`, con las clases de pastilla
  ya canónicas (`LayersMenu.vue:102`) y emitiendo `open-feedback` hacia la página, exactamente como
  ya hacen `open-panel`/`open-prefs` (`LayersMenu.vue:64-72`). Es el único sitio libre: arriba-izq
  está `RadarProductChip` y abajo el timebar ocupa todo el ancho (`pages/…/[[time]].vue:816`).
  Badge: punto rojo cuando hay respuestas con `read_at IS NULL`.
- **`components/FeedbackDialog.vue`**: `<dialog>` nativo, patrón de `PrefsDialog.vue:19-23` —
  `defineExpose({ open })`, `<form method="dialog">`, `aria-labelledby`. **No** un dock: `DataModal`
  y `LayersMenu` no tienen ni Esc ni focus trap (`DataModal.vue:2-5`), y un formulario los necesita.
  Dos tabs: *Enviar* y *Mis mensajes* (hilo con tus respuestas). Campos: ocupación (**obligatoria**,
  `<select>` + "otro" en texto), tipo, valoración 1-5 opcional, mensaje (obligatorio), y plegado
  "sobre ti" opcional con nombre/email/institución/país. El perfil se precarga de `localStorage`:
  a partir del segundo envío solo se escribe el mensaje.
  > Ojo: `TabModal.vue` **ya no existe** (borrado en `ad064dc`, pese a lo que dice
  > `docs/decisiones.md:132`). La lógica de tabs se copia de `DataModal.vue:48-62`.
- **`components/FeedbackNudge.vue`**: tarjeta pequeña abajo-derecha
  (`absolute bottom-28 right-4 md:right-8 z-30`) — esquina libre desde la D36, según el comentario
  de `pages/…/[[time]].vue:812`. Tres acciones: *Dejar feedback* / *Más tarde* / *No, gracias*.
- **Contexto automático**: al enviar se adjunta en silencio `{ url, site, product, volTime, layers,
  panel, windLevel, basemap, buildId, viewport, locale, userAgent }`, leído de `ctx`/`overlayCtx`
  (`pages/…/[[time]].vue:214` y `:504`). Añadir `runtimeConfig.public.buildId` (desde `GIT_SHA`) en
  `nuxt.config.ts` y pasarlo como ARG en el `Dockerfile`.
- **Admin**: `pages/admin/feedback.vue` + `pages/admin/login.vue`. Tabla nativa + Tailwind, como
  `CellTable.vue` (PrimeVue sigue sin uso; no introducir ahí un patrón nuevo). Filtros por estado y
  por ocupación, caja de respuesta por hilo, `<meta name="robots" content="noindex">`.
- Strings en **español hardcodeado**, como el resto del repo (i18n sigue siendo F5; no está
  instalado pese a lo que dice `docs/arquitectura.md:43`).

## Fase 6 — Tests

- **Unit** (`tests/unit/`): `feedback-nudge.spec.ts` (política pura con reloj inyectado),
  `feedback-identity.spec.ts` (migración de versión, JSON corrupto, `localStorage` ausente),
  `feedback-dal.spec.ts` (misma suite contra live y memory), `feedback-machine.spec.ts`,
  y round-trip de los esquemas Zod.
- **Soporte de escritura en `tests/helpers/pg-sqlite.ts`.** Hoy `sqliteCompatible` (`:28`) solo
  traduce `BIGSERIAL`. Hay que extenderlo: `ATTACH DATABASE ':memory:' AS viewer` para los nombres
  cualificados, `TIMESTAMPTZ`→`TEXT`, `JSONB`→`TEXT`, `now()`→`CURRENT_TIMESTAMP`, quitar `::jsonb`.
  Las migraciones de `db/viewer_migrations/` se cargan aparte de `tests/contract/schema/`, que sigue
  siendo espejo byte-exacto del pipeline.
  > **Trampa**: `asPg()` (`pg-sqlite.ts:76`) traduce `$n` → `?` **posicional**. Si una query de
  > feedback reusa `$1`, el orden de parámetros se corrompe en silencio y el test pasa con datos
  > mal puestos. Ninguna query nueva debe repetir un placeholder; dejarlo escrito en el helper.
- **E2E** `e2e/feedback.spec.ts`, modo fixture (adaptador en memoria, sin Turnstile). Flujo
  completo: abrir pill → validación de ocupación obligatoria → enviar → aparece en "Mis mensajes";
  y el nudge sembrando `lamula:feedback` con `page.addInitScript`, como hace
  `e2e/prefs.spec.ts:34-39`. **Respetar la regla de hidratación** documentada en
  `e2e/prefs.spec.ts:5-8`: un solo click tras `waitForLoadState('networkidle')`, nunca reintentos
  sobre acciones con efecto; `toPass` solo en asserts idempotentes. Navegar por `getByTestId`
  (convención kebab-case con prefijo de componente).
- **Goldens**: siguen desactivados por defecto (gate `GOLDENS=1`, `playwright.config.ts:38`). El
  pill nuevo cambia el rail derecho, así que si alguna vez se reactivan hay que regenerarlos —
  anotarlo, no regenerarlos a ciegas.
- **CI**: sin cambios en `.github/workflows/ci.yml` — no hace falta servicio Postgres, el adaptador
  live se prueba contra better-sqlite3 como el resto.

## Fase 7 — Documentación

- `docs/decisiones.md`: **D39** con el acotamiento de la regla de escritura, el porqué del schema
  `viewer` con rol propio, token-hash en vez de id público, y los descartes (base de datos aparte;
  tabla en el pipeline; solo-localStorage).
- `docs/maquinas-estado.md`: diagrama y notas de `feedbackMachine` — `CLAUDE.md` exige que vaya en
  **el mismo commit** que la máquina.
- `docs/feedback.md` (nuevo): schema, GRANTs, env vars, runbook de despliegue (aplicar la migración
  a mano con `psql`, igual que el despliegue al Swarm es manual) y cómo usar el admin.
- `CLAUDE.md`: actualizar la regla — "jamás escribe en el schema `public` del pipeline".

## Ficheros críticos

Nuevos: `db/viewer_migrations/0001_feedback.sql`, `shared/contract/feedback.ts`,
`server/dal/feedback{,-types,-live,-memory}.ts`, `server/api/feedback/**`, `server/api/admin/**`,
`server/middleware/admin.ts`, `composables/useFeedbackIdentity.ts`, `machines/feedback.ts`,
`utils/feedback/nudge.ts`, `components/Feedback{Dialog,Nudge}.vue`, `pages/admin/*.vue`,
`docs/feedback.md`.

Modificados: `server/dal/pg.ts` (cache por config), `server/dal/params.ts` (`parseBody`),
`nuxt.config.ts` (env vars + `buildId`), `components/LayersMenu.vue` (pill + emit),
`pages/[site]/[product]/[[time]].vue` (montaje y cableado), `tests/helpers/pg-sqlite.ts`,
`Dockerfile` (ARG `GIT_SHA`), `shared/contract/index.ts`, `CLAUDE.md`, `docs/*`.

## Verificación

1. `pnpm lint && pnpm typecheck && pnpm test` — unit en verde, incluida la suite de feedback.
2. `bash scripts/check-contract-drift.sh` — debe seguir pasando **sin cambios**: prueba de que el
   contrato del pipeline no se tocó.
3. `pnpm test` sobre `tests/unit/dal.spec.ts` — la paridad M1 intacta, sin modificar el fichero.
4. `pnpm build && pnpm test:e2e` — `e2e/feedback.spec.ts` recorre enviar → leer el hilo, y el nudge.
5. Local contra Postgres real: `docker run postgres:16-alpine`, `pnpm db:setup`, aplicar
   `db/viewer_migrations/0001_feedback.sql` y los GRANTs, arrancar con `NUXT_PG_*` +
   `NUXT_PG_WRITE_*`, enviar feedback desde la UI y comprobar con `psql` que la fila está.
6. Comprobar que el rol de lectura **no** puede escribir: `INSERT` en `viewer.feedback` con el
   usuario de solo-lectura debe fallar con `permission denied`.
7. Admin: login con `NUXT_ADMIN_TOKEN`, responder un hilo, recargar el viewer con el mismo
   navegador y ver el badge rojo; abrir el hilo y comprobar que el badge desaparece.
8. Webhook: apuntar `NUXT_FEEDBACK_WEBHOOK_URL` a un `nc -l` local y verificar que llega el POST y
   que, con la URL rota, el envío del usuario **igual responde 201**.
