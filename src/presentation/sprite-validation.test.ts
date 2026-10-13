import { describe, expect, it } from 'vitest';
import { assetUrl, pngSignature, spriteKey, validateSpriteManifest } from './sprite-validation';

describe('sprite identity and routing',()=>{
  it('uses the species National Dex number for both directions',()=>{
    expect(spriteKey('raichu','front')).toBe('front/26');
    expect(spriteKey('charizard','back')).toBe('back/6');
    expect(spriteKey('tyranitar','back')).toBe('back/248');
    expect(spriteKey('raichualola','front')).toBe('front/10100');
    expect(spriteKey('unknown','front')).toBeUndefined();
  });
  it('rejects another species, another facing, unknown Dex and external paths',()=>{
    const result=validateSpriteManifest({version:1,images:{
      'back/26':'/sprites/front/6.png','front/6':'/sprites/back/6.png',
      'front/99999':'/sprites/front/99999.png','front/248':'https://example.com/248.png',
      'front/3':'/sprites/front/3.png',
    }});
    expect(result.images).toEqual({'front/3':'/sprites/front/3.png'});
    expect(result.errors).toHaveLength(4);
  });
  it('rejects malformed manifests instead of silently presenting an empty library',()=>{
    for(const value of [null,'<html>',{version:2,images:{}},{version:1,images:[]}])
      expect(()=>validateSpriteManifest(value)).toThrow(/manifest/);
  });
  it('resolves local assets under a deployed subdirectory',()=>{
    expect(assetUrl('/sprites/front/6.png','/arena/')).toBe('/arena/sprites/front/6.png');
    expect(assetUrl('/sprites/manifest.json','/')).toBe('/sprites/manifest.json');
  });
  it('rejects HTML or truncated bytes even when the filename ends in png',()=>{
    expect(pngSignature(new TextEncoder().encode('<!DOCTYPE html><title>Vite</title>'))).toBe(false);
    expect(pngSignature(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe(false);
  });
});
