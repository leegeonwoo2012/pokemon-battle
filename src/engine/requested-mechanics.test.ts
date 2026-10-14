import {describe,expect,it} from 'vitest';
import {items,moves,species} from '../data';
import {createSet} from '../team';
import {createBattle,runTurn} from './battle';
import {damagePassiveMultiplier,dynamicMovePower,estimateDamage,weatherBallMove} from './calculations';
import {resistBerryMultiplier} from './effects';
import type {BattleAction,TeamSet} from './types';

function setWith(moveId:string):TeamSet {
  const id=Object.keys(species).find(candidate=>species[candidate].learnset.includes(moveId)&&species[candidate].learnset.length>=4);
  if(!id)throw Error(`No species learns ${moveId}`);
  const set=createSet(id);
  set.moves=[moveId,...set.moves.filter(id=>id!==moveId)].slice(0,4);
  while(set.moves.length<4)set.moves.push(species[id].learnset.find(id=>!set.moves.includes(id))!);
  return set;
}
const action=(moveId:string,slot=0,target?:{side:'player'|'cpu';slot:number}):BattleAction=>({kind:'move',moveId,slot,target});

describe('requested move and item mechanics',()=>{
  it('Stored Power gains 20 power for each positive stage, including accuracy and evasion',()=>{
    const state=createBattle({format:'singles',playerTeam:[setWith('storedpower')],cpuTeam:[setWith('protect')],seed:4});
    const attacker=state.sides.player.team[0];
    expect(dynamicMovePower(state,attacker,moves.storedpower.power,moves.storedpower)).toBe(20);
    attacker.stages.spa=2;attacker.stages.spe=1;attacker.stages.accuracy=1;attacker.stages.def=-3;
    expect(dynamicMovePower(state,attacker,moves.storedpower.power,moves.storedpower)).toBe(100);
    const boosted=runTurn(state,[action('storedpower')],[action('protect')]);
    expect(boosted.sides.player.team[0].pp.storedpower).toBe(moves.storedpower.pp-1);
    const neutral=createBattle({format:'singles',playerTeam:[setWith('storedpower')],cpuTeam:[setWith('swordsdance')],seed:16});
    const ranked=structuredClone(neutral);
    ranked.sides.player.team[0].stages.accuracy=2;
    ranked.sides.player.team[0].stages.evasion=2;
    const normalHit=runTurn(neutral,[action('storedpower')],[action('swordsdance')]);
    const rankedHit=runTurn(ranked,[action('storedpower')],[action('swordsdance')]);
    expect(rankedHit.sides.cpu.team[0].hp).toBeLessThan(normalHit.sides.cpu.team[0].hp);
  });

  it('Return and Frustration use friendship-based power at the time they are used',()=>{
    const state=createBattle({format:'singles',playerTeam:[setWith('tackle')],cpuTeam:[setWith('protect')],seed:31});
    const attacker=state.sides.player.team[0];
    expect(moves.return.dynamicPower).toBe('friendship');
    expect(moves.frustration.dynamicPower).toBe('lowFriendship');
    expect(dynamicMovePower(state,attacker,moves.return.power,moves.return)).toBe(102);
    attacker.set.friendship=127;
    expect(dynamicMovePower(state,attacker,moves.return.power,moves.return)).toBe(50);
    expect(dynamicMovePower(state,attacker,moves.frustration.power,moves.frustration)).toBe(51);
    attacker.set.friendship=255;
    expect(dynamicMovePower(state,attacker,moves.frustration.power,moves.frustration)).toBe(1);
    expect(dynamicMovePower(state,attacker,moves.return.power,{...moves.return,dynamicPower:undefined})).toBe(moves.return.power);
    const lowFriendship={...createSet('eevee'),friendship:0},highFriendship={...createSet('eevee'),friendship:255};
    const lowState=createBattle({format:'singles',playerTeam:[lowFriendship],cpuTeam:[setWith('protect')],seed:32});
    const highState=createBattle({format:'singles',playerTeam:[highFriendship],cpuTeam:[setWith('protect')],seed:32});
    expect(estimateDamage(highState,highState.sides.player.team[0],highState.sides.cpu.team[0],moves.return))
      .toBeGreaterThan(estimateDamage(lowState,lowState.sides.player.team[0],lowState.sides.cpu.team[0],moves.return));
    expect(estimateDamage(lowState,lowState.sides.player.team[0],lowState.sides.cpu.team[0],moves.frustration))
      .toBeGreaterThan(estimateDamage(highState,highState.sides.player.team[0],highState.sides.cpu.team[0],moves.frustration));
  });

  it('Toxic deals escalating 1/16, 2/16, 3/16 max HP damage and resets its counter on switch',()=>{
    const initial=createBattle({format:'singles',playerTeam:[setWith('toxic')],cpuTeam:[setWith('swordsdance'),setWith('protect')],seed:11});
    initial.sides.player.team[0].stats.spe=400;
    const first=runTurn(initial,[action('toxic')],[action('swordsdance')]);
    const target=first.sides.cpu.team[0];
    expect(target.status).toBe('poison');
    expect(target.toxicCounter).toBe(2);
    expect(initial.sides.cpu.team[0].hp-target.hp).toBe(Math.max(1,Math.floor(target.maxHp/16)));
    const second=runTurn(first,[action('protect')],[action('swordsdance')]);
    expect(target.hp-second.sides.cpu.team[0].hp).toBe(Math.floor(target.maxHp*2/16));
    const third=runTurn(second,[action('protect')],[action('swordsdance')]);
    expect(second.sides.cpu.team[0].hp-third.sides.cpu.team[0].hp).toBe(Math.floor(target.maxHp*3/16));
    const switched=runTurn(third,[action('protect')],[{kind:'switch',slot:0,to:1}]);
    expect(switched.sides.cpu.team[0].toxicCounter).toBe(1);
  });

  it('Entrainment can select a teammate in doubles and changes that teammate ability',()=>{
    const state=createBattle({format:'doubles',playerTeam:[setWith('entrainment'),setWith('lifedew')],cpuTeam:[setWith('protect'),setWith('protect')],seed:8});
    const user=state.sides.player.team[0],ally=state.sides.player.team[1];
    expect(user.set.abilityId).not.toBe(ally.set.abilityId);
    user.stats.spe=400;
    const next=runTurn(state,[action('entrainment',0,{side:'player',slot:1}),action('lifedew',1)],[action('protect',0),action('protect',1)]);
    expect(next.sides.player.team[1].set.abilityId).toBe(user.set.abilityId);
  });

  it('Life Dew heals both active allies by one quarter of each maximum HP',()=>{
    const state=createBattle({format:'doubles',playerTeam:[setWith('lifedew'),setWith('protect')],cpuTeam:[setWith('protect'),setWith('protect')],seed:5});
    for(const mon of state.sides.player.team)mon.hp=Math.floor(mon.maxHp/2);
    state.sides.player.team[1].set.abilityId='magicbounce';
    const next=runTurn(state,[action('lifedew'),action('protect',1)],[action('protect',0),action('protect',1)]);
    for(let i=0;i<2;i++)expect(next.sides.player.team[i].hp-state.sides.player.team[i].hp).toBe(Math.floor(state.sides.player.team[i].maxHp/4));
    expect(next.sides.cpu.team.map(mon=>mon.hp)).toEqual(state.sides.cpu.team.map(mon=>mon.hp));
  });

  it('Howl raises the Attack of the user and its active partner',()=>{
    const state=createBattle({format:'doubles',playerTeam:[setWith('howl'),setWith('protect')],cpuTeam:[setWith('protect'),setWith('protect')],seed:21});
    const opponentStages=state.sides.cpu.team.map(mon=>mon.stages.atk);
    const next=runTurn(state,[action('howl'),action('protect',1)],[action('protect',0),action('protect',1)]);
    expect(next.sides.player.team.map(mon=>mon.stages.atk)).toEqual([1,1]);
    expect(next.sides.cpu.team.map(mon=>mon.stages.atk)).toEqual(opponentStages);
  });

  it('every type-resistance berry halves its matching hit once; Chilan handles neutral Normal',()=>{
    const pairs:Record<string,string>={
      occaberry:'fire',passhoberry:'water',wacanberry:'electric',rindoberry:'grass',yacheberry:'ice',
      chopleberry:'fighting',kebiaberry:'poison',shucaberry:'ground',cobaberry:'flying',payapaberry:'psychic',
      tangaberry:'bug',chartiberry:'rock',kasibberry:'ghost',habanberry:'dragon',colburberry:'dark',
      babiriberry:'steel',roseliberry:'fairy',chilanberry:'normal',
    };
    for(const [itemId,type] of Object.entries(pairs)){
      const state=createBattle({format:'singles',playerTeam:[setWith('protect')],cpuTeam:[setWith('protect')],seed:9});
      const holder=state.sides.player.team[0];holder.set.itemId=itemId;
      const move={...moves.tackle,type};
      expect(resistBerryMultiplier(state,holder,move,type==='normal'?1:2),itemId).toBe(.5);
      expect(holder.itemConsumed,itemId).toBe(true);
      expect(resistBerryMultiplier(state,holder,move,2),itemId).toBe(1);
    }
    const plain=createBattle({format:'singles',playerTeam:[setWith('swordsdance')],cpuTeam:[setWith('moonblast')],seed:17});
    plain.sides.player.team[0].types=['dragon'];
    plain.sides.cpu.team[0].stats.spe=400;
    const withBerry=structuredClone(plain);
    withBerry.sides.player.team[0].set.itemId='roseliberry';
    const unprotected=runTurn(plain,[action('swordsdance')],[action('moonblast')]);
    const protectedByBerry=runTurn(withBerry,[action('swordsdance')],[action('moonblast')]);
    expect(protectedByBerry.sides.player.team[0].hp).toBeGreaterThan(unprotected.sides.player.team[0].hp);
    expect(protectedByBerry.sides.player.team[0].itemConsumed).toBe(true);
  });

  it('new battle items expose functional attack, accuracy and critical effects',()=>{
    const state=createBattle({format:'singles',playerTeam:[setWith('protect')],cpuTeam:[setWith('protect')],seed:2});
    const holder=state.sides.player.team[0];
    for(const itemId of ['silkscarf','nevermeltice','blackbelt','poisonbarb','softsand','sharpbeak','twistedspoon','silverpowder','hardstone','dragonfang','blackglasses','metalcoat','fairyfeather']){
      holder.set.itemId=itemId;
      const type=items[itemId].effects.find(effect=>effect.trigger==='onAttack'&&effect.kind==='damageMultiplier');
      expect(type,itemId).toBeDefined();
      expect(damagePassiveMultiplier(holder,{...moves.tackle,type:type!.type!},'onAttack'),itemId).toBeCloseTo(1.2);
    }
    expect(items.scopelens.effects[0]).toMatchObject({trigger:'onCritical',stages:1});
    expect(items.widelens.effects[0]).toMatchObject({trigger:'onAccuracy',multiplier:1.1});
    expect(items.brightpowder.effects[0]).toMatchObject({trigger:'onAccuracy',multiplier:.9});
  });

  it('Weather Ball changes type and doubles power in all four weathers, including the move event',()=>{
    const state=createBattle({format:'singles',playerTeam:[setWith('weatherball')],cpuTeam:[setWith('swordsdance')],seed:14});
    const user=state.sides.player.team[0],foe=state.sides.cpu.team[0];
    expect(weatherBallMove(state,user,moves.weatherball)).toMatchObject({type:'normal',power:50});
    for(const [weather,type] of [['sun','fire'],['rain','water'],['sand','rock'],['snow','ice']] as const){
      state.weather={id:weather,turns:5};
      expect(weatherBallMove(state,user,moves.weatherball)).toMatchObject({type,power:100});
    }
    state.weather={id:'rain',turns:5};
    const rainyDamage=estimateDamage(state,user,foe,moves.weatherball);
    state.weather=null;
    expect(rainyDamage).toBeGreaterThan(estimateDamage(state,user,foe,moves.weatherball));
    state.weather={id:'rain',turns:5};
    const result=runTurn(state,[action('weatherball')],[action('swordsdance')]);
    expect(result.log.some(entry=>entry.text.includes('웨더볼 사용!'))).toBe(true);
    const suppressed=structuredClone(state);suppressed.sides.cpu.team[0].set.abilityId='cloudnine';
    expect(weatherBallMove(suppressed,suppressed.sides.player.team[0],moves.weatherball)).toMatchObject({type:'normal',power:50});
  });

  it('Helping Hand gives its pending ally a same-turn power boost',()=>{
    const helper=setWith('helpinghand');
    const fallback=species[helper.speciesId].learnset.find(id=>moves[id]?.category==='status'&&id!=='helpinghand')!;
    expect(fallback).toBeDefined();
    helper.moves=[...new Set(['helpinghand',fallback,...helper.moves])].slice(0,4);
    const state=createBattle({format:'doubles',playerTeam:[helper,setWith('tackle')],cpuTeam:[setWith('swordsdance'),setWith('swordsdance')],seed:10});
    const assisted=runTurn(state,[action('helpinghand',0,{side:'player',slot:1}),action('tackle',1,{side:'cpu',slot:0})],[action('swordsdance',0),action('swordsdance',1)]);
    const ordinary=runTurn(state,[action(fallback,0),action('tackle',1,{side:'cpu',slot:0})],[action('swordsdance',0),action('swordsdance',1)]);
    expect(assisted.sides.cpu.team[0].hp).toBeLessThan(ordinary.sides.cpu.team[0].hp);
    expect(assisted.sides.player.team[1].helpingHandTurn).toBe(1);
  });

  it.each([
    ['coaching','atk',1],['aromaticmist','spd',1],['decorate','atk',2],
  ] as const)('%s raises a selected teammate’s %s', (moveId,stat,stages)=>{
    const state=createBattle({format:'doubles',playerTeam:[setWith(moveId),setWith('protect')],cpuTeam:[setWith('protect'),setWith('protect')],seed:7});
    const result=runTurn(state,[action(moveId,0,{side:'player',slot:1}),action('protect',1)],[action('protect',0),action('protect',1)]);
    expect(result.sides.player.team[1].stages[stat]).toBe(stages);
  });

  it('Heal Pulse, Acupressure, Dragon Cheer and Pollen Puff work on selected teammates',()=>{
    const heal=createBattle({format:'doubles',playerTeam:[setWith('healpulse'),setWith('swordsdance')],cpuTeam:[setWith('protect'),setWith('protect')],seed:5});
    heal.sides.player.team[1].hp=Math.floor(heal.sides.player.team[1].maxHp/3);
    const healed=runTurn(heal,[action('healpulse',0,{side:'player',slot:1}),action('swordsdance',1)],[action('protect',0),action('protect',1)]);
    expect(healed.sides.player.team[1].hp).toBeGreaterThan(heal.sides.player.team[1].hp);
    const pressure=createBattle({format:'doubles',playerTeam:[setWith('acupressure'),setWith('protect')],cpuTeam:[setWith('protect'),setWith('protect')],seed:12});
    const pressured=runTurn(pressure,[action('acupressure',0,{side:'player',slot:1}),action('protect',1)],[action('protect',0),action('protect',1)]);
    expect(Object.values(pressured.sides.player.team[1].stages).reduce((sum,stage)=>sum+stage,0)).toBe(2);
    const cheer=createBattle({format:'doubles',playerTeam:[setWith('dragoncheer'),setWith('protect')],cpuTeam:[setWith('protect'),setWith('protect')],seed:13});
    cheer.sides.player.team[1].types=['dragon'];
    const cheered=runTurn(cheer,[action('dragoncheer',0,{side:'player',slot:1}),action('protect',1)],[action('protect',0),action('protect',1)]);
    expect(cheered.sides.player.team[1].dragonCheerCritStages).toBe(2);
    const puff=createBattle({format:'doubles',playerTeam:[setWith('pollenpuff'),setWith('swordsdance')],cpuTeam:[setWith('protect'),setWith('protect')],seed:15});
    puff.sides.player.team[1].hp=Math.floor(puff.sides.player.team[1].maxHp/2);
    const restored=runTurn(puff,[action('pollenpuff',0,{side:'player',slot:1}),action('swordsdance',1)],[action('protect',0),action('protect',1)]);
    expect(restored.sides.player.team[1].hp).toBeGreaterThan(puff.sides.player.team[1].hp);
  });
});
