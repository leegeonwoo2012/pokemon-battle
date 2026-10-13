import { species, moves, typeNames, items } from '../data';
import { exclusiveZMoves, gmaxForms, gimmickNames, maxEffects, maxMoves, maxPower, megaForms, powerMetadata, zMoves, zPower } from '../data/gimmicks';
import { calculateStats, passiveEffects } from './calculations';
import { activePokemon, addLog, applyDamage, applyEntryEffects, applyHeal, applyStatChange, applyStatus, getPokemonAt, refreshAbilityTypes } from './effects';
import { isMoveUsable } from './choices';
import { chance } from './rng';
import { randomInt } from './rng';
import { applyVolatile } from './conditions';
import type { BattleState, BoostStat, Combatant, Gimmick, Move, Side, TeamSet } from './types';

export function gimmickSetErrors(set:TeamSet):string[] {
  const errors:string[]=[];
  if(set.teraType !== undefined && !typeNames[set.teraType]) errors.push('지원되지 않는 테라 타입입니다.');
  if(set.gigantamax !== undefined && typeof set.gigantamax !== 'boolean') errors.push('거다이맥스 설정이 올바르지 않습니다.');
  if(set.gigantamax && !gmaxForms[set.speciesId]) errors.push('이 종의 거다이맥스 데이터는 지원하지 않습니다.');
  return errors;
}
export const megaFormFor = (pokemon:Combatant) => megaForms.find(f=>f.speciesId===pokemon.set.speciesId&&f.stoneId===pokemon.set.itemId);
export const teraTypeFromItem = (itemId:string):string|undefined => {
  const type=itemId.startsWith('tera-')?itemId.slice(5):undefined;
  return type&&typeNames[type]?type:undefined;
};
export const exclusiveZFor=(set:TeamSet)=>exclusiveZMoves.find(z=>z.speciesId===set.speciesId&&set.moves.includes(z.baseMove))?.crystal;
function zStatusSupported(id:string):boolean {
  const z=powerMetadata[id]?.z;
  return !!z&&(!!z.boost||['heal','clearnegativeboost'].includes(z.effect??''));
}
export function compatibleZTypes(set:TeamSet):string[] {
  return [...new Set(set.moves.flatMap(id=>{const move=moves[id];return move&&(move.category!=='status'||zStatusSupported(id))&&zMoves[move.type]?[move.type]:[];}))];
}
export function gimmickReason(state:BattleState,side:Side,pokemon:Combatant,kind:Gimmick,moveId?:string,teraType?:string):string|undefined {
  if(!['mega','tera','z','dynamax'].includes(kind)) return '알 수 없는 기믹입니다.';
  if(state.winner) return '배틀이 종료되었습니다.';
  if(pokemon.fainted) return '기절한 포켓몬은 사용할 수 없습니다.';
  if(!state.sides[side].active.some(i=>state.sides[side].team[i].uid===pokemon.uid)) return '출전 중인 포켓몬만 사용할 수 있습니다.';
  if(state.sides[side].gimmick?.used) return `이번 배틀에서 ${gimmickNames[state.sides[side].gimmick!.kind!]}를 이미 사용했습니다.`;
  if(pokemon.transformation) return '이미 변신한 포켓몬입니다.';
  if(kind==='mega'&&!megaFormFor(pokemon)) {
    const forms=megaForms.filter(f=>f.speciesId===pokemon.set.speciesId);
    return forms.length?`팀 편성 → 기믹 도구 빠른 장착에서 ${forms.map(f=>items[f.stoneId]?.name??f.stoneName).join(' 또는 ')}를 고르세요.`:'이 종의 메가진화 데이터는 지원하지 않습니다.';
  }
  if(kind==='tera'){
    const equipped=teraTypeFromItem(pokemon.set.itemId);
    if(!equipped||pokemon.itemConsumed)return '팀 편성에서 원하는 타입의 테라크리스탈을 지니게 하세요.';
    if(teraType&&teraType!==equipped)return '지닌 테라크리스탈과 다른 타입은 사용할 수 없습니다.';
  }
  if(kind==='dynamax'&&pokemon.set.gigantamax&&!gmaxForms[pokemon.set.speciesId]) return '거다이맥스 폼 데이터가 없습니다.';
  if(kind==='z') {
    const compatible=(id:string)=>{
      const m=moves[id];
      if(!m||!isMoveUsable(pokemon,id,true))return false;
      if(exclusiveZMoves.some(z=>z.speciesId===pokemon.set.speciesId&&z.baseMove===id&&z.crystal===pokemon.set.itemId))return true;
      if(zMoves[m.type]?.crystal!==pokemon.set.itemId)return false;
      if(m.category!=='status') return true;
      const z=powerMetadata[id]?.z;
      return !!z&&(!!z.boost||['heal','clearnegativeboost'].includes(z.effect??''));
    };
    if(moveId?!compatible(moveId):!pokemon.set.moves.some(compatible)) {
      const types=compatibleZTypes(pokemon.set);
      const options=[...(exclusiveZFor(pokemon.set)?[items[exclusiveZFor(pokemon.set)!].name]:[]),...types.map(type=>items[zMoves[type].crystal]?.name??`${typeNames[type]} Z크리스탈`)];
      return options.length
        ?`팀 편성 → 기믹 도구 빠른 장착 또는 지닌 도구에서 ${options.join(' 또는 ')}를 고르세요.`
        :'배운 기술과 호환되는 Z크리스탈이 없습니다. 지원되는 기술을 확인하세요.';
    }
  }
  return undefined;
}
function remember(pokemon:Combatant) {
  pokemon.original??={name:pokemon.speciesName,types:[...pokemon.types],stats:{...pokemon.stats},abilityId:pokemon.set.abilityId,maxHp:pokemon.maxHp};
}
export function activateGimmick(state:BattleState,side:Side,slot:number,kind:Gimmick,moveId:string,teraType?:string):boolean {
  const p=getPokemonAt(state,{side,slot}); if(!p) return false;
  const selectedTeraType=kind==='tera'?teraTypeFromItem(p.set.itemId)??p.types[0]:teraType??p.set.teraType??p.types[0];
  const reason=gimmickReason(state,side,p,kind,moveId,teraType);
  if(reason) {addLog(state,reason,'system',{kind:'blocked',actorUid:p.uid});return false;}
  addLog(state,`${p.speciesName}의 ${gimmickNames[kind]} 발동 준비!`,'system',{kind:'gimmick-start',actorUid:p.uid,gimmick:kind,type:selectedTeraType});
  state.sides[side].gimmick={used:true,kind,uid:p.uid};
  if(kind!=='z') {
    remember(p);
    p.transformation={kind};
    if(kind==='mega') {
      const form=megaFormFor(p)!;
      p.speciesName=form.name;p.types=[...form.types];p.stats=calculateStats({...species[p.set.speciesId],baseStats:form.baseStats},p.set);
      p.stats.hp=p.maxHp;p.set.abilityId=form.abilityId;p.transformation.formId=form.id;
    } else if(kind==='tera') { if(selectedTeraType!=='stellar')p.types=[selectedTeraType];p.transformation.teraType=selectedTeraType;p.stellarBoostedTypes=[]; }
    else {
      p.maxHp*=2;p.hp*=2;p.stats.hp=p.maxHp;p.transformation.turns=3;
      if(p.set.gigantamax) {p.transformation.formId=p.set.speciesId+'gmax';p.speciesName='거다이'+p.speciesName;}
    }
  }
  addLog(state,`${p.speciesName}: ${gimmickNames[kind]} 발동!${kind==='tera'?` ${typeNames[selectedTeraType]} 타입`:''}`,'system',{kind:'gimmick-transform',actorUid:p.uid,gimmick:kind,type:kind==='tera'?selectedTeraType:moves[moveId]?.type});
  if(kind==='mega') applyEntryEffects(state,side,p);
  return true;
}
export function previewMove(p:Combatant,base:Move,kind?:Gimmick,teraType?:string):Move {
  if(base.id==='struggle') return base;
  if(base.id==='terablast'&&(p.transformation?.kind==='tera'||kind==='tera')&&kind!=='z'&&kind!=='dynamax'){
    const chosen=p.transformation?.teraType??teraTypeFromItem(p.set.itemId)??teraType??p.set.teraType??p.types[0];
    const stellar=chosen==='stellar';
    return {...base,type:chosen,power:stellar?100:80,category:p.stats.atk>p.stats.spa?'physical':'special',
      effects:stellar?[{kind:'stat',stat:'atk',stages:-1,target:'self'},{kind:'stat',stat:'spa',stages:-1,target:'self'}]:undefined};
  }
  if(kind==='z') {
    const exclusive=exclusiveZMoves.find(z=>z.speciesId===p.set.speciesId&&z.crystal===p.set.itemId&&z.baseMove===base.id);
    if(exclusive)return {id:exclusive.id,name:exclusive.name,type:exclusive.type,category:exclusive.category,power:exclusive.power,accuracy:null,pp:base.pp,priority:0,target:exclusive.target,powered:'z',
      ignoreAbility:exclusive.id==='menacingmoonrazemaelstrom',contact:['letssnuggleforever','maliciousmoonsault','pulverizingpancake'].includes(exclusive.id),
      effects:exclusive.id==='clangoroussoulblaze'?(['atk','def','spa','spd','spe'] as const).map(stat=>({kind:'stat' as const,stat,stages:1,target:'self' as const})):undefined};
    if(base.category==='status') return {...base,name:'Z'+base.name,powered:'z'};
    const z=zMoves[base.type];
    return {id:z.id,name:z.name,type:base.type,category:base.category,power:powerMetadata[base.id]?.z?.basePower??zPower(base.power),accuracy:null,pp:base.pp,priority:base.priority,target:'enemy',powered:'z'};
  }
  if(kind==='dynamax'||p.transformation?.kind==='dynamax') {
    if(base.category==='status') return {id:'maxguard',name:'다이월',type:'normal',category:'status',power:0,accuracy:null,pp:base.pp,priority:4,target:'self',effects:[{kind:'protect'}],powered:'max'};
    const conversion=base.type==='normal'?passiveEffects(p).find(effect=>effect.trigger==='onMoveType'&&effect.kind==='convertType'&&effect.from==='normal'):undefined;
    const type=conversion?.kind==='convertType'?conversion.to:base.type;
    const power=conversion?.kind==='convertType'?Math.max(1,Math.floor(base.power*conversion.multiplier)):base.power;
    const g=p.set.gigantamax?gmaxForms[p.set.speciesId]:undefined;
    const definition=g?.type===type?g:maxMoves[type];
    return {id:definition.id,name:definition.name,type,category:base.category,power:g?.id===definition.id&&g.effect==='fixedPower'?160:powerMetadata[base.id]?.max??maxPower(power,type),accuracy:null,pp:base.pp,priority:base.priority,target:'enemy',powered:'max',ignoreAbility:g?.id===definition.id&&g.effect==='fixedPower',bypassProtect:g?.id===definition.id&&g.effect==='bypassProtect'};
  }
  if(base.category!=='status'&&base.type==='normal'&&base.id!=='terablast'){
    const conversion=passiveEffects(p).find(effect=>effect.trigger==='onMoveType'&&effect.kind==='convertType'&&effect.from===base.type);
    if(conversion&&conversion.kind==='convertType')return {...base,type:conversion.to,power:Math.max(1,Math.floor(base.power*conversion.multiplier))};
  }
  return base;
}
export function applyExclusiveZEffect(state:BattleState,move:Move):void {
  if(move.id==='genesissupernova'){
    state.field={id:'psychic',turns:5};refreshAbilityTypes(state);addLog(state,'Genesis Supernova: 사이코필드가 펼쳐졌다!','status',{kind:'field'});
  }else if(move.id==='splinteredstormshards'&&state.field){
    state.field=null;refreshAbilityTypes(state);addLog(state,'Splintered Stormshards: 필드가 사라졌다!','status',{kind:'field'});
  }
}
export function applyZStatus(state:BattleState,p:Combatant,baseId:string) {
  const z=powerMetadata[baseId]?.z;
  if(z?.boost) for(const [stat,stages] of Object.entries(z.boost)) applyStatChange(state,p,stat as BoostStat,stages,p);
  if(z?.effect==='heal') applyHeal(state,p,1,'Z기술');
  if(z?.effect==='clearnegativeboost') {
    for(const stat of Object.keys(p.stages) as BoostStat[]) if(p.stages[stat]<0) applyStatChange(state,p,stat,-p.stages[stat],p);
  }
}
export function applyMaxEffect(state:BattleState,side:Side,p:Combatant,move:Move) {
  const foe:Side=side==='player'?'cpu':'player';
  const g=gmaxForms[p.set.speciesId];
  if(p.set.gigantamax&&g&&move.id===g.id) {
    if(g.effect==='paralysis') for(const target of activePokemon(state,foe)) applyStatus(state,target,'paralysis',g.name,p);
    else if(g.effect==='residual'&&!state.sides[foe].residual)state.sides[foe].residual={type:g.type,turns:4,name:g.name};
    else if(g.effect==='auroraveil'){
      const long=p.set.itemId==='lightclay'&&!p.itemConsumed;
      state.sides[side].screens??={};state.sides[side].screens!.auroraveil=long?8:5;
      addLog(state,`${g.name}: 아군에게 오로라베일이 펼쳐졌다!`,'status',{kind:'field'});
    }else if(g.effect==='replenish'&&chance(state,50))for(const ally of activePokemon(state,side)){
      if(ally.itemConsumed&&ally.set.itemId.toLowerCase().endsWith('berry')){
        ally.itemConsumed=false;addLog(state,`${ally.speciesName}의 열매가 돌아왔다!`,'status',{kind:'item',actorUid:ally.uid,sourceId:ally.set.itemId,sourceKind:'item'});
      }
    }else if(g.effect==='befuddle'||g.effect==='stunShock')for(const target of activePokemon(state,foe)){
      const choices=g.effect==='befuddle'?(['sleep','paralysis','poison'] as const):(['paralysis','poison'] as const);
      applyStatus(state,target,choices[randomInt(state,0,choices.length-1)],g.name,p);
    }else if(g.effect==='critBoost')for(const ally of activePokemon(state,side)){
      ally.gmaxCritStages=Math.min(3,(ally.gmaxCritStages??0)+1);addLog(state,`${ally.speciesName}의 급소 확률이 올랐다!`,'status',{targetUid:ally.uid});
    }else if(g.effect==='trap'||g.effect==='sandblast'){
      for(const target of activePokemon(state,foe)){
        if(target.types.includes('ghost'))continue;
        target.trapped=true;target.trappedBy=p.uid;
        addLog(state,`${target.speciesName}은 교체할 수 없게 되었다!`,'status',{targetUid:target.uid});
      }
      if(g.effect==='sandblast'&&!state.sides[foe].residual)state.sides[foe].residual={type:'ground',turns:4,name:g.name};
    }else if(g.effect==='poison')for(const target of activePokemon(state,foe))applyStatus(state,target,'poison',g.name,p);
    else if(g.effect==='clearField'){
      for(const fieldSide of ['player','cpu'] as const){state.sides[fieldSide].hazards={};state.sides[fieldSide].screens={};}
      addLog(state,`${g.name}: 양쪽 진영의 설치물과 장막이 제거되었다!`,'status');
    }
    else if(g.effect==='confuse')for(const target of activePokemon(state,foe))applyVolatile(state,target,'confusion');
    else if(g.effect==='attraction'){
      for(const target of activePokemon(state,foe))if(p.gender&&target.gender&&p.gender!=='N'&&target.gender!=='N'&&p.gender!==target.gender){
        target.infatuatedBy=p.uid;addLog(state,`${target.speciesName}은(는) ${p.speciesName}에게 반했다!`,'status',{targetUid:target.uid});
      }
    }
    else if(g.effect==='snooze'){
      for(const target of activePokemon(state,foe))if(!target.status&&!target.yawnTurns&&chance(state,50)){
        target.yawnTurns=2;addLog(state,`${target.speciesName}이 졸음에 빠졌다!`,'status',{targetUid:target.uid});
      }
    }
    else if(g.effect==='speedDrop')for(const target of activePokemon(state,foe))applyStatChange(state,target,'spe',-2,p);
    else if(g.effect==='gravity') {state.gravity=5;addLog(state,'거다이중력: 중력이 강해졌다!','status',{kind:'field'});}
    else if(g.effect==='spikes'||g.effect==='steelsurge') {
      const hazard=g.effect==='steelsurge'?'steelsurge':'stealthrock';
      state.sides[foe].hazards??={};state.sides[foe].hazards[hazard]=1;
      addLog(state,`${g.name}: 상대 진영에 ${hazard==='steelsurge'?'강철 가시':'바위 가시'}가 설치되었다!`,'status');
    }
    else if(g.effect==='disable') {
      for(const target of activePokemon(state,foe))if(target.lastMove) {
        target.tormentedMove={moveId:target.lastMove,turns:3};
        addLog(state,`${target.speciesName}은(는) ${target.lastMove}을 연속해서 사용할 수 없다!`,'status',{targetUid:target.uid});
      }
    }
    else if(g.effect==='allyHeal') {
      for(const ally of activePokemon(state,side))applyHeal(state,ally,1/6,g.name);
    }
    else if(g.effect==='depletion') {
      for(const target of activePokemon(state,foe))if(target.lastMove&&target.pp[target.lastMove]!==undefined) {
        target.pp[target.lastMove]=Math.max(0,target.pp[target.lastMove]-2);
        addLog(state,`${target.speciesName}의 ${target.lastMove} PP가 2 줄었다!`,'status',{targetUid:target.uid});
      }
    }
    else if(g.effect==='sweetness')for(const ally of activePokemon(state,side))if(ally.status){
      ally.status=null;ally.sleepTurns=0;ally.toxicCounter=undefined;
      addLog(state,`${ally.speciesName}의 상태 이상이 나았다!`,'status',{targetUid:ally.uid,status:null});
    }
  } else {
    const effect=maxEffects[move.type]; if(!effect) return;
    if('weather' in effect) {state.weather={id:effect.weather,turns:5};refreshAbilityTypes(state);addLog(state,`${move.name}: 날씨 ${effect.weather}!`,'status',{kind:'weather'});}
    else if('field' in effect) {state.field={id:effect.field,turns:5};refreshAbilityTypes(state);addLog(state,`${move.name}: ${effect.field} 필드!`,'status',{kind:'field'});}
    else for(const target of activePokemon(state,effect.side==='allies'?side:foe)) applyStatChange(state,target,effect.stat,effect.stages,p);
  }
}
export function endDynamax(state:BattleState,p:Combatant) {
  if(p.transformation?.kind!=='dynamax'||!p.original) return;
  p.hp=Math.min(p.original.maxHp,Math.ceil(p.hp/2));p.maxHp=p.original.maxHp;p.stats={...p.original.stats};p.speciesName=p.original.name;
  p.transformation=undefined;p.original=undefined;p.maxGuard=false;
  addLog(state,`${p.speciesName}의 다이맥스가 풀렸다!`,'system',{kind:'gimmick-end',actorUid:p.uid,gimmick:'dynamax'});
}
export function finishGimmickTurn(state:BattleState) {
  for(const side of ['player','cpu'] as const) {
    const residual=state.sides[side].residual;
    if(residual) {
      for(const p of activePokemon(state,side)) if(p.set.abilityId!=='magicguard'&&!p.types.includes(residual.type)&&!(residual.name==='거다이사가'&&p.types.some(type=>['rock','ground','steel'].includes(type)))) applyDamage(state,p,(p.original?.maxHp??p.maxHp)/6,residual.name);
      if(--residual.turns<=0) state.sides[side].residual=undefined;
    }
    for(const p of state.sides[side].team) if(p.transformation?.kind==='dynamax') {
      if(p.fainted||--p.transformation.turns!<=0) endDynamax(state,p);
    }
  }
}
export function restoreBattleForms(state:BattleState) {
  for(const side of ['player','cpu'] as const) for(const p of state.sides[side].team) {
    endDynamax(state,p);
    if(p.original) {
      p.speciesName=p.original.name;p.types=[...p.original.types];p.stats={...p.original.stats};p.set.abilityId=p.original.abilityId;
      p.maxHp=p.original.maxHp;p.hp=Math.min(p.hp,p.maxHp);p.original=undefined;p.transformation=undefined;
      addLog(state,`${p.speciesName}이 원래 모습으로 돌아왔다.`,'system',{kind:'gimmick-end',actorUid:p.uid});
    }
  }
}
