import { describe,expect,it } from 'vitest';
import { moves } from '../data';
import { createSet } from '../team';
import { battleTypeMultiplier,effectiveWeather } from './calculations';
import { createBattle,runTurn } from './battle';
import { activateGimmick,gimmickReason } from './gimmicks';
import { processEndTurn,setBattleWeather } from './effects';

describe('form abilities and fixed type items',()=>{
  it('Power Construct changes Zygarde to Complete at end of turn below half HP, recalculates stats and reverts on switch',()=>{
    const zygarde={...createSet('zygarde'),abilityId:'powerconstruct',moves:['coreenforcer','thousandarrows','protect','extremespeed']};
    const state=createBattle({format:'singles',playerTeam:[zygarde,createSet('charizard')],cpuTeam:[createSet('blissey')],seed:711});
    const mon=state.sides.player.team[0],baseMax=mon.maxHp;
    mon.hp=Math.floor(baseMax/2);
    processEndTurn(state);
    expect(mon.battleFormId).toBe('zygardecomplete');
    expect(mon.speciesName).toBe('지가르데 퍼펙트폼');
    expect(mon.stats).toMatchObject({hp:mon.maxHp,atk:120,def:141,spa:111,spd:115,spe:105});
    expect(mon.maxHp).toBeGreaterThan(baseMax);
    expect(mon.hp).toBe(mon.maxHp-(baseMax-Math.floor(baseMax/2)));
    expect(state.log.some(entry=>entry.text.includes('스웜체인지'))).toBe(true);

    const switched=runTurn(state,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(switched.sides.player.team[0].battleFormId).toBeUndefined();
    expect(switched.sides.player.team[0].set.abilityId).toBe('powerconstruct');
    expect(switched.sides.player.team[0].maxHp).toBe(baseMax);
  });

  it('RKS System follows all seventeen Memories and protects them from Knock Off',()=>{
    const silvally={...createSet('silvally'),abilityId:'rkssystem',itemId:'firememory',moves:['flamethrower','protect','icebeam','thunderbolt']};
    const state=createBattle({format:'singles',playerTeam:[silvally],cpuTeam:[{...createSet('weavile'),moves:['knockoff','protect','icebeam','nightslash']}],seed:712});
    const mon=state.sides.player.team[0];
    expect(mon.types).toEqual(['fire']);
    for(const [memory,type] of Object.entries({bugmemory:'bug',darkmemory:'dark',dragonmemory:'dragon',electricmemory:'electric',fairymemory:'fairy',fightingmemory:'fighting',firememory:'fire',flyingmemory:'flying',ghostmemory:'ghost',grassmemory:'grass',groundmemory:'ground',icememory:'ice',poisonmemory:'poison',psychicmemory:'psychic',rockmemory:'rock',steelmemory:'steel',watermemory:'water'})){
      mon.set.itemId=memory;processEndTurn(state);expect(mon.types,memory).toEqual([type]);
    }
    const result=runTurn(state,[{kind:'move',slot:0,moveId:'flamethrower'}],[{kind:'move',slot:0,moveId:'knockoff'}]);
    expect(result.sides.player.team[0].set.itemId).toBe('watermemory');
    expect(result.sides.player.team[0].types).toEqual(['water']);
  });

  it('Tera Shift, Tera Shell and Teraform Zero use their real form rules and sprites',()=>{
    const terapagos={...createSet('terapagos'),itemId:'tera-stellar',moves:['terastarstorm','protect','earthpower','icebeam']};
    const state=createBattle({format:'singles',playerTeam:[terapagos],cpuTeam:[createSet('machamp')],seed:713});
    const mon=state.sides.player.team[0];
    expect(mon.battleFormId).toBe('terapagosterastal');
    expect(mon.set.abilityId).toBe('terashell');
    expect(mon.stats).toMatchObject({atk:115,def:130,spa:125,spd:130,spe:105});
    expect(gimmickReason(state,'player',mon,'tera','terastarstorm','normal')).toContain('지닌 테라크리스탈');
    expect(gimmickReason(state,'player',mon,'tera','terastarstorm','stellar')).toBeUndefined();
    expect(battleTypeMultiplier(state,moves.closecombat,mon)).toBe(.5);
    expect(battleTypeMultiplier(state,moves.shadowball,mon)).toBe(0);
    mon.hp--;
    expect(battleTypeMultiplier(state,moves.closecombat,mon)).toBe(2);
    mon.hp=mon.maxHp;
    state.weather={id:'rain',turns:5};state.field={id:'electric',turns:5};
    expect(activateGimmick(state,'player',0,'tera','terastarstorm','stellar')).toBe(true);
    expect(mon.battleFormId).toBe('terapagosstellar');
    expect(mon.set.abilityId).toBe('teraformzero');
    expect(mon.stats).toMatchObject({atk:125,def:130,spa:150,spd:130,spe:105});
    expect(mon.transformation).toMatchObject({kind:'tera',teraType:'stellar'});
    expect(state.weather).toBeNull();expect(state.field).toBeNull();
    expect(state.log.some(entry=>entry.text.includes('테라폼제로'))).toBe(true);
  });

  it('Air Lock suppresses weather effects without deleting the field weather',()=>{
    const state=createBattle({format:'doubles',playerTeam:[createSet('rayquaza'),createSet('raichu')],cpuTeam:[createSet('blissey'),createSet('charizard')],seed:714});
    state.sides.player.team[0].set.abilityId='airlock';state.sides.cpu.team[0].set.abilityId='deltastream';
    setBattleWeather(state,'strongwinds',99);
    expect(state.weather).toMatchObject({id:'strongwinds'});
    expect(effectiveWeather(state)).toBeUndefined();
    state.sides.player.team[0].set.abilityId='none';
    expect(effectiveWeather(state)).toBe('strongwinds');
  });
});
