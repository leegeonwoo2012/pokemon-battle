import type { Stats } from '../engine/types';

/** Battle-only forms whose stats or ability change at a defined battle event. */
export interface AbilityBattleForm {
  id: string;
  speciesId: string;
  name: string;
  types: string[];
  baseStats: Stats;
  abilityId: string;
}

export const abilityBattleForms: Record<string, AbilityBattleForm> = {
  zygardecomplete: {
    id: 'zygardecomplete', speciesId: 'zygarde', name: '지가르데 퍼펙트폼', types: ['dragon', 'ground'],
    baseStats: { hp: 216, atk: 100, def: 121, spa: 91, spd: 95, spe: 85 }, abilityId: 'powerconstruct',
  },
  terapagosterastal: {
    id: 'terapagosterastal', speciesId: 'terapagos', name: '테라파고스 테라스탈폼', types: ['normal'],
    baseStats: { hp: 95, atk: 95, def: 110, spa: 105, spd: 110, spe: 85 }, abilityId: 'terashell',
  },
  terapagosstellar: {
    id: 'terapagosstellar', speciesId: 'terapagos', name: '테라파고스 스텔라폼', types: ['normal'],
    baseStats: { hp: 160, atk: 105, def: 110, spa: 130, spd: 110, spe: 85 }, abilityId: 'teraformzero',
  },
};

export const silvallyMemoryTypes: Record<string, string> = {
  bugmemory: 'bug', darkmemory: 'dark', dragonmemory: 'dragon', electricmemory: 'electric',
  fairymemory: 'fairy', fightingmemory: 'fighting', firememory: 'fire', flyingmemory: 'flying',
  ghostmemory: 'ghost', grassmemory: 'grass', groundmemory: 'ground', icememory: 'ice',
  poisonmemory: 'poison', psychicmemory: 'psychic', rockmemory: 'rock', steelmemory: 'steel',
  watermemory: 'water',
};

export function isSilvallyMemory(itemId: string): boolean {
  return Object.hasOwn(silvallyMemoryTypes, itemId);
}
