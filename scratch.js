import { createMachine, createActor } from 'xstate';

const machine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { GO: 'buffering' } },
    buffering: { on: { GO: 'paused' } },
    paused: {}
  }
});
const actor = createActor(machine).start();
console.log(actor.getSnapshot().value);
actor.send({ type: 'GO' });
console.log(actor.getSnapshot().value);
actor.send({ type: 'GO' });
console.log(actor.getSnapshot().value);
