import { describe, expect, it } from 'vitest';
import { getStarterTeam } from '../data';
import { chooseCpuActions, createBattle, getTypeMultiplier, runTurn, validateTeam } from './index';
import type { TeamSet } from './types';

function set(speciesId: string, moves: string[], abilityId: string, itemId = 'none', natureId = 'hardy'): TeamSet {
  return { speciesId, moves, abilityId, itemId, natureId };
}

const pikachu = () => set('raichu', ['thunderbolt', 'quickattack', 'thunderwave', 'protect'], 'static');
const blastoise = () => set('blastoise', ['surf', 'waterpulse', 'icebeam', 'protect'], 'torrent');
const charizard = () => set('charizard', ['flamethrower', 'heatwave', 'airslash', 'protect'], 'blaze');

describe('battle engine', () => {
  it('uses a move, decreases HP and PP, and keeps the input state immutable', () => {
    const initial = createBattle({ format: 'singles', playerTeam: [pikachu()], cpuTeam: [blastoise()], seed: 5 });
    const next = runTurn(initial, [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(initial.sides.cpu.team[0].hp);
    expect(next.sides.player.team[0].pp.thunderbolt).toBe(14);
    expect(initial.sides.player.team[0].pp.thunderbolt).toBe(15);
  });

  it('does not choose a self-KO move when replacing an invalid command', () => {
    const snorlax=set('snorlax',['selfdestruct','bodyslam','rest','crunch'],'thickFat');
    const state=createBattle({format:'singles',playerTeam:[snorlax],cpuTeam:[blastoise()],seed:5});
    const next=runTurn(state,[{kind:'move',slot:0,moveId:'protect'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(next.sides.player.team[0].fainted).toBe(false);
    expect(next.log.some(entry=>entry.text.includes('누르기 사용!'))).toBe(true);
    expect(next.log.some(entry=>entry.text.includes('자폭 사용!'))).toBe(false);
  });

  it('applies Parting Shot drops before pivoting, but does not pivot through Protect', () => {
    const user=set('persianalola',['partingshot','protect','foulplay','uturn'],'furcoat');
    const bench=set('raichu',['thunderbolt','quickattack','thunderwave','protect'],'static');
    const foe=set('snorlax',['protect','bodyslam','rest','crunch'],'thickFat');
    const state=createBattle({format:'singles',playerTeam:[user,bench],cpuTeam:[foe],seed:12});
    const pivoted=runTurn(state,[{kind:'move',slot:0,moveId:'partingshot'}],[{kind:'move',slot:0,moveId:'bodyslam'}]);
    expect(pivoted.sides.cpu.team[0].stages).toMatchObject({atk:-1,spa:-1});
    expect(pivoted.sides.player.active[0]).toBe(1);
    expect(pivoted.log.some(entry=>entry.text.includes('막말내뱉기 사용!'))).toBe(true);

    const blocked=createBattle({format:'singles',playerTeam:[user,bench],cpuTeam:[foe],seed:12});
    const protectedHit=runTurn(blocked,[{kind:'move',slot:0,moveId:'partingshot'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(protectedHit.sides.player.active[0]).toBe(0);
    expect(protectedHit.sides.cpu.team[0].stages).toMatchObject({atk:0,spa:0});
  });

  it('passes rank changes and Substitute through Baton Pass', () => {
    const user=set('eevee',['batonpass','calmmind','substitute','protect'],'runaway');
    const bench=set('raichu',['thunderbolt','quickattack','thunderwave','protect'],'static');
    const foe=set('snorlax',['protect','bodyslam','rest','crunch'],'thickFat');
    const state=createBattle({format:'singles',playerTeam:[user,bench],cpuTeam:[foe],seed:14});
    const prepared=runTurn(state,[{kind:'move',slot:0,moveId:'calmmind'}],[{kind:'move',slot:0,moveId:'protect'}]);
    const withSub=runTurn(prepared,[{kind:'move',slot:0,moveId:'substitute'}],[{kind:'move',slot:0,moveId:'protect'}]);
    const passed=runTurn(withSub,[{kind:'move',slot:0,moveId:'batonpass'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(passed.sides.player.active[0]).toBe(1);
    expect(passed.sides.player.team[1].stages).toMatchObject({spa:1,spd:1});
    expect(passed.sides.player.team[1].substituteHp).toBeGreaterThan(0);
  });

  it('applies Intimidate to every opposing active Pokémon on a doubles entry', () => {
    const state=createBattle({format:'doubles',playerTeam:[
      set('gyarados',['waterfall','crunch','protect','return'],'intimidate'),
      set('arcanine',['flamethrower','crunch','protect','willowisp'],'intimidate'),
      set('raichu',['thunderbolt','quickattack','thunderwave','protect'],'static'),
    ],cpuTeam:[
      set('snorlax',['protect','bodyslam','rest','crunch'],'thickFat'),
      set('blastoise',['protect','surf','icebeam','raindance'],'torrent'),
    ],seed:15});
    expect(state.sides.cpu.team[0].stages.atk).toBe(-2);
    expect(state.sides.cpu.team[1].stages.atk).toBe(-2);
    expect(state.log.filter(entry=>entry.text.includes('위협')).length).toBeGreaterThanOrEqual(2);
  });

  it('applies dual type matchups and immunities', () => {
    expect(getTypeMultiplier('electric', ['water', 'flying'])).toBe(4);
    expect(getTypeMultiplier('ground', ['flying'])).toBe(0);
    expect(getTypeMultiplier('fire', ['water'])).toBe(0.5);
  });

  it('orders actions by priority before speed', () => {
    const state = createBattle({ format: 'singles', playerTeam: [pikachu()], cpuTeam: [set('jolteon', ['thunderbolt', 'quickattack', 'shadowball', 'protect'], 'voltAbsorb')], seed: 10 });
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'quickattack' }], [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }]);
    const moves = next.log.filter(entry => entry.kind === 'move' && entry.text.includes('사용!'));
    expect(moves[0].text).toContain('전광석화');
  });

  it('fires an entry ability and a held item effect', () => {
    const gyarados = set('gyarados', ['waterfall', 'crunch', 'protect', 'return'], 'intimidate');
    const state = createBattle({ format: 'singles', playerTeam: [gyarados], cpuTeam: [set('snorlax', ['return', 'crunch', 'protect', 'earthquake'], 'thickFat')], seed: 8 });
    expect(state.sides.cpu.team[0].stages.atk).toBe(-1);
    const withMagnet = pikachu(); withMagnet.itemId = 'magnet';
    const noItem = pikachu();
    const options = { format: 'singles' as const, cpuTeam: [blastoise()], seed: 22 };
    const boosted = runTurn(createBattle({ ...options, playerTeam: [withMagnet] }), [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    const plain = runTurn(createBattle({ ...options, playerTeam: [noItem] }), [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(boosted.sides.cpu.team[0].hp).toBeLessThan(plain.sides.cpu.team[0].hp);
  });

  it('applies status and residual damage', () => {
    const arcanine = set('arcanine', ['willowisp', 'flamethrower', 'crunch', 'protect'], 'intimidate');
    const snorlax = set('snorlax', ['return', 'crunch', 'earthquake', 'protect'], 'thickFat');
    const state = createBattle({ format: 'singles', playerTeam: [arcanine], cpuTeam: [snorlax], seed: 2 });
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'willowisp' }], [{ kind: 'move', slot: 0, moveId: 'return' }]);
    expect(next.sides.cpu.team[0].status).toBe('burn');
    expect(next.log.some(entry => entry.text.includes('(화상)'))).toBe(true);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(next.sides.cpu.team[0].maxHp);
  });

  it('respects type immunity for an offensive status move', () => {
    const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'swordsdance', 'protect'], 'roughSkin');
    const state = createBattle({ format: 'singles', playerTeam: [pikachu()], cpuTeam: [garchomp], seed: 9 });
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'thunderwave' }], [{ kind: 'move', slot: 0, moveId: 'swordsdance' }]);
    expect(next.sides.cpu.team[0].status).toBeNull();
    expect(next.log.some(entry => entry.text.includes('효과가 없다'))).toBe(true);
  });

  it('heals with Leftovers at turn end and tracks weather duration', () => {
    const tank = blastoise(); tank.itemId = 'leftovers'; tank.moves = ['raindance', 'waterpulse', 'icebeam', 'protect'];
    const state = createBattle({ format: 'singles', playerTeam: [tank], cpuTeam: [pikachu()], seed: 11 });
    state.sides.player.team[0].hp -= 20;
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'raindance' }], [{ kind: 'move', slot: 0, moveId: 'protect' }]);
    expect(next.sides.player.team[0].hp).toBeGreaterThan(state.sides.player.team[0].hp);
    expect(next.weather).toEqual({ id: 'rain', turns: 4 });
  });

  it('keeps self stat changes when the same move knocks out its target', () => {
    const venusaur = set('venusaur', ['leafstorm', 'energyball', 'gigadrain', 'protect'], 'overgrow');
    const state = createBattle({ format: 'singles', playerTeam: [venusaur], cpuTeam: [blastoise()], seed: 19 });
    state.sides.cpu.team[0].hp = 1;
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'leafstorm' }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(next.winner).toBe('player');
    expect(next.sides.player.team[0].stages.spa).toBe(-2);
  });

  it('switches to a bench Pokémon and activates its entry effect', () => {
    const arcanine = set('arcanine', ['willowisp', 'flamethrower', 'crunch', 'protect'], 'intimidate');
    const state = createBattle({ format: 'singles', playerTeam: [pikachu(), arcanine], cpuTeam: [blastoise()], seed: 3 });
    const next = runTurn(state, [{ kind: 'switch', slot: 0, to: 1 }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(next.sides.player.active[0]).toBe(1);
    expect(next.sides.cpu.team[0].stages.atk).toBe(-1);
    expect(next.log.some(entry => entry.kind === 'switch' && entry.text.includes('윈디'))).toBe(true);
  });

  it('faints the last foe and declares a single-battle winner', () => {
    const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], 'roughSkin');
    const state = createBattle({ format: 'singles', playerTeam: [garchomp], cpuTeam: [pikachu()], seed: 4 });
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'earthquake' }], [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }]);
    expect(next.sides.cpu.team[0].fainted).toBe(true);
    expect(next.winner).toBe('player');
    expect(next.log.some(entry => entry.kind === 'result')).toBe(true);
  });

  it('automatically brings in a reserve after a faint', () => {
    const garchomp = set('garchomp', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], 'roughSkin');
    const state = createBattle({ format: 'singles', playerTeam: [garchomp], cpuTeam: [pikachu(), blastoise()], seed: 4 });
    const next = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'earthquake' }], [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }]);
    expect(next.sides.cpu.team[0].fainted).toBe(true);
    expect(next.sides.cpu.active[0]).toBe(1);
    expect(next.winner).toBeNull();
  });

  it('processes two actions per side and spread targets in doubles', () => {
    const venusaur = set('venusaur', ['energyball', 'sludgebomb', 'gigadrain', 'protect'], 'overgrow');
    const state = createBattle({ format: 'doubles', playerTeam: [charizard(), blastoise()], cpuTeam: [venusaur, pikachu()], seed: 16 });
    const next = runTurn(state,
      [{ kind: 'move', slot: 0, moveId: 'heatwave' }, { kind: 'move', slot: 1, moveId: 'icebeam', target: { side: 'cpu', slot: 0 } }],
      [{ kind: 'move', slot: 0, moveId: 'energyball', target: { side: 'player', slot: 1 } }, { kind: 'move', slot: 1, moveId: 'quickattack', target: { side: 'player', slot: 0 } }]);
    expect(next.log.filter(entry => entry.kind === 'move' && entry.text.includes('사용!')).length).toBeGreaterThanOrEqual(3);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
    expect(next.sides.cpu.team[1].hp).toBeLessThan(state.sides.cpu.team[1].hp);
  });

  it('uses deterministic randomness and allows CPU to switch', () => {
    const grassAttacker=set('rillaboom',['woodhammer','grassyglide','uturn','protect'],'grassysurge');
    const options = { format: 'singles' as const, playerTeam: [grassAttacker], cpuTeam: [pikachu(), charizard()], seed: 91 };
    const state = createBattle(options);
    const one = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    const two = runTurn(state, [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(one).toEqual(two);
    state.turn = 2;
    state.sides.cpu.team[0].hp = 1;
    expect(chooseCpuActions(state)[0]).toMatchObject({ kind: 'switch', to: 1 });
  });

  it('validates an editable six-member team', () => {
    expect(validateTeam(getStarterTeam())).toEqual([]);
    const invalid = getStarterTeam();
    invalid[0].moves = ['thunderbolt', 'thunderbolt'];
    invalid[0].evs = { atk: 252, spa: 252, spe: 252 };
    expect(validateTeam(invalid).length).toBeGreaterThan(1);
  });

  it.each(['singles', 'doubles'] as const)('plays a complete seeded %s match without stalling', format => {
    let state = createBattle({ format, playerTeam: getStarterTeam(), cpuTeam: getStarterTeam().reverse(), seed: 1234 });
    for (let turn = 0; turn < 120 && !state.winner; turn++) {
      const actions = state.sides.player.active.flatMap((teamIndex, slot) => {
        const actor = state.sides.player.team[teamIndex];
        if (actor.fainted) return [];
        const moveId = actor.set.moves.find(id => actor.pp[id] > 0) ?? 'struggle';
        return [{ kind: 'move' as const, slot, moveId }];
      });
      state = runTurn(state, actions);
    }
    expect(state.winner).not.toBeNull();
  });
});
