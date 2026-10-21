import type { Item, PassiveEffect } from '../engine/types';
import { svItemCatalog } from './sv-items.generated';

const items: Record<string,Item>={};
const add=(id:string,description:string,effects:PassiveEffect[]=[])=>{
  items[id]={id,name:svItemCatalog[id]?.name??id,description,effects,supported:effects.length>0};
};

const plates:Record<string,string>={dracoplate:'dragon',dreadplate:'dark',earthplate:'ground',fistplate:'fighting',flameplate:'fire',icicleplate:'ice',insectplate:'bug',ironplate:'steel',meadowplate:'grass',mindplate:'psychic',pixieplate:'fairy',skyplate:'flying',splashplate:'water',spookyplate:'ghost',stoneplate:'rock',toxicplate:'poison',zapplate:'electric'};
for(const [id,type] of Object.entries(plates))add(id,`해당 타입 기술 위력 1.2배. 아르세우스가 지니면 ${type} 타입으로 변합니다.`,[{trigger:'onAttack',kind:'damageMultiplier',type,multiplier:1.2}]);

for(const [id,types,holders] of [
  ['adamantorb',['dragon','steel'],['dialga']],['adamantcrystal',['dragon','steel'],['dialga']],
  ['lustrousorb',['dragon','water'],['palkia']],['lustrousglobe',['dragon','water'],['palkia']],
  ['griseousorb',['dragon','ghost'],['giratina']],['griseouscore',['dragon','ghost'],['giratina']],
  ['souldew',['dragon','psychic'],['latios','latias']],
] as [string,string[],string[]][]) {
  add(id,`${holders.join('·')}의 ${types.join('·')} 타입 기술 위력이 1.2배가 됩니다.`,types.map(type=>({trigger:'onAttack',kind:'damageMultiplier',type,multiplier:1.2,speciesIds:holders})));
}
// These three also change their holders to Origin forms; keep them unavailable until that form rule is complete.
for(const id of ['adamantcrystal','lustrousglobe','griseouscore'])items[id].supported=false;
add('expertbelt','효과가 굉장한 기술의 피해를 1.2배로 늘립니다.',[{trigger:'onSuperEffectiveDamage',kind:'damageMultiplier',multiplier:1.2}]);
add('rockyhelmet','접촉 공격을 한 상대가 최대 HP의 1/6을 잃습니다.',[{trigger:'onContact',kind:'damage',fraction:1/6}]);
add('eviolite','진화할 수 있는 포켓몬의 방어와 특수방어가 1.5배가 됩니다.',[
  {trigger:'onStat',kind:'statMultiplier',stat:'def',multiplier:1.5,condition:'canEvolve'},
  {trigger:'onStat',kind:'statMultiplier',stat:'spd',multiplier:1.5,condition:'canEvolve'},
]);
add('lightball','피카츄의 공격과 특수공격이 2배가 됩니다.',[
  {trigger:'onStat',kind:'statMultiplier',stat:'atk',multiplier:2,speciesIds:['pikachu']},
  {trigger:'onStat',kind:'statMultiplier',stat:'spa',multiplier:2,speciesIds:['pikachu']},
]);
add('rarebone','배틀 중 효과는 없습니다. 판매용 도구입니다.');
add('clearamulet','상대가 시도한 능력치 하락을 막습니다.',[{trigger:'onStatDrop',kind:'statImmunity'}]);
add('airballoon','땅 기술을 피하며, 공격을 받으면 터집니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'ground'}]);
add('blacksludge','독 타입은 턴마다 최대 HP의 1/16을 회복하고 다른 타입은 1/8을 잃습니다.');
for(const [id,weather] of Object.entries({damprock:'rain',heatrock:'sun',icyrock:'snow',smoothrock:'sand'}))add(id,`${weather} 날씨를 8턴 유지합니다.`);
add('terrainextender','설치한 필드를 8턴 유지합니다.');
add('protectivepads','접촉 기술 사용 시 상대의 접촉 반응을 받지 않습니다.');
for(const id of ['poweranklet','powerband','powerbelt','powerbracer','powerlens','powerweight'])add(id,'배틀 중 스피드가 절반이 됩니다. 노력치 획득 효과는 이 게임에 적용되지 않습니다.',[{trigger:'onSpeed',kind:'speedMultiplier',multiplier:.5}]);
add('ironball','스피드가 절반이 되고 땅 기술의 공중 면역이 사라집니다.',[{trigger:'onSpeed',kind:'speedMultiplier',multiplier:.5}]);
add('laggingtail','같은 우선도 안에서 마지막에 행동합니다.');
add('quickclaw','매 턴 20% 확률로 같은 우선도 안에서 먼저 행동합니다.');
add('loadeddice','2~5회 연속 공격을 4~5회 맞힙니다.');
add('flameorb','턴 종료 시 지닌 포켓몬을 화상 상태로 만듭니다.');
add('toxicorb','턴 종료 시 지닌 포켓몬을 맹독 상태로 만듭니다.');
add('shellbell','피해를 준 뒤 입힌 피해의 1/8만큼 HP를 회복합니다.');
add('throatspray','소리 기술을 사용한 뒤 특수공격이 1단계 오르고 소모됩니다.');
add('mentalherb','도발·앵콜을 한 번 제거하고 소모됩니다.');
add('whiteherb','하락한 능력치를 한 번 복원하고 소모됩니다.');
// White Herb is handled directly by applyStatChange rather than a passive effect.
items.whiteherb.supported=true;
add('zoomlens','상대보다 늦게 행동하면 명중률이 1.2배가 됩니다.');
add('normalgem','첫 노말 타입 공격의 위력이 1.3배가 되고 소모됩니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'normal',multiplier:1.3}]);
add('bigroot','흡수 기술의 회복량이 1.3배가 됩니다.');
add('punchingglove','펀치 기술 위력이 1.1배가 되고 접촉 판정을 받지 않습니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'punch',multiplier:1.1}]);
add('shedshell','교체를 막는 효과가 있어도 교체할 수 있습니다.');
add('utilityumbrella','지닌 포켓몬에게 날씨의 공격·방어 보정이 적용되지 않습니다.');
add('floatstone','지닌 포켓몬의 실효 체중이 절반이 됩니다.');
add('rustedsword','자시안의 왕관폼을 부르는 녹슨검. 아이언헤드가 거수참으로 바뀝니다.');
add('rustedshield','자마젠타의 왕관폼을 부르는 녹슨방패. 아이언헤드가 거수탄으로 바뀝니다.');
add('airbellows','제피레온 전용 도구. 비행 타입 기술의 위력이 1.2배가 됩니다.',[
  {trigger:'onAttack',kind:'damageMultiplier',type:'flying',multiplier:1.2,speciesIds:['zephyreon']},
]);
items.airbellows.name='공기풀무';

const hitBerries:[string,string,number][]=[['absorbbulb','water',1],['cellbattery','electric',1],['luminousmoss','water',1],['snowball','ice',1]];
for(const [id,type,stages] of hitBerries)add(id,`${type} 타입 공격을 받으면 능력치가 상승하고 소모됩니다.`,[{trigger:'onAfterHit',kind:'stat',stat:id==='luminousmoss'?'spd':id==='snowball'||id==='cellbattery'?'atk':'spa',stages,type,consume:true}]);
add('adrenalineorb','위협으로 능력치가 내려가면 스피드가 1단계 오르고 소모됩니다.');
for(const [id,stat] of Object.entries({liechiberry:'atk',ganlonberry:'def',petayaberry:'spa',apicotberry:'spd',salacberry:'spe'}))
  add(id,'HP가 1/4 이하일 때 해당 능력치가 1단계 오르고 소모됩니다.',[{trigger:'onAfterDamage',kind:'stat',stat:stat as 'atk'|'def'|'spa'|'spd'|'spe',stages:1,threshold:.25,consume:true}]);
add('oranberry','HP가 절반 이하이면 HP 10을 회복하고 소모됩니다.');
for(const id of ['aguavberry','figyberry','iapapaberry','magoberry','wikiberry'])add(id,'HP가 1/4 이하이면 HP를 1/3 회복하고, 싫어하는 맛이면 혼란에 빠집니다.');
add('persimberry','혼란을 즉시 치유하고 소모됩니다.');
add('leppaberry','PP가 다 떨어진 기술 하나의 PP를 10 회복하고 소모됩니다.');
add('enigmaberry','효과가 굉장한 공격을 받으면 HP를 1/4 회복하고 소모됩니다.');
add('keeberry','물리 공격을 받으면 방어가 1단계 오르고 소모됩니다.',[{trigger:'onAfterHit',kind:'stat',stat:'def',stages:1,category:'physical',consume:true}]);
add('marangaberry','특수 공격을 받으면 특수방어가 1단계 오르고 소모됩니다.',[{trigger:'onAfterHit',kind:'stat',stat:'spd',stages:1,category:'special',consume:true}]);
for(const [id,field,stat] of [['electricseed','electric','def'],['grassyseed','grassy','def'],['mistyseed','misty','spd'],['psychicseed','psychic','spd']] as const)
  add(id,`${field} 필드에서 등장하면 ${stat}이 1단계 오르고 소모됩니다.`);
add('rockyhelmet','접촉 공격을 한 상대가 최대 HP의 1/6을 잃습니다.',[{trigger:'onContact',kind:'damage',fraction:1/6}]);
add('scopelens','급소 확률이 한 단계 오릅니다.',[{trigger:'onCritical',kind:'criticalBoost',stages:1}]);
add('razorclaw','급소 확률이 한 단계 오릅니다.',[{trigger:'onCritical',kind:'criticalBoost',stages:1}]);
add('kingsrock','피해를 주는 기술에 10% 풀죽음 효과를 더합니다.');
add('razorfang','피해를 주는 기술에 10% 풀죽음 효과를 더합니다.');
add('focusband','공격으로 기절할 때 10% 확률로 HP 1로 버팁니다.',[{trigger:'onDirectDamage',kind:'survive',consume:false,chance:10,requiresFullHp:false}]);
add('blunderpolicy','기술이 빗나가면 스피드가 2단계 오르고 소모됩니다.');
add('roomservice','트릭룸이 시작되면 스피드가 1단계 낮아지고 소모됩니다.');
add('redcard','공격을 받으면 상대를 강제 교체시키고 소모됩니다.');
add('ejectbutton','공격을 받으면 자신을 교체하고 소모됩니다.');
add('ejectpack','능력치가 내려가면 자신을 교체하고 소모됩니다.');
add('mirrorherb','상대의 능력치 상승을 한 번 복사하고 소모됩니다.');
add('abilityshield','특성 변경·무효화를 막습니다.');
add('metronome','같은 기술을 연속 사용하면 해당 기술의 위력이 점차 증가합니다.');
add('stickybarb','턴 종료 시 최대 HP의 1/8을 잃습니다. 접촉 공격자에게 옮겨갈 수 있습니다.');
add('bindingband','조이기 계열의 지속 피해를 최대 HP의 1/6으로 높입니다.');
add('gripclaw','조이기 계열 기술의 지속 시간을 7턴으로 고정합니다.');
add('ringtarget','타입 상성에 의한 면역을 무시하고 공격을 받습니다.');
add('boosterenergy','고대활성·쿼크차지의 능력치 상승을 한 번 발동하고 소모됩니다.');
add('destinyknot','헤롱헤롱 상태가 되면 상대도 헤롱헤롱 상태로 만듭니다.');
add('jabocaberry','물리 공격을 받으면 공격자에게 최대 HP의 1/8 피해를 주고 소모됩니다.');
add('rowapberry','특수 공격을 받으면 공격자에게 최대 HP의 1/8 피해를 주고 소모됩니다.');

for(const id of ['rustedsword','rustedshield','quickclaw','laggingtail','loadeddice','flameorb','toxicorb','blacksludge','electricseed','grassyseed','mistyseed','psychicseed',
  'protectivepads','shellbell','bigroot','throatspray','damprock','heatrock','icyrock','smoothrock','terrainextender','ringtarget','whiteherb','floatstone',
  'oranberry','figyberry','iapapaberry','magoberry','aguavberry','wikiberry','enigmaberry','persimberry','kingsrock','razorfang','zoomlens','stickybarb','shedshell','roomservice','leppaberry','mentalherb','destinyknot','adrenalineorb','blunderpolicy','jabocaberry','rowapberry'])
  if(items[id])items[id].supported=true;

export const plateTypes=plates;
export const svBattleItemOverrides=items;
