import { expect, it } from 'vitest';
import { createSet } from '../team';
import { createBattle, runTurnWithEvents } from './battle';
const action = (moveId: string) => [{kind: 'move' as const, slot: 0, moveId}];

it('one remaining sleep turn prevents an action without consuming PP, then wakes', () => {
  const state = createBattle({format:'singles', playerTeam:[createSet('pikachu')], cpuTeam:[createSet('blastoise')], seed:5});
  const user = state.sides.player.team[0];
  user.status = 'sleep'; user.sleepTurns = 1;
  const id = user.set.moves[0];
  const first = runTurnWithEvents(state, action(id), action('protect'));
  expect(first.state.sides.player.team[0].pp[id]).toBe(user.pp[id]);
  expect(first.events.some(event => event.kind === 'blocked' && event.targetUid === user.uid)).toBe(true);
  const second = runTurnWithEvents(first.state, action(id), action('protect'));
  expect(second.events.some(event => event.kind === 'status' && event.status === null && event.targetUid === user.uid)).toBe(true);
  expect(second.state.sides.player.team[0].pp[id]).toBe(user.pp[id] - 1);
});

it('Struggle hits a Ghost after all PP are gone and recoils by one quarter of maximum HP', () => {
  const state = createBattle({format:'singles', playerTeam:[createSet('snorlax')], cpuTeam:[createSet('gengar')], seed:6});
  const user = state.sides.player.team[0], foe = state.sides.cpu.team[0];
  Object.keys(user.pp).forEach(id => {user.pp[id] = 0;});
  foe.status = 'sleep'; foe.sleepTurns = 3;
  const result = runTurnWithEvents(state, action('struggle'), action(foe.set.moves[0]));
  expect(result.state.sides.cpu.team[0].hp).toBeLessThan(foe.hp);
  expect(result.state.sides.player.team[0].hp).toBe(user.hp - Math.floor(user.maxHp / 4));
  const recoil = result.events.find(event => event.kind === 'damage' && event.targetUid === user.uid)!;
  expect(recoil.moveId).toBeUndefined();
});

it('rejects a fabricated Struggle action when a normal move is available', () => {
  const state = createBattle({format:'singles', playerTeam:[createSet('pikachu')], cpuTeam:[createSet('blastoise')], seed:2});
  const result = runTurnWithEvents(state, action('struggle'), action('protect'));
  expect(result.events.filter(event => event.kind === 'move').some(event => event.moveId === 'struggle')).toBe(false);
});
