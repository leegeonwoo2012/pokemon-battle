import { species } from './index';

export type SpriteFacing = 'front' | 'back';

/**
 * Local sprite routes follow National Dex IDs so a separately licensed asset
 * can be added without changing battle data. This build intentionally ships no
 * Pokémon artwork: the public repositories reviewed for this project do not
 * grant clear rights to redistribute the character images.
 */
export const nationalDexNumbers = Object.fromEntries(
  Object.values(species).map(entry => [entry.id, entry.nationalDex]),
) as Record<string, number>;

export const spritePathFor = (speciesId: string, facing: SpriteFacing): string | null => {
  const nationalDex = nationalDexNumbers[speciesId];
  if (!nationalDex) return null;
  // Place approved transparent PNGs in public/sprites/{front|back}/{dex}.png
  return `/sprites/${facing}/${nationalDex}.png`;
};
