import { describe,expect,it } from 'vitest';
import { species,moves } from '../data';
import { exclusiveZMoves,megaForms,gmaxForms,maxPower,zMoves,zPower } from '../data/gimmicks';
import { createSet,loadTeam,saveTeam,validateTeam } from '../team';
import { createBattle,runTurn,runTurnWithEvents } from './battle';
import { activateGimmick,applyMaxEffect,endDynamax,exclusiveZForAll,gimmickReason,previewMove } from './gimmicks';
import { battleTypeMultiplier,estimateDamage,getTypeMultiplier,stabMultiplier } from './calculations';
import { chooseCpuActions } from './ai';
import { applyDamage,applyHeal,processEndTurn } from './effects';
import { moveUnavailableReason,usableMoves } from './choices';
import { applyVolatile } from './conditions';
import { playEvents } from '../presentation/queue';
import type { BattleAction,Format,Gimmick,TeamSet } from './types';
const set=(id:string,extra:Partial<TeamSet>={}):TeamSet=>({...createSet(id),itemId:'dynamaxband',...extra});
const attack=(moveId:string,gimmick?:Gimmick,slot=0):BattleAction=>({kind:'move',slot,moveId,gimmick});
const protect=(slot=0)=>attack('protect',undefined,slot);
const battle=(player:TeamSet[],format:Format='singles')=>createBattle({format,playerTeam:player,cpuTeam:[set('blissey'),set('snorlax'),set('ursaluna')],seed:5});

describe('shared gimmick resource and ordered transformation events',()=>{
  it('uses Kommo-o exclusive Z move and raises its five combat stats once in doubles',()=>{
    const user=set('kommoo',{itemId:'kommoniumz',moves:['clangingscales','dragonclaw','protect','rockslide']});
    const initial=battle([user,set('raichu')],'doubles');
    const next=runTurn(initial,[attack('clangingscales','z'),protect(1)],[attack('recover'),protect(1)]);
    const mon=next.sides.player.team[0];
    expect(next.sides.player.gimmick).toMatchObject({used:true,kind:'z'});
    expect(mon.pp.clangingscales).toBe(moves.clangingscales.pp-1);
    for(const stat of ['atk','def','spa','spd','spe'] as const)expect(mon.stages[stat]).toBe(1);
    expect(next.log.some(entry=>entry.text.includes('브레이징소울비트 사용!'))).toBe(true);
  });
  for(const z of exclusiveZMoves.filter(z=>z.speciesId!=='kommoo'))it(`${z.speciesId} uses ${z.name} only with its own crystal and base move`,()=>{
    const defaults=createSet(z.speciesId).moves;
    const genericMoves=z.speciesId==='eevee'?['lastresort','tackle','quickattack','protect']:[z.baseMove,...defaults.filter(id=>id!==z.baseMove)].slice(0,4);
    const user=set(z.speciesId,{itemId:z.crystal,moves:genericMoves});
    expect(validateTeam([user])).toEqual([]);
    let initial=battle([user]);
    if(z.speciesId==='eevee')for(const moveId of user.moves.filter(id=>id!=='lastresort'))initial=runTurn(initial,[attack(moveId)],[attack('recover')]);
    expect(gimmickReason(initial,'player',initial.sides.player.team[0],'z',z.baseMove)).toBeUndefined();
    const next=runTurn(initial,[attack(z.baseMove,'z')],[protect()]);
    expect(next.sides.player.gimmick).toMatchObject({used:true,kind:'z'});
    expect(next.sides.player.team[0].pp[z.baseMove]).toBe(moves[z.baseMove].pp-1);
    expect(next.log.some(entry=>entry.text.includes(`${z.name} 사용!`))).toBe(true);
  });
  for(const format of ['singles','doubles'] as const) for(const kind of ['mega','tera','z','dynamax'] as const) it(`${format}: ${kind} uses one trainer resource and executes real damage`,()=>{
    const p=set('charizard',{itemId:kind==='mega'?'charizarditex':kind==='z'?'firiumz':kind==='tera'?'tera-fire':'dynamaxband',teraType:'fire',moves:['flamethrower','airslash','roost','protect']});
    const initial=battle([p,set('raichu')],format);
    const result=runTurnWithEvents(initial,[attack('flamethrower',kind),...(format==='doubles'?[protect(1)]:[])],[protect(),...(format==='doubles'?[protect(1)]:[])]);
    expect(result.state.sides.player.gimmick).toMatchObject({used:true,kind});
    expect(result.events.filter(e=>e.kind==='gimmick-start')).toHaveLength(1);
    const start=result.events.find(e=>e.kind==='gimmick-start')!,transform=result.events.find(e=>e.kind==='gimmick-transform')!;
    expect(start.snapshot.sides.player.gimmick?.used).toBe(false);
    expect(transform.snapshot.sides.player.gimmick?.used).toBe(true);
    expect(result.state.sides.player.team[0].pp.flamethrower).toBe(moves.flamethrower.pp-1);
    expect(initial.sides.player.gimmick?.used).toBe(false);
    expect(gimmickReason(result.state,'player',result.state.sides.player.team[1],'tera')).toBeTruthy();
    expect(result.events.at(-1)?.snapshot).toEqual(result.state);
    if(kind==='z'||kind==='dynamax') expect(result.state.sides.cpu.team[0].hp).toBeLessThan(initial.sides.cpu.team[0].hp);
  });
  it('reserves only one doubles activation, leaves submitted actions and original data untouched',()=>{
    const original=JSON.stringify(species.charizard);
    const initial=battle([set('charizard',{itemId:'charizarditey'}),set('raichu')],'doubles');
    const actions=[attack('protect','mega'),attack('protect','tera',1)];
    const result=runTurnWithEvents(initial,actions,[protect(),protect(1)]);
    expect(result.state.sides.player.gimmick?.kind).toBe('mega');
    expect(result.state.sides.player.team[1].transformation).toBeUndefined();
    expect(actions[1]).toMatchObject({gimmick:'tera'});
    expect(JSON.stringify(species.charizard)).toBe(original);
  });
  it('CPU and player spend independent resources and a fresh battle resets them',()=>{
    const initial=battle([set('raichu',{itemId:'tera-electric'})]);
    const next=runTurn(initial,[attack('protect','tera')],[attack('protect','dynamax')]);
    expect(next.sides.player.gimmick?.kind).toBe('tera');expect(next.sides.cpu.gimmick?.kind).toBe('dynamax');
    expect(battle([set('raichu')]).sides.player.gimmick).toEqual({used:false});
  });
  it('waits for each transformation animation before presenting the changed snapshot',async()=>{
    const frames=runTurnWithEvents(battle([set('raichu',{itemId:'tera-electric'})]),[attack('protect','tera')],[protect()]).events;
    let release!:()=>void;const presented:string[]=[];
    const task=playEvents(frames,{present:e=>presented.push(e.kind),animate:e=>e.kind==='gimmick-start'?new Promise<void>(r=>release=r):Promise.resolve(),minDurationMs:()=>0},new AbortController().signal);
    expect(presented).toEqual(['gimmick-start']);release();await task;expect(presented[1]).toBe('gimmick-transform');
  });
});
describe('Mega and Tera rules',()=>{
  it('requires the matching stone and rejects fainted actors',()=>{
    const state=battle([set('charizard',{itemId:'venusaurite'})]);const p=state.sides.player.team[0];
    expect(activateGimmick(state,'player',0,'mega','protect')).toBe(false);expect(state.sides.player.gimmick?.used).toBe(false);
    p.set.itemId='charizarditex';p.fainted=true;expect(activateGimmick(state,'player',0,'mega','protect')).toBe(false);
  });
  for(const form of megaForms) it(`verified Mega form ${form.id} applies stats, type and ability`,()=>{
    const state=battle([set(form.speciesId,form.id==='rayquazamega'?{moves:['dragonascent','protect','earthquake','extremespeed']}:{itemId:form.stoneId})]);const p=state.sides.player.team[0];p.hp-=20;const hp=p.hp;
    expect(activateGimmick(state,'player',0,'mega',p.set.moves[0])).toBe(true);
    expect(p.hp).toBe(hp);expect(p.types).toEqual(form.types);
    // Trace activates on Mega entry and immediately copies the opposing ability.
    expect(p.set.abilityId).toBe(form.abilityId==='trace'?state.sides.cpu.team[0].set.abilityId:form.abilityId);
    expect(p.speciesName).toBe(form.name);expect(p.stats.hp).toBe(p.maxHp);
  });
  for(const kind of ['mega','tera'] as const) it(`${kind} persists on switching and restores when battle ends`,()=>{
    let state=battle([set('charizard',{itemId:kind==='tera'?'tera-water':'charizarditey',teraType:'water'}),set('raichu')]);
    activateGimmick(state,'player',0,kind,'protect');
    state=runTurn(state,[{kind:'switch',slot:0,to:1}],[protect()]);expect(state.sides.player.team[0].transformation?.kind).toBe(kind);
    state.sides.cpu.team.forEach(p=>{p.fainted=true;p.hp=0;});
    state=runTurn(state,[protect()],[protect()]);expect(state.winner).toBe('player');
    const p=state.sides.player.team[0];expect(p.transformation).toBeUndefined();expect(p.types).toEqual(species.charizard.types);expect(p.set.abilityId).toBe(species.charizard.abilities[0]);
  });
  it('keeps original offensive STAB and switches defensive matchups; matching STAB is 2x',()=>{
    const state=battle([set('charizard',{itemId:'tera-water',teraType:'water'})]);const p=state.sides.player.team[0];
    activateGimmick(state,'player',0,'tera','protect');
    expect(p.types).toEqual(['water']);expect(getTypeMultiplier('electric',p.types)).toBe(2);
    expect(stabMultiplier(p,moves.flamethrower)).toBe(1.5);expect(stabMultiplier(p,moves.surf)).toBe(1.5);expect(stabMultiplier(p,moves.airslash)).toBe(1.5);
    const matching=battle([set('charizard',{itemId:'tera-fire',teraType:'fire'})]);const m=matching.sides.player.team[0];const before=estimateDamage(matching,m,matching.sides.cpu.team[0],moves.flamethrower);
    activateGimmick(matching,'player',0,'tera','protect');expect(stabMultiplier(m,moves.flamethrower)).toBe(2);expect(estimateDamage(matching,m,matching.sides.cpu.team[0],moves.flamethrower)).toBeGreaterThan(before);
  });
  it('uses the equipped Tera crystal for any of the 18 defensive types',()=>{
    const available=['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
    for(const teraType of available) {
      const state=battle([set('raichu',{itemId:`tera-${teraType}`,teraType:'electric'})]);const p=state.sides.player.team[0];
      expect(activateGimmick(state,'player',0,'tera','protect')).toBe(true);
      expect(p.types).toEqual([teraType]);expect(p.transformation?.teraType).toBe(teraType);expect(p.set.teraType).toBe('electric');
      expect(stabMultiplier(p,moves.thunderbolt)).toBe(teraType==='electric'?2:1.5);
    }
    const flying=battle([set('raichu',{itemId:'tera-flying'})]);activateGimmick(flying,'player',0,'tera','protect');
    expect(getTypeMultiplier('ground',flying.sides.player.team[0].types)).toBe(0);
  });
  it('handles Adaptability with matching and different Tera types',()=>{
    const state=battle([set('lucario',{itemId:'tera-fighting',teraType:'fighting'})]);const p=state.sides.player.team[0];p.set.abilityId='adaptability';activateGimmick(state,'player',0,'tera','protect');
    expect(stabMultiplier(p,moves.closecombat)).toBe(2.25);expect(stabMultiplier(p,moves.flashcannon)).toBe(1.5);
  });
});
describe('Z and Max moves',()=>{
  it('uses real power curves, source-specific overrides, category and guaranteed damaging accuracy',()=>{
    expect(zPower(40)).toBe(100);expect(zPower(90)).toBe(175);expect(zPower(120)).toBe(190);
    expect(maxPower(90,'water')).toBe(130);expect(maxPower(90,'fighting')).toBe(90);
    const p=battle([set('charizard',{itemId:'firiumz'})]).sides.player.team[0];
    expect(previewMove(p,moves.flamethrower,'z')).toMatchObject({category:'special',accuracy:null,power:175,target:'enemy'});
    expect(previewMove(p,moves.flareblitz,'z')).toMatchObject({category:'physical',power:190});
    expect(Object.keys(zMoves)).toHaveLength(18);
    const fairy=battle([set('sylveon',{itemId:'fairiumz'})]).sides.player.team[0];
    expect(zMoves.fairy).toMatchObject({id:'twinkletackle',name:'러블리스타임팩트',crystal:'fairiumz'});
    expect(previewMove(fairy,moves.moonblast,'z')).toMatchObject({id:'twinkletackle',name:'러블리스타임팩트',power:175,category:'special'});
    expect(previewMove(fairy,moves.dazzlinggleam,'z')).toMatchObject({id:'twinkletackle',name:'러블리스타임팩트',power:160,category:'special'});
  });
  it('wrong Z crystal does not consume the resource or change the base move',()=>{
    const state=battle([set('charizard',{itemId:'wateriumz',moves:['flamethrower','airslash','roost','protect']})]);
    const result=runTurnWithEvents(state,[attack('flamethrower','z')],[protect()]);expect(result.state.sides.player.gimmick?.used).toBe(false);
    expect(result.events.find(e=>e.kind==='move'&&e.actorUid==='player-0')?.moveId).toBe('flamethrower');
  });
  it('shows both compatible Pikachu crystals and gates Last Resort until all other move slots were used',()=>{
    const pika=set('pikachu',{moves:['volttackle','thunderbolt','quickattack','protect']});
    expect(exclusiveZForAll(pika)).toEqual(['pikaniumz','pikashuniumz']);
    const eeveeMoves=createSet('eevee').moves;
    const moveset=['lastresort',...species.eevee.learnset.filter(id=>id!=='lastresort').slice(0,3)];
    expect(eeveeMoves.length).toBe(4);
    const state=battle([set('eevee',{itemId:'eeviumz',moves:moveset})]);
    const p=state.sides.player.team[0];
    expect(usableMoves(p).map(move=>move.id)).not.toContain('lastresort');
    expect(usableMoves(p,true).map(move=>move.id)).toContain('lastresort');
    expect(moveUnavailableReason(p,'lastresort')).toContain('다른 기술을 모두');
    expect(moveUnavailableReason(p,'lastresort',true)).toBeUndefined();
    const immediate=runTurn(state,[attack('lastresort','z')],[protect()]);
    expect(immediate.sides.player.gimmick).toMatchObject({used:true,kind:'z'});
    expect(immediate.log.some(entry=>entry.text.includes('나인이볼부스트 사용!'))).toBe(true);
    expect(immediate.sides.player.team[0].stages).toMatchObject({atk:2,def:2,spa:2,spd:2,spe:2});
    for(const moveId of moveset.slice(1)){
      const next=runTurn(state,[attack(moveId)],[protect()]);
      state.rngState=next.rngState;state.turn=next.turn;state.sides=next.sides;state.weather=next.weather;state.field=next.field;state.log=next.log;state.winner=next.winner;
    }
    expect(state.sides.player.team[0].usedMoveIds).toEqual(expect.arrayContaining(moveset.slice(1)));
    expect(usableMoves(state.sides.player.team[0]).map(move=>move.id)).toContain('lastresort');
    const final=runTurn(state,[attack('lastresort','z')],[protect()]);
    expect(final.sides.player.gimmick).toMatchObject({used:true,kind:'z'});
    expect(final.log.some(entry=>entry.text.includes('나인이볼부스트 사용!'))).toBe(true);
    expect(final.sides.player.team[0].stages).toMatchObject({atk:2,def:2,spa:2,spd:2,spe:2});
  });
  it('keeps Last Resort move-slot usage after switching out and back',()=>{
    const moveIds=['lastresort','tackle','quickattack','protect'];
    let state=battle([set('eevee',{moves:moveIds}),set('raichu')]);
    for(const moveId of moveIds.slice(1))state=runTurn(state,[attack(moveId)],[attack('recover')]);
    state=runTurn(state,[{kind:'switch',slot:0,to:1}],[attack('recover')]);
    state=runTurn(state,[{kind:'switch',slot:0,to:0}],[attack('recover')]);
    expect(usableMoves(state.sides.player.team[0]).map(move=>move.id)).toContain('lastresort');
  });
  it('Spectral Thief steals positive stat stages before damage and passes Substitute',()=>{
    let next:ReturnType<typeof runTurn>|undefined;
    for(let seed=1;seed<=100&&!next;seed++){
      const state=createBattle({format:'singles',playerTeam:[set('marshadow',{moves:['spectralthief','closecombat','shadowclaw','protect']})],cpuTeam:[set('sylveon')],seed});
      const target=state.sides.cpu.team[0];target.stages.atk=2;target.stages.def=1;target.stages.evasion=2;target.substituteHp=100;
      const result=runTurn(state,[attack('spectralthief')],[attack('moonblast')]);
      if(result.sides.player.team[0].stages.atk>0)next=result;
    }
    expect(next).toBeDefined();
    const result=next!;
    const attacker=result.sides.player.team[0],victim=result.sides.cpu.team[0];
    expect(victim.stages).toMatchObject({atk:0,def:0,evasion:0});
    expect(attacker.stages).toMatchObject({atk:2,def:1,evasion:2});
    expect(victim.substituteHp).toBe(100);
    expect(victim.hp).toBeLessThan(victim.maxHp);
  });
  it('Zygarde signature moves ground airborne targets, trap non-Ghosts and suppress an ability after its action',()=>{
    const ground=createBattle({format:'singles',playerTeam:[set('zygarde',{moves:['thousandarrows','earthquake','coreenforcer','protect']})],cpuTeam:[set('charizard')],seed:4});
    const flying=ground.sides.cpu.team[0];flying.charging={moveId:'fly'};
    const arrow=runTurn(ground,[attack('thousandarrows')],[attack('recover')]);
    expect(arrow.sides.cpu.team[0].hp).toBeLessThan(flying.hp);expect(arrow.sides.cpu.team[0].groundedByMove).toBe(true);
    const waves=createBattle({format:'singles',playerTeam:[set('zygarde',{moves:['thousandwaves','thousandarrows','coreenforcer','protect']})],cpuTeam:[set('sylveon')],seed:4});
    const trapped=runTurn(waves,[attack('thousandwaves')],[attack('recover')]);expect(trapped.sides.cpu.team[0].trapped).toBe(true);
    const core=createBattle({format:'singles',playerTeam:[set('zygarde',{moves:['coreenforcer','thousandarrows','thousandwaves','protect']})],cpuTeam:[set('raichu'),set('blissey')],seed:4});
    core.sides.cpu.team[0].maxHp=1000;core.sides.cpu.team[0].hp=1000;
    const suppressed=runTurn(core,[attack('coreenforcer')],[attack('quickattack')]);
    expect(suppressed.sides.cpu.team[0].set.abilityId).toBe('none');
    const sleeping=createBattle({format:'singles',playerTeam:[set('zygarde',{moves:['coreenforcer','thousandarrows','thousandwaves','protect']})],cpuTeam:[set('raichu')],seed:4});
    sleeping.sides.cpu.team[0].status='sleep';sleeping.sides.cpu.team[0].sleepTurns=2;
    const asleep=runTurn(sleeping,[attack('coreenforcer')],[attack('quickattack')]);
    expect(asleep.sides.cpu.team[0].actedTurn).toBe(asleep.turn-1);expect(asleep.sides.cpu.team[0].movedTurn).toBeUndefined();
    expect(asleep.sides.cpu.team[0].set.abilityId).toBe('static');
    const returned=runTurn(suppressed,[attack('recover')],[{kind:'switch',slot:0,to:1}]);
    expect(returned.sides.cpu.team[0].set.abilityId).toBe('static');
  });
  it('Guardian of Alola removes three quarters of current HP, with the source-defined Protect chip',()=>{
    const user=set('tapukoko',{itemId:'tapuniumz',moves:['naturesmadness','thunderbolt','uturn','protect']});
    const plain=battle([user]);plain.sides.cpu.team[0].hp=121;plain.sides.cpu.team[0].status='sleep';plain.sides.cpu.team[0].sleepTurns=3;
    const hit=runTurn(plain,[attack('naturesmadness','z')],[attack('recover')]);
    expect(hit.sides.cpu.team[0].hp).toBe(31);
    const guarded=battle([user]);guarded.sides.cpu.team[0].hp=121;
    const protectedHit=runTurn(guarded,[attack('naturesmadness','z')],[protect()]);
    expect(protectedHit.sides.cpu.team[0].hp).toBe(99);
  });
  it('Ultra Burst transforms both Necrozma forms and Light That Burns the Sky uses the higher unboosted attack stat',()=>{
    for(const id of ['necrozmaduskmane','necrozmadawnwings']){
      const signature=id==='necrozmaduskmane'?'sunsteelstrike':'moongeistbeam';
      const state=battle([set(id,{itemId:'ultranecroziumz',moves:['photongeyser',signature,'protect','earthquake']})]);
      const p=state.sides.player.team[0];
      expect(activateGimmick(state,'player',0,'z','photongeyser')).toBe(true);
      expect(p.transformation).toMatchObject({kind:'z',formId:'necrozmaultra'});
      expect(p.speciesName).toBe('울트라네크로즈마');expect(p.set.abilityId).toBe('neuroforce');
      p.stats.atk=p.stats.spa+1;
      expect(previewMove(p,moves.photongeyser,'z')).toMatchObject({id:'lightthatburnsthesky',category:'physical',power:200,ignoreAbility:true});
      p.stats.atk=p.stats.spa-1;
      expect(previewMove(p,moves.photongeyser,'z').category).toBe('special');
    }
  });
  it('Mega Zygarde Nihil Light bypasses Fairy immunity, evasion, defensive stages and Protect without inventing a stat drop',()=>{
    const make=()=>createBattle({format:'singles',playerTeam:[set('zygarde',{itemId:'zygardite',moves:['nihillight','thousandarrows','coreenforcer','protect']})],cpuTeam:[set('sylveon')],seed:27});
    const plain=make(),boosted=make();
    expect(usableMoves(plain.sides.player.team[0]).map(move=>move.id)).not.toContain('nihillight');
    expect(moves.nihillight).toMatchObject({power:200,target:'allEnemies',bypassProtect:true,ignoreDefenderStages:true,ignoreEvasion:true});
    expect(moves.nihillight.effects).toBeUndefined();
    boosted.sides.cpu.team[0].maxHp=1000;boosted.sides.cpu.team[0].hp=1000;boosted.sides.cpu.team[0].stages.spd=6;boosted.sides.cpu.team[0].stages.evasion=6;boosted.sides.cpu.team[0].status='sleep';boosted.sides.cpu.team[0].sleepTurns=2;
    plain.sides.cpu.team[0].maxHp=1000;plain.sides.cpu.team[0].hp=1000;plain.sides.cpu.team[0].status='sleep';plain.sides.cpu.team[0].sleepTurns=2;
    const action=attack('nihillight','mega');
    const normal=runTurn(plain,[action],[attack('recover')]);
    const staged=runTurn(boosted,[action],[attack('recover')]);
    const normalTarget=normal.sides.cpu.team[0],stagedTarget=staged.sides.cpu.team[0];
    expect(normal.sides.player.team[0].transformation?.formId).toBe('zygardemega');
    expect(stagedTarget.hp).toBeLessThan(1000);expect(stagedTarget.hp).toBe(normalTarget.hp);
    expect(stagedTarget.stages.spd).toBe(6);expect(stagedTarget.stages.spa).toBe(0);
    expect(normal.log.some(entry=>entry.text.includes('니힐레이저 사용!'))).toBe(true);
    const dual=make(),dualUser=dual.sides.player.team[0],dualTarget=dual.sides.cpu.team[0];dualTarget.types=['dragon','fairy'];
    expect(battleTypeMultiplier(dual,previewMove(dualUser,moves.nihillight),dualTarget,dualUser)).toBe(2);
    const protectedState=make(),protectedTarget=protectedState.sides.cpu.team[0];protectedTarget.maxHp=1000;protectedTarget.hp=1000;
    const protectedTurn=runTurn(protectedState,[action],[protect()]);
    expect(protectedTarget.protected).toBe(false);expect(protectedTurn.sides.cpu.team[0].hp).toBeLessThan(1000);
  });
  it('applies declarative Z status boosts as well as the original effect',()=>{
    const state=battle([set('raichu',{itemId:'electriumz',moves:['thunderbolt','quickattack','thunderwave','protect']})]);
    const next=runTurn(state,[attack('thunderwave','z')],[attack('recover')]);
    expect(next.sides.player.team[0].stages.spd).toBe(1);expect(next.sides.cpu.team[0].status).toBe('paralysis');
  });
  it('clears negative stages for Z Protect',()=>{
    const state=battle([set('raichu',{itemId:'normaliumz'})]);state.sides.player.team[0].stages.atk=-3;
    const next=runTurn(state,[attack('protect','z')],[protect()]);expect(next.sides.player.team[0].stages.atk).toBe(0);
  });
  it('Dynamax scales injured HP and ends after the activation turn plus two turns',()=>{
    let state=battle([set('charizard')]);const p=state.sides.player.team[0];p.hp-=33;const hp=p.hp,maxHp=p.maxHp;
    const result=runTurnWithEvents(state,[attack('protect','dynamax')],[protect()]);state=result.state;
    expect(result.events.find(e=>e.kind==='gimmick-transform')?.snapshot.sides.player.team[0].hp).toBe(hp*2);
    expect(state.sides.player.team[0].maxHp).toBe(maxHp*2);expect(state.sides.player.team[0].transformation?.turns).toBe(2);
    state=runTurn(state,[protect()],[protect()]);expect(state.sides.player.team[0].transformation?.turns).toBe(1);
    state=runTurn(state,[protect()],[protect()]);expect(state.sides.player.team[0].transformation).toBeUndefined();expect(state.sides.player.team[0].hp).toBe(hp);expect(state.sides.player.team[0].maxHp).toBe(maxHp);
  });
  it('ends Dynamax on switching/fainting, rounds HP without healing, and cannot reuse',()=>{
    let state=battle([set('raichu'),set('charizard')]);const p=state.sides.player.team[0];activateGimmick(state,'player',0,'dynamax','protect');p.hp=101;endDynamax(state,p);expect(p.hp).toBe(51);
    expect(gimmickReason(state,'player',p,'dynamax')).toBeTruthy();
    state=battle([set('raichu'),set('charizard')]);activateGimmick(state,'player',0,'dynamax','protect');state=runTurn(state,[{kind:'switch',slot:0,to:1}],[protect()]);expect(state.sides.player.team[0].transformation).toBeUndefined();
    const faint=battle([set('raichu')]);activateGimmick(faint,'player',0,'dynamax','protect');applyDamage(faint,faint.sides.player.team[0],9999,'test');const next=runTurn(faint,[],[protect()]);expect(next.winner).toBe('cpu');expect(next.sides.player.team[0].hp).toBe(0);expect(next.sides.player.team[0].transformation).toBeUndefined();
  });
  it('uses base HP for burn and recovery; suppresses a previous Choice lock and flinch while Maxed',()=>{
    const state=battle([set('raichu',{itemId:'dynamaxband'})]);const p=state.sides.player.team[0],hp=p.maxHp;p.choiceLock=p.set.moves[0];activateGimmick(state,'player',0,'dynamax','protect');
    expect(usableMoves(p)).toHaveLength(4);expect(applyVolatile(state,p,'flinch')).toBe(false);
    p.status='burn';processEndTurn(state);expect(p.hp).toBe(hp*2-Math.floor(hp/16));p.hp=10;applyHeal(state,p,.5,'test');expect(p.hp).toBe(10+Math.floor(hp/2));
  });
  it('requires the Dynamax Band even when another held item is equipped',()=>{
    const state=battle([set('raichu',{itemId:'choiceBand',moves:['thunderbolt','quickattack','thunderwave','protect']})]);state.sides.player.team[0].choiceLock='quickattack';
    expect(gimmickReason(state,'player',state.sides.player.team[0],'dynamax')).toBeTruthy();
    const next=runTurn(state,[attack('thunderbolt','dynamax')],[protect()]);expect(next.sides.player.gimmick?.used).toBe(false);
    expect(usableMoves(next.sides.player.team[0]).map(m=>m.id)).toEqual(['quickattack']);
  });
  it('Max attacks chip Protect, Max Guard fully blocks them and normal attacks',()=>{
    const state=battle([set('charizard',{moves:['flamethrower','airslash','roost','protect']})]);
    const chip=runTurn(state,[attack('flamethrower','dynamax')],[protect()]);expect(chip.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
    const guard=runTurn(state,[attack('flamethrower','dynamax')],[attack('protect','dynamax')]);expect(guard.sides.cpu.team[0].hp).toBe(state.sides.cpu.team[0].hp*2);
  });
  it('Max move changes weather and boosts both allies, targets only one foe',()=>{
    let state=createBattle({format:'doubles',playerTeam:[set('charizard',{moves:['flamethrower','airslash','roost','protect']}),set('raichu')],
      cpuTeam:[set('blissey'),set('snorlax',{moves:['protect','bodyslam','rest','crunch']}),set('ursaluna')],seed:5});
    state=runTurn(state,[attack('airslash','dynamax'),protect(1)],[attack('recover'),protect(1)]);
    expect(state.sides.player.team[0].stages.spe).toBe(1);expect(state.sides.player.team[1].stages.spe).toBe(1);expect(state.sides.cpu.team[1].hp).toBe(state.sides.cpu.team[1].maxHp);
    state=runTurn(state,[attack('flamethrower'),protect(1)],[protect(),protect(1)]);expect(state.weather?.id).toBe('sun');
  });
  for(const id of Object.keys(gmaxForms).filter(id=>species[id])) it(`Gmax ${id} exposes only the correct signature`,()=>{
    const state=battle([set(id,{gigantamax:true})]);const p=state.sides.player.team[0];activateGimmick(state,'player',0,'dynamax',p.set.moves[0]);
    const signature=gmaxForms[id];const base=Object.values(moves).find(m=>m.type===signature.type&&m.category!=='status')!;
    expect(previewMove(p,base).id).toBe(signature.id);expect(previewMove(p,moves.protect).id).toBe('maxguard');
  });
  it('Gmax Lapras creates Aurora Veil after its Ice attack without snow',()=>{
    const state=battle([set('lapras',{gigantamax:true,moves:['icebeam','surf','protect','thunderbolt']})]);
    const next=runTurn(state,[attack('icebeam','dynamax')],[attack('recover')]);
    expect(next.sides.player.screens?.auroraveil).toBeGreaterThan(0);
    expect(next.log.some(entry=>entry.text.includes('거다이선율'))).toBe(true);
  });
  it('Gmax Snorlax can restore a consumed berry to an ally on a seeded 50% roll',()=>{
    const state=battle([set('snorlax',{gigantamax:true,moves:['return','crunch','protect','earthquake']}),set('raichu',{itemId:'lumberry'})],'doubles');
    const berry=state.sides.player.team[1];
    const move={...moves.return,id:'gmaxreplenish'};
    const outcomes=new Set<boolean>();
    for(let i=0;i<12;i++){
      berry.itemConsumed=true;
      applyMaxEffect(state,'player',state.sides.player.team[0],move);
      outcomes.add(!berry.itemConsumed);
    }
    expect(outcomes).toEqual(new Set([true,false]));
  });
  it('Gmax residual damages eligible enemies for four end turns and keeps the final-form signature set supported',()=>{
    let state=battle([set('charizard',{gigantamax:true,moves:['flamethrower','airslash','roost','protect']})]);
    state=runTurn(state,[attack('flamethrower','dynamax')],[protect()]);expect(state.sides.cpu.residual?.turns).toBe(3);
    for(let i=0;i<3;i++) state=runTurn(state,[protect()],[protect()]);expect(state.sides.cpu.residual).toBeUndefined();
    expect(Object.keys(gmaxForms).filter(id=>species[id]).length).toBeGreaterThanOrEqual(15);
    expect(gmaxForms.raichu).toBeUndefined();
    expect(validateTeam([set('raichu',{gigantamax:true})])).not.toEqual([]);
  });
});
describe('configuration and CPU',()=>{
  for(const [id,extra,foe,kind] of [
    ['mawile',{itemId:'mawilite'},'blissey','mega'],
    ['gyarados',{teraType:'ground'},'raichu','tera'],
    ['charizard',{itemId:'firiumz'},'venusaur','z'],
    ['blastoise',{},'charizard','dynamax'],
  ] as [string,Partial<TeamSet>,string,Gimmick][]) it(`CPU selects ${kind} for ${id}'s matchup`,()=>{
    const state=createBattle({format:'singles',playerTeam:[set(foe)],cpuTeam:[set(id,extra)],seed:5});
    const selected=chooseCpuActions(state);
    if(kind==='mega'||kind==='z') expect(selected[0]).toMatchObject({kind:'move',gimmick:kind});
    else {
      expect(selected[0]).toMatchObject({kind:'move'});
      if(selected[0].kind==='move') {
        expect(['tera','dynamax']).toContain(selected[0].gimmick);
        expect(gimmickReason(state,'cpu',state.sides.cpu.team[0],selected[0].gimmick!,selected[0].moveId)).toBeUndefined();
      }
    }
  });
  it('round trips Tera/Gmax settings for supported finals and rejects unsupported input',()=>{
    const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
    const team=[set('charizard',{teraType:'water',gigantamax:true,itemId:'firiumz'})];saveTeam(team,storage);expect(loadTeam(storage)).toEqual(team);
    expect(validateTeam([set('tyranitar',{gigantamax:true})])).not.toEqual([]);expect(validateTeam([set('raichu',{teraType:'invalid'})])).not.toEqual([]);
  });
  it('CPU scores supported gimmicks deterministically and never assigns two in doubles',()=>{
    const state=createBattle({format:'doubles',playerTeam:[set('blastoise'),set('venusaur')],cpuTeam:[set('charizard',{itemId:'charizarditey'}),set('raichu',{itemId:'electriumz'})],seed:8});
    const actions=chooseCpuActions(state);expect(actions).toEqual(chooseCpuActions(state));expect(actions.filter(a=>a.kind==='move'&&a.gimmick)).toHaveLength(1);
    const next=runTurn(state,[protect(),protect(1)]);expect(next.sides.cpu.gimmick?.used).toBe(true);
  });
});
