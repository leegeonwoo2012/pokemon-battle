import { describe, expect, it } from 'vitest';
import { moves, species } from '../data';
import { createSet } from '../team';
import { createBattle, runTurnWithEvents } from './battle';
import {
  burnMultiplier, damagePassiveMultiplier, getModifiedStat, moveAccuracy, secondaryChance,
} from './calculations';
import { applyDamage, applyStatChange, applyStatus } from './effects';
import { startRecording, stopRecording } from './events';
import type { TeamSet } from './types';

/** All fixtures enter through normal team validation with real supported learnsets. */
function set(speciesId: string, abilityId: string, required: string[] = [], itemId = 'none'): TeamSet {
  const base = createSet(speciesId);
  return { ...base, abilityId, itemId,
    moves: [...new Set([...required, ...base.moves, ...species[speciesId].learnset])].slice(0, 4) };
}

function singles(player: TeamSet, cpu: TeamSet, seed = 4) {
  return createBattle({ format: 'singles', playerTeam: [player], cpuTeam: [cpu], seed });
}

describe('modular abilities and held items', () => {
  it('boosts every attack type by 50 percent with Royaleon Royalty',()=>{
    const royaleon=set('royaleon','royalty');
    expect(damagePassiveMultiplier(createBattle({format:'singles',playerTeam:[royaleon],cpuTeam:[set('raichu','static')]}).sides.player.team[0],moves.judgment,'onAttack')).toBe(1.5);
    expect(damagePassiveMultiplier(createBattle({format:'singles',playerTeam:[royaleon],cpuTeam:[set('raichu','static')]}).sides.player.team[0],moves.tackle,'onAttack')).toBe(1.5);
  });

  it('limits Air Bellows to Zephyreon and boosts only Flying attacks',()=>{
    const zephyreon=set('zephyreon','compoundeyes',[],'airbellows');
    const holder=createBattle({format:'singles',playerTeam:[zephyreon],cpuTeam:[set('raichu','static')]}).sides.player.team[0];
    expect(damagePassiveMultiplier(holder,moves.hurricane,'onAttack')).toBe(1.2);
    expect(damagePassiveMultiplier(holder,moves.thunderbolt,'onAttack')).toBe(1);
    const raichu=set('raichu','static',[],'airbellows');
    const other=createBattle({format:'singles',playerTeam:[raichu],cpuTeam:[set('blastoise','torrent')]}).sides.player.team[0];
    expect(damagePassiveMultiplier(other,moves.thunderbolt,'onAttack')).toBe(1);
  });

  it.each([
    ['jolteon', 'voltAbsorb', 'raichu', 'static', 'thunderbolt'],
    ['vaporeon', 'waterabsorb', 'blastoise', 'torrent', 'waterpulse'],
  ])('%s absorbs its matching attack and heals exactly one quarter of maximum HP', (holder, ability, attacker, attackAbility, moveId) => {
    const state = singles(set(holder, ability, ['raindance']), set(attacker, attackAbility, [moveId]));
    const pokemon = state.sides.player.team[0];
    pokemon.hp = Math.floor(pokemon.maxHp / 2);
    const result = runTurnWithEvents(state, [{ kind: 'move', slot: 0, moveId: 'raindance' }], [{ kind: 'move', slot: 0, moveId }]);
    expect(result.state.sides.player.team[0].hp).toBe(pokemon.hp + Math.floor(pokemon.maxHp / 4));
    expect(result.events.some(event => event.kind === 'ability' && event.sourceId === ability && event.targetUid === pokemon.uid)).toBe(true);
    expect(result.events.filter(event => event.kind === 'damage' && event.targetUid === pokemon.uid)).toEqual([]);
    expect(result.events.find(event => event.kind === 'heal' && event.targetUid === pokemon.uid)).toMatchObject({ beforeHp: pokemon.hp, afterHp: pokemon.hp + Math.floor(pokemon.maxHp / 4) });
  });

  it('activates Flash Fire once, strengthens subsequent fire damage, and clears the boost on switch', () => {
    const state = createBattle({ format: 'singles', seed: 7,
      playerTeam: [set('arcanine', 'flashFire', ['sunnyday', 'flamethrower']), set('blastoise', 'torrent')],
      cpuTeam: [set('charizard', 'blaze', ['flamethrower', 'sunnyday'])] });
    const absorbed = runTurnWithEvents(state, [{ kind: 'move', slot: 0, moveId: 'sunnyday' }], [{ kind: 'move', slot: 0, moveId: 'flamethrower' }]);
    const holder = absorbed.state.sides.player.team[0];
    expect(holder.hp).toBe(holder.maxHp);
    expect(holder.absorbedTypes).toEqual(['fire']);
    expect(damagePassiveMultiplier(holder, moves.flamethrower, 'onAttack')).toBe(1.5);
    expect(damagePassiveMultiplier(holder, moves.crunch, 'onAttack')).toBe(1);
    const plain = structuredClone(absorbed.state);
    plain.sides.player.team[0].absorbedTypes = [];
    const attack = [{ kind: 'move' as const, slot: 0, moveId: 'flamethrower' }];
    const weather = [{ kind: 'move' as const, slot: 0, moveId: 'sunnyday' }];
    expect(runTurnWithEvents(absorbed.state, attack, weather).state.sides.cpu.team[0].hp)
      .toBeLessThan(runTurnWithEvents(plain, attack, weather).state.sides.cpu.team[0].hp);
    const switched = runTurnWithEvents(absorbed.state, [{ kind: 'switch', slot: 0, to: 1 }], weather);
    expect(switched.state.sides.player.team[0].absorbedTypes).toEqual([]);
  });

  it('heals a Regenerator user on an actual switch without healing its replacement', () => {
    const state = createBattle({ format: 'singles', seed: 8,
      playerTeam: [set('slowbro', 'regenerator'), set('blastoise', 'torrent')],
      cpuTeam: [set('raichu', 'static', ['protect'])] });
    const holder = state.sides.player.team[0];
    holder.hp = Math.floor(holder.maxHp / 3);
    const result = runTurnWithEvents(state, [{ kind: 'switch', slot: 0, to: 1 }], [{ kind: 'move', slot: 0, moveId: 'protect' }]);
    expect(result.state.sides.player.active).toEqual([1]);
    expect(result.state.sides.player.team[0].hp).toBe(holder.hp + Math.floor(holder.maxHp / 3));
    expect(result.state.sides.player.team[1].hp).toBe(state.sides.player.team[1].maxHp);
    expect(result.events.find(event => event.kind === 'heal')).toMatchObject({ targetUid: holder.uid });
  });

  it.each([['metagross', 'clearBody'], ['lucario', 'innerFocus']])('%s prevents Intimidate with %s', (speciesId, ability) => {
    const state = singles(set(speciesId, ability), set('gyarados', 'intimidate'));
    expect(state.sides.player.team[0].stages.atk).toBe(0);
    expect(state.log.some(event => event.text.includes('하락이 막혔다'))).toBe(true);
    applyStatChange(state, state.sides.player.team[0], 'def', -1, state.sides.cpu.team[0]);
    expect(state.sides.player.team[0].stages.def).toBe(ability === 'clearBody' ? 0 : -1);
  });

  it.each([
    ['kingambit', 'defiant', 'atk', 1], ['milotic', 'competitive', 'spa', 2],
  ] as const)('%s reacts to opposing stat drops, but not its own or its ally’s drops', (speciesId, ability, boosted, initialStage) => {
    const state = createBattle({ format: 'doubles', seed: 2,
      playerTeam: [set(speciesId, ability), set('blastoise', 'torrent')],
      cpuTeam: [set('gyarados', 'intimidate'), set('snorlax', 'thickFat')] });
    const holder = state.sides.player.team[0];
    expect(holder.stages[boosted]).toBe(initialStage);
    applyStatChange(state, holder, 'def', -1, holder);
    applyStatChange(state, holder, 'spd', -1, state.sides.player.team[1]);
    expect(holder.stages[boosted]).toBe(initialStage);
    applyStatChange(state, holder, 'spe', -1, state.sides.cpu.team[1]);
    expect(holder.stages[boosted]).toBe(initialStage + 2);
  });

  it('reflects a major status with Synchronize once, without a reflection loop', () => {
    const state = singles(set('espeon', 'synchronize'), set('gardevoir', 'synchronize'));
    const events = startRecording(state);
    expect(applyStatus(state, state.sides.player.team[0], 'burn', 'test attack', state.sides.cpu.team[0])).toBe(true);
    stopRecording(state);
    expect(state.sides.player.team[0].status).toBe('burn');
    expect(state.sides.cpu.team[0].status).toBe('burn');
    expect(events.filter(event => event.kind === 'status')).toHaveLength(2);
    expect(events.filter(event => event.kind === 'ability' && event.sourceId === 'synchronize')).toHaveLength(1);
    expect(events.find(event => event.kind === 'status' && event.targetUid === 'cpu-0')).toMatchObject({ actorUid: 'player-0', status: 'burn' });
  });

  it('does not reflect sleep or bypass the original attacker’s type immunity', () => {
    const state = singles(set('espeon', 'synchronize'), set('charizard', 'blaze'));
    applyStatus(state, state.sides.player.team[0], 'burn', 'test attack', state.sides.cpu.team[0]);
    expect(state.sides.cpu.team[0].status).toBeNull();
    state.sides.player.team[0].status = null;
    applyStatus(state, state.sides.player.team[0], 'sleep', 'test attack', state.sides.cpu.team[0]);
    expect(state.sides.player.team[0].status).toBe('sleep');
    expect(state.sides.cpu.team[0].status).toBeNull();
  });

  it('applies Huge Power, Guts, and Marvel Scale to the relevant actual stats and burn modifier', () => {
    const power = singles(set('azumarill', 'hugepower'), set('snorlax', 'thickFat')).sides.player.team[0];
    expect(getModifiedStat(power, 'atk')).toBe(power.stats.atk * 2);
    expect(getModifiedStat(power, 'spa')).toBe(power.stats.spa);
    const guts = singles(set('machamp', 'guts'), set('snorlax', 'thickFat')).sides.player.team[0];
    expect(getModifiedStat(guts, 'atk')).toBe(guts.stats.atk);
    guts.status = 'burn';
    expect(getModifiedStat(guts, 'atk')).toBe(Math.floor(guts.stats.atk * 1.5));
    expect(burnMultiplier(guts, moves.closecombat)).toBe(1);
    power.status = 'burn';
    expect(burnMultiplier(power, moves.waterfall)).toBe(0.5);
    const scales = singles(set('milotic', 'marvelScale'), set('snorlax', 'thickFat')).sides.player.team[0];
    expect(getModifiedStat(scales, 'def')).toBe(scales.stats.def);
    scales.status = 'poison';
    expect(getModifiedStat(scales, 'def')).toBe(Math.floor(scales.stats.def * 1.5));
    expect(getModifiedStat(scales, 'spd')).toBe(scales.stats.spd);
  });

  it('uses Compound Eyes in a real seeded accuracy check and applies Sand Veil only in sand', () => {
    const enhanced = singles(set('butterfree', 'compoundeyes', ['sleeppowder']), set('charizard', 'blaze', ['sunnyday']), 5);
    const plain = singles(set('butterfree', 'tintedlens', ['sleeppowder']), set('charizard', 'blaze', ['sunnyday']), 5);
    const sleep = [{ kind: 'move' as const, slot: 0, moveId: 'sleeppowder' }];
    const sun = [{ kind: 'move' as const, slot: 0, moveId: 'sunnyday' }];
    expect(moveAccuracy(enhanced, enhanced.sides.player.team[0], enhanced.sides.cpu.team[0], moves.sleeppowder)).toBe(97.5);
    expect(runTurnWithEvents(enhanced, sleep, sun).state.sides.cpu.team[0].status).toBe('sleep');
    expect(runTurnWithEvents(plain, sleep, sun).state.sides.cpu.team[0].status).toBeNull();
    const sand = singles(set('butterfree', 'compoundeyes'), set('garchomp', 'sandveil'));
    sand.weather = { id: 'sand', turns: 5 };
    expect(moveAccuracy(sand, sand.sides.player.team[0], sand.sides.cpu.team[0], moves.sleeppowder)).toBe(78);
    sand.weather = null;
    expect(moveAccuracy(sand, sand.sides.player.team[0], sand.sides.cpu.team[0], moves.sleeppowder)).toBe(97.5);
  });

  it('uses Serene Grace in a real secondary-effect roll rather than only in descriptions', () => {
    const enhanced = singles(set('togekiss', 'sereneGrace', ['shadowball']), set('blastoise', 'torrent', ['raindance']), 4);
    const plain = singles(set('togekiss', 'hustle', ['shadowball']), set('blastoise', 'torrent', ['raindance']), 4);
    const attack = [{ kind: 'move' as const, slot: 0, moveId: 'shadowball' }];
    const weather = [{ kind: 'move' as const, slot: 0, moveId: 'raindance' }];
    expect(secondaryChance(enhanced.sides.player.team[0], 20)).toBe(40);
    expect(secondaryChance(enhanced.sides.player.team[0], 80)).toBe(100);
    expect(runTurnWithEvents(enhanced, attack, weather).state.sides.cpu.team[0].stages.spd).toBe(-1);
    expect(runTurnWithEvents(plain, attack, weather).state.sides.cpu.team[0].stages.spd).toBe(0);
  });

  it('uses Focus Sash for one lethal direct hit only, even after restoring full HP', () => {
    const state = singles(set('raichu', 'static', ['raindance'], 'focusSash'), set('garchomp', 'roughSkin', ['earthquake']), 4);
    const actions = [{ kind: 'move' as const, slot: 0, moveId: 'raindance' }];
    const attacks = [{ kind: 'move' as const, slot: 0, moveId: 'earthquake' }];
    const first = runTurnWithEvents(state, actions, attacks);
    expect(first.state.sides.player.team[0]).toMatchObject({ hp: 1, itemConsumed: true, fainted: false });
    expect(first.events.filter(event => event.kind === 'item' && event.sourceId === 'focusSash')).toHaveLength(1);
    first.state.sides.player.team[0].hp = first.state.sides.player.team[0].maxHp;
    const second = runTurnWithEvents(first.state, actions, attacks);
    expect(second.state.sides.player.team[0].fainted).toBe(true);
    expect(second.events.some(event => event.kind === 'item' && event.sourceId === 'focusSash')).toBe(false);
  });

  it('does not use Focus Sash for residual damage or when HP is already below maximum', () => {
    for (const direct of [false, true]) {
      const state = singles(set('raichu', 'static', [], 'focusSash'), set('blastoise', 'torrent'));
      const holder = state.sides.player.team[0];
      if (direct) holder.hp -= 1;
      applyDamage(state, holder, holder.maxHp, direct ? 'direct test' : 'poison', direct);
      expect(holder.fainted).toBe(true);
      expect(holder.itemConsumed).not.toBe(true);
    }
  });

  it('consumes Sitrus Berry immediately after crossing half HP and records damage before healing', () => {
    const state = singles(set('blastoise', 'torrent', [], 'sitrusBerry'), set('snorlax', 'thickFat'));
    const holder = state.sides.player.team[0];
    const events = startRecording(state);
    const amount = Math.ceil(holder.maxHp / 2);
    const dealt = applyDamage(state, holder, amount, 'test attack', true);
    const recovered = Math.floor(holder.maxHp / 4);
    expect(dealt).toBe(amount);
    expect(holder.hp).toBe(holder.maxHp - amount + recovered);
    expect(holder.itemConsumed).toBe(true);
    expect(events.map(event => event.kind)).toEqual(['damage', 'item', 'heal']);
    expect(events[0].snapshot.sides.player.team[0].hp).toBe(holder.maxHp - amount);
    expect(events[2].afterHp).toBe(holder.hp);
    applyDamage(state, holder, recovered, 'second attack', true);
    stopRecording(state);
    expect(events.filter(event => event.kind === 'heal')).toHaveLength(1);
  });

  it('takes Life Orb recoil once after a spread move has damaged both foes', () => {
    const state = createBattle({ format: 'doubles', seed: 9,
      playerTeam: [set('blastoise', 'torrent', ['surf'], 'lifeOrb'), set('snorlax', 'thickFat', ['protect'])],
      cpuTeam: [set('charizard', 'blaze', ['sunnyday']), set('venusaur', 'overgrow', ['swordsdance'])] });
    const holder = state.sides.player.team[0];
    const result = runTurnWithEvents(state,
      [{ kind: 'move', slot: 0, moveId: 'surf' }, { kind: 'move', slot: 1, moveId: 'protect' }],
      [{ kind: 'move', slot: 0, moveId: 'sunnyday' }, { kind: 'move', slot: 1, moveId: 'swordsdance' }]);
    const impacts = result.events.filter(event => event.kind === 'damage' && event.moveId === 'surf');
    expect(impacts.map(event => event.targetUid)).toEqual(['cpu-0', 'cpu-1']);
    const recoil = result.events.filter(event => event.kind === 'damage' && event.targetUid === holder.uid);
    expect(recoil).toHaveLength(1);
    expect(recoil[0].moveId).toBeUndefined();
    expect(result.state.sides.player.team[0].hp).toBe(holder.maxHp - Math.floor(holder.maxHp / 8));
    expect(result.events.indexOf(recoil[0])).toBeGreaterThan(result.events.indexOf(impacts[1]));
  });

  it('enforces Choice locking on submitted moves, falls back to Struggle, and unlocks after switching', () => {
    const state = createBattle({ format: 'singles', seed: 11,
      playerTeam: [set('raichu', 'static', ['quickattack', 'thunderbolt'], 'choiceScarf'), set('blastoise', 'torrent')],
      cpuTeam: [set('snorlax', 'thickFat', ['protect'])] });
    const defend = [{ kind: 'move' as const, slot: 0, moveId: 'protect' }];
    const first = runTurnWithEvents(state, [{ kind: 'move', slot: 0, moveId: 'quickattack' }], defend);
    expect(first.state.sides.player.team[0].choiceLock).toBe('quickattack');
    const second = runTurnWithEvents(first.state, [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }], defend);
    expect(second.events.find(event => event.kind === 'move' && event.actorUid === 'player-0')?.moveId).toBe('quickattack');
    expect(second.state.sides.player.team[0].pp.thunderbolt).toBe(state.sides.player.team[0].pp.thunderbolt);
    second.state.sides.player.team[0].pp.quickattack = 0;
    const exhausted = runTurnWithEvents(second.state, [{ kind: 'move', slot: 0, moveId: 'thunderbolt' }], defend);
    expect(exhausted.events.find(event => event.kind === 'move' && event.actorUid === 'player-0')?.moveId).toBe('struggle');
    const switched = runTurnWithEvents(first.state, [{ kind: 'switch', slot: 0, to: 1 }], defend);
    expect(switched.state.sides.player.team[0].choiceLock).toBeUndefined();
  });
});
