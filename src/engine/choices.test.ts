import { describe, expect, it } from 'vitest';
import { createSet } from '../team';
import { chooseCpuActions } from './ai';
import { createBattle } from './battle';
import { isMoveUsable, moveUnavailableReason, usableMoves } from './choices';

function battle() {
  const pikachu = { ...createSet('raichu'), itemId: 'choiceScarf', moves: ['thunderbolt', 'quickattack', 'thunderwave', 'protect'] };
  return createBattle({ format: 'singles', playerTeam: [createSet('blastoise')], cpuTeam: [pikachu], seed: 7 });
}

describe('shared move availability', () => {
  it('permits four moves before selection and only the held Choice lock afterward', () => {
    const pokemon = battle().sides.cpu.team[0];
    expect(usableMoves(pokemon)).toHaveLength(4);
    expect(isMoveUsable(pokemon, 'struggle')).toBe(false);
    pokemon.choiceLock = 'quickattack';
    expect(usableMoves(pokemon).map(move => move.id)).toEqual(['quickattack']);
    expect(isMoveUsable(pokemon, 'thunderbolt')).toBe(false);
    expect(moveUnavailableReason(pokemon, 'thunderbolt')).toContain('전광석화만');
  });

  it('uses Struggle when the locked move is exhausted despite remaining PP on other moves', () => {
    const pokemon = battle().sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    pokemon.pp.quickattack = 0;
    expect(pokemon.pp.thunderbolt).toBeGreaterThan(0);
    expect(usableMoves(pokemon)).toEqual([]);
    expect(isMoveUsable(pokemon, 'struggle')).toBe(true);
    pokemon.fainted = true;
    expect(isMoveUsable(pokemon, 'struggle')).toBe(false);
  });

  it('ignores a remembered lock without a Choice item and rejects unknown or unlearned moves', () => {
    const pokemon = battle().sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    pokemon.set.itemId = 'leftovers';
    expect(usableMoves(pokemon)).toHaveLength(4);
    expect(isMoveUsable(pokemon, 'earthquake')).toBe(false);
    expect(isMoveUsable(pokemon, 'unknown')).toBe(false);
  });

  it('makes the CPU obey its low-damage locked move and fall back to Struggle at zero PP', () => {
    const state = battle();
    const pokemon = state.sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    expect(chooseCpuActions(state)[0]).toMatchObject({ kind: 'move', moveId: 'quickattack' });
    pokemon.pp.quickattack = 0;
    expect(chooseCpuActions(state)[0]).toMatchObject({ kind: 'move', moveId: 'struggle' });
  });

  it('reserves a doubles bench member so two CPU slots cannot select the same replacement', () => {
    const state = createBattle({
      format: 'doubles', seed: 5,
      playerTeam: [createSet('blastoise'), createSet('venusaur')],
      cpuTeam: [createSet('raichu'), createSet('charizard'), createSet('snorlax')],
    });
    state.turn = 2;
    state.sides.cpu.team[0].hp = 1;
    state.sides.cpu.team[1].hp = 1;
    const actions = chooseCpuActions(state);
    const switches = actions.filter(action => action.kind === 'switch');
    expect(actions).toHaveLength(2);
    expect(switches).toHaveLength(1);
    expect(switches[0]).toMatchObject({ kind: 'switch', to: 2 });
    expect(actions[1].kind).toBe('move');
  });
});
