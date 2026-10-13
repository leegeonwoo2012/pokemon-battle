import type { BoostStat, Field, Item, Weather } from '../engine/types';
import { megaForms, zDefinitions, maxDefinitions } from './gimmicks.generated';
export { megaForms, powerMetadata } from './gimmicks.generated';
export const gimmickNames = {mega:'메가진화',tera:'테라스탈',z:'Z기술',dynamax:'다이맥스'};
export const exclusiveZMoves = [
  {speciesId:'kommoo',baseMove:'clangingscales',crystal:'kommoniumz',id:'clangoroussoulblaze',name:'브레이징소울비트',type:'dragon',category:'special',power:185,target:'allEnemies'},
  {speciesId:'mew',baseMove:'psychic',crystal:'mewniumz',id:'genesissupernova',name:'Genesis Supernova',type:'psychic',category:'special',power:185,target:'enemy'},
  {speciesId:'lycanroc',baseMove:'stoneedge',crystal:'lycaniumz',id:'splinteredstormshards',name:'Splintered Stormshards',type:'rock',category:'physical',power:190,target:'enemy'},
  {speciesId:'mimikyu',baseMove:'playrough',crystal:'mimikiumz',id:'letssnuggleforever',name:"Let's Snuggle Forever",type:'fairy',category:'physical',power:190,target:'enemy'},
  {speciesId:'incineroar',baseMove:'darkestlariat',crystal:'inciniumz',id:'maliciousmoonsault',name:'Malicious Moonsault',type:'dark',category:'physical',power:180,target:'enemy'},
  {speciesId:'lunala',baseMove:'moongeistbeam',crystal:'lunaliumz',id:'menacingmoonrazemaelstrom',name:'Menacing Moonraze Maelstrom',type:'ghost',category:'special',power:200,target:'enemy'},
  {speciesId:'primarina',baseMove:'sparklingaria',crystal:'primariumz',id:'oceanicoperetta',name:'Oceanic Operetta',type:'water',category:'special',power:195,target:'enemy'},
  {speciesId:'snorlax',baseMove:'gigaimpact',crystal:'snorliumz',id:'pulverizingpancake',name:'Pulverizing Pancake',type:'normal',category:'physical',power:210,target:'enemy'},
] as const;
const koreanTypes:Record<string,string>={normal:'노말',fire:'불꽃',water:'물',electric:'전기',grass:'풀',ice:'얼음',fighting:'격투',poison:'독',ground:'땅',flying:'비행',psychic:'에스퍼',bug:'벌레',rock:'바위',ghost:'고스트',dragon:'드래곤',dark:'악',steel:'강철',fairy:'페어리'};
export const gimmickItems: Item[] = [
  ...megaForms.map(form=>({id:form.stoneId,name:`메가스톤 · ${form.name} (${form.stoneName})`,description:`${form.speciesId} 전용 메가스톤. 이 폼으로 메가진화합니다.`,effects:[]})),
  ...zDefinitions.map(z=>({id:z.crystal,name:`${koreanTypes[z.type]} Z크리스탈 (${z.crystal})`,description:`${koreanTypes[z.type]} 타입 기술을 ${z.name}으로 바꿉니다.`,effects:[]})),
  ...exclusiveZMoves.map(z=>({id:z.crystal,name:z.crystal==='kommoniumz'?'짜랑고우거Z':`${z.name} 전용 Z크리스탈`,description:`${z.speciesId}의 ${z.baseMove}를 ${z.name}으로 바꿉니다.`,effects:[]})),
];
export const zMoves = Object.fromEntries(zDefinitions.map(z=>[z.type,z]));
export type MaxEffect = {weather:Weather}|{field:Field}|{stat:BoostStat;stages:number;side:'allies'|'foes'};
export const maxEffects: Record<string,MaxEffect> = {
  fire:{weather:'sun'},water:{weather:'rain'},rock:{weather:'sand'},ice:{weather:'snow'},
  grass:{field:'grassy'},electric:{field:'electric'},psychic:{field:'psychic'},fairy:{field:'misty'},
  fighting:{stat:'atk',stages:1,side:'allies'},poison:{stat:'spa',stages:1,side:'allies'},flying:{stat:'spe',stages:1,side:'allies'},
  steel:{stat:'def',stages:1,side:'allies'},ground:{stat:'spd',stages:1,side:'allies'},
  normal:{stat:'spe',stages:-1,side:'foes'},bug:{stat:'spa',stages:-1,side:'foes'},ghost:{stat:'def',stages:-1,side:'foes'},
  dark:{stat:'spd',stages:-1,side:'foes'},dragon:{stat:'atk',stages:-1,side:'foes'},
};
// PokeAPI move_names.csv, local_language_id=3. IDs/power remain the upstream definitions.
const maxNames: Record<string, string> = { normal:'다이어택',fire:'다이번',water:'다이스트림',electric:'다이썬더',grass:'다이그래스',ice:'다이아이스',fighting:'다이너클',poison:'다이애시드',ground:'다이어스',flying:'다이제트',psychic:'다이사이코',bug:'다이웜',rock:'다이록',ghost:'다이할로우',dragon:'다이드라군',dark:'다이아크',steel:'다이스틸',fairy:'다이페어리' };
export const maxMoves = Object.fromEntries(maxDefinitions.map(m=>[m.type,{...m,name:maxNames[m.type]}]));
// Forms here require a verified front/back pair in public/sprites/forms.
export type GmaxEffect = 'residual'|'paralysis'|'auroraveil'|'replenish'|'befuddle'|'critBoost'|'trap'|'sandblast'|'poison'|'fixedPower'|'clearField'|'stunShock'|'confuse'|'attraction'|'snooze'|'speedDrop'|'gravity'|'spikes'|'disable'|'allyHeal'|'steelsurge'|'depletion'|'bypassProtect'|'sweetness';
export const gmaxForms: Record<string,{id:string;name:string;type:string;effect:GmaxEffect}> = {
  venusaur:{id:'gmaxvinelash',name:'거다이편달',type:'grass',effect:'residual'},
  charizard:{id:'gmaxwildfire',name:'거다이옥염',type:'fire',effect:'residual'},
  blastoise:{id:'gmaxcannonade',name:'거다이포격',type:'water',effect:'residual'},
  butterfree:{id:'gmaxbefuddle',name:'거다이곤란',type:'bug',effect:'befuddle'},
  pikachu:{id:'gmaxvoltcrash',name:'거다이천도',type:'electric',effect:'paralysis'},
  meowth:{id:'gmaxgoldrush',name:'거다이금화',type:'normal',effect:'confuse'},
  machamp:{id:'gmaxchistrike',name:'거다이회심격',type:'fighting',effect:'critBoost'},
  gengar:{id:'gmaxterror',name:'거다이환영',type:'ghost',effect:'trap'},
  kingler:{id:'gmaxfoam',name:'거다이포말',type:'water',effect:'speedDrop'},
  lapras:{id:'gmaxresonance',name:'거다이선율',type:'ice',effect:'auroraveil'},
  eevee:{id:'gmaxcuddle',name:'거다이포옹',type:'normal',effect:'attraction'},
  snorlax:{id:'gmaxreplenish',name:'거다이재생',type:'normal',effect:'replenish'},
  garbodor:{id:'gmaxmalodor',name:'거다이악취',type:'poison',effect:'poison'},
  melmetal:{id:'gmaxmeltdown',name:'거다이융해',type:'steel',effect:'disable'},
  rillaboom:{id:'gmaxdrumsolo',name:'거다이난타',type:'grass',effect:'fixedPower'},
  cinderace:{id:'gmaxfireball',name:'거다이화염구',type:'fire',effect:'fixedPower'},
  inteleon:{id:'gmaxhydrosnipe',name:'거다이저격',type:'water',effect:'fixedPower'},
  corviknight:{id:'gmaxwindrage',name:'거다이풍격',type:'flying',effect:'clearField'},
  orbeetle:{id:'gmaxgravitas',name:'거다이중력',type:'psychic',effect:'gravity'},
  drednaw:{id:'gmaxstonesurge',name:'거다이암진',type:'rock',effect:'spikes'},
  coalossal:{id:'gmaxvolcalith',name:'거다이분석',type:'rock',effect:'residual'},
  flapple:{id:'gmaxsweetness',name:'거다이감미',type:'grass',effect:'sweetness'},
  appletun:{id:'gmaxsweetness',name:'거다이감미',type:'grass',effect:'sweetness'},
  sandaconda:{id:'gmaxsandblast',name:'거다이사가',type:'ground',effect:'sandblast'},
  toxtricity:{id:'gmaxstunshock',name:'거다이감전',type:'electric',effect:'stunShock'},
  toxtricitylowkey:{id:'gmaxstunshock',name:'거다이감전',type:'electric',effect:'stunShock'},
  centiskorch:{id:'gmaxcentiferno',name:'거다이일섬',type:'fire',effect:'residual'},
  hatterene:{id:'gmaxsmite',name:'거다이천벌',type:'fairy',effect:'confuse'},
  grimmsnarl:{id:'gmaxsnooze',name:'거다이수마',type:'dark',effect:'snooze'},
  alcremie:{id:'gmaxfinale',name:'거다이단맛',type:'fairy',effect:'allyHeal'},
  copperajah:{id:'gmaxsteelsurge',name:'거다이강철진',type:'steel',effect:'steelsurge'},
  duraludon:{id:'gmaxdepletion',name:'거다이감쇠',type:'dragon',effect:'depletion'},
  urshifu:{id:'gmaxoneblow',name:'거다이일격',type:'dark',effect:'bypassProtect'},
  urshifurapidstrike:{id:'gmaxrapidflow',name:'거다이연격',type:'water',effect:'bypassProtect'},
};
export function zPower(power:number):number {
  return [[140,200],[130,195],[120,190],[110,185],[100,180],[90,175],[80,160],[70,140],[60,120],[0,100]].find(([threshold])=>power>=threshold)![1];
}
export function maxPower(power:number,type:string):number {
  const reduced=['fighting','poison'].includes(type);
  return [[150,150,100],[110,140,95],[75,130,90],[65,120,85],[55,110,80],[45,100,75],[0,90,70]].find(([threshold])=>power>=threshold)![reduced?2:1];
}
