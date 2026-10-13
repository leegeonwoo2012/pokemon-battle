import { describe, expect, it } from 'vitest';
import { moves, species } from '../data';
import { createSet } from '../team';
import { createBattle, runTurn, runTurnWithEvents } from './battle';
import { activateGimmick } from './gimmicks';
import type { BattleAction, BattleState, TeamSet } from './types';

const action = (moveId: string): BattleAction[] => [{ kind: 'move', slot: 0, moveId }];
const fixture = (moveId: string, overrides: Partial<TeamSet> = {}): TeamSet => {
  const id = Object.keys(species).find(id => species[id].learnset.includes(moveId) && species[id].learnset.length >= 4);
  if (!id) throw new Error(`No eligible species for ${moveId}`);
  const set = createSet(id);
  set.moves = [moveId, ...set.moves.filter(id => id !== moveId)].slice(0, 4);
  if (set.moves.length < 4) set.moves.push(...species[id].learnset.filter(id => !set.moves.includes(id)).slice(0, 4 - set.moves.length));
  return { ...set, ...overrides };
};
const battle = (player: TeamSet, cpu = fixture('swordsdance'), seed = 21) => createBattle({ format: 'singles', playerTeam: [player], cpuTeam: [cpu], seed });
const mon = (state: BattleState, side: 'player' | 'cpu') => state.sides[side].team[0];

describe('move mechanics regressions', () => {
  it.each(['solarbeam', 'dig', 'fly', 'dive', 'skyattack', 'bounce', 'meteorbeam', 'solarblade', 'phantomforce', 'electroshot'])('%s charges for one turn and spends PP once', moveId => {
    expect(moves[moveId].charge).toBeTruthy();
    const initial = battle(fixture(moveId), fixture('swordsdance'));
    const first = runTurn(initial, action(moveId), action('swordsdance'));
    expect(mon(first, 'player').charging?.moveId).toBe(moveId);
    expect(mon(first, 'player').pp[moveId]).toBe(moves[moveId].pp - 1);
    const second = runTurn(first, action('swordsdance'), action('swordsdance'));
    expect(mon(second, 'player').charging).toBeUndefined();
    expect(mon(second, 'player').pp[moveId]).toBe(moves[moveId].pp - 1);
    expect(second.log.some(entry => entry.text.includes(`${moves[moveId].name} 사용!`))).toBe(true);
  });

  it('boosts Electro Shot on charge and fires immediately in rain', () => {
    const set = fixture('electroshot');
    const first = runTurn(battle(set), action('electroshot'), action('swordsdance'));
    expect(mon(first, 'player').stages.spa).toBe(1);
    const rainy = battle(set);
    rainy.weather = { id: 'rain', turns: 4 };
    const instant = runTurn(rainy, action('electroshot'), action('swordsdance'));
    expect(mon(instant, 'player').charging).toBeUndefined();
    expect(mon(instant, 'player').stages.spa).toBe(1);
  });

  it('keeps an underground charging Pokémon out of an ordinary attack', () => {
    const initial = battle(fixture('dig'), fixture('tackle'));
    mon(initial, 'player').stats.spe = 300;
    mon(initial, 'cpu').stats.spe = 1;
    const charging = runTurn(initial, action('dig'), action('tackle'));
    expect(mon(charging, 'player').charging?.moveId).toBe('dig');
    expect(mon(charging, 'player').hp).toBe(mon(initial, 'player').hp);
    expect(charging.log.some(entry => entry.text.includes('빗나갔다'))).toBe(true);
  });

  it.each([['counter', 'physical'], ['mirrorcoat', 'special']] as const)('%s returns twice the damage received that turn', (moveId, category) => {
    const attacker = fixture(category === 'physical' ? 'tackle' : 'surf');
    const state = battle(fixture(moveId), attacker);
    mon(state, 'player').stats.spe = 1;
    mon(state, 'cpu').stats.spe = 300;
    const next = runTurn(state, action(moveId), action(category === 'physical' ? 'tackle' : 'surf'));
    const received = mon(state, 'player').hp - mon(next, 'player').hp;
    expect(received).toBeGreaterThan(0);
    expect(mon(state, 'cpu').hp - mon(next, 'cpu').hp).toBe(Math.min(mon(state, 'cpu').hp, received * 2));
  });

  it('Endeavor reduces a healthier foe to the user’s current HP', () => {
    const state = battle(fixture('endeavor'), fixture('swordsdance'));
    mon(state, 'player').hp = 23;
    const next = runTurn(state, action('endeavor'), action('swordsdance'));
    expect(mon(next, 'cpu').hp).toBe(23);
  });

  it('Volt Switch damages and switches to a healthy reserve', () => {
    const state = createBattle({ format: 'singles', playerTeam: [fixture('voltswitch'), fixture('swordsdance')], cpuTeam: [fixture('tackle')], seed: 8 });
    const next = runTurn(state, action('voltswitch'), action('tackle'));
    expect(next.sides.player.active[0]).toBe(1);
    expect(mon(next, 'cpu').hp).toBeLessThan(mon(state, 'cpu').hp);
  });

  it('reports immunity before playing an attack motion', () => {
    const initial = battle(fixture('earthquake'), createSet('charizard'));
    const result = runTurnWithEvents(initial, action('earthquake'), action('flamethrower'));
    expect(result.events.some(event => event.moveId === 'earthquake' && event.kind === 'move')).toBe(false);
    expect(result.events.some(event => event.moveId === 'earthquake' && event.kind === 'message')).toBe(true);
    expect(result.events.some(event => event.kind === 'effectiveness' && event.effectiveness === 0)).toBe(true);
  });

  it('requires the equipped Tera crystal and refuses a different battle selection', () => {
    const none = battle(createSet('raichu'));
    expect(activateGimmick(none, 'player', 0, 'tera', 'thunderbolt')).toBe(false);
    const withCrystal = battle({ ...createSet('raichu'), itemId: 'tera-water', teraType: 'electric' });
    expect(activateGimmick(withCrystal, 'player', 0, 'tera', 'thunderbolt', 'fire')).toBe(false);
    expect(activateGimmick(withCrystal, 'player', 0, 'tera', 'thunderbolt')).toBe(true);
    expect(mon(withCrystal, 'player').types).toEqual(['water']);
  });

  it('Last Respects grows with fainted allies and HP based moves weaken with HP', () => {
    const target = { ...createSet('garchomp'), moves: ['swordsdance', 'dragonclaw', 'earthquake', 'protect'] };
    const base = battle(fixture('lastrespects'), target);
    const withAlly = createBattle({ format: 'singles', playerTeam: [fixture('lastrespects'), fixture('tackle')], cpuTeam: [target], seed: 21 });
    withAlly.sides.player.team[1].fainted = true;
    withAlly.sides.player.team[1].hp = 0;
    // Compare against the same active Pokémon and random seed.
    const low = runTurn(base, action('lastrespects'), action('swordsdance'));
    const high = runTurn(withAlly, action('lastrespects'), action('swordsdance'));
    expect(mon(high, 'cpu').hp).toBeLessThan(mon(low, 'cpu').hp);
    for (const moveId of ['waterspout', 'eruption']) {
      const fresh = battle(fixture(moveId));
      const weakened = structuredClone(fresh);
      mon(weakened, 'player').hp = Math.floor(mon(weakened, 'player').maxHp / 2);
      const fullHit = runTurn(fresh, action(moveId), action('swordsdance'));
      const weakHit = runTurn(weakened, action(moveId), action('swordsdance'));
      expect(mon(fullHit, 'cpu').hp).toBeLessThan(mon(weakHit, 'cpu').hp);
    }
  });

  it('heals from Aqua Ring and Rest, and Yawn induces sleep later', () => {
    const ring = battle(fixture('aquaring'));
    mon(ring, 'player').hp -= 32;
    const ringNext = runTurn(ring, action('aquaring'), action('swordsdance'));
    expect(mon(ringNext, 'player').aquaRing).toBe(true);
    expect(mon(ringNext, 'player').hp).toBeGreaterThan(mon(ring, 'player').hp);
    const rest = battle(fixture('rest'));
    mon(rest, 'player').hp -= 35;
    const rested = runTurn(rest, action('rest'), action('swordsdance'));
    expect(mon(rested, 'player').status).toBe('sleep');
    expect(mon(rested, 'player').hp).toBe(mon(rested, 'player').maxHp);
    const yawn = runTurn(battle(fixture('yawn')), action('yawn'), action('swordsdance'));
    expect(mon(yawn, 'cpu').yawnTurns).toBe(1);
    const sleep = runTurn(yawn, action('swordsdance'), action('swordsdance'));
    expect(mon(sleep, 'cpu').status).toBe('sleep');
  });

  it.each(['recover','roost','slackoff','softboiled','milkdrink','moonlight','morningsun','synthesis'].filter(id => Object.values(species).some(mon => mon.learnset.includes(id))))('%s restores HP from its healing effect', moveId => {
    const initial = battle(fixture(moveId));
    mon(initial, 'player').hp = Math.floor(mon(initial, 'player').maxHp / 4);
    const healed = runTurn(initial, action(moveId), action('swordsdance'));
    expect(mon(healed, 'player').hp).toBeGreaterThan(mon(initial, 'player').hp);
  });

  it.each(['bulletseed','iciclespear','scaleshot'].filter(id => Object.values(species).some(mon => mon.learnset.includes(id))))('%s makes several hits while spending one PP', moveId => {
    const initial = battle(fixture(moveId), fixture('swordsdance'));
    const after = runTurn(initial, action(moveId), action('swordsdance'));
    expect(mon(after, 'player').pp[moveId]).toBe(moves[moveId].pp - 1);
    expect(after.log.some(entry => /[2-5]번 맞았다/.test(entry.text))).toBe(true);
  });

  it('Attract requires opposite genders, and Entrainment changes the active ability', () => {
    const attract = fixture('attract', { gender: 'F' });
    const male = fixture('swordsdance', { gender: 'M' });
    const affected = runTurn(battle(attract, male), action('attract'), action('swordsdance'));
    expect(mon(affected, 'cpu').infatuatedBy).toBe(mon(affected, 'player').uid);
    const same = runTurn(battle(attract, { ...male, gender: 'F' }), action('attract'), action('swordsdance'));
    expect(mon(same, 'cpu').infatuatedBy).toBeUndefined();
    const setter = fixture('entrainment');
    const enemy = fixture('swordsdance');
    if (setter.abilityId === enemy.abilityId) enemy.abilityId = species[enemy.speciesId].abilities.at(-1)!;
    const changed = runTurn(battle(setter, enemy), action('entrainment'), action('swordsdance'));
    expect(mon(changed, 'cpu').set.abilityId).toBe(setter.abilityId);
  });

  it('Steel Beam costs half maximum HP and self destruct moves faint the user', () => {
    const state = battle(fixture('steelbeam'));
    const next = runTurn(state, action('steelbeam'), action('swordsdance'));
    expect(mon(next, 'player').hp).toBe(mon(state, 'player').hp - Math.ceil(mon(state, 'player').maxHp / 2));
    for (const moveId of ['selfdestruct', 'explosion', 'mistyexplosion']) {
      const initial = battle(fixture(moveId));
      const after = runTurn(initial, action(moveId), action('swordsdance'));
      expect(mon(after, 'player').fainted).toBe(true);
    }
  });

  it('Steel Beam still costs HP through Protect and records self damage as recoil', () => {
    const initial=battle(fixture('steelbeam'),fixture('protect'));
    const result=runTurnWithEvents(initial,action('steelbeam'),action('protect'));
    const user=mon(result.state,'player');
    expect(user.hp).toBe(mon(initial,'player').maxHp-Math.ceil(mon(initial,'player').maxHp/2));
    const recoil=result.events.find(event=>event.kind==='damage'&&event.targetUid===user.uid);
    expect(recoil?.moveId).toBeUndefined();
    expect(recoil?.text).toContain('철제광선의 반동');
    expect(mon(result.state,'cpu').hp).toBe(mon(initial,'cpu').hp);
  });

  it('damage-based recoil reports the move and scales with damage dealt', () => {
    const initial=battle(fixture('wavecrash'),fixture('swordsdance'));
    const result=runTurnWithEvents(initial,action('wavecrash'),action('swordsdance'));
    const dealt=mon(initial,'cpu').hp-mon(result.state,'cpu').hp;
    const recoil=mon(initial,'player').hp-mon(result.state,'player').hp;
    expect(dealt).toBeGreaterThan(0);
    expect(recoil).toBe(Math.max(1,Math.floor(dealt/3)));
    expect(result.events.find(event=>event.kind==='damage'&&event.targetUid===mon(initial,'player').uid)?.text).toContain('웨이브태클의 반동');
  });

  it('Outrage remains locked until confusion and Scale Shot changes both stats', () => {
    let state = battle(fixture('outrage'), fixture('recover'), 4);
    let turns = 0;
    while (turns < 6 && !mon(state, 'player').confusionTurns) {
      state = runTurn(state, action(turns === 0 ? 'outrage' : 'protect'), action('recover'));
      turns++;
      if (turns < 5 && mon(state, 'player').rampage) expect(mon(state, 'player').rampage?.moveId).toBe('outrage');
    }
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(turns).toBeLessThanOrEqual(5);
    expect(mon(state, 'player').confusionTurns).toBeGreaterThan(0);
    const scale = runTurn(battle(fixture('scaleshot')), action('scaleshot'), action('swordsdance'));
    expect(mon(scale, 'player').stages.spe).toBe(1);
    expect(mon(scale, 'player').stages.def).toBe(-1);
  });

  it('Outrage executes again despite another submitted move and spends PP only once', () => {
    const initial=battle(fixture('outrage'),fixture('recover'),4);
    const first=runTurn(initial,action('outrage'),action('recover'));
    expect(mon(first,'player').rampage?.moveId).toBe('outrage');
    const second=runTurnWithEvents(first,action('protect'),action('recover'));
    expect(second.events.some(event=>event.kind==='move'&&event.moveId==='outrage')).toBe(true);
    expect(second.events.some(event=>event.kind==='protect'&&event.actorUid===mon(first,'player').uid)).toBe(false);
    expect(mon(second.state,'player').pp.outrage).toBe(moves.outrage.pp-1);
  });

  it.each(Object.values(moves).filter(move=>move.rampage).map(move=>move.id))('%s uses the shared multi-turn lock', moveId => {
    const initial=battle(fixture(moveId),fixture('swordsdance'),4);
    const defender=mon(initial,'cpu');defender.maxHp=9999;defender.hp=9999;defender.stats.def=999;defender.stats.spd=999;
    const first=runTurn(initial,action(moveId),action('swordsdance'));
    expect(mon(first,'player').rampage?.moveId).toBe(moveId);
    const second=runTurnWithEvents(first,action('protect'),action('swordsdance'));
    expect(second.events.some(event=>event.kind==='move'&&event.moveId===moveId)).toBe(true);
    expect(mon(second.state,'player').pp[moveId]).toBe(moves[moveId].pp-1);
  });

  it('does not leave Outrage locked after Protect blocks it or sleep interrupts it', () => {
    const blocked=runTurn(battle(fixture('outrage'),fixture('protect')),action('outrage'),action('protect'));
    expect(mon(blocked,'player').rampage).toBeUndefined();
    const first=runTurn(battle(fixture('outrage'),fixture('recover'),4),action('outrage'),action('recover'));
    mon(first,'player').status='sleep';mon(first,'player').sleepTurns=2;
    const interrupted=runTurn(first,action('protect'),action('recover'));
    expect(mon(interrupted,'player').rampage).toBeUndefined();
    expect(interrupted.log.some(entry=>entry.text.includes('연속 사용이 끊겼다'))).toBe(true);
  });
});

