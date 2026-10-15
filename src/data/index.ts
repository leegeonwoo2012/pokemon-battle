import { roster, importedAbilities } from './roster.generated';
import { legendaryRoster, legendaryAbilities, restrictedNationalDex } from './legendary-roster.generated';
import { legacyRoster } from './legacy-roster.generated';
import { signatureRoster } from './signature-roster.generated';
import { expansionRoster } from './expansion-roster.generated';
import { svItemCatalog } from './sv-items.generated';
import { svBattleItemOverrides } from './sv-items';
import { gimmickItems } from './gimmicks';
import { championMoves } from './champion-moves.generated';
import type { Ability, Item, Move, Nature, Species, TeamSet } from '../engine/types';

/** Custom battle rules with a generated Regulation M-C team-selectable roster. */

export const typeChart: Record<string, Partial<Record<string, number>>> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export const typeNames: Record<string, string> = {
  normal: '노말', fire: '불꽃', water: '물', electric: '전기', grass: '풀', ice: '얼음',
  fighting: '격투', poison: '독', ground: '땅', flying: '비행', psychic: '에스퍼',
  bug: '벌레', rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악',
  steel: '강철', fairy: '페어리', stellar:'스텔라',
};

const move = (
  id: string, name: string, type: string, category: Move['category'], power: number,
  accuracy: number | null, pp: number, target: Move['target'] = 'enemy',
  effects?: Move['effects'], priority = 0, contact = false,
): Move => ({ id, name, type, category, power, accuracy, pp, target, effects, priority, contact });

export const moves: Record<string, Move> = Object.fromEntries(([
  move('tackle', '몸통박치기', 'normal', 'physical', 40, 100, 35, 'enemy', undefined, 0, true),
  move('transform', '변신', 'normal', 'status', 0, null, 10, 'enemy'),
  move('torchsong','플레어송','fire','special',80,100,10,'enemy',[{kind:'stat',stat:'spa',stages:1,target:'self'}]),
  move('aquastep','아쿠아스텝','water','physical',80,100,10,'enemy',[{kind:'stat',stat:'spe',stages:1,target:'self'}],0,true),
  move('kowtowcleave','도각참','dark','physical',85,null,10,'enemy',undefined,0,true),
  move('headlongrush','들이받기','ground','physical',120,100,5,'enemy',[{kind:'stat',stat:'def',stages:-1,target:'self'},{kind:'stat',stat:'spd',stages:-1,target:'self'}],0,true),
  move('wavecrash','웨이브태클','water','physical',120,100,10,'enemy',[{kind:'recoil',fraction:1/3}],0,true),
  move('woodhammer','우드해머','grass','physical',120,100,15,'enemy',[{kind:'recoil',fraction:1/3}],0,true),
  move('bravebird','브레이브버드','flying','physical',120,100,15,'any',[{kind:'recoil',fraction:1/3}],0,true),
  move('dracometeor','용성군','dragon','special',130,90,5,'enemy',[{kind:'stat',stat:'spa',stages:-2,target:'self'}]),
  move('overheat','오버히트','fire','special',130,90,5,'enemy',[{kind:'stat',stat:'spa',stages:-2,target:'self'}]),
  move('superpower','엄청난힘','fighting','physical',120,100,5,'enemy',[{kind:'stat',stat:'atk',stages:-1,target:'self'},{kind:'stat',stat:'def',stages:-1,target:'self'}],0,true),
  move('leafblade','리프블레이드','grass','physical',90,100,15,'enemy',undefined,0,true),
  move('powerwhip','파워휩','grass','physical',120,85,10,'enemy',undefined,0,true),
  move('megahorn','메가혼','bug','physical',120,85,10,'enemy',undefined,0,true),
  move('liquidation','아쿠아브레이크','water','physical',85,100,10,'enemy',[{kind:'stat',stat:'def',stages:-1,chance:20}],0,true),
  move('boomburst','폭음파','normal','special',140,100,10,'allOthers'),
  move('stoneaxe','암석액스','rock','physical',65,90,15,'enemy',[{kind:'hazard',hazard:'stealthrock'}],0,true),
  move('ceaselessedge','비검천중파','dark','physical',65,90,15,'enemy',[{kind:'hazard',hazard:'spikes'}],0,true),
  move('triplearrows','3연화살','fighting','physical',90,100,10,'enemy',[{kind:'stat',stat:'def',stages:-1,chance:50},{kind:'volatile',condition:'flinch',chance:30}]),
  move('blizzard','눈보라','ice','special',110,70,5,'allEnemies',[{kind:'status',status:'freeze',chance:10}]),
  move('focusblast','기합구슬','fighting','special',120,70,5,'enemy',[{kind:'stat',stat:'spd',stages:-1,chance:10}]),
  move('gunkshot','더스트슈트','poison','physical',120,80,5,'enemy',[{kind:'status',status:'poison',chance:30}]),
  move('poisonjab','독찌르기','poison','physical',80,100,20,'enemy',[{kind:'status',status:'poison',chance:30}],0,true),
  move('psychocut','사이코커터','psychic','physical',70,100,20),
  move('nightslash','깜짝베기','dark','physical',70,100,20,'enemy',undefined,0,true),
  move('aerialace','제비반환','flying','physical',60,null,20,'any',undefined,0,true),
  move('hyperbeam','파괴광선','normal','special',150,90,5,'enemy',[{kind:'recharge'}]),
  move('frenzyplant','하드플랜트','grass','special',150,90,5,'enemy',[{kind:'recharge'}]),
  move('blastburn','블라스트번','fire','special',150,90,5,'enemy',[{kind:'recharge'}]),
  move('hydrocannon','하이드로캐논','water','special',150,90,5,'enemy',[{kind:'recharge'}]),
  move('irontail','아이언테일','steel','physical',100,75,15,'enemy',[{kind:'stat',stat:'def',stages:-1,chance:30}],0,true),
  move('headsmash','양날박치기','rock','physical',150,80,5,'enemy',[{kind:'recoil',fraction:0.5}],0,true),
  move('volttackle','볼트태클','electric','physical',120,100,15,'enemy',[{kind:'status',status:'paralysis',chance:10},{kind:'recoil',fraction:1/3}],0,true),
  move('doubleedge','이판사판태클','normal','physical',120,100,15,'enemy',[{kind:'recoil',fraction:1/3}],0,true),
  move('crabhammer','집게해머','water','physical',100,95,10,'enemy',undefined,0,true),
  move('crosschop','크로스촙','fighting','physical',100,80,5,'enemy',undefined,0,true),
  move('sludgewave','오물웨이브','poison','special',95,100,10,'allOthers',[{kind:'status',status:'poison',chance:10}]),
  move('scald','열탕','water','special',80,100,15,'enemy',[{kind:'status',status:'burn',chance:30}]),
  move('highhorsepower','10만마력','ground','physical',95,95,10,'enemy',undefined,0,true),
  move('seedbomb','씨폭탄','grass','physical',80,100,15),
  move('meteorassault','스타어설트','fighting','physical',170,100,5,'enemy',[{kind:'recharge'}]),
  move('rockwrecker','암석포','rock','physical',150,90,5,'enemy',[{kind:'recharge'}]),
  move('twinbeam','트윈빔','psychic','special',40,100,10),
  move('psyshieldbash','배리어러시','psychic','physical',90,90,10,'enemy',[{kind:'stat',stat:'def',stages:1,target:'self'}],0,true),
  move('bonerush','본러시','ground','physical',30,90,10),
  move('nightdaze','나이트버스트','dark','special',90,95,10,'enemy',[{kind:'stat',stat:'accuracy',stages:-1,chance:40}]),
  move('bittermalice','천추지한','ghost','special',75,100,10,'enemy',[{kind:'stat',stat:'atk',stages:-1}]),
  move('fierydance','불꽃춤','fire','special',80,100,10,'enemy',[{kind:'stat',stat:'spa',stages:1,chance:50,target:'self'}]),
  move('watershuriken','물수리검','water','special',15,100,20,'enemy',undefined,1),
  move('lightofruin','파멸의빛','fairy','special',140,90,5,'enemy',[{kind:'recoil',fraction:.5}]),
  move('mountaingale','빙산바람','ice','physical',120,85,10,'enemy',[{kind:'volatile',condition:'flinch',chance:30}]),
  move('firelash','불꽃채찍','fire','physical',90,100,15,'enemy',[{kind:'stat',stat:'def',stages:-1}],0,true),
  move('tropkick','트로피컬킥','grass','physical',85,100,15,'enemy',[{kind:'stat',stat:'atk',stages:-1}],0,true),
  move('snipeshot','노려맞히기','water','special',85,100,15),
  move('gravapple','G의힘','grass','physical',90,100,10,'enemy',[{kind:'stat',stat:'def',stages:-1}]),
  move('appleacid','사과산','grass','special',90,100,10,'enemy',[{kind:'stat',stat:'spd',stages:-1}]),
  move('shiftgear','기어체인지','steel','status',0,null,10,'self',[{kind:'stat',stat:'atk',stages:1,target:'self'},{kind:'stat',stat:'spe',stages:2,target:'self'}]),
  move('spiritbreak','소울크래시','fairy','physical',75,100,15,'enemy',[{kind:'stat',stat:'spa',stages:-1}],0,true),
  move('luminacrash','루미나콜리전','psychic','special',80,100,10,'enemy',[{kind:'stat',stat:'spd',stages:-2}]),
  move('jetpunch','제트펀치','water','physical',60,100,15,'enemy',undefined,1,true),
  move('mortalspin','킬러스핀','poison','physical',30,100,15,'allEnemies',[{kind:'status',status:'poison'},{kind:'clearHazards'}],0,true),
  move('quickattack', '전광석화', 'normal', 'physical', 40, 100, 30, 'enemy', undefined, 1, true),
  move('return', '은혜갚기', 'normal', 'physical', 90, 100, 20, 'enemy', undefined, 0, true),
  move('hypervoice', '하이퍼보이스', 'normal', 'special', 90, 100, 10, 'allEnemies'),
  move('flamethrower', '화염방사', 'fire', 'special', 90, 100, 15, 'enemy', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('fireblast', '불대문자', 'fire', 'special', 110, 85, 5, 'enemy', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('flareblitz', '플레어드라이브', 'fire', 'physical', 120, 100, 15, 'enemy', [{ kind: 'recoil', fraction: 1 / 3 }], 0, true),
  move('heatwave', '열풍', 'fire', 'special', 95, 90, 10, 'allEnemies', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('waterpulse', '물의파동', 'water', 'special', 60, 100, 20, 'enemy', [{kind:'volatile', condition:'confusion', chance:20}]),
  move('surf', '파도타기', 'water', 'special', 90, 100, 15, 'allOthers'),
  move('hydropump', '하이드로펌프', 'water', 'special', 110, 80, 5),
  move('waterfall', '폭포오르기', 'water', 'physical', 80, 100, 15, 'enemy', [{kind:'volatile', condition:'flinch', chance:20}], 0, true),
  move('thunderbolt', '10만볼트', 'electric', 'special', 90, 100, 15, 'enemy', [{ kind: 'status', status: 'paralysis', chance: 10 }]),
  move('thunder', '번개', 'electric', 'special', 110, 70, 10, 'enemy', [{ kind: 'status', status: 'paralysis', chance: 30 }]),
  move('spark', '스파크', 'electric', 'physical', 65, 100, 20, 'enemy', [{ kind: 'status', status: 'paralysis', chance: 30 }], 0, true),
  move('energyball', '에너지볼', 'grass', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('leafstorm', '리프스톰', 'grass', 'special', 130, 90, 5, 'enemy', [{ kind: 'stat', stat: 'spa', stages: -2, target: 'self' }]),
  move('gigadrain', '기가드레인', 'grass', 'special', 75, 100, 10, 'enemy', [{ kind: 'drain', fraction: 0.5 }]),
  move('razorleaf', '잎날가르기', 'grass', 'physical', 55, 95, 25, 'allEnemies'),
  move('icebeam', '냉동빔', 'ice', 'special', 90, 100, 10, 'enemy', [{ kind: 'status', status: 'freeze', chance: 10 }]),
  move('icywind', '얼다바람', 'ice', 'special', 55, 95, 15, 'allEnemies', [{ kind: 'stat', stat: 'spe', stages: -1 }]),
  move('closecombat', '인파이트', 'fighting', 'physical', 120, 100, 5, 'enemy', [
    { kind: 'stat', stat: 'def', stages: -1, target: 'self' }, { kind: 'stat', stat: 'spd', stages: -1, target: 'self' },
  ], 0, true),
  move('aurasphere', '파동탄', 'fighting', 'special', 80, null, 20),
  move('drainpunch', '드레인펀치', 'fighting', 'physical', 75, 100, 10, 'enemy', [{ kind: 'drain', fraction: 0.5 }], 0, true),
  move('sludgebomb', '오물폭탄', 'poison', 'special', 90, 100, 10, 'enemy', [{ kind: 'status', status: 'poison', chance: 30 }]),
  move('earthquake', '지진', 'ground', 'physical', 100, 100, 10, 'allOthers'),
  move('earthpower', '대지의힘', 'ground', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('airslash', '에어슬래시', 'flying', 'special', 75, 95, 15, 'enemy', [{kind:'volatile', condition:'flinch', chance:30}]),
  move('hurricane', '폭풍', 'flying', 'special', 110, 70, 10, 'enemy', [{kind:'volatile', condition:'confusion', chance:30}]),
  move('psychic', '사이코키네시스', 'psychic', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('xscissor', '시저크로스', 'bug', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
  move('bugbuzz', '벌레의야단법석', 'bug', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('rockslide', '스톤샤워', 'rock', 'physical', 75, 90, 10, 'allEnemies', [{kind:'volatile', condition:'flinch', chance:30}]),
  move('stoneedge', '스톤에지', 'rock', 'physical', 100, 80, 5),
  move('shadowball', '섀도볼', 'ghost', 'special', 80, 100, 15, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 20 }]),
  move('shadowclaw', '섀도클로', 'ghost', 'physical', 70, 100, 15, 'enemy', undefined, 0, true),
  move('dragonclaw', '드래곤클로', 'dragon', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
  move('dragonpulse', '용의파동', 'dragon', 'special', 85, 100, 10),
  move('darkpulse', '악의파동', 'dark', 'special', 80, 100, 15, 'enemy', [{kind:'volatile', condition:'flinch', chance:20}]),
  move('crunch', '깨물어부수기', 'dark', 'physical', 80, 100, 15, 'enemy', [{ kind: 'stat', stat: 'def', stages: -1, chance: 20 }], 0, true),
  move('ironhead', '아이언헤드', 'steel', 'physical', 80, 100, 15, 'enemy', [{kind:'volatile', condition:'flinch', chance:30}], 0, true),
  move('flashcannon', '러스터캐논', 'steel', 'special', 80, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('dazzlinggleam', '매지컬샤인', 'fairy', 'special', 80, 100, 10, 'allEnemies'),
  move('moonblast', '문포스', 'fairy', 'special', 95, 100, 15, 'enemy', [{ kind: 'stat', stat: 'spa', stages: -1, chance: 30 }]),
  move('thunderwave', '전기자석파', 'electric', 'status', 0, 90, 20, 'enemy', [{ kind: 'status', status: 'paralysis' }]),
  move('sleeppowder', '수면가루', 'grass', 'status', 0, 75, 15, 'enemy', [{ kind: 'status', status: 'sleep' }]),
  move('willowisp', '도깨비불', 'fire', 'status', 0, 85, 15, 'enemy', [{ kind: 'status', status: 'burn' }]),
  move('swordsdance', '칼춤', 'normal', 'status', 0, null, 20, 'self', [{ kind: 'stat', stat: 'atk', stages: 2, target: 'self' }]),
  move('irondefense', '철벽', 'steel', 'status', 0, null, 15, 'self', [{ kind: 'stat', stat: 'def', stages: 2, target: 'self' }]),
  move('calmmind', '명상', 'psychic', 'status', 0, null, 20, 'self', [
    { kind: 'stat', stat: 'spa', stages: 1, target: 'self' }, { kind: 'stat', stat: 'spd', stages: 1, target: 'self' },
  ]),
  move('dragondance', '용의춤', 'dragon', 'status', 0, null, 20, 'self', [
    { kind: 'stat', stat: 'atk', stages: 1, target: 'self' }, { kind: 'stat', stat: 'spe', stages: 1, target: 'self' },
  ]),
  move('recover', 'HP회복', 'normal', 'status', 0, null, 5, 'self', [{ kind: 'heal', fraction: 0.5, target: 'self' }]),
  move('roost', '날개쉬기', 'flying', 'status', 0, null, 5, 'self', [{ kind: 'heal', fraction: 0.5, target: 'self' }]),
  move('protect', '방어', 'normal', 'status', 0, null, 5, 'self', [{ kind: 'protect' }], 4),
  move('raindance', '비바라기', 'water', 'status', 0, null, 5, 'self', [{ kind: 'weather', weather: 'rain', turns: 5 }]),
  move('sunnyday', '쾌청', 'fire', 'status', 0, null, 5, 'self', [{ kind: 'weather', weather: 'sun', turns: 5 }]),
  move('electricterrain', '일렉트릭필드', 'electric', 'status', 0, null, 10, 'self', [{ kind: 'field', field: 'electric', turns: 5 }]),
  move('grassyterrain', '그래스필드', 'grass', 'status', 0, null, 10, 'self', [{ kind: 'field', field: 'grassy', turns: 5 }]),
  move('mistyterrain', '미스트필드', 'fairy', 'status', 0, null, 10, 'self', [{kind:'field', field:'misty', turns:5}]),
  move('psychicterrain', '사이코필드', 'psychic', 'status', 0, null, 10, 'self', [{kind:'field', field:'psychic', turns:5}]),
  move('sandstorm', '모래바람', 'rock', 'status', 0, null, 5, 'self', [{kind:'weather', weather:'sand', turns:5}]),
  move('snowscape', '설경', 'ice', 'status', 0, null, 5, 'self', [{kind:'weather', weather:'snow', turns:5}]),
  move('confuseray', '이상한빛', 'ghost', 'status', 0, 100, 10, 'enemy', [{kind:'volatile', condition:'confusion'}]),
  move('pyroball', '화염볼', 'fire', 'physical', 120, 90, 5, 'enemy', [{kind:'status', status:'burn', chance:10}]),
  move('overdrive', '오버드라이브', 'electric', 'special', 80, 100, 10, 'allEnemies'),
  move('drumbeating', '드럼어택', 'grass', 'physical', 80, 100, 10, 'enemy', [{kind:'stat', stat:'spe', stages:-1}]),
  move('matchagotcha', '휘적휘적포', 'grass', 'special', 80, 90, 15, 'allEnemies', [{kind:'drain', fraction:0.5},{kind:'status', status:'burn', chance:20}]),
  move('flowertrick', '트릭플라워', 'grass', 'physical', 70, null, 10, 'enemy', undefined, 0, false),
  move('glaciate', '얼어붙은세계', 'ice', 'special', 65, 95, 10, 'allEnemies', [{kind:'stat', stat:'spe', stages:-1}]),
  move('sandsearstorm', '열사의폭풍', 'ground', 'special', 100, 80, 10, 'allEnemies', [{kind:'status', status:'burn', chance:20}]),
  move('bleakwindstorm', '찬바람폭풍', 'flying', 'special', 100, 80, 10, 'allEnemies', [{kind:'stat', stat:'spe', stages:-1, chance:30}]),
  move('springtidestorm', '봄의폭풍', 'fairy', 'special', 100, 80, 5, 'allEnemies', [{kind:'stat', stat:'atk', stages:-1, chance:30}]),
  move('armorcannon', '아머캐논', 'fire', 'special', 120, 100, 5, 'enemy', [{kind:'stat', stat:'def', stages:-1, target:'self'},{kind:'stat', stat:'spd', stages:-1, target:'self'}]),
  move('accelerock', '액셀록', 'rock', 'physical', 40, 100, 20, 'enemy', undefined, 1, true),
  move('makeitrain', '골드러시', 'steel', 'special', 120, 95, 5, 'allEnemies', [{kind:'stat', stat:'spa', stages:-2, target:'self'}]),
  move('bitterblade', '원념의칼', 'fire', 'physical', 90, 100, 10, 'enemy', [{kind:'drain', fraction:0.5}], 0, true),
  move('clangingscales', '스케일노이즈', 'dragon', 'special', 110, 100, 5, 'allEnemies', [{kind:'stat', stat:'def', stages:-1, target:'self'}]),
  move('darkvoid', '다크홀', 'dark', 'status', 0, 50, 10, 'allEnemies', [{kind:'status', status:'sleep'}]),
  move('stealthrock','스텔스록','rock','status',0,null,20,'self',[{kind:'hazard',hazard:'stealthrock'}]),
  move('spikes','압정뿌리기','ground','status',0,null,20,'self',[{kind:'hazard',hazard:'spikes'}]),
  move('toxicspikes','독압정','poison','status',0,null,20,'self',[{kind:'hazard',hazard:'toxicspikes'}]),
  move('stickyweb','끈적끈적네트','bug','status',0,null,20,'self',[{kind:'hazard',hazard:'stickyweb'}]),
  move('reflect','리플렉터','psychic','status',0,null,20,'self',[{kind:'screen',screen:'reflect'}]),
  move('lightscreen','빛의장막','psychic','status',0,null,30,'self',[{kind:'screen',screen:'lightscreen'}]),
  move('auroraveil','오로라베일','ice','status',0,null,20,'self',[{kind:'screen',screen:'auroraveil'}]),
  move('trickroom','트릭룸','psychic','status',0,null,5,'self',[{kind:'trickroom'}],-7),
  move('gravity','중력','psychic','status',0,null,5,'self',[{kind:'gravity'}]),
  move('substitute','대타출동','normal','status',0,null,10,'self',[{kind:'substitute'}]),
  move('roar','울부짖기','normal','status',0,null,20,'enemy',[{kind:'forceSwitch'}],-6),
  move('whirlwind','날려버리기','normal','status',0,null,20,'enemy',[{kind:'forceSwitch'}],-6),
  {...move('fissure','땅가르기','ground','physical',1,30,5),ohko:true},
  {...move('horndrill','뿔드릴','normal','physical',1,30,5),ohko:true},
  {...move('guillotine','가위자르기','normal','physical',1,30,5),ohko:true},
  {...move('sheercold','절대영도','ice','special',1,30,5),ohko:true},
  {...move('futuresight','미래예지','psychic','special',120,100,10),delayedTurns:2},
  {...move('doomdesire','파멸의소원','steel','special',140,100,5),delayedTurns:2},
  move('terablast','테라버스트','normal','special',80,100,10),
  move('playrough','치근거리기','fairy','physical',90,90,10,'enemy',[{kind:'stat',stat:'atk',stages:-1,chance:10}],0,true),
  {...move('darkestlariat','DD래리어트','dark','physical',85,100,10,'enemy',undefined,0,true),ignoreDefenderStages:true},
  {...move('moongeistbeam','섀도레이','ghost','special',100,100,5),ignoreAbility:true},
  move('sparklingaria','물거품아리아','water','special',90,100,10,'allOthers',[{kind:'cureBurn'}]),
  move('gigaimpact','기가임팩트','normal','physical',150,90,5,'enemy',[{kind:'recharge'}],0,true),
  move('tailwind','순풍','flying','status',0,null,15,'self',[{kind:'tailwind'}]),
  move('taunt','도발','dark','status',0,100,20,'enemy',[{kind:'taunt'}]),
  move('encore','앵콜','normal','status',0,100,5,'enemy',[{kind:'encore'}]),
  move('rapidspin','고속스핀','normal','physical',50,100,40,'enemy',[{kind:'clearHazards'},{kind:'stat',stat:'spe',stages:1,target:'self'}],0,true),
  move('defog','안개제거','flying','status',0,null,15,'enemy',[{kind:'stat',stat:'evasion',stages:-1},{kind:'clearHazards',bothSides:true,screens:true}]),
  {...move('bulletseed','기관총','grass','physical',25,100,30),multihit:[2,5]},
  {...move('iciclespear','고드름침','ice','physical',25,100,30),multihit:[2,5]},
  {...move('populationbomb','찍찍베기','normal','physical',20,90,10,'enemy',undefined,0,true),multihit:10,multiaccuracy:true},
  move('gigatonhammer','거대해머','steel','physical',160,100,5),
  move('saltcure','소금절이','rock','physical',40,100,15,'enemy',[{kind:'saltCure'}]),
  {...move('dragondarts','드래곤애로','dragon','physical',50,100,10),multihit:2},
] as Move[]).map(entry => [entry.id, entry]));
for(const [id,entry] of Object.entries(championMoves))if(!moves[id])moves[id]=entry;
// Spectral Thief is marked Past by the pinned modern format, but remains Marshadow's
// exclusive move. Keep its canonical Gen 7 move data for the explicit signature roster.
moves.spectralthief={...move('spectralthief','섀도스틸','ghost','physical',90,100,10,'enemy',undefined,0,true),bypassSubstitute:true,stealsBoosts:true};
moves.sunsteelstrike={...moves.sunsteelstrike,ignoreAbility:true};
moves.moongeistbeam={...moves.moongeistbeam,ignoreAbility:true};
moves.coreenforcer={...moves.coreenforcer,effects:[{kind:'suppressAbility'}]};
moves.thousandarrows={...moves.thousandarrows,ignoreImmunity:['ground'],groundsTarget:true};
moves.thousandwaves={...moves.thousandwaves,effects:[{kind:'trap'}]};
// These source moves use callbacks or targeting rules the generated data cannot infer.
moves.storedpower.dynamicPower='positiveBoosts';
moves.toxic.effects=[{kind:'status',status:'poison',badlyPoisoned:true}];
moves.entrainment.target='any';
moves.lifedew.target='allAllies';
moves.lifedew.effects=[{kind:'heal',fraction:1/4,target:'target'}];
moves.howl.target='allAllies';moves.howl.effects=[{kind:'stat',stat:'atk',stages:1,target:'target'}];moves.howl.sound=true;
moves.helpinghand.effects=[{kind:'helpingHand'}];moves.helpinghand.bypassProtect=true;
moves.dragoncheer.effects=[{kind:'dragonCheer'}];moves.dragoncheer.bypassProtect=true;
moves.acupressure.target='allyOrSelf';moves.acupressure.effects=[{kind:'acupressure'}];moves.acupressure.bypassProtect=true;
moves.healpulse.effects=[{kind:'heal',fraction:1/2,target:'target',pulseBoost:true}];
moves.milkdrink.target='self';
moves.coaching.bypassProtect=true;
moves.aromaticmist.bypassProtect=true;
moves.decorate.target='any';moves.decorate.bypassProtect=true;
moves.pollenpuff.target='any';
moves.healbell.effects=[{kind:'teamCure'}];
for (const id of ['stoneedge','shadowclaw','razorleaf']) moves[id].critStage = 1;
for (const id of ['leafblade','triplearrows','psychocut','nightslash','crabhammer','crosschop'])moves[id].critStage=1;
for (const id of ['thunder','hurricane']) moves[id].weatherAccuracy = {rain:null, sun:50};
moves.blizzard.weatherAccuracy={snow:null};
moves.sleeppowder.powder = true;
moves.flareblitz.thawsUser = true;
moves.flowertrick.critStage = 3;
moves.snipeshot.critStage=1;
for(const id of ['drainpunch','firepunch','icepunch','thunderpunch','machpunch','bulletpunch','closecombat','jetpunch','hammerarm','gigatonhammer'])if(moves[id])moves[id].punch=true;
for(const id of ['shadowball','sludgebomb','focusblast','energyball','gyroball','weatherball','zapcannon','rockblast','bulletseed','seedbomb','electroball','octazooka'])if(moves[id])moves[id].bullet=true;
for(const id of ['torchsong','boomburst','hypervoice','bugbuzz','overdrive','roar','snarl','sing','uproar','round','disarmingvoice','sparklingaria'])if(moves[id])moves[id].sound=true;
moves.twinbeam.multihit=2;
moves.bonerush.multihit=[2,5];
moves.watershuriken.multihit=[2,5];

const ability = (id: string, name: string, description: string, effects: Ability['effects']): Ability => ({ id, name, description, effects });
export const abilities: Record<string, Ability> = Object.fromEntries(([
  ability('static', '정전기', '접촉 공격을 받으면 30% 확률로 상대를 마비시킵니다.', [{ trigger: 'onContact', kind: 'status', status: 'paralysis', chance: 30 }]),
  ability('blaze', '맹화', 'HP가 낮으면 불꽃 기술 위력이 1.5배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'fire', multiplier: 1.5, condition: 'lowHp' }]),
  ability('torrent', '급류', 'HP가 낮으면 물 기술 위력이 1.5배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'water', multiplier: 1.5, condition: 'lowHp' }]),
  ability('overgrow', '심록', 'HP가 낮으면 풀 기술 위력이 1.5배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'grass', multiplier: 1.5, condition: 'lowHp' }]),
  ability('intimidate', '위협', '등장할 때 상대의 공격을 1단계 낮춥니다.', [{ trigger: 'onEnter', kind: 'stat', target: 'foes', stat: 'atk', stages: -1 }]),
  ability('levitate', '부유', '땅타입 공격을 받지 않습니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'ground' }]),
  ability('multiscale', '멀티스케일', 'HP가 가득 찼을 때 받는 피해가 절반이 됩니다.', [{ trigger: 'onDamage', kind: 'damageMultiplier', multiplier: 0.5, condition: 'fullHp' }]),
  ability('swiftSwim', '쓱쓱', '비가 오면 스피드가 2배가 됩니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', weather: 'rain', multiplier: 2 }]),
  ability('chlorophyll', '엽록소', '햇살이 강하면 스피드가 2배가 됩니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', weather: 'sun', multiplier: 2 }]),
  ability('sandStream', '모래날림', '등장할 때 모래바람이 5턴 동안 이어집니다.', [{ trigger: 'onEnter', kind: 'weather', weather: 'sand', turns: 5 }]),
  ability('adaptability', '적응력', '자속 보정이 2배가 됩니다.', [{ trigger: 'onAttack', kind: 'stabMultiplier', multiplier: 2 }]),
  ability('technician', '테크니션', '위력 60 이하인 기술의 위력이 1.5배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', multiplier: 1.5, condition: 'lowPower' }]),
  ability('thickFat', '두꺼운지방', '불꽃과 얼음 공격으로 받는 피해가 절반이 됩니다.', [
    { trigger: 'onDamage', kind: 'damageMultiplier', type: 'fire', multiplier: 0.5 },
    { trigger: 'onDamage', kind: 'damageMultiplier', type: 'ice', multiplier: 0.5 },
  ]),
  ability('flashFire', '타오르는불꽃', '불꽃 기술을 무효화하고 교체할 때까지 자신의 불꽃 공격을 1.5배로 강화합니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'fire', activateBoost: true }]),
  ability('voltAbsorb', '축전', '전기 기술을 무효화하고 최대 HP의 1/4을 회복합니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'electric', healFraction: 1 / 4 }]),
  ability('waterabsorb', '저수', '물 기술을 무효화하고 최대 HP의 1/4을 회복합니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'water', healFraction: 1 / 4 }]),
  ability('sandRush', '모래헤치기', '모래바람이 불면 스피드가 2배가 됩니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', weather: 'sand', multiplier: 2 }]),
  ability('roughSkin', '까칠한피부', '접촉 공격을 한 상대에게 최대 HP의 1/8 피해를 줍니다.', [{ trigger: 'onContact', kind: 'damage', fraction: 1 / 8 }]),
  ability('ironbarbs', '철가시', '접촉 공격을 한 상대에게 최대 HP의 1/8 피해를 줍니다.', [{ trigger: 'onContact', kind: 'damage', fraction: 1 / 8 }]),
  ability('drizzle', '잔비', '등장할 때 비를 5턴 동안 내리게 합니다.', [{ trigger: 'onEnter', kind: 'weather', weather: 'rain', turns: 5 }]),
  ability('drought', '가뭄', '등장할 때 쾌청을 5턴 동안 만듭니다.', [{ trigger: 'onEnter', kind: 'weather', weather: 'sun', turns: 5 }]),
  ability('swarm', '벌레의알림', 'HP가 1/3 이하면 벌레 기술의 위력이 1.5배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'bug', multiplier: 1.5, condition: 'lowHp' }]),
  ability('immunity', '면역', '독 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'poison' }]),
  ability('limber', '유연', '마비 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'paralysis' }]),
  ability('insomnia', '불면', '잠듦 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'sleep' }]),
  ability('vitalspirit', '의기양양', '잠듦 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'sleep' }]),
  ability('waterveil', '수의베일', '화상 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'burn' }]),
  ability('magmaarmor', '마그마의무장', '얼음 상태가 되지 않습니다.', [{ trigger: 'onStatus', kind: 'statusImmunity', status: 'freeze' }]),
  ability('synchronize', '싱크로', '상대에게 받은 화상·독·마비를 그 상대에게도 옮깁니다.', [{ trigger: 'onStatus', kind: 'reflectStatus' }]),
  ability('marvelScale', '이상한비늘', '상태 이상일 때 방어가 1.5배가 됩니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'def', multiplier: 1.5, condition: 'status' }]),
  ability('sereneGrace', '하늘의은총', '기술의 확률형 추가 효과 발생 확률이 2배가 됩니다.', [{ trigger: 'onSecondary', kind: 'chanceMultiplier', multiplier: 2 }]),
  ability('innerFocus', '정신력', '풀죽음과 위협에 의한 공격 하락을 막습니다.', [{ trigger: 'onStatDrop', kind: 'statImmunity', sourceId: 'intimidate' }, {trigger:'onVolatile', kind:'conditionImmunity', condition:'flinch'}]),
  ability('owntempo', '마이페이스', '혼란과 위협에 의한 공격 하락을 막습니다.', [{trigger:'onVolatile', kind:'conditionImmunity', condition:'confusion'}, {trigger:'onStatDrop', kind:'statImmunity', sourceId:'intimidate'}]),
  ability('battlearmor', '전투무장', '상대 공격이 급소에 맞지 않습니다.', [{trigger:'onCritical', kind:'criticalImmunity'}]),
  ability('shellarmor', '조가비갑옷', '상대 공격이 급소에 맞지 않습니다.', [{trigger:'onCritical', kind:'criticalImmunity'}]),
  ability('superluck', '대운', '기술의 급소 단계가 1 올라갑니다.', [{trigger:'onCritical', kind:'criticalBoost', stages:1}]),
  ability('sturdy', '옹골참', 'HP가 가득 찼을 때 공격을 HP 1로 버티고 일격기를 막습니다.', [{trigger:'onDirectDamage', kind:'survive', consume:false},{trigger:'onOHKO',kind:'ohkoImmunity'}]),
  ability('clearBody', '클리어바디', '다른 포켓몬에 의한 능력치 하락을 막습니다.', [{ trigger: 'onStatDrop', kind: 'statImmunity' }]),
  ability('regenerator', '재생력', '교체해 물러날 때 최대 HP의 1/3을 회복합니다.', [{ trigger: 'onExit', kind: 'heal', fraction: 1 / 3 }]),
  ability('hugepower', '천하장사', '공격 능력치가 2배가 됩니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'atk', multiplier: 2 }]),
  ability('purepower', '순수한힘', '공격 능력치가 2배가 됩니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'atk', multiplier: 2 }]),
  ability('guts', '근성', '상태 이상일 때 공격이 1.5배가 되며 화상의 공격 감소를 무시합니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'atk', multiplier: 1.5, condition: 'status', ignoreBurn: true }]),
  ability('compoundeyes', '복안', '기술 명중률이 1.3배가 됩니다.', [{ trigger: 'onAccuracy', kind: 'accuracyMultiplier', target: 'self', multiplier: 1.3 }]),
  ability('sandveil', '모래숨기', '모래바람에서 상대 기술의 명중률을 0.8배로 낮춥니다.', [{ trigger: 'onAccuracy', kind: 'accuracyMultiplier', target: 'attacker', weather: 'sand', multiplier: 0.8 }]),
  ability('snowcloak', '눈숨기', '눈에서 상대 기술의 명중률을 0.8배로 낮춥니다.', [{ trigger: 'onAccuracy', kind: 'accuracyMultiplier', target: 'attacker', weather: 'snow', multiplier: 0.8 }]),
  ability('competitive', '승기', '상대가 능력치를 낮추면 특수공격이 2단계 오릅니다.', [{ trigger: 'onStatDrop', kind: 'stat', stat: 'spa', stages: 2 }]),
  ability('defiant', '오기', '상대가 능력치를 낮추면 공격이 2단계 오릅니다.', [{ trigger: 'onStatDrop', kind: 'stat', stat: 'atk', stages: 2 }]),
  ability('grassysurge', '그래스메이커', '등장할 때 그래스필드를 5턴 동안 전개합니다.', [{trigger:'onEnter', kind:'field', field:'grassy', turns:5}]),
  ability('electricsurge', '일렉트릭메이커', '등장할 때 일렉트릭필드를 5턴 동안 전개합니다.', [{trigger:'onEnter', kind:'field', field:'electric', turns:5}]),
  ability('psychicsurge', '사이코메이커', '등장할 때 사이코필드를 5턴 동안 전개합니다.', [{trigger:'onEnter', kind:'field', field:'psychic', turns:5}]),
  ability('mistysurge', '미스트메이커', '등장할 때 미스트필드를 5턴 동안 전개합니다.', [{trigger:'onEnter', kind:'field', field:'misty', turns:5}]),
  ability('snowwarning', '눈퍼뜨리기', '등장할 때 눈을 5턴 동안 내리게 합니다.', [{trigger:'onEnter', kind:'weather', weather:'snow', turns:5}]),
  ability('prankster', '짓궂은마음', '변화 기술의 우선도가 1 상승합니다. 악 타입 상대에게 쓰는 변화 기술은 실패합니다.', [{trigger:'onPriority', kind:'priorityBoost', category:'status', stages:1}]),
  ability('goodasgold', '황금몸', '다른 포켓몬이 사용하는 변화 기술을 무효화합니다.', [{trigger:'onTargetStatusMove', kind:'statusMoveImmunity'}]),
  ability('unaware', '천진', '공격하거나 피해를 받을 때 상대의 관련 능력치 변화 단계를 무시합니다.', [{trigger:'onAttack', kind:'ignoreFoeStages'}, {trigger:'onDamage', kind:'ignoreFoeStages'}]),
  ability('noGuard', '노가드', '자신과 상대가 사용하는 기술이 반드시 명중합니다.', [{trigger:'onAccuracy', kind:'accuracyAlwaysHits'}]),
] as Ability[]).map(entry => [entry.id, entry]));

const item = (id: string, name: string, description: string, effects: Item['effects']): Item => ({ id, name, description, effects });
export const items: Record<string, Item> = Object.fromEntries(([
  item('none', '없음', '지닌 도구가 없습니다.', []),
  item('leftovers', '먹다남은음식', '매 턴 종료 시 최대 HP의 1/16을 회복합니다.', [{ trigger: 'onEndTurn', kind: 'heal', fraction: 1 / 16 }]),
  item('muscleBand', '힘의머리띠', '물리 공격의 위력이 1.1배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', category: 'physical', multiplier: 1.1 }]),
  item('wiseGlasses', '박식안경', '특수 공격의 위력이 1.1배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', category: 'special', multiplier: 1.1 }]),
  item('choiceScarf', '구애스카프', '스피드가 1.5배가 되지만 교체할 때까지 처음 사용한 기술만 쓸 수 있습니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', multiplier: 1.5 }, { trigger: 'onChoice', kind: 'choiceLock' }]),
  item('choiceBand', '구애머리띠', '공격이 1.5배가 되지만 교체할 때까지 처음 사용한 기술만 쓸 수 있습니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'atk', multiplier: 1.5 }, { trigger: 'onChoice', kind: 'choiceLock' }]),
  item('choiceSpecs', '구애안경', '특수공격이 1.5배가 되지만 교체할 때까지 처음 사용한 기술만 쓸 수 있습니다.', [{ trigger: 'onStat', kind: 'statMultiplier', stat: 'spa', multiplier: 1.5 }, { trigger: 'onChoice', kind: 'choiceLock' }]),
  item('sitrusBerry', '자뭉열매', '피해를 받아 HP가 절반 이하면 최대 HP의 1/4을 회복하고 소모됩니다.', [{ trigger: 'onAfterDamage', kind: 'heal', fraction: 1 / 4, threshold: 0.5, consume: true }]),
  item('focusSash', '기합의띠', 'HP가 가득 찬 상태에서 공격으로 쓰러질 때 HP 1로 버티고 소모됩니다.', [{ trigger: 'onDirectDamage', kind: 'survive', consume: true }]),
  item('lifeOrb', '생명의구슬', '공격 피해가 1.3배가 되며 피해를 준 기술을 사용한 뒤 최대 HP의 1/8을 잃습니다. (이 게임의 규칙)', [{ trigger: 'onAttack', kind: 'damageMultiplier', multiplier: 1.3 }, { trigger: 'onAfterMove', kind: 'recoil', fraction: 1 / 8 }]),
  item('powerherb', '파워풀허브', '충전 기술을 한 번 즉시 사용하고 소모됩니다.', []),
  item('charcoal', '목탄', '불꽃 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'fire', multiplier: 1.2 }]),
  item('mysticWater', '신비의물방울', '물 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'water', multiplier: 1.2 }]),
  item('magnet', '자석', '전기 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'electric', multiplier: 1.2 }]),
  item('miracleSeed', '기적의씨', '풀 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'grass', multiplier: 1.2 }]),
  item('dynamaxband','다이맥스밴드','이 게임의 규칙: 지니면 배틀에서 다이맥스 또는 거다이맥스를 한 번 사용할 수 있습니다.',[]),
  item('rustedsword','녹슨검','자시안이 지니고 등장하면 왕관폼으로 변하며 아이언헤드가 거수참으로 바뀝니다.',[]),
  item('rustedshield','녹슨방패','자마젠타가 지니고 등장하면 왕관폼으로 변하며 아이언헤드가 거수탄으로 바뀝니다.',[]),
] as Item[]).map(entry => [entry.id, entry]));

const nature = (id: string, name: string, up?: Nature['up'], down?: Nature['down']): Nature => ({ id, name, up, down });
export const natures: Record<string, Nature> = Object.fromEntries(([
  nature('hardy', '노력'), nature('lonely', '외로움', 'atk', 'def'), nature('brave', '용감', 'atk', 'spe'),
  nature('adamant', '고집', 'atk', 'spa'), nature('naughty', '개구쟁이', 'atk', 'spd'),
  nature('bold', '대담', 'def', 'atk'), nature('docile', '온순'), nature('relaxed', '무사태평', 'def', 'spe'),
  nature('impish', '장난꾸러기', 'def', 'spa'), nature('lax', '촐랑', 'def', 'spd'),
  nature('timid', '겁쟁이', 'spe', 'atk'), nature('hasty', '성급', 'spe', 'def'), nature('serious', '성실'),
  nature('jolly', '명랑', 'spe', 'spa'), nature('naive', '천진난만', 'spe', 'spd'),
  nature('modest', '조심', 'spa', 'atk'), nature('mild', '의젓', 'spa', 'def'), nature('quiet', '냉정', 'spa', 'spe'),
  nature('bashful', '수줍음'), nature('rash', '덜렁', 'spa', 'spd'),
  nature('calm', '차분', 'spd', 'atk'), nature('gentle', '얌전', 'spd', 'def'), nature('sassy', '건방', 'spd', 'spe'),
  nature('careful', '신중', 'spd', 'spa'), nature('quirky', '변덕'),
] as Nature[]).map(entry => [entry.id, entry]));

export const restrictedDexNumbers=new Set(restrictedNationalDex);
export const regulationSpecies:Record<string,Species>=Object.fromEntries([...roster,...legendaryRoster,...signatureRoster,...expansionRoster].map(entry=>[entry.id,entry]));
const historical:Record<string,Species>=Object.fromEntries(legacyRoster.map(entry=>[entry.id,entry]));
export const species: Record<string, Species> = {...historical,...Object.fromEntries([...roster,...legendaryRoster,...signatureRoster,...expansionRoster].map(entry=>{
  const prior=historical[entry.id];
  return [entry.id,prior?{...entry,abilities:[...new Set([...entry.abilities,...prior.abilities])],learnset:[...new Set([...entry.learnset,...prior.learnset])]}:entry];
}))};
Object.assign(abilities, importedAbilities, legendaryAbilities);
abilities.intrepidsword=ability('intrepidsword','불요의검','등장할 때 공격이 1단계 상승합니다.',[{trigger:'onEnter',kind:'stat',target:'self',stat:'atk',stages:1}]);
abilities.dauntlessshield=ability('dauntlessshield','불굴의방패','등장할 때 방어가 1단계 상승합니다.',[{trigger:'onEnter',kind:'stat',target:'self',stat:'def',stages:1}]);
abilities.chillingneigh=ability('chillingneigh','백의울음','상대를 쓰러뜨리면 공격이 1단계 상승합니다.',[{trigger:'onKO',kind:'stat',stat:'atk',stages:1}]);
abilities.grimneigh=ability('grimneigh','흑의울음','상대를 쓰러뜨리면 특수공격이 1단계 상승합니다.',[{trigger:'onKO',kind:'stat',stat:'spa',stages:1}]);
abilities.orichalcumpulse=ability('orichalcumpulse','진홍빛고동','등장할 때 햇살을 강하게 하고 햇살 아래 공격을 강화합니다.',[{trigger:'onEnter',kind:'weather',weather:'sun',turns:5},{trigger:'onStat',kind:'statMultiplier',stat:'atk',multiplier:4/3,condition:'sun'}]);
abilities.hadronengine=ability('hadronengine','하드론엔진','등장할 때 일렉트릭필드를 펼칩니다.',[{trigger:'onEnter',kind:'field',field:'electric',turns:5}]);
abilities.primordialsea=ability('primordialsea','시작의바다','등장할 때 강한 비를 내립니다.',[{trigger:'onEnter',kind:'weather',weather:'rain',turns:99}]);
abilities.desolateland=ability('desolateland','끝의대지','등장할 때 강한 햇살을 만듭니다.',[{trigger:'onEnter',kind:'weather',weather:'sun',turns:99}]);
abilities.deltastream=ability('deltastream','델타스트림','등장하면 난기류를 일으켜 비행 타입의 약점을 무효화하고 강한 날씨가 끝날 때까지 유지합니다.',[{trigger:'onEnter',kind:'weather',weather:'strongwinds',turns:99}]);
abilities.aurabreak=ability('aurabreak','오라브레이크','다크오라와 페어리오라의 위력 효과를 반전합니다.',[]);
abilities.tabletsofruin=ability('tabletsofruin','재앙의목간','자신을 제외한 모든 포켓몬의 공격을 25% 낮춥니다.',[]);
abilities.swordofruin=ability('swordofruin','재앙의검','자신을 제외한 모든 포켓몬의 방어를 25% 낮춥니다.',[]);
abilities.vesselofruin=ability('vesselofruin','재앙의그릇','자신을 제외한 모든 포켓몬의 특수공격을 25% 낮춥니다.',[]);
abilities.beadsofruin=ability('beadsofruin','재앙의구슬','자신을 제외한 모든 포켓몬의 특수방어를 25% 낮춥니다.',[]);
abilities.toxicchain=ability('toxicchain','독사슬','상대에게 피해를 주면 30% 확률로 맹독을 건다. 방진과 은밀망토는 막을 수 있습니다.',[]);
abilities.slowstart=ability('slowstart','슬로스타트','출전 후 5턴 동안 공격과 스피드가 절반이 됩니다. 교체하면 다시 5턴부터 시작합니다.',[]);
abilities.turboblaze=ability('turboblaze','터보블레이즈','공격할 때 상대의 방어 특성을 무시합니다.',[{trigger:'onAttack',kind:'ignoreTargetAbility'}]);
abilities.teravolt=ability('teravolt','테라볼티지','공격할 때 상대의 방어 특성을 무시합니다.',[{trigger:'onAttack',kind:'ignoreTargetAbility'}]);
abilities.asoneglastrier=ability('asoneglastrier','혼연일체 (백마)','상대의 열매 사용을 막고 상대를 쓰러뜨리면 공격이 1단계 오릅니다.',[{trigger:'onKO',kind:'stat',stat:'atk',stages:1}]);
abilities.asonespectrier=ability('asonespectrier','혼연일체 (흑마)','상대의 열매 사용을 막고 상대를 쓰러뜨리면 특수공격이 1단계 오릅니다.',[{trigger:'onKO',kind:'stat',stat:'spa',stages:1}]);
abilities.swiftswim=ability('swiftswim','쓱쓱','비가 오면 스피드가 2배가 됩니다.',[{trigger:'onSpeed',kind:'speedMultiplier',weather:'rain',multiplier:2}]);
abilities.steamengine=ability('steamengine','증기기관','물 또는 불꽃 타입 공격을 받으면 스피드가 6단계 오릅니다.',[
  {trigger:'onAfterHit',kind:'stat',stat:'spe',stages:6,type:'water'},
  {trigger:'onAfterHit',kind:'stat',stat:'spe',stages:6,type:'fire'},
]);
abilities.tintedlens=ability('tintedlens','색안경','효과가 별로인 공격의 피해를 2배로 높입니다.',[]);
abilities.flashfire={...abilities.flashFire,id:'flashfire'};
abilities.shadowshield=ability('shadowshield','스펙터가드','HP가 가득 찼을 때 받는 피해를 절반으로 줄입니다.',[{trigger:'onDamage',kind:'damageMultiplier',condition:'fullHp',multiplier:.5}]);
abilities.prismarmor=ability('prismarmor','프리즘아머','약점 공격으로 받는 피해를 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'damageMultiplier',multiplier:.75}]);
abilities.transistor=ability('transistor','트랜지스터','전기 타입 공격의 위력을 1.3배 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'electric',multiplier:1.3}]);
abilities.dragonsmaw=ability('dragonsmaw','용의턱','드래곤 타입 공격의 위력을 1.5배 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'dragon',multiplier:1.5}]);
abilities.fullmetalbody=ability('fullmetalbody','메탈프로텍트','상대에 의한 능력치 하락을 막습니다.',(['atk','def','spa','spd','spe','accuracy','evasion'] as const).map(stat=>({trigger:'onStatDrop',kind:'statImmunity',stat})));
abilities.powerconstruct=ability('powerconstruct','스웜체인지','지가르데의 HP가 절반 이하가 되면 턴 종료 시 퍼펙트폼으로 변하고 종족값이 바뀝니다.',[]);
abilities.rkssystem=ability('rkssystem','AR시스템','실바디가 지닌 메모리에 따라 타입이 바뀝니다. 메모리는 제거하거나 교환할 수 없습니다.',[]);
abilities.terashift=ability('terashift','테라체인지','테라파고스가 배틀에 나오면 테라스탈폼으로 변합니다.',[]);
abilities.terashell=ability('terashell','테라셸','HP가 가득 찬 동안 타입 상성이 있는 공격을 모두 반감 상성으로 받습니다. 타입 면역은 유지됩니다.',[]);
abilities.teraformzero=ability('teraformzero','테라폼제로','테라파고스가 스텔라 테라스탈하면 날씨와 필드를 없앱니다.',[]);
for(const mon of legacyRoster)for(const id of mon.abilities)if(!abilities[id])abilities[id]=ability(id,id,'이전 로스터의 특성입니다. 효과는 미지원입니다.',[]);
abilities.imposter=ability('imposter','괴짜','등장할 때 상대 포켓몬으로 변신합니다.',[]);
abilities.limber=ability('limber','유연','마비 상태가 되지 않습니다.',[{trigger:'onStatus',kind:'statusImmunity',status:'paralysis'}]);
abilities.purifyingsalt=ability('purifyingsalt','정화의소금','상태 이상을 막고 고스트 기술 피해를 절반으로 줄입니다.',[
  ...(['burn','poison','paralysis','sleep','freeze'] as const).map(status=>({trigger:'onStatus' as const,kind:'statusImmunity' as const,status})),
  {trigger:'onDamage',kind:'damageMultiplier',type:'ghost',multiplier:0.5},
]);
abilities.supremeoverlord=ability('supremeoverlord','총대장','등장할 때 이미 쓰러진 아군 수에 따라 공격 기술 위력이 최대 1.5배로 증가합니다.',[{trigger:'onAttack',kind:'fallenAllyBoost'}]);
abilities.hypercutter=ability('hypercutter','괴력집게','다른 포켓몬에 의한 공격 하락을 막습니다.',[{trigger:'onStatDrop',kind:'statImmunity',stat:'atk'}]);
abilities.furcoat=ability('furcoat','퍼코트','방어 능력치가 2배가 됩니다.',[{trigger:'onStat',kind:'statMultiplier',stat:'def',multiplier:2}]);
abilities.solidrock=ability('solidrock','하드록','효과가 굉장한 기술로 받는 피해가 0.75배가 됩니다.',[{trigger:'onSuperEffectiveDamage',kind:'damageMultiplier',multiplier:.75}]);
abilities.eartheater=ability('eartheater','흙먹기','땅 타입 기술을 무효화하고 최대 HP의 1/4을 회복합니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'ground',healFraction:1/4}]);
abilities.heatproof=ability('heatproof','내열','불꽃 타입 공격으로 받는 피해를 절반으로 줄입니다. 화상 피해 감소는 미지원입니다.',[{trigger:'onDamage',kind:'damageMultiplier',type:'fire',multiplier:.5}]);
abilities.motordrive=ability('motordrive','전기엔진','전기 타입 기술을 무효화하고 스피드를 1단계 높입니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'electric',boostStat:'spe'}]);
abilities.rattled=ability('rattled','주눅','벌레·고스트·악 타입 기술에 맞거나 위협을 받으면 스피드가 1단계 오릅니다.',[
  ...(['bug','ghost','dark'] as const).map(type=>({trigger:'onAfterHit' as const,kind:'stat' as const,stat:'spe' as const,stages:1,type})),
  {trigger:'onStatDrop',kind:'stat',stat:'spe',stages:1,sourceId:'intimidate'},
]);
abilities.thermalexchange=ability('thermalexchange','열교환','불꽃 기술에 맞으면 공격이 1단계 오르고 화상을 막습니다.',[{trigger:'onAfterHit',kind:'stat',stat:'atk',stages:1,type:'fire'},{trigger:'onStatus',kind:'statusImmunity',status:'burn'}]);
abilities.magicbounce=ability('magicbounce','매직미러','자신을 대상으로 한 변화 기술을 사용자에게 되돌립니다.',[{trigger:'onTargetStatusMove',kind:'reflectStatusMove'}]);
abilities.trace=ability('trace','트레이스','등장할 때 상대 포켓몬의 특성을 복사합니다.',[]);
abilities.shadowtag=ability('shadowtag','그림자밟기','등장해 있는 동안 고스트 타입 이외의 상대가 교체하지 못하게 합니다.',[]);
abilities.innardsout=ability('innardsout','내용물분출','공격으로 쓰러질 때 마지막으로 받은 피해만큼 상대에게 돌려줍니다.',[]);
abilities.megasol=ability('megasol','메가솔','이 포켓몬은 햇살이 강한 날씨의 기술 효과를 받습니다.',[]);
abilities.dragonize=ability('dragonize','드래곤제너레이트','노말 기술이 드래곤 타입이 되고 위력이 1.2배가 됩니다.',[{trigger:'onMoveType',kind:'convertType',from:'normal',to:'dragon',multiplier:1.2}]);
abilities.sandforce=ability('sandforce','모래의힘','모래바람에서 바위·땅·강철 기술의 위력이 1.3배가 됩니다.',[]);
abilities.stalwart=ability('stalwart','굳건한신념','상대의 기술 대상 유도 효과를 무시합니다.',[]);
abilities.solarpower=ability('solarpower','선파워','햇살에서 특수공격이 1.5배가 되고 매 턴 HP가 줄어듭니다.',[{trigger:'onEndTurn',kind:'damage',fraction:1/8,weather:'sun'}]);
abilities.scrappy=ability('scrappy','배짱','노말·격투 기술이 고스트 타입에도 맞습니다.',[]);
abilities.auraguard=ability('auraguard','오라가드','접촉 기술로 받는 피해가 절반이 됩니다.',[{trigger:'onDamage',kind:'damageMultiplier',multiplier:.5,condition:'contact'}]);
abilities.piercingdrill=ability('piercingdrill','관통드릴','접촉 기술이 방어와 다이월을 관통합니다.',[{trigger:'onAttack',kind:'bypassProtect'}]);
abilities.healer=ability('healer','치유의마음','더블 배틀에서 턴 종료 시 아군의 상태 이상을 30% 확률로 치료합니다.',[{trigger:'onEndTurn',kind:'cureStatus',chance:30,target:'ally'}]);
abilities.eelevate=ability('eelevate','일레베이트','땅 타입 기술에 맞지 않으며 쓰러뜨리면 가장 높은 능력치가 오릅니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'ground'},{trigger:'onKO',kind:'bestStat'}]);
abilities.unseenfist=ability('unseenfist','보이지않는주먹','접촉 기술이 방어와 다이월을 관통합니다.',[{trigger:'onAttack',kind:'bypassProtect'}]);
abilities.bulletproof=ability('bulletproof','방탄','폭탄·구슬 계열 기술을 무효화합니다.',[]);
abilities.protean=ability('protean','변환자재','배틀 중 한 번 기술을 사용하기 전에 자신의 타입을 그 기술 타입으로 바꿉니다.',[]);
abilities.firemane=ability('firemane','불꽃갈기','불꽃 기술의 위력이 1.5배가 됩니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'fire',multiplier:1.5}]);
abilities.fairyaura=ability('fairyaura','페어리오라','전장 전체의 페어리 기술 위력이 1.33배가 됩니다.',[]);
abilities.ironfist=ability('ironfist','철주먹','펀치 기술의 위력이 1.2배가 됩니다.',[{trigger:'onAttack',kind:'damageMultiplier',multiplier:1.2,condition:'punch'}]);
abilities.berserk=ability('berserk','발끈','HP가 절반 이하로 내려가면 특수공격이 1단계 오릅니다.',[{trigger:'onAfterDamage',kind:'stat',stat:'spa',stages:1,threshold:.5}]);
abilities.spicyspray=ability('spicyspray','핫스프레이','공격을 받으면 공격한 포켓몬을 화상 상태로 만듭니다.',[]);
abilities.stamina=ability('stamina','지구력','공격을 받을 때마다 방어가 1단계 오릅니다.',[{trigger:'onAfterHit',kind:'stat',stat:'def',stages:1}]);
abilities.fluffy=ability('fluffy','복슬복슬','접촉 기술 피해를 절반으로 줄이고 불꽃 기술 피해를 2배로 받습니다.',[{trigger:'onDamage',kind:'damageMultiplier',multiplier:.5,condition:'contact'},{trigger:'onDamage',kind:'damageMultiplier',type:'fire',multiplier:2}]);
abilities.punkrock=ability('punkrock','펑크록','소리 기술 위력이 1.3배가 되고 소리 기술 피해는 절반만 받습니다.',[{trigger:'onAttack',kind:'damageMultiplier',multiplier:1.3,condition:'sound'},{trigger:'onDamage',kind:'damageMultiplier',multiplier:.5,condition:'sound'}]);
abilities.waterbubble=ability('waterbubble','수포','물 기술 위력이 2배가 되고 화상을 막습니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'water',multiplier:2},{trigger:'onStatus',kind:'statusImmunity',status:'burn'}]);
abilities.quickfeet=ability('quickfeet','속보','상태 이상일 때 스피드가 1.5배가 되고 마비의 스피드 감소를 무시합니다.',[{trigger:'onStat',kind:'statMultiplier',stat:'spe',multiplier:1.5,condition:'status'}]);
abilities.surgesurfer=ability('surgesurfer','서핑테일','일렉트릭필드에서 스피드가 2배가 됩니다.',[]);
abilities.slushrush=ability('slushrush','눈치우기','눈이 내릴 때 스피드가 2배가 됩니다.',[{trigger:'onSpeed',kind:'speedMultiplier',weather:'snow',multiplier:2}]);
abilities.gooey=ability('gooey','미끈미끈','접촉 기술을 받으면 상대의 스피드가 1단계 내려갑니다.',[{trigger:'onAfterHit',kind:'stat',stat:'spe',stages:-1,contact:true}]);
abilities.frisk=ability('frisk','통찰','등장할 때 상대 포켓몬의 지닌 도구를 확인합니다.',[]);
abilities.angerpoint=ability('angerpoint','분노의경혈','급소에 맞으면 공격이 최대치까지 오릅니다.',[]);
abilities.soundproof=ability('soundproof','방음','소리 기술을 무효화합니다.',[]);
abilities.sniper=ability('sniper','스나이퍼','급소 피해가 2.25배가 됩니다.',[]);
abilities.steadfast=ability('steadfast','불굴의마음','풀죽으면 스피드가 1단계 오릅니다.',[]);
abilities.bigpecks=ability('bigpecks','부풀린가슴','방어가 내려가지 않습니다.',[{trigger:'onStatDrop',kind:'statImmunity',stat:'def'}]);
abilities.whitesmoke=ability('whitesmoke','하얀연기','상대의 기술로 능력치가 내려가지 않습니다.',[{trigger:'onStatDrop',kind:'statImmunity'}]);
abilities.leafguard=ability('leafguard','리프가드','햇살이 강한 날씨에 상태 이상을 막습니다.',[]);
abilities.flowerveil=ability('flowerveil','플라워베일','아군 풀 타입의 상태 이상과 능력치 하락을 막습니다.',[]);
abilities.sweetveil=ability('sweetveil','스위트베일','아군이 잠들지 않게 합니다.',[]);
abilities.earlybird=ability('earlybird','일찍기상','잠든 뒤 더 빨리 깨어납니다.',[]);
abilities.poisonheal=ability('poisonheal','포이즌힐','독 상태일 때 피해 대신 매 턴 HP를 회복합니다.',[]);
abilities.raindish=ability('raindish','젖은접시','비가 내릴 때 매 턴 HP를 회복합니다.',[]);
abilities.dryskin=ability('dryskin','건조피부','물 기술을 무효화하고 HP를 회복합니다. 비에 회복하고 햇살과 불꽃 기술에 약합니다.',[
  {trigger:'onDamage',kind:'typeImmunity',type:'water',healFraction:1/4},
  {trigger:'onDamage',kind:'damageMultiplier',type:'fire',multiplier:1.25},
]);
abilities.hydration=ability('hydration','촉촉한몸','비가 내릴 때 턴 종료 시 상태 이상을 회복합니다.',[]);
abilities.shedskin=ability('shedskin','탈피','턴 종료 시 일정 확률로 상태 이상을 회복합니다.',[]);
abilities.mirrorarmor=ability('mirrorarmor','미러아머','상대가 낮춘 능력치를 상대에게 되돌립니다.',[]);
abilities.opportunist=ability('opportunist','기회주의','상대의 능력치 상승을 복사합니다.',[]);
abilities.corrosion=ability('corrosion','부식','강철·독 타입도 독 상태로 만들 수 있습니다.',[]);
abilities.magicguard=ability('magicguard','매직가드','상태 이상·날씨·설치물의 간접 피해를 받지 않습니다.',[]);
abilities.friendguard=ability('friendguard','프렌드가드','더블 배틀에서 아군이 받는 피해를 줄입니다.',[]);
abilities.steelyspirit=ability('steelyspirit','강철정신','더블 배틀에서 아군의 강철 기술을 강화합니다.',[]);
abilities.plus=ability('plus','플러스','더블 배틀에서 마이너스 특성 아군과 함께하면 특수공격이 오른다.',[]);
abilities.minus=ability('minus','마이너스','더블 배틀에서 플러스 특성 아군과 함께하면 특수공격이 오른다.',[]);
abilities.tangledfeet=ability('tangledfeet','갈지자걸음','혼란 상태일 때 상대 기술을 잘 피합니다.',[]);
abilities.rivalry=ability('rivalry','투쟁심','성별이 같은 상대에게 강하고 다른 성별에게 약합니다.',[]);
abilities.stakeout=ability('stakeout','감시','교체 직후의 상대에게 주는 피해가 2배가 됩니다.',[]);
abilities.telepathy=ability('telepathy','텔레파시','더블 배틀에서 아군의 공격에 맞지 않습니다.',[]);
abilities.damp=ability('damp','습기','자폭 기술을 막습니다.',[]);
abilities.liquidvoice=ability('liquidvoice','촉촉보이스','소리 기술이 물 타입으로 바뀝니다.',[]);
abilities.galewings=ability('galewings','질풍날개','HP가 가득 차 있으면 비행 기술의 우선도가 오릅니다.',[]);
abilities.stall=ability('stall','시간벌기','같은 우선도라면 행동 순서가 늦어집니다.',[]);
abilities.quickdraw=ability('quickdraw','퀵드로','일정 확률로 같은 우선도 기술보다 먼저 행동합니다.',[]);
abilities.armortail=ability('armortail','테일아머','상대의 선제 기술을 막습니다.',[]);
abilities.queenlymajesty=ability('queenlymajesty','여왕의위엄','상대의 선제 기술을 막습니다.',[]);
abilities.libero=ability('libero','리베로','배틀 중 한 번 사용한 기술과 같은 타입으로 변합니다.',[]);
abilities.illuminate=ability('illuminate','발광','상대가 능력치를 낮추지 못하고, 자신의 기술이 상대의 회피율 변화를 무시합니다.',[]);
abilities.lightmetal=ability('lightmetal','라이트메탈','자신의 무게가 절반이 됩니다.',[]);
abilities.heavymetal=ability('heavymetal','헤비메탈','자신의 무게가 두 배가 됩니다.',[]);
abilities.moody=ability('moody','변덕쟁이','매 턴 능력치 하나가 2단계 오르고 다른 능력치 하나가 1단계 내려갑니다.',[]);
abilities.battlebond=ability('battlebond','유대변화','상대 포켓몬을 쓰러뜨리면 공격·특수공격·스피드가 1단계씩 오릅니다.',[]);
abilities.disguise=ability('disguise','탈','미믹큐가 처음 직접 공격을 받을 때 피해를 크게 줄이고 탈이 벗겨집니다.',[]);
abilities.forecast=ability('forecast','기상예보','캐스퐁의 타입이 날씨에 따라 바뀝니다.',[]);
abilities.hungerswitch=ability('hungerswitch','꼬르륵스위치','매 턴 배부른 모드와 배고픈 모드가 바뀌며, 오라휠 타입도 달라집니다.',[]);
abilities.longreach=ability('longreach','원거리','자신의 기술은 접촉 판정을 하지 않습니다.',[]);
abilities.mimicry=ability('mimicry','의태','필드에 따라 자신의 타입이 바뀌며 필드가 사라지면 원래 타입으로 돌아옵니다.',[]);
abilities.receiver=ability('receiver','리시버','더블 배틀에서 아군이 쓰러지면 그 특성을 이어받습니다.',[]);
abilities.stancechange=ability('stancechange','배틀스위치','킬가르도가 공격 기술을 쓰면 블레이드폼, 킹실드를 쓰면 실드폼이 되어 능력치가 바뀝니다.',[]);
abilities.suctioncups=ability('suctioncups','흡반','상대의 강제 교체 기술을 막습니다.',[]);
abilities.zerotohero=ability('zerotohero','마이티체인지','돌아간 뒤 처음 다시 교체하면 영웅폼 능력치가 됩니다.',[]);
abilities.runaway=ability('runaway','도주','야생 포켓몬과의 배틀에서 도망칩니다. 현재 게임은 트레이너 대전만 지원합니다.',[]);
Object.assign(items, Object.fromEntries(gimmickItems.map(item => [item.id, item])));
for(const [type,name] of Object.entries(typeNames))items[`tera-${type}`]=item(`tera-${type}`,`${name} 테라크리스탈`,`${name} 타입 테라스탈을 사용할 수 있게 합니다. 이 게임의 편성 규칙입니다.`,[]);
Object.assign(items,{
  heavydutyboots:item('heavydutyboots','통굽부츠','교체로 들어올 때 스텔스록·압정·독압정·끈적끈적네트의 영향을 받지 않습니다.',[{trigger:'onEntryHazard',kind:'hazardImmunity'}]),
  lightclay:item('lightclay','빛의점토','리플렉터·빛의장막·오로라베일의 지속 시간이 5턴에서 8턴으로 늘어납니다.',[{trigger:'onScreen',kind:'screenDuration',turns:8}]),
  lumberry:item('lumberry','리샘열매','상태 이상이 생기면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',consume:true}]),
  cheriberry:item('cheriberry','버치열매','마비에 걸리면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',status:'paralysis',consume:true}]),
  chestoberry:item('chestoberry','유루열매','잠듦에 걸리면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',status:'sleep',consume:true}]),
  pechaberry:item('pechaberry','복슝열매','독에 걸리면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',status:'poison',consume:true}]),
  rawstberry:item('rawstberry','복분열매','화상에 걸리면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',status:'burn',consume:true}]),
  aspearberry:item('aspearberry','배리열매','얼음에 걸리면 즉시 회복하고 소모됩니다.',[{trigger:'onStatus',kind:'cureStatus',status:'freeze',consume:true}]),
  occaberry:item('occaberry','오카열매','효과가 굉장한 불꽃 기술의 피해를 한 번 절반으로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'resistType',type:'fire',multiplier:0.5,consume:true}]),
  passhoberry:item('passhoberry','꼬시개열매','효과가 굉장한 물 기술의 피해를 한 번 절반으로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'resistType',type:'water',multiplier:0.5,consume:true}]),
  wacanberry:item('wacanberry','초나열매','효과가 굉장한 전기 기술의 피해를 한 번 절반으로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'resistType',type:'electric',multiplier:0.5,consume:true}]),
  yacheberry:item('yacheberry','플카열매','효과가 굉장한 얼음 기술의 피해를 한 번 절반으로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'resistType',type:'ice',multiplier:0.5,consume:true}]),
  shucaberry:item('shucaberry','슈캐열매','효과가 굉장한 땅 기술의 피해를 한 번 절반으로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'resistType',type:'ground',multiplier:0.5,consume:true}]),
  assaultvest:item('assaultvest','돌격조끼','특수방어가 1.5배가 되며 변화 기술을 사용할 수 없습니다.',[{trigger:'onStat',kind:'statMultiplier',stat:'spd',multiplier:1.5},{trigger:'onMoveChoice',kind:'blockStatus'}]),
  weaknesspolicy:item('weaknesspolicy','약점보험','효과가 굉장한 기술로 피해를 받으면 공격과 특수공격이 2단계씩 오르고 소모됩니다.',[{trigger:'onSuperEffectiveHit',kind:'stat',stat:'atk',stages:2,consume:true},{trigger:'onSuperEffectiveHit',kind:'stat',stat:'spa',stages:2,consume:true}]),
  scopelens:item('scopelens','초점렌즈','공격 기술의 급소 확률을 한 단계 높입니다.',[{trigger:'onCritical',kind:'criticalBoost',stages:1}]),
  widelens:item('widelens','광각렌즈','기술의 명중률을 1.1배로 높입니다.',[{trigger:'onAccuracy',kind:'accuracyMultiplier',target:'self',multiplier:1.1}]),
  brightpowder:item('brightpowder','반짝가루','상대 기술의 명중률을 0.9배로 낮춥니다.',[{trigger:'onAccuracy',kind:'accuracyMultiplier',target:'attacker',multiplier:0.9}]),
  safetygoggles:item('safetygoggles','방진고글','가루 기술과 모래바람 피해를 막습니다.',[{trigger:'onPowder',kind:'immunity'},{trigger:'onWeatherDamage',kind:'immunity',weather:'sand'}]),
  covertcloak:item('covertcloak','은밀망토','공격 기술의 추가 효과를 막습니다.',[]),
});
// One-time type-resistance berries. Chilan is the Normal-type exception: it works without a weakness.
const resistanceBerries:Record<string,[string,string]>= {
  rindoberry:['린드열매','grass'],chopleberry:['로플열매','fighting'],kebiaberry:['으름열매','poison'],
  cobaberry:['바코열매','flying'],payapaberry:['야파열매','psychic'],tangaberry:['리체열매','bug'],
  chartiberry:['루미열매','rock'],kasibberry:['수불열매','ghost'],habanberry:['하반열매','dragon'],
  colburberry:['마코열매','dark'],babiriberry:['바리비열매','steel'],roseliberry:['로셀열매','fairy'],
  chilanberry:['카리열매','normal'],
};
for(const [id,[name,type]] of Object.entries(resistanceBerries))
  items[id]=item(id,name,`${typeNames[type]} 타입 공격의 피해를 한 번 절반으로 줄입니다${type==='normal'?'.':' (약점 공격일 때).'}`,
    [{trigger:'onSuperEffectiveDamage',kind:'resistType',type,multiplier:.5,consume:true}]);
const typeBoosters:Record<string,[string,string]>={
  silkscarf:['실크스카프','normal'],nevermeltice:['녹지않는얼음','ice'],blackbelt:['검은띠','fighting'],
  poisonbarb:['독바늘','poison'],softsand:['부드러운모래','ground'],sharpbeak:['예리한부리','flying'],
  twistedspoon:['휘어진스푼','psychic'],silverpowder:['은빛가루','bug'],hardstone:['딱딱한돌','rock'],
  dragonfang:['용의이빨','dragon'],blackglasses:['검은안경','dark'],metalcoat:['금속코트','steel'],
  fairyfeather:['요정의깃털','fairy'],
};
for(const [id,[name,type]] of Object.entries(typeBoosters))
  items[id]=item(id,name,`${typeNames[type]} 타입 공격 기술의 위력을 1.2배로 높입니다.`,
    [{trigger:'onAttack',kind:'damageMultiplier',type,multiplier:1.2}]);
for(const [id,signature] of Object.entries({maushold:'populationbomb',tinkaton:'gigatonhammer',garganacl:'saltcure',dragapult:'dragondarts'})) {
  if(species[id]&&!species[id].learnset.includes(signature))species[id].learnset.push(signature);
}
for(const id of ['clefable','gardevoir'])if(species[id]&&!species[id].learnset.includes('gravity'))species[id].learnset.push('gravity');
for(const id of ['clefable','gardevoir','charizard','blastoise','snorlax'])if(species[id]&&!species[id].learnset.includes('substitute'))species[id].learnset.push('substitute');
for(const [id,moveId] of [['tyranitar','roar'],['skarmory','roar'],['skarmory','whirlwind']] as const)if(species[id]&&!species[id].learnset.includes(moveId))species[id].learnset.push(moveId);
for(const [id,moveId] of [['lapras','fissure'],['lapras','horndrill'],['lapras','sheercold'],['rhyperior','horndrill'],['walrein','sheercold'],['kingler','guillotine']] as const)if(species[id]&&!species[id].learnset.includes(moveId))species[id].learnset.push(moveId);
for(const id of ['alakazam','slowbro','gardevoir'])if(species[id]&&!species[id].learnset.includes('futuresight'))species[id].learnset.push('futuresight');
if(species.jirachi&&!species.jirachi.learnset.includes('doomdesire'))species.jirachi.learnset.push('doomdesire');
for(const id of ['raichu','charizard','blastoise','gardevoir','dragonite'])if(species[id]&&!species[id].learnset.includes('terablast'))species[id].learnset.push('terablast');
for(const [id,moveId] of [['mimikyu','playrough'],['incineroar','darkestlariat'],['lunala','moongeistbeam'],['primarina','sparklingaria'],['snorlax','gigaimpact']] as const)if(species[id]&&!species[id].learnset.includes(moveId))species[id].learnset.push(moveId);
for(const id of ['hypervoice','bugbuzz','overdrive','clangingscales'])moves[id].sound=true;
moves.torchsong.sound=true;moves.boomburst.sound=true;
moves.roar.sound=true;
moves.whirlwind.bypassSubstitute=true;
abilities.skilllink=ability('skilllink','스킬링크','지원되는 2~5회 연속 기술이 항상 5회 공격합니다.',[{trigger:'onMultiHit',kind:'maxHits'}]);
abilities.infiltrator=ability('infiltrator','틈새포착','공격 기술이 상대의 장막과 대타출동을 무시합니다.',[{trigger:'onAttack',kind:'ignoreScreens'},{trigger:'onAttack',kind:'bypassSubstitute'}]);
abilities.oblivious=ability('oblivious','둔감','도발과 위협을 막습니다. 헤롱헤롱은 미지원.',[{trigger:'onTactical',kind:'tacticalImmunity',condition:'taunt'},{trigger:'onStatDrop',kind:'statImmunity',sourceId:'intimidate'}]);
abilities.aromaveil=ability('aromaveil','아로마베일','자신과 아군의 도발·앵콜을 막습니다. 다른 행동 제한 효과는 미지원.',[{trigger:'onTactical',kind:'tacticalImmunity',condition:'taunt',target:'allies'},{trigger:'onTactical',kind:'tacticalImmunity',condition:'encore',target:'allies'}]);
abilities.toughclaws = ability('toughclaws', '단단한발톱', '접촉 기술의 위력이 1.3배가 됩니다.', [{trigger:'onAttack',kind:'damageMultiplier',condition:'contact',multiplier:1.3}]);
abilities.flamebody=ability('flamebody','불꽃몸','접촉 공격을 받으면 30% 확률로 상대에게 화상을 입힙니다.',[{trigger:'onContact',kind:'status',status:'burn',chance:30}]);
abilities.poisonpoint=ability('poisonpoint','독가시','접촉 공격을 받으면 30% 확률로 상대에게 독을 입힙니다.',[{trigger:'onContact',kind:'status',status:'poison',chance:30}]);
abilities.lightningrod=ability('lightningrod','피뢰침','전기 기술을 무효화하고 특수공격을 1단계 올립니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'electric',boostStat:'spa'}]);
abilities.sapsipper=ability('sapsipper','초식','풀 기술을 무효화하고 공격을 1단계 올립니다.',[{trigger:'onDamage',kind:'typeImmunity',type:'grass',boostStat:'atk'}]);
abilities.naturalcure=ability('naturalcure','자연회복','교체하면 상태 이상이 회복됩니다.',[{trigger:'onExit',kind:'cureStatus'}]);
abilities.speedboost=ability('speedboost','가속','턴이 끝날 때 스피드가 1단계 오릅니다.',[{trigger:'onEndTurn',kind:'stat',stat:'spe',stages:1}]);
abilities.icebody=ability('icebody','아이스바디','눈이 내릴 때 턴 종료 시 최대 HP의 1/16을 회복합니다.',[{trigger:'onEndTurn',kind:'heal',fraction:1/16,weather:'snow'}]);
abilities.overcoat=ability('overcoat','방진','모래바람 피해와 가루 기술을 막습니다.',[{trigger:'onWeatherDamage',kind:'immunity',weather:'sand'},{trigger:'onPowder',kind:'immunity'}]);
abilities.moxie=ability('moxie','자기과신','기술로 상대를 쓰러뜨리면 공격이 1단계 오릅니다.',[{trigger:'onKO',kind:'stat',stat:'atk',stages:1}]);
abilities.moldbreaker=ability('moldbreaker','틀깨기','기술 사용 시 상대의 방어 특성을 무시합니다.',[{trigger:'onAttack',kind:'ignoreTargetAbility'}]);
abilities.contrary=ability('contrary','심술꾸러기','능력치 변화의 상승과 하락을 반대로 바꿉니다.',[{trigger:'onStatChange',kind:'invertStages'}]);
abilities.rockhead=ability('rockhead','돌머리','공격 기술의 반동 피해를 받지 않습니다.',[{trigger:'onRecoil',kind:'immunity'}]);
abilities.pressure=ability('pressure','프레셔','자신을 대상으로 한 상대 기술의 PP를 1 더 소모시킵니다.',[{trigger:'onPPUse',kind:'extraPP',amount:1}]);
abilities.sheerforce=ability('sheerforce','우격다짐','확률형 추가 효과를 포기하고 해당 공격의 위력을 1.3배로 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'secondary',multiplier:1.3}]);
abilities.keeneye=ability('keeneye','날카로운눈','명중률 하락을 막고 상대 회피율 상승을 무시합니다.',[{trigger:'onStatDrop',kind:'statImmunity',stat:'accuracy'},{trigger:'onAccuracy',kind:'ignoreEvasion'}]);
abilities.reckless=ability('reckless','이판사판','반동 피해를 주는 공격 기술의 위력을 1.2배로 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'recoil',multiplier:1.2}]);
abilities.weakarmor=ability('weakarmor','깨어진갑옷','물리 공격을 받으면 방어가 1단계 떨어지고 스피드가 2단계 오릅니다.',[{trigger:'onAfterHit',kind:'stat',stat:'def',stages:-1,category:'physical'},{trigger:'onAfterHit',kind:'stat',stat:'spe',stages:2,category:'physical'}]);
abilities.justified=ability('justified','정의의마음','악 타입 기술에 맞으면 공격이 1단계 오릅니다.',[{trigger:'onAfterHit',kind:'stat',stat:'atk',stages:1,type:'dark'}]);
abilities.megalauncher=ability('megalauncher','메가런처','파동 기술의 위력을 1.5배로 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'pulse',multiplier:1.5}]);
abilities.strongjaw=ability('strongjaw','옹골찬턱','물기 기술의 위력을 1.5배로 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'bite',multiplier:1.5}]);
abilities.sharpness=ability('sharpness','예리함','베기 기술의 위력을 1.5배로 높입니다.',[{trigger:'onAttack',kind:'damageMultiplier',condition:'slicing',multiplier:1.5}]);
abilities.aerilate=ability('aerilate','스카이스킨','노말 공격을 비행 타입으로 바꾸고 위력을 1.2배로 높입니다.',[{trigger:'onMoveType',kind:'convertType',from:'normal',to:'flying',multiplier:1.2}]);
abilities.pixilate=ability('pixilate','페어리스킨','노말 공격을 페어리 타입으로 바꾸고 위력을 1.2배로 높입니다.',[{trigger:'onMoveType',kind:'convertType',from:'normal',to:'fairy',multiplier:1.2}]);
abilities.refrigerate=ability('refrigerate','프리즈스킨','노말 공격을 얼음 타입으로 바꾸고 위력을 1.2배로 높입니다.',[{trigger:'onMoveType',kind:'convertType',from:'normal',to:'ice',multiplier:1.2}]);
abilities.filter=ability('filter','필터','효과가 굉장한 공격의 피해를 0.75배로 줄입니다.',[{trigger:'onSuperEffectiveDamage',kind:'damageMultiplier',multiplier:0.75}]);
abilities.parentalbond=ability('parentalbond','부자유친','단일 대상 공격이 한 번 더 맞으며 두 번째 공격은 피해가 1/4입니다.',[{trigger:'onMultiHit',kind:'secondStrike',multiplier:0.25}]);
for(const id of ['waterpulse','dragonpulse','darkpulse','aurasphere'])moves[id].pulse=true;
for(const id of ['crunch'])moves[id].bite=true;
for(const id of ['xscissor','shadowclaw','dragonclaw','razorleaf','bitterblade'])moves[id].slicing=true;
for(const id of ['kowtowcleave','leafblade','stoneaxe','ceaselessedge','psychocut','nightslash','aerialace'])moves[id].slicing=true;

// Preserve hand-written effects while using the pinned source's exact attack tags.
// Close Combat and Gigaton Hammer, for example, must not receive Iron Fist's bonus.
const attackFlags=['contact','sound','powder','bite','slicing','pulse','punch','bullet'] as const;
for(const [id,definition] of Object.entries(championMoves)){
  for(const flag of attackFlags)moves[id][flag]=definition[flag]??false;
  if(definition.dynamicPower)moves[id].dynamicPower=definition.dynamicPower;
  if(definition.ohko)moves[id].power=0;
}

items.leek=item('leek','대파','파오리 계열이 지니면 급소에 맞힐 확률이 크게 오릅니다.',[{trigger:'onCritical',kind:'criticalBoost',stages:2,speciesIds:['farfetchd','sirfetchd']}]);
items.spelltag=item('spelltag','저주의부적','고스트 타입 기술의 위력이 1.2배가 됩니다.',[{trigger:'onAttack',kind:'damageMultiplier',type:'ghost',multiplier:1.2}]);

const silvallyMemoryNames:Record<string,string>={bugmemory:'벌레메모리',darkmemory:'악메모리',dragonmemory:'드래곤메모리',electricmemory:'전기메모리',fairymemory:'페어리메모리',fightingmemory:'격투메모리',firememory:'불꽃메모리',flyingmemory:'비행메모리',ghostmemory:'고스트메모리',grassmemory:'풀메모리',groundmemory:'땅메모리',icememory:'얼음메모리',poisonmemory:'독메모리',psychicmemory:'에스퍼메모리',rockmemory:'바위메모리',steelmemory:'강철메모리',watermemory:'물메모리'};
for(const [id,name] of Object.entries(silvallyMemoryNames))items[id]=item(id,name,'실바디의 타입을 해당 메모리 타입으로 바꾸며, 다른 포켓몬이 빼앗거나 지울 수 없습니다.',[]);
const existingItemIds=new Set(Object.keys(items).map(id=>id.toLowerCase()));
for(const [id,entry] of Object.entries(svItemCatalog))if(!existingItemIds.has(id.toLowerCase()))items[id]=entry;
Object.assign(items,svBattleItemOverrides);

export const starterTeam: TeamSet[] = [
  { speciesId: 'rotomwash', moves: ['hydropump', 'voltswitch', 'willowisp', 'protect'], abilityId: 'levitate', itemId: 'leftovers', natureId: 'modest', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'grimmsnarl', moves: ['spiritbreak', 'reflect', 'lightscreen', 'taunt'], abilityId: 'prankster', itemId: 'lightclay', natureId: 'adamant', evs: { hp: 252, atk: 252, spd: 4 } },
  { speciesId: 'garchomp', moves: ['outrage', 'earthquake', 'rockslide', 'protect'], abilityId: 'roughSkin', itemId: 'muscleBand', natureId: 'jolly', evs: { atk: 252, spe: 252, hp: 4 } },
  { speciesId: 'charizard', moves: ['flamethrower', 'airslash', 'roost', 'protect'], abilityId: 'blaze', itemId: 'charizarditey', natureId: 'timid', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'gholdengo', moves: ['makeitrain', 'shadowball', 'steelbeam', 'recover'], abilityId: 'goodasgold', itemId: 'wiseGlasses', natureId: 'modest', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'basculegion', moves: ['lastrespects', 'wavecrash', 'aquajet', 'protect'], abilityId: 'adaptability', itemId: 'mysticWater', natureId: 'adamant', evs: { atk: 252, spe: 252, hp: 4 } },
];

/** Always give callers a private copy: the team editor mutates nested arrays. */
export const getStarterTeam = (): TeamSet[] => structuredClone(starterTeam);
