// annotationMachine (F7.2). Diagrama: docs/maquinas-estado.md.
import { createActor } from 'xstate'
import { describe, expect, it } from 'vitest'
import { annotationMachine, annotationsOf } from '~/machines/annotation'
import type { AnnotationsBySite } from '~/machines/annotation'
import { makeAnnotation } from '~/utils/export/annotations'

function start(site = 'BYX') {
  const persisted: AnnotationsBySite[] = []
  const actor = createActor(
    annotationMachine.provide({
      actions: { persist: (_, bySite) => { persisted.push(bySite) } },
    }),
    { input: { site } },
  ).start()
  return { actor, persisted }
}

const arrow = (id: string) => makeAnnotation('arrow', [[0, 0], [1000, 1000]], { id })!

describe('annotationMachine', () => {
  it('arranca apagada y solo dibuja tras ENABLE', () => {
    const { actor } = start()
    expect(actor.getSnapshot().matches('off')).toBe(true)
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(0)

    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(1)
  })

  it('persiste en cada mutación, nunca al solo cambiar de herramienta', () => {
    const { actor, persisted } = start()
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'SET_TOOL', tool: 'circle' })
    actor.send({ type: 'SET_COLOR', color: '#facc15' })
    expect(persisted).toHaveLength(0)

    actor.send({ type: 'ADD', annotation: arrow('a1') })
    expect(persisted).toHaveLength(1)
    expect(persisted[0]!.BYX).toHaveLength(1)
  })

  it('las anotaciones son por sitio: cambiar de radar no las mezcla', () => {
    const { actor } = start('BYX')
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    actor.send({ type: 'SITE_CHANGED', site: 'KTLX' })
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(0)

    actor.send({ type: 'ADD', annotation: arrow('b1') })
    actor.send({ type: 'SITE_CHANGED', site: 'BYX' })
    expect(annotationsOf(actor.getSnapshot().context).map(a => a.id)).toEqual(['a1'])
  })

  it('UPDATE reemplaza en el sitio, sin duplicar ni reordenar', () => {
    const { actor } = start()
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    actor.send({ type: 'ADD', annotation: arrow('a2') })
    const moved = makeAnnotation('arrow', [[5000, 5000], [6000, 6000]], { id: 'a1' })!
    actor.send({ type: 'UPDATE', annotation: moved })
    const list = annotationsOf(actor.getSnapshot().context)
    expect(list.map(a => a.id)).toEqual(['a1', 'a2'])
    expect(list[0]!.coords[0]).toEqual([5000, 5000])
  })

  it('UNDO saca la última, CLEAR vacía el sitio y REMOVE va por id', () => {
    const { actor } = start()
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    actor.send({ type: 'ADD', annotation: arrow('a2') })
    actor.send({ type: 'UNDO' })
    expect(annotationsOf(actor.getSnapshot().context).map(a => a.id)).toEqual(['a1'])

    actor.send({ type: 'ADD', annotation: arrow('a3') })
    actor.send({ type: 'REMOVE', id: 'a1' })
    expect(annotationsOf(actor.getSnapshot().context).map(a => a.id)).toEqual(['a3'])

    actor.send({ type: 'CLEAR' })
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(0)
  })

  it('editar y borrar siguen disponibles con el modo apagado', () => {
    const { actor } = start()
    actor.send({ type: 'ENABLE' })
    actor.send({ type: 'ADD', annotation: arrow('a1') })
    actor.send({ type: 'DISABLE' })
    expect(actor.getSnapshot().matches('off')).toBe(true)
    actor.send({ type: 'UNDO' })
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(0)
  })

  it('LOADED rehidrata sin pasar por el modo dibujo', () => {
    const { actor, persisted } = start()
    actor.send({ type: 'LOADED', bySite: { BYX: [arrow('a1')] } })
    expect(persisted).toHaveLength(0) // rehidratar no reescribe localStorage
    expect(annotationsOf(actor.getSnapshot().context)).toHaveLength(1)
    expect(actor.getSnapshot().matches('off')).toBe(true)
  })
})
