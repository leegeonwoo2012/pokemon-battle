import type { BoostStat, Field, Item, Weather } from '../engine/types';
import { megaForms, primalForms, zDefinitions, maxDefinitions } from './gimmicks.generated';
export { megaForms, primalForms, powerMetadata, ultraNecrozmaForm } from './gimmicks.generated';
export const gimmickNames = {mega:'메가진화',primal:'원시회귀',tera:'테라스탈',z:'Z기술',dynamax:'다이맥스'};
export const exclusiveZMoves = [
  {speciesId:'pikachu',baseMove:'volttackle',crystal:'pikaniumz',id:'catastropika',name:'필살피카슛',type:'electric',category:'physical',power:210,target:'enemy',contact:true},
  {speciesId:'pikachu',baseMove:'thunderbolt',crystal:'pikashuniumz',id:'10000000voltthunderbolt',name:'1000만볼트',type:'electric',category:'special',power:195,target:'enemy',critStage:1},
  {speciesId:'kommoo',baseMove:'clangingscales',crystal:'kommoniumz',id:'clangoroussoulblaze',name:'브레이징소울비트',type:'dragon',category:'special',power:185,target:'allEnemies'},
  {speciesId:'mew',baseMove:'psychic',crystal:'mewniumz',id:'genesissupernova',name:'오리진즈슈퍼노바',type:'psychic',category:'special',power:185,target:'enemy',afterHit:'psychicTerrain'},
  {speciesId:'lycanroc',baseMove:'stoneedge',crystal:'lycaniumz',id:'splinteredstormshards',name:'레이디얼에지스톰',type:'rock',category:'physical',power:190,target:'enemy',afterHit:'clearTerrain'},
  {speciesId:'mimikyu',baseMove:'playrough',crystal:'mimikiumz',id:'letssnuggleforever',name:'투닥투닥프렌드타임',type:'fairy',category:'physical',power:190,target:'enemy',contact:true},
  {speciesId:'incineroar',baseMove:'darkestlariat',crystal:'inciniumz',id:'maliciousmoonsault',name:'하이퍼다크크러셔',type:'dark',category:'physical',power:180,target:'enemy',contact:true},
  {speciesId:'lunala',baseMove:'moongeistbeam',crystal:'lunaliumz',id:'menacingmoonrazemaelstrom',name:'문라이트블래스터',type:'ghost',category:'special',power:200,target:'enemy',ignoreAbility:true},
  {speciesId:'primarina',baseMove:'sparklingaria',crystal:'primariumz',id:'oceanicoperetta',name:'바다의심포니',type:'water',category:'special',power:195,target:'enemy'},
  {speciesId:'snorlax',baseMove:'gigaimpact',crystal:'snorliumz',id:'pulverizingpancake',name:'진심의공격',type:'normal',category:'physical',power:210,target:'enemy',contact:true},
  {speciesId:'eevee',baseMove:'lastresort',crystal:'eeviumz',id:'extremeevoboost',name:'나인이볼부스트',type:'normal',category:'status',power:0,target:'self',effects:['atk','def','spa','spd','spe'].map(stat=>({kind:'stat' as const,stat:stat as 'atk'|'def'|'spa'|'spd'|'spe',stages:2,target:'self' as const}))},
  ...(['tapukoko','tapulele','tapubulu','tapufini'] as const).map(speciesId=>({speciesId,baseMove:'naturesmadness',crystal:'tapuniumz',id:'guardianofalola',name:'알로라의수호자',type:'fairy',category:'special' as const,power:0,target:'enemy' as const,fixedHpFraction:.75,fixedHpBasis:'current' as const})),
  {speciesId:'necrozmaduskmane',baseMove:'photongeyser',crystal:'ultranecroziumz',id:'lightthatburnsthesky',name:'하늘을태우는멸망의빛',type:'psychic',category:'special',power:200,target:'enemy',ignoreAbility:true,ultraBurst:true},
  {speciesId:'necrozmadawnwings',baseMove:'photongeyser',crystal:'ultranecroziumz',id:'lightthatburnsthesky',name:'하늘을태우는멸망의빛',type:'psychic',category:'special',power:200,target:'enemy',ignoreAbility:true,ultraBurst:true},
  {speciesId:'solgaleo',baseMove:'sunsteelstrike',crystal:'solganiumz',id:'searingsunrazesmash',name:'선샤인스매셔',type:'steel',category:'physical',power:200,target:'enemy',contact:true,ignoreAbility:true},
  {speciesId:'decidueye',baseMove:'spiritshackle',crystal:'decidiumz',id:'sinisterarrowraid',name:'섀도애로우즈스트라이크',type:'ghost',category:'physical',power:180,target:'enemy'},
  {speciesId:'marshadow',baseMove:'spectralthief',crystal:'marshadiumz',id:'soulstealing7starstrike',name:'칠성탈혼퇴',type:'ghost',category:'physical',power:195,target:'enemy',contact:true},
  {speciesId:'raichualola',baseMove:'thunderbolt',crystal:'aloraichiumz',id:'stokedsparksurfer',name:'라이트닝서프라이드',type:'electric',category:'special',power:175,target:'enemy',effects:[{kind:'status',status:'paralysis',chance:100}]},
] as const;
const koreanTypes:Record<string,string>={normal:'노말',fire:'불꽃',water:'물',electric:'전기',grass:'풀',ice:'얼음',fighting:'격투',poison:'독',ground:'땅',flying:'비행',psychic:'에스퍼',bug:'벌레',rock:'바위',ghost:'고스트',dragon:'드래곤',dark:'악',steel:'강철',fairy:'페어리'};
export const gimmickItems: Item[] = [
  ...megaForms.filter(form=>form.stoneId!=='dragonascent').map(form=>({id:form.stoneId,name:`메가스톤 · ${form.name} (${form.stoneName})`,description:`${form.speciesId} 전용 메가스톤. 이 폼으로 메가진화합니다.`,effects:[]})),
  ...primalForms.map(form=>({id:form.orbId,name:`${form.orbName} · ${form.name}`,description:`${form.speciesId}이(가) 지니고 등장하면 원시회귀합니다.`,effects:[]})),
  ...zDefinitions.map(z=>({id:z.crystal,name:`${koreanTypes[z.type]} Z크리스탈 (${z.crystal})`,description:`${koreanTypes[z.type]} 타입 기술을 ${z.name}으로 바꿉니다.`,effects:[]})),
  ...new Map(exclusiveZMoves.map(z=>[z.crystal,{id:z.crystal,name:z.crystal==='kommoniumz'?'짜랑고우거Z':`${z.name} 전용 Z크리스탈`,description:`호환 포켓몬의 지정 기술을 ${z.name}으로 바꿉니다.`,effects:[]}])).values(),
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
