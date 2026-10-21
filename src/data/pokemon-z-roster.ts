import type { Species } from '../engine/types';

/** Pokémon Z Eevee evolutions; names are localized for this project. */
export const pokemonZRoster: Species[] = [
  {
    id: 'zephyreon',
    nationalDex: 11001,
    spriteId: 12001,
    name: '제피레온',
    englishName: 'Cefireon',
    representativeType: 'flying',
    types: ['flying'],
    baseStats: { hp: 65, atk: 65, def: 60, spa: 110, spd: 95, spe: 130 },
    abilities: ['lightningrod', 'compoundeyes'],
    learnset: ['hurricane', 'tailwind', 'featherdance', 'uturn'],
    color: '#c8d5ef',
  },
  {
    id: 'royaleon',
    nationalDex: 11002,
    spriteId: 12002,
    name: '로얄레온',
    englishName: 'Royaleon',
    representativeType: 'normal',
    types: ['normal'],
    baseStats: { hp: 110, atk: 60, def: 95, spa: 130, spd: 65, spe: 65 },
    abilities: ['royalty', 'furcoat'],
    learnset: ['judgment', 'cottonguard', 'moonlight', 'batonpass'],
    color: '#d7cbbd',
  },
];
