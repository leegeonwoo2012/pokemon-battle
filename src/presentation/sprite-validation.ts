import { regulationSpecies, species } from '../data';
export type Facing = 'front' | 'back';
export type SpriteLibrary = Record<string,string>;
const spriteNumbers = new Set(Object.values(regulationSpecies).map(pokemon=>pokemon.spriteId??pokemon.nationalDex));
export function validateSpriteManifest(value:unknown):{images:SpriteLibrary;errors:string[]} {
  if(!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('images' in value) || !value.images || typeof value.images !== 'object' || Array.isArray(value.images))
    throw new Error('스프라이트 manifest 형식이 올바르지 않습니다. version: 1, images 객체가 필요합니다.');
  const images:SpriteLibrary={}, errors:string[]=[];
  for(const [key,path] of Object.entries(value.images)) {
    const match=key.match(/^(front|back)\/([1-9]\d*)$/);
    if(!match || !spriteNumbers.has(Number(match[2])) || typeof path !== 'string' || path !== `/sprites/${key}.png`) {
      errors.push(`${key}: 도감 번호·방향과 파일 경로가 일치하지 않습니다.`);continue;
    }
    images[key]=path;
  }
  return {images,errors};
}
export function spriteKey(speciesId:string,facing:Facing):string|undefined {
  const pokemon=species[speciesId],spriteId=pokemon?.spriteId??pokemon?.nationalDex;return spriteId ? `${facing}/${spriteId}` : undefined;
}
export function pngSignature(bytes:Uint8Array):boolean {
  return bytes.length>=24 && bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
}
export function assetUrl(path:string,base:string):string {
  return `${base.replace(/\/?$/,'/')}${path.replace(/^\//,'')}`;
}
