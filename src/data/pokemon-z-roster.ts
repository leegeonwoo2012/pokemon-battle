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
    // Pokémon Z sample teams also show Defog, Wish, Helping Hand and
    // Thunderbolt; Cefireon's earlier Opalo sets include Shadow Ball and
    // Signal Beam. Keep those selectable alongside its signature support kit.
    learnset: ['hurricane', 'tailwind', 'featherdance', 'uturn', 'defog', 'wish', 'helpinghand', 'thunderbolt', 'shadowball', 'signalbeam'],
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
    // Expand the starter stub with moves documented on Pokémon Z trainer
    // teams and player sets, while retaining the original entries.
    learnset: ['judgment', 'cottonguard', 'moonlight', 'batonpass', 'boomburst', 'darkpulse', 'sludgebomb', 'powergem', 'focusblast', 'shadowball', 'helpinghand'],
    color: '#d7cbbd',
  },
];
