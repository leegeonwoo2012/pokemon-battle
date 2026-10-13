import metadata from './sprite-metrics.generated.json';

export interface SpriteBounds { width: number; height: number; x: number; y: number; w: number; h: number }
export function spriteBounds(source: string | undefined): SpriteBounds | undefined {
  if (!source || source.startsWith('blob:')) return undefined;
  // BASE_URL can be a nested deployment path. IndexedDB user art is measured separately.
  const index = source.indexOf('/sprites/');
  return index < 0 ? undefined : (metadata.images as Record<string, SpriteBounds>)[source.slice(index)];
}
export function physicalDimensions(id: string, formId?: string) {
  const dimensions = metadata.dimensions as Record<string, { height: number; weight: number }>;
  return dimensions[formId ?? id] ?? dimensions[id];
}
/** Camera compression preserves physical size differences without hiding tiny species. */
export function speciesVisualProfile(id: string, formId?: string) {
  const dimensions = physicalDimensions(id, formId) ?? {height:1.5,weight:70};
  // The dex calls a serpent's length its height. Use a shallower exponent for these silhouettes.
  const elongated = ['gyarados','milotic','steelix','onix','serperior','dondozo'].includes(id);
  const heightScale = Math.pow(dimensions.height / 2, elongated ? .22 : .34);
  const massScale = Math.pow(Math.max(.1, dimensions.weight) / 70, .035);
  const scale = Math.max(.38, Math.min(1.16, heightScale * massScale));
  const shadowScale = Math.max(.45, Math.min(1.35, Math.pow(Math.max(.1, dimensions.weight) / 70, .12)));
  return {...dimensions,scale,shadowScale};
}
export function speciesVisualScale(id: string, formId?: string): number {
  return speciesVisualProfile(id, formId).scale;
}
