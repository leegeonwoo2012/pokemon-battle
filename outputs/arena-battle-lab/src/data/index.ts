import type { Ability, Item, Move, Nature, Species, TeamSet } from '../engine/types';

/**
 * A deliberately small, hand-authored fan battle roster. These values define this
 * prototype's rules and are not claimed to be the official Champions rule set.
 * No sprites, audio, text descriptions, or code have been copied from the games.
 */

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
  steel: '강철', fairy: '페어리',
};

const move = (
  id: string, name: string, type: string, category: Move['category'], power: number,
  accuracy: number | null, pp: number, target: Move['target'] = 'enemy',
  effects?: Move['effects'], priority = 0, contact = false,
): Move => ({ id, name, type, category, power, accuracy, pp, target, effects, priority, contact });

export const moves: Record<string, Move> = Object.fromEntries(([
  move('tackle', '몸통박치기', 'normal', 'physical', 40, 100, 35, 'enemy', undefined, 0, true),
  move('quickattack', '전광석화', 'normal', 'physical', 40, 100, 30, 'enemy', undefined, 1, true),
  move('return', '은혜갚기', 'normal', 'physical', 90, 100, 20, 'enemy', undefined, 0, true),
  move('hypervoice', '하이퍼보이스', 'normal', 'special', 90, 100, 10, 'allEnemies'),
  move('flamethrower', '화염방사', 'fire', 'special', 90, 100, 15, 'enemy', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('fireblast', '불대문자', 'fire', 'special', 110, 85, 5, 'enemy', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('flareblitz', '플레어드라이브', 'fire', 'physical', 120, 100, 15, 'enemy', [{ kind: 'recoil', fraction: 1 / 3 }], 0, true),
  move('heatwave', '열풍', 'fire', 'special', 95, 90, 10, 'allEnemies', [{ kind: 'status', status: 'burn', chance: 10 }]),
  move('waterpulse', '물의파동', 'water', 'special', 60, 100, 20),
  move('surf', '파도타기', 'water', 'special', 90, 100, 15, 'allOthers'),
  move('hydropump', '하이드로펌프', 'water', 'special', 110, 80, 5),
  move('waterfall', '폭포오르기', 'water', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
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
  move('airslash', '에어슬래시', 'flying', 'special', 75, 95, 15),
  move('hurricane', '폭풍', 'flying', 'special', 110, 70, 10),
  move('psychic', '사이코키네시스', 'psychic', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('xscissor', '시저크로스', 'bug', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
  move('bugbuzz', '벌레의야단법석', 'bug', 'special', 90, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('rockslide', '스톤샤워', 'rock', 'physical', 75, 90, 10, 'allEnemies'),
  move('stoneedge', '스톤에지', 'rock', 'physical', 100, 80, 5),
  move('shadowball', '섀도볼', 'ghost', 'special', 80, 100, 15, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 20 }]),
  move('shadowclaw', '섀도클로', 'ghost', 'physical', 70, 100, 15, 'enemy', undefined, 0, true),
  move('dragonclaw', '드래곤클로', 'dragon', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
  move('dragonpulse', '용의파동', 'dragon', 'special', 85, 100, 10),
  move('darkpulse', '악의파동', 'dark', 'special', 80, 100, 15),
  move('crunch', '깨물어부수기', 'dark', 'physical', 80, 100, 15, 'enemy', [{ kind: 'stat', stat: 'def', stages: -1, chance: 20 }], 0, true),
  move('ironhead', '아이언헤드', 'steel', 'physical', 80, 100, 15, 'enemy', undefined, 0, true),
  move('flashcannon', '러스터캐논', 'steel', 'special', 80, 100, 10, 'enemy', [{ kind: 'stat', stat: 'spd', stages: -1, chance: 10 }]),
  move('dazzlinggleam', '매지컬샤인', 'fairy', 'special', 80, 100, 10, 'allEnemies'),
  move('moonblast', '문포스', 'fairy', 'special', 95, 100, 15, 'enemy', [{ kind: 'stat', stat: 'spa', stages: -1, chance: 30 }]),
  move('thunderwave', '전기자석파', 'electric', 'status', 0, 90, 20, 'enemy', [{ kind: 'status', status: 'paralysis' }]),
  move('sleeppowder', '수면가루', 'grass', 'status', 0, 75, 15, 'enemy', [{ kind: 'status', status: 'sleep' }]),
  move('willowisp', '도깨비불', 'fire', 'status', 0, 85, 15, 'enemy', [{ kind: 'status', status: 'burn' }]),
  move('swordsdance', '칼춤', 'normal', 'status', 0, null, 20, 'self', [{ kind: 'stat', stat: 'atk', stages: 2, target: 'self' }]),
  move('calmmind', '명상', 'psychic', 'status', 0, null, 20, 'self', [
    { kind: 'stat', stat: 'spa', stages: 1, target: 'self' }, { kind: 'stat', stat: 'spd', stages: 1, target: 'self' },
  ]),
  move('dragondance', '용의춤', 'dragon', 'status', 0, null, 20, 'self', [
    { kind: 'stat', stat: 'atk', stages: 1, target: 'self' }, { kind: 'stat', stat: 'spe', stages: 1, target: 'self' },
  ]),
  move('recover', 'HP회복', 'normal', 'status', 0, null, 10, 'self', [{ kind: 'heal', fraction: 0.5, target: 'self' }]),
  move('roost', '날개쉬기', 'flying', 'status', 0, null, 10, 'self', [{ kind: 'heal', fraction: 0.5, target: 'self' }]),
  move('protect', '방어', 'normal', 'status', 0, null, 10, 'self', [{ kind: 'protect' }], 4),
  move('raindance', '비바라기', 'water', 'status', 0, null, 5, 'self', [{ kind: 'weather', weather: 'rain', turns: 5 }]),
  move('sunnyday', '쾌청', 'fire', 'status', 0, null, 5, 'self', [{ kind: 'weather', weather: 'sun', turns: 5 }]),
  move('electricterrain', '일렉트릭필드', 'electric', 'status', 0, null, 10, 'self', [{ kind: 'field', field: 'electric', turns: 5 }]),
  move('grassyterrain', '그래스필드', 'grass', 'status', 0, null, 10, 'self', [{ kind: 'field', field: 'grassy', turns: 5 }]),
] as Move[]).map(entry => [entry.id, entry]));

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
  ability('flashFire', '타오르는불꽃', '불꽃타입 공격을 받지 않습니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'fire' }]),
  ability('voltAbsorb', '축전', '전기타입 공격을 받지 않습니다. 회복 효과는 이번 버전에 포함되지 않습니다.', [{ trigger: 'onDamage', kind: 'typeImmunity', type: 'electric' }]),
  ability('sandRush', '모래헤치기', '모래바람이 불면 스피드가 2배가 됩니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', weather: 'sand', multiplier: 2 }]),
  ability('roughSkin', '까칠한피부', '접촉 피해 반사는 이번 버전에 포함되지 않습니다.', []),
  ability('synchronize', '싱크로', '상태 이상 반사는 이번 버전에 포함되지 않습니다.', []),
  ability('marvelScale', '이상한비늘', '상태 이상 중 방어력 보정은 이번 버전에 포함되지 않습니다.', []),
  ability('sereneGrace', '하늘의은총', '추가 효과 확률 보정은 이번 버전에 포함되지 않습니다.', []),
  ability('innerFocus', '정신력', '현재 규칙에서 추가 효과가 없습니다.', []),
  ability('clearBody', '클리어바디', '현재 규칙에서 추가 효과가 없습니다.', []),
] as Ability[]).map(entry => [entry.id, entry]));

const item = (id: string, name: string, description: string, effects: Item['effects']): Item => ({ id, name, description, effects });
export const items: Record<string, Item> = Object.fromEntries(([
  item('none', '없음', '지닌 도구가 없습니다.', []),
  item('leftovers', '먹다남은음식', '매 턴 종료 시 최대 HP의 1/16을 회복합니다.', [{ trigger: 'onEndTurn', kind: 'heal', fraction: 1 / 16 }]),
  item('muscleBand', '힘의머리띠', '물리 공격의 위력이 1.1배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', category: 'physical', multiplier: 1.1 }]),
  item('wiseGlasses', '박식안경', '특수 공격의 위력이 1.1배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', category: 'special', multiplier: 1.1 }]),
  item('choiceScarf', '구애스카프', '스피드가 1.5배가 됩니다. 기술 고정은 이 버전에서 지원하지 않습니다.', [{ trigger: 'onSpeed', kind: 'speedMultiplier', multiplier: 1.5 }]),
  item('charcoal', '목탄', '불꽃 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'fire', multiplier: 1.2 }]),
  item('mysticWater', '신비의물방울', '물 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'water', multiplier: 1.2 }]),
  item('magnet', '자석', '전기 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'electric', multiplier: 1.2 }]),
  item('miracleSeed', '기적의씨', '풀 기술 위력이 1.2배가 됩니다.', [{ trigger: 'onAttack', kind: 'damageMultiplier', type: 'grass', multiplier: 1.2 }]),
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

const nationalDexById: Record<string, number> = {
  pikachu: 25, charizard: 6, blastoise: 9, venusaur: 3, gengar: 94, dragonite: 149,
  garchomp: 445, lucario: 448, gardevoir: 282, tyranitar: 248, gyarados: 130,
  snorlax: 143, jolteon: 135, arcanine: 59, scizor: 212, excadrill: 530,
  milotic: 350, togekiss: 468,
};

const speciesEntry = (
  id: string, name: string, types: string[], stats: [number, number, number, number, number, number],
  possibleAbilities: string[], learnset: string[], color: string,
): Species => ({
  id, nationalDex: nationalDexById[id], name, types,
  baseStats: { hp: stats[0], atk: stats[1], def: stats[2], spa: stats[3], spd: stats[4], spe: stats[5] },
  abilities: possibleAbilities, learnset, color,
});

export const species: Record<string, Species> = Object.fromEntries(([
  speciesEntry('pikachu', '피카츄', ['electric'], [35, 55, 40, 50, 50, 90], ['static'],
    ['thunderbolt', 'thunder', 'quickattack', 'thunderwave', 'spark', 'protect', 'electricterrain', 'return'], '#f6c945'),
  speciesEntry('charizard', '리자몽', ['fire', 'flying'], [78, 84, 78, 109, 85, 100], ['blaze'],
    ['flamethrower', 'fireblast', 'heatwave', 'airslash', 'hurricane', 'roost', 'sunnyday', 'protect', 'dragonpulse'], '#eb774a'),
  speciesEntry('blastoise', '거북왕', ['water'], [79, 83, 100, 85, 105, 78], ['torrent'],
    ['surf', 'hydropump', 'waterpulse', 'icebeam', 'icywind', 'protect', 'raindance', 'return'], '#5d92d0'),
  speciesEntry('venusaur', '이상해꽃', ['grass', 'poison'], [80, 82, 83, 100, 100, 80], ['overgrow', 'chlorophyll'],
    ['energyball', 'leafstorm', 'gigadrain', 'sludgebomb', 'sleeppowder', 'sunnyday', 'grassyterrain', 'protect', 'earthpower'], '#61a98b'),
  speciesEntry('gengar', '팬텀', ['ghost', 'poison'], [60, 65, 60, 130, 75, 110], ['levitate'],
    ['shadowball', 'sludgebomb', 'thunderbolt', 'willowisp', 'protect', 'darkpulse', 'dazzlinggleam'], '#8061b5'),
  speciesEntry('dragonite', '망나뇽', ['dragon', 'flying'], [91, 134, 95, 100, 100, 80], ['multiscale', 'innerFocus'],
    ['dragonclaw', 'dragonpulse', 'earthquake', 'fireblast', 'roost', 'dragondance', 'protect', 'hurricane'], '#d29c53'),
  speciesEntry('garchomp', '한카리아스', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], ['roughSkin'],
    ['earthquake', 'dragonclaw', 'stoneedge', 'rockslide', 'swordsdance', 'protect', 'fireblast', 'crunch'], '#647eae'),
  speciesEntry('lucario', '루카리오', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], ['innerFocus'],
    ['closecombat', 'aurasphere', 'flashcannon', 'ironhead', 'swordsdance', 'protect', 'darkpulse', 'quickattack'], '#7192c3'),
  speciesEntry('gardevoir', '가디안', ['psychic', 'fairy'], [68, 65, 65, 125, 115, 80], ['synchronize'],
    ['psychic', 'energyball', 'moonblast', 'dazzlinggleam', 'calmmind', 'protect', 'thunderbolt', 'shadowball'], '#85bea9'),
  speciesEntry('tyranitar', '마기라스', ['rock', 'dark'], [100, 134, 110, 95, 100, 61], ['sandStream'],
    ['rockslide', 'stoneedge', 'crunch', 'earthquake', 'dragonclaw', 'protect', 'fireblast', 'thunderwave'], '#8fa875'),
  speciesEntry('gyarados', '갸라도스', ['water', 'flying'], [95, 125, 79, 60, 100, 81], ['intimidate'],
    ['waterfall', 'earthquake', 'crunch', 'icebeam', 'dragondance', 'protect', 'raindance', 'return'], '#5395bb'),
  speciesEntry('snorlax', '잠만보', ['normal'], [160, 110, 65, 65, 110, 30], ['thickFat'],
    ['return', 'earthquake', 'crunch', 'rockslide', 'protect', 'fireblast', 'thunderbolt'], '#5d8380'),
  speciesEntry('jolteon', '쥬피썬더', ['electric'], [65, 65, 60, 110, 95, 130], ['voltAbsorb'],
    ['thunderbolt', 'thunder', 'spark', 'thunderwave', 'shadowball', 'protect', 'electricterrain', 'quickattack'], '#e3c65c'),
  speciesEntry('arcanine', '윈디', ['fire'], [90, 110, 80, 100, 80, 95], ['intimidate', 'flashFire'],
    ['flareblitz', 'flamethrower', 'heatwave', 'willowisp', 'crunch', 'protect', 'sunnyday', 'return'], '#d98b62'),
  speciesEntry('scizor', '핫삼', ['bug', 'steel'], [70, 130, 100, 55, 80, 65], ['technician'],
    ['xscissor', 'bugbuzz', 'ironhead', 'quickattack', 'swordsdance', 'protect', 'roost', 'return'], '#bf6b70'),
  speciesEntry('excadrill', '몰드류', ['ground', 'steel'], [110, 135, 60, 50, 65, 88], ['sandRush'],
    ['earthquake', 'ironhead', 'rockslide', 'stoneedge', 'swordsdance', 'protect', 'return', 'quickattack'], '#9c8b7f'),
  speciesEntry('milotic', '밀로틱', ['water'], [95, 60, 79, 100, 125, 81], ['marvelScale'],
    ['surf', 'hydropump', 'icebeam', 'icywind', 'recover', 'protect', 'raindance', 'waterpulse'], '#9b8dd2'),
  speciesEntry('togekiss', '토게키스', ['fairy', 'flying'], [85, 50, 95, 120, 115, 80], ['sereneGrace'],
    ['airslash', 'dazzlinggleam', 'moonblast', 'roost', 'thunderwave', 'protect', 'heatwave', 'calmmind'], '#ddd7c8'),
] as Species[]).map(entry => [entry.id, entry]));

export const starterTeam: TeamSet[] = [
  { speciesId: 'pikachu', moves: ['thunderbolt', 'quickattack', 'thunderwave', 'protect'], abilityId: 'static', itemId: 'magnet', natureId: 'timid', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'charizard', moves: ['flamethrower', 'airslash', 'roost', 'protect'], abilityId: 'blaze', itemId: 'charcoal', natureId: 'timid', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'blastoise', moves: ['surf', 'icebeam', 'raindance', 'protect'], abilityId: 'torrent', itemId: 'mysticWater', natureId: 'modest', evs: { spa: 252, hp: 252, def: 4 } },
  { speciesId: 'venusaur', moves: ['energyball', 'sludgebomb', 'gigadrain', 'protect'], abilityId: 'overgrow', itemId: 'miracleSeed', natureId: 'modest', evs: { spa: 252, spe: 252, hp: 4 } },
  { speciesId: 'garchomp', moves: ['earthquake', 'dragonclaw', 'rockslide', 'protect'], abilityId: 'roughSkin', itemId: 'muscleBand', natureId: 'jolly', evs: { atk: 252, spe: 252, hp: 4 } },
  { speciesId: 'gardevoir', moves: ['psychic', 'moonblast', 'calmmind', 'protect'], abilityId: 'synchronize', itemId: 'wiseGlasses', natureId: 'modest', evs: { spa: 252, spe: 252, hp: 4 } },
];

/** Always give callers a private copy: the team editor mutates nested arrays. */
export const getStarterTeam = (): TeamSet[] => structuredClone(starterTeam);
