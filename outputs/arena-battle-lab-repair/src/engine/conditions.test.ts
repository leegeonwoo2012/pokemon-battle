import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSet } from '../team';
import { moves, species } from '../data';
import { createBattle, runTurnWithEvents } from './battle';
import { applyVolatile, processConfusion } from './conditions';
import { applyDamage, applyStatus, processEndTurn } from './effects';
import { criticalChance, defensiveStat, estimateDamage, fieldMultiplier, isGrounded, moveAccuracy } from './calculations';
import * as rng from './rng';
import type { TeamSet } from './types';

const set = (id:string, requested:string[] = [], abilityId?:string):TeamSet => {
  const base = createSet(id);
  return {...base, itemId:'none', moves:[...new Set([...requested, ...base.moves, ...species[id].learnset])].slice(0,4), abilityId:abilityId ?? base.abilityId};
};
const action = (moveId:string, slot = 0) => ({kind:'move' as const, slot, moveId});
const battle = (p = set('charizard',['airslash','protect']), c = set('blastoise',['waterpulse','protect'])) =>
  createBattle({format:'singles', playerTeam:[p], cpuTeam:[c], seed:4});
const forceSecondary = () => vi.spyOn(rng,'chance').mockImplementation((_state,percent) => percent >= 20);
afterEach(() => vi.restoreAllMocks());

describe('volatile conditions use the actual turn order', () => {
  it('a faster flinch prevents the target action and PP use, then expires at turn end', () => {
    forceSecondary();
    const initial = battle(); initial.sides.player.team[0].stats.spe = 1000;
    const first = runTurnWithEvents(initial,[action('airslash')],[action('waterpulse')]);
    expect(first.events.some(e => e.condition === 'flinch' && e.kind === 'blocked')).toBe(true);
    expect(first.state.sides.cpu.team[0].pp.waterpulse).toBe(initial.sides.cpu.team[0].pp.waterpulse);
    expect(first.state.sides.cpu.team[0].flinched).toBe(false);
    const next = runTurnWithEvents(first.state,[action('protect')],[action('waterpulse')]);
    expect(next.state.sides.cpu.team[0].pp.waterpulse).toBe(initial.sides.cpu.team[0].pp.waterpulse - 1);
  });
  it('a slower flinch cannot cancel an action already taken or leak into the next turn', () => {
    forceSecondary();
    const initial = battle(); initial.sides.cpu.team[0].stats.spe = 1000;
    const result = runTurnWithEvents(initial,[action('airslash')],[action('waterpulse')]);
    expect(result.events.some(e => e.condition === 'flinch')).toBe(false);
    expect(result.state.sides.cpu.team[0].pp.waterpulse).toBe(initial.sides.cpu.team[0].pp.waterpulse - 1);
  });
  it('Inner Focus blocks the actual secondary effect and the defender still acts', () => {
    forceSecondary();
    const initial = battle(undefined,set('lucario',['aurasphere','protect'],'innerFocus'));
    initial.sides.player.team[0].stats.spe = 1000;
    const result = runTurnWithEvents(initial,[action('airslash')],[action('aurasphere')]);
    expect(result.events.some(e => e.kind === 'ability' && e.sourceId === 'innerFocus')).toBe(true);
    expect(result.state.sides.cpu.team[0].pp.aurasphere).toBe(19);
  });
  it('a doubles flinch blocks only the selected slot', () => {
    forceSecondary();
    const initial = createBattle({format:'doubles',seed:4,
      playerTeam:[set('charizard',['airslash']),set('snorlax',['protect'])],
      cpuTeam:[set('blastoise',['waterpulse']),set('milotic',['waterpulse'])]});
    initial.sides.player.team[0].stats.spe = 1000;
    const result = runTurnWithEvents(initial,
      [{...action('airslash'),target:{side:'cpu',slot:1}},action('protect',1)],
      [action('waterpulse'),action('waterpulse',1)]);
    expect(result.state.sides.cpu.team[0].pp.waterpulse).toBe(19);
    expect(result.state.sides.cpu.team[1].pp.waterpulse).toBe(20);
  });
  it('confusion damage consumes no PP and records self damage without a fake move', () => {
    forceSecondary();
    const initial = battle(); const p = initial.sides.player.team[0]; p.confusionTurns = 3;
    const result = runTurnWithEvents(initial,[action('airslash')],[action('protect')]);
    expect(result.state.sides.player.team[0].pp.airslash).toBe(p.pp.airslash);
    const selfDamage = result.events.find(e => e.kind === 'damage' && e.targetUid === p.uid)!;
    expect(selfDamage.actorUid).toBe(p.uid); expect(selfDamage.moveId).toBeUndefined();
    expect(selfDamage.afterHp).toBeLessThan(selfDamage.beforeHp!);
    expect(result.state.sides.player.team[0].confusionTurns).toBe(2);
  });
  it('confusion expiry allows a real move and switching removes confusion', () => {
    const initial = createBattle({format:'singles',seed:4,
      playerTeam:[set('charizard',['airslash']),set('snorlax')],cpuTeam:[set('blastoise',['protect'])]});
    initial.sides.player.team[0].confusionTurns = 1;
    const result = runTurnWithEvents(initial,[action('airslash')],[action('protect')]);
    expect(result.events.some(e => e.condition === 'confusion' && e.conditionActive === false)).toBe(true);
    expect(result.state.sides.player.team[0].pp.airslash).toBe(14);
    result.state.sides.player.team[0].confusionTurns = 4;
    const switched = runTurnWithEvents(result.state,[{kind:'switch',slot:0,to:1}],[action('protect')]);
    expect(switched.state.sides.player.team[0].confusionTurns).toBe(0);
  });
  it('Own Tempo prevents confusion, and major status and confusion can coexist', () => {
    const initial = battle(set('slowbro',[], 'owntempo'));
    expect(applyVolatile(initial,initial.sides.player.team[0],'confusion')).toBe(false);
    const foe = initial.sides.cpu.team[0];
    expect(applyStatus(initial,foe,'burn','test')).toBe(true);
    expect(applyVolatile(initial,foe,'confusion')).toBe(true);
    expect(foe.status).toBe('burn');
  });
  it('confusion self damage ignores Huge Power, burn, and attack items', () => {
    forceSecondary();
    const a = battle(set('azumarill',[],'hugepower')), b = structuredClone(a);
    a.sides.player.team[0].set.itemId = 'lifeOrb'; a.sides.player.team[0].status = 'burn';
    b.sides.player.team[0].set.abilityId = 'thickFat';
    for (const state of [a,b]) {state.sides.player.team[0].confusionTurns = 3; processConfusion(state,state.sides.player.team[0]);}
    expect(a.sides.player.team[0].hp).toBe(b.sides.player.team[0].hp);
  });
  it('a self knockout ends the battle with the actual winner', () => {
    forceSecondary(); const initial = battle();
    initial.sides.player.team[0].hp = 1; initial.sides.player.team[0].confusionTurns = 3;
    const result = runTurnWithEvents(initial,[action('airslash')],[action('protect')]);
    expect(result.state.winner).toBe('cpu'); expect(result.events.at(-1)?.kind).toBe('result');
  });
});

describe('supported weather, terrain and critical rules', () => {
  it('rain guarantees Thunder/Hurricane accuracy despite negative ranks, sun lowers it', () => {
    const state = battle(); const p = state.sides.player.team[0], c = state.sides.cpu.team[0];
    p.stages.accuracy = -6; c.stages.evasion = 6; state.weather = {id:'rain',turns:5};
    expect(moveAccuracy(state,p,c,moves.thunder)).toBe(100);
    expect(moveAccuracy(state,p,c,moves.hurricane)).toBe(100);
    p.stages.accuracy = 0; c.stages.evasion = 0; state.weather.id = 'sun';
    expect(moveAccuracy(state,p,c,moves.thunder)).toBe(50);
  });
  it('sand boosts Rock special defense and snow boosts Ice physical defense', () => {
    const state = battle(set('tyranitar'),set('glaceon'));
    const rock = state.sides.player.team[0], ice = state.sides.cpu.team[0];
    state.weather = {id:'sand',turns:5}; expect(defensiveStat(state,rock,'spd')).toBe(Math.floor(rock.stats.spd * 1.5));
    expect(defensiveStat(state,ice,'def')).toBe(ice.stats.def);
    state.weather.id = 'snow'; expect(defensiveStat(state,ice,'def')).toBe(Math.floor(ice.stats.def * 1.5));
  });
  it('Levitate and Flying bypass terrain healing, boosts and status protection', () => {
    const state = battle(set('eelektross',[],'levitate'),set('charizard'));
    const p = state.sides.player.team[0], c = state.sides.cpu.team[0];
    expect(isGrounded(p)).toBe(false); expect(isGrounded(c)).toBe(false);
    state.field = {id:'electric',turns:5}; expect(fieldMultiplier(state,p,moves.thunderbolt)).toBe(1);
    expect(applyStatus(state,p,'sleep','test')).toBe(true);
    p.hp -= 20; state.field = {id:'grassy',turns:5}; const before = p.hp;
    processEndTurn(state); expect(p.hp).toBe(before);
  });
  it('grassy terrain halves grounded Earthquake damage and misty terrain halves Dragon damage', () => {
    const state = battle(set('garchomp'),set('blastoise'));
    const p = state.sides.player.team[0], c = state.sides.cpu.team[0];
    const normal = estimateDamage(state,p,c,moves.earthquake);
    state.field = {id:'grassy',turns:5};
    expect(fieldMultiplier(state,p,moves.earthquake,c)).toBe(0.5);
    expect(estimateDamage(state,p,c,moves.earthquake)).toBeLessThan(normal * 0.55);
    state.field.id = 'misty'; expect(fieldMultiplier(state,p,moves.dragonclaw,c)).toBe(0.5);
    expect(applyVolatile(state,c,'confusion')).toBe(false);
  });
  it('psychic terrain blocks priority against grounded foes but not Flying foes', () => {
    const state = battle(set('pikachu',['quickattack','protect']),set('blastoise',['waterpulse']));
    state.field = {id:'psychic',turns:5}; state.sides.cpu.team[0].stats.spe = 1;
    const result = runTurnWithEvents(state,[action('quickattack')],[action('waterpulse')]);
    expect(result.state.sides.cpu.team[0].hp).toBe(state.sides.cpu.team[0].hp);
    expect(result.events.some(e => e.kind === 'blocked' && e.text.includes('사이코필드'))).toBe(true);
    state.sides.cpu.team[0].types = ['flying'];
    const airborne = runTurnWithEvents(state,[action('quickattack')],[action('waterpulse')]);
    expect(airborne.state.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
  });
  it('powder cannot sleep a Grass type and harsh sunlight prevents freezing', () => {
    const state = battle(set('venusaur',['sleeppowder']),set('meganium',['swordsdance']));
    state.sides.player.team[0].stats.spe = 1000;
    const result = runTurnWithEvents(state,[action('sleeppowder')],[action('swordsdance')]);
    expect(result.state.sides.cpu.team[0].status).toBeNull();
    expect(result.events.some(e => e.text.includes('가루 기술'))).toBe(true);
    state.weather = {id:'sun',turns:5}; expect(applyStatus(state,state.sides.cpu.team[0],'freeze','test')).toBe(false);
  });
  it('Flare Blitz thaws the user and a Fire hit thaws the target', () => {
    forceSecondary(); const state = battle(set('charizard',['flareblitz']),set('blastoise',['protect']));
    state.sides.player.team[0].status = 'freeze'; state.sides.cpu.team[0].status = 'freeze';
    state.sides.cpu.team[0].sleepTurns = 0; state.sides.player.team[0].stats.spe = 1000;
    const result = runTurnWithEvents(state,[action('flareblitz')],[action('waterpulse')]);
    expect(result.events.filter(e => e.kind === 'status' && e.status === null)).toHaveLength(2);
  });
  it('high critical moves and Super Luck raise stages while armor completely prevents criticals', () => {
    const state = battle(set('honchkrow',[],'superluck'),set('drapion',[],'battlearmor'));
    const p = state.sides.player.team[0], c = state.sides.cpu.team[0];
    expect(criticalChance(p,c,moves.shadowclaw)).toBe(0);
    c.set.abilityId = 'sniper'; expect(criticalChance(p,c,moves.shadowclaw)).toBe(50);
    expect(criticalChance(p,c,moves.darkpulse)).toBe(12.5);
  });
  it('Sturdy survives without consuming an item and fails when below full HP', () => {
    const state = battle(set('skarmory',[],'sturdy')); const p = state.sides.player.team[0];
    applyDamage(state,p,p.maxHp,'hit',true); expect(p.hp).toBe(1); expect(p.itemConsumed).not.toBe(true);
    applyDamage(state,p,p.maxHp,'second hit',true); expect(p.fainted).toBe(true);
  });
});
