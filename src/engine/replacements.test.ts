import { describe, expect, it } from 'vitest';
import { createBattle, needsReplacement, replacementSlots, runTurnWithEvents } from './battle';
import { createSet } from '../team';
import { swapBattleSides } from '../network/friendBattle';

describe('interactive fainted Pokémon replacements', () => {
  it('waits after a real knockout and lets the player choose without consuming a turn or PP', () => {
    const initial = createBattle({ format: 'singles', playerTeam: ['charizard', 'blastoise', 'gyarados'].map(createSet), cpuTeam: [createSet('raichu')], seed: 42, manualReplacementSides: ['player'] });
    initial.sides.player.team[0].hp = 1;
    const knockout = runTurnWithEvents(initial, [{ kind: 'move', slot: 0, moveId: 'flamethrower' }], [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }]);
    expect(knockout.events.some(event => event.kind === 'faint')).toBe(true);
    expect(knockout.state.sides.player.active).toEqual([0]);
    expect(replacementSlots(knockout.state, 'player')).toEqual([0]);
    const hp = knockout.state.sides.cpu.team[0].hp, pp = knockout.state.sides.cpu.team[0].pp;
    const chosen = runTurnWithEvents(knockout.state, [{ kind: 'switch', slot: 0, to: 2 }]);
    expect(chosen.state.sides.player.active).toEqual([2]);
    expect(chosen.state.turn).toBe(knockout.state.turn);
    expect(chosen.state.sides.cpu.team[0].hp).toBe(hp);
    expect(chosen.state.sides.cpu.team[0].pp).toEqual(pp);
    expect(chosen.events.some(event => event.kind === 'move')).toBe(false);
    expect(chosen.events.some(event => event.kind === 'ability')).toBe(true); // Intimidate on entry
    expect(needsReplacement(chosen.state)).toBe(false);
    expect(knockout.state.sides.player.active).toEqual([0]);
  });

  it('rejects missing, occupied, fainted, and duplicate doubles choices atomically', () => {
    const state = createBattle({ format: 'doubles', playerTeam: ['charizard', 'raichu', 'blastoise', 'gyarados'].map(createSet), cpuTeam: [createSet('snorlax')], seed: 7, manualReplacementSides: ['player'] });
    for (const index of [0, 1]) { state.sides.player.team[index].hp = 0; state.sides.player.team[index].fainted = true; }
    const before = structuredClone(state);
    expect(replacementSlots(state, 'player')).toEqual([0, 1]);
    expect(() => runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 2 }])).toThrow(/출전/);
    expect(() => runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 0 }, { kind: 'switch', slot: 1, to: 3 }])).toThrow();
    expect(() => runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 2 }, { kind: 'switch', slot: 1, to: 2 }])).toThrow();
    expect(state).toEqual(before);
    const result = runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 3 }, { kind: 'switch', slot: 1, to: 2 }]);
    expect(result.state.sides.player.active).toEqual([3, 2]);
    expect(result.events.filter(event => event.kind === 'switch-in')).toHaveLength(2);
    expect(result.state.turn).toBe(state.turn);
  });

  it('requires only one choice when two doubles slots faint but only one bench member survives', () => {
    const state = createBattle({ format: 'doubles', playerTeam: ['charizard', 'raichu', 'blastoise'].map(createSet), cpuTeam: [createSet('snorlax')], manualReplacementSides: ['player'] });
    for (const index of [0, 1]) { state.sides.player.team[index].hp = 0; state.sides.player.team[index].fainted = true; }
    expect(replacementSlots(state, 'player')).toEqual([0]);
    const result = runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 2 }]);
    expect(needsReplacement(result.state)).toBe(false);
    expect(result.state.winner).toBeNull();
  });

  it('resolves both friendly teams together and maps the guest replacement perspective', () => {
    const state = createBattle({ format: 'singles', playerTeam: ['charizard', 'gyarados'].map(createSet), cpuTeam: ['raichu', 'blastoise'].map(createSet), manualReplacementSides: ['player', 'cpu'] });
    for (const side of ['player', 'cpu'] as const) { state.sides[side].team[0].fainted = true; state.sides[side].team[0].hp = 0; }
    expect(replacementSlots(swapBattleSides(state), 'player')).toEqual([0]);
    expect(() => runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 1 }], [])).toThrow();
    const result = runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 1 }], [{ kind: 'switch', slot: 0, to: 1 }]);
    expect(result.state.sides.player.active).toEqual([1]);
    expect(result.state.sides.cpu.active).toEqual([1]);
    expect(needsReplacement(result.state)).toBe(false);
    expect(result.state.turn).toBe(1);
  });
});
