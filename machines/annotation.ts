// Anotaciones sobre el mapa (F7.2): modo de dibujo, herramienta activa y la
// colección por sitio. Diagrama: docs/maquinas-estado.md.
//
// Pura como el resto (decisión 18): la persistencia entra como acción
// inyectada (`persist`), igual que `syncQuery` en viewerMachine — los tests
// corren con `createActor` sin localStorage ni DOM.
//
// Las anotaciones NO viajan en la URL (excepción a la decisión 23,
// documentada en la 40): un trazo a mano alzada son cientos de puntos.
import { assign, setup } from 'xstate'
import type { Annotation, AnnotationKind } from '../utils/export/annotations'
import { DEFAULT_ANNOTATION_COLOR } from '../utils/export/annotations'

/** Colección por `site_id`: un trazo sobre una tormenta de BYX no pinta en KTLX. */
export type AnnotationsBySite = Record<string, Annotation[]>

export interface AnnotationContext {
  site: string
  tool: AnnotationKind
  color: string
  /** rótulo que usará el próximo punto con la herramienta 'text' */
  pendingText: string
  bySite: AnnotationsBySite
}

export type AnnotationEvent =
  | { type: 'ENABLE' }
  | { type: 'DISABLE' }
  | { type: 'SET_TOOL', tool: AnnotationKind }
  | { type: 'SET_COLOR', color: string }
  | { type: 'SET_TEXT', text: string }
  /** la capa terminó un trazo */
  | { type: 'ADD', annotation: Annotation }
  /** la capa movió/reformó un trazo existente */
  | { type: 'UPDATE', annotation: Annotation }
  | { type: 'REMOVE', id: string }
  | { type: 'UNDO' }
  | { type: 'CLEAR' }
  | { type: 'SITE_CHANGED', site: string }
  /** rehidratación desde localStorage al montar */
  | { type: 'LOADED', bySite: AnnotationsBySite }

function listOf(ctx: AnnotationContext): Annotation[] {
  return ctx.bySite[ctx.site] ?? []
}

function withList(ctx: AnnotationContext, list: Annotation[]): AnnotationsBySite {
  return { ...ctx.bySite, [ctx.site]: list }
}

export const annotationMachine = setup({
  types: {} as {
    context: AnnotationContext
    events: AnnotationEvent
    input: { site: string }
  },
  actions: {
    // inyectada por la página: persiste en localStorage (lamula:annotations)
    persist: (_, _params: AnnotationsBySite) => {},
  },
}).createMachine({
  id: 'annotation',
  context: ({ input }) => ({
    site: input.site,
    tool: 'arrow' as AnnotationKind,
    color: DEFAULT_ANNOTATION_COLOR,
    pendingText: '',
    bySite: {},
  }),
  // el sitio y la colección cambian con el modo apagado o encendido:
  // van en la raíz, no dentro de un estado
  on: {
    SITE_CHANGED: { actions: assign({ site: ({ event }) => event.site }) },
    LOADED: { actions: assign({ bySite: ({ event }) => event.bySite }) },
    SET_COLOR: { actions: assign({ color: ({ event }) => event.color }) },
    SET_TEXT: { actions: assign({ pendingText: ({ event }) => event.text }) },
    UPDATE: {
      actions: [
        assign({
          bySite: ({ context, event }) => withList(
            context,
            listOf(context).map(a => (a.id === event.annotation.id ? event.annotation : a)),
          ),
        }),
        { type: 'persist', params: ({ context }) => context.bySite },
      ],
    },
    REMOVE: {
      actions: [
        assign({
          bySite: ({ context, event }) => withList(context, listOf(context).filter(a => a.id !== event.id)),
        }),
        { type: 'persist', params: ({ context }) => context.bySite },
      ],
    },
    UNDO: {
      actions: [
        assign({ bySite: ({ context }) => withList(context, listOf(context).slice(0, -1)) }),
        { type: 'persist', params: ({ context }) => context.bySite },
      ],
    },
    CLEAR: {
      actions: [
        assign({ bySite: ({ context }) => withList(context, []) }),
        { type: 'persist', params: ({ context }) => context.bySite },
      ],
    },
  },
  initial: 'off',
  states: {
    off: {
      on: { ENABLE: 'drawing' },
    },
    drawing: {
      on: {
        DISABLE: 'off',
        SET_TOOL: { actions: assign({ tool: ({ event }) => event.tool }) },
        ADD: {
          actions: [
            assign({ bySite: ({ context, event }) => withList(context, [...listOf(context), event.annotation]) }),
            { type: 'persist', params: ({ context }) => context.bySite },
          ],
        },
      },
    },
  },
})

/** Anotaciones del sitio mostrado — lo que la capa tiene que pintar. */
export function annotationsOf(ctx: AnnotationContext): Annotation[] {
  return ctx.bySite[ctx.site] ?? []
}
