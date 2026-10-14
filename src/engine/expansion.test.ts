import { describe, expect, it } from 'vitest';
import { items, moves, species } from '../data';
import { megaForms } from '../data/gimmicks';
import { createSet } from '../team';
import { createBattle, runTurnWithEvents } from './battle';

function set(speciesId: string, required: string[] = []) {
  const base = createSet(speciesId);
  return { ...base, moves: [...new Set([...required, ...base.moves, ...species[speciesId].learnset])].slice(0, 4) };
}

describe('expanded roster battle mechanics', () => {
  it('Rillaboom opens Grassy Terrain through its real ability', () => {
    const rillaboom = { ...set('rillaboom'), abilityId: 'grassysurge' };
    const state = createBattle({ format: 'singles', playerTeam: [rillaboom], cpuTeam: [set('blastoise')], seed: 9 });
    expect(state.field).toEqual({ id: 'grassy', turns: 5 });
    expect(state.log.some(row => row.text.includes('그래스메이커'))).toBe(true);
  });

  it('Flower Trick always lands a critical hit and damages the target', () => {
    const player = set('meowscarada', ['flowertrick']);
    const state = createBattle({ format: 'singles', playerTeam: [player], cpuTeam: [set('blastoise', ['waterpulse'])], seed: 3 });
    const result = runTurnWithEvents(state, [{ kind: 'move', slot: 0, moveId: 'flowertrick' }], [{ kind: 'move', slot: 0, moveId: 'waterpulse' }]);
    expect(moves.flowertrick.critStage).toBe(3);
    expect(result.events.some(event => event.kind === 'critical')).toBe(true);
    expect(result.events.some(event => event.kind === 'damage' && event.critical === true && event.effectiveness === 2)).toBe(true);
    expect(result.state.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
  });

  it('Make It Rain hits both opponents but lowers its user Special Attack only once', () => {
    const player = [set('gholdengo', ['makeitrain']), set('blastoise', ['protect'])];
    const cpu = [set('blastoise', ['waterpulse']), set('vaporeon', ['waterpulse'])];
    const state = createBattle({ format: 'doubles', playerTeam: player, cpuTeam: cpu, seed: 4 });
    const result = runTurnWithEvents(state,
      [{ kind: 'move', slot: 0, moveId: 'makeitrain' }, { kind: 'move', slot: 1, moveId: 'protect' }],
      [{ kind: 'move', slot: 0, moveId: 'waterpulse' }, { kind: 'move', slot: 1, moveId: 'waterpulse' }]);
    expect(result.state.sides.player.team[0].stages.spa).toBe(-2);
    expect(result.state.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
    expect(result.state.sides.cpu.team[1].hp).toBeLessThan(state.sides.cpu.team[1].hp);
  });

  it('Prankster lets a slower user act first and Dark targets block that status move', () => {
    const player = { ...set('grimmsnarl', ['thunderwave']), abilityId:'prankster' };
    const target = set('dragapult', ['dragonpulse']);
    const state = createBattle({format:'singles', playerTeam:[player], cpuTeam:[target], seed:11});
    const result = runTurnWithEvents(state, [{kind:'move', slot:0, moveId:'thunderwave'}], [{kind:'move', slot:0, moveId:'dragonpulse'}]);
    const moveEvents = result.events.filter(event => event.kind === 'move');
    expect(moveEvents[0].moveId).toBe('thunderwave');
    expect(result.state.sides.cpu.team[0].status).toBe('paralysis');
    const dark = createBattle({format:'singles', playerTeam:[player], cpuTeam:[set('kingambit', ['ironhead'])], seed:11});
    const blocked = runTurnWithEvents(dark, [{kind:'move', slot:0, moveId:'thunderwave'}], [{kind:'move', slot:0, moveId:'ironhead'}]);
    expect(blocked.state.sides.cpu.team[0].status).toBeNull();
    expect(blocked.state.log.some(row=>row.text.includes('악 타입'))).toBe(true);
  });

  it('Good as Gold blocks opposing status moves', () => {
    const gold = { ...set('gholdengo', ['makeitrain']), abilityId:'goodasgold' };
    const state = createBattle({format:'singles', playerTeam:[gold], cpuTeam:[set('venusaur', ['sleeppowder'])], seed:8});
    const result = runTurnWithEvents(state, [{kind:'move',slot:0,moveId:'makeitrain'}], [{kind:'move',slot:0,moveId:'sleeppowder'}]);
    expect(result.state.sides.player.team[0].status).toBeNull();
    expect(result.state.log.some(row=>row.text.includes('황금몸'))).toBe(true);
  });

  it('Unaware ignores the attacker Special Attack boost when defending', () => {
    const attack = set('blastoise', ['waterpulse']);
    const defender = set('dondozo', ['tackle']);
    const regular = createBattle({format:'singles',playerTeam:[attack],cpuTeam:[{...defender,abilityId:'oblivious'}],seed:7});
    const unaware = createBattle({format:'singles',playerTeam:[attack],cpuTeam:[{...defender,abilityId:'unaware'}],seed:7});
    regular.sides.player.team[0].stages.spa = 4;
    unaware.sides.player.team[0].stages.spa = 4;
    const userAction = [{kind:'move' as const,slot:0,moveId:'waterpulse'}];
    const cpuAction = [{kind:'move' as const,slot:0,moveId:'tackle'}];
    const regularEnd = runTurnWithEvents(regular,userAction,cpuAction).state;
    const unawareEnd = runTurnWithEvents(unaware,userAction,cpuAction).state;
    expect(unawareEnd.sides.cpu.team[0].hp).toBeGreaterThan(regularEnd.sides.cpu.team[0].hp);
  });

  it('Raichunite X/Y equip the distinct Mega forms with their stats and abilities', () => {
    const raichuForms = megaForms.filter(form => form.speciesId === 'raichu');
    expect(raichuForms.map(form => form.id)).toEqual(['raichumegax','raichumegay']);
    expect(items.raichunitex.name).toContain('메가라이츄 X');
    expect(items.raichunitey.name).toContain('메가라이츄 Y');

    const xState = createBattle({format:'singles',playerTeam:[{...set('raichu',['thunder']),itemId:'raichunitex'}],cpuTeam:[set('charizard',['protect'])],seed:4});
    const xResult = runTurnWithEvents(xState,[{kind:'move',slot:0,moveId:'thunder',gimmick:'mega'}],[{kind:'move',slot:0,moveId:'protect'}]);
    const x = xResult.state.sides.player.team[0];
    expect(x.speciesName).toBe('메가라이츄 X');
    expect(x.stats).toMatchObject({atk:155,def:115,spa:110,spd:115,spe:130});
    expect(x.set.abilityId).toBe('electricsurge');
    expect(xResult.state.field).toEqual({id:'electric',turns:4});

    const yState = createBattle({format:'singles',playerTeam:[{...set('raichu',['thunderwave']),itemId:'raichunitey'}],cpuTeam:[set('charizard',['fireblast'])],seed:5});
    const y = runTurnWithEvents(yState,[{kind:'move',slot:0,moveId:'thunderwave',gimmick:'mega'}],[{kind:'move',slot:0,moveId:'fireblast'}]);
    expect(y.state.sides.player.team[0].speciesName).toBe('메가라이츄 Y');
    expect(y.state.sides.player.team[0].stats).toMatchObject({atk:120,def:75,spa:180,spd:100,spe:150});
    expect(y.state.sides.player.team[0].set.abilityId).toBe('noGuard');
    expect(y.events.some(event=>event.kind==='miss')).toBe(false);
  });
});
