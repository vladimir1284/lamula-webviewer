import { createMachine, createActor, assign } from 'xstate';

const childMachine = createMachine({
  initial: 'pending',
  states: {
    pending: { on: { FAILED: 'failed' } },
    failed: {}
  }
});

const machine = createMachine({
  initial: 'buffering',
  context: { frames: [] },
  states: {
    buffering: {
      always: {
        guard: ({ context }) => context.frames.length > 0 && context.frames.every(f => !f.getSnapshot().matches('pending')),
        target: 'paused'
      },
      on: {
        SET: {
          actions: assign(({ spawn }) => ({ frames: [spawn(childMachine)] }))
        },
        FRAME_FAILED: {
          actions: ({ context }) => context.frames[0].send({ type: 'FAILED' })
        }
      }
    },
    paused: {}
  }
});
const actor = createActor(machine).start();
actor.send({ type: 'SET' });
console.log("After SET:", actor.getSnapshot().value);
actor.send({ type: 'FRAME_FAILED' });
console.log("After FRAME_FAILED:", actor.getSnapshot().value);
