import { describe, expect, it } from 'vitest'
import { createActor } from 'xstate'
import { frameMachine } from '../../machines/frame'

describe('frameMachine', () => {
  it('arranca en pending', () => {
    const actor = createActor(frameMachine, { input: { index: 2 } })
    actor.start()
    expect(actor.getSnapshot().matches('pending')).toBe(true)
    expect(actor.getSnapshot().context.index).toBe(2)
  })

  it('READY → ready', () => {
    const actor = createActor(frameMachine, { input: { index: 0 } })
    actor.start()
    actor.send({ type: 'READY' })
    expect(actor.getSnapshot().matches('ready')).toBe(true)
  })

  it('FAILED → failed con mensaje', () => {
    const actor = createActor(frameMachine, { input: { index: 0 } })
    actor.start()
    actor.send({ type: 'FAILED', message: 'no COG' })
    expect(actor.getSnapshot().matches('failed')).toBe(true)
    expect(actor.getSnapshot().context.error).toBe('no COG')
  })
})
