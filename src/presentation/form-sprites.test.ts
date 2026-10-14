import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { megaForms, gmaxForms } from '../data/gimmicks';
import { formSpriteSource } from './form-sprites';
import { availableFormSprites, formSpriteFormats } from '../data/form-sprites.generated';

const root = new URL('../../public/sprites/forms/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as Record<string, {
  id: number; slug: string; front: { source: string; width: number; height: number; sha256?: string }; back: { source: string; width: number; height: number; sha256?: string };
}>;

describe('verified transformation sprites', () => {
  it('indexes only verified front/back form pairs, including Mega Zygarde from Legends: Z-A', () => {
    const requested = JSON.parse(readFileSync(new URL('../data/form-slugs.generated.json', import.meta.url), 'utf8')) as Record<string,string>;
    const supported = [...megaForms.map(form => form.id), ...Object.keys(gmaxForms).map(id => `${id}gmax`)];
    expect(supported.filter(id=>!manifest[id])).toEqual([]);
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(requested).sort());
    expect(availableFormSprites).toContain('zygardemega');
    expect(formSpriteFormats.zygardemega).toBe('png');
    expect(manifest.zygardemega).toMatchObject({id:10301,slug:'zygarde-mega',extractedFrame:0});
    for(const facing of ['front','back'] as const){
      const image=manifest.zygardemega[facing];
      const bytes=readFileSync(new URL(`zygardemega-${facing}.png`,root));
      expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
      expect(bytes.readUInt32BE(16)).toBe(512);
      expect(image.source).toContain(`/legends-za/${facing==='back'?'back/':''}10301.webp`);
      expect(image.sha256).toBeDefined();
      expect(formSpriteSource('zygardemega',facing)).toBe(`/sprites/forms/zygardemega-${facing}.png`);
    }
    expect(new Set(Object.values(manifest).map(entry => entry.id)).size).toBe(Object.keys(manifest).length);
    for (const [id, entry] of Object.entries(manifest)) for (const facing of ['front', 'back'] as const) {
      const extension=formSpriteFormats[id]??'png';
      const bytes = readFileSync(new URL(`${id}-${facing}.${extension}`, root));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(entry[facing].width);
      expect(bytes.readUInt32BE(20)).toBe(entry[facing].height);
      if(id!=='zygardemega')expect(entry[facing].source).toContain(`/pokemon/${facing === 'back' ? 'back/' : ''}${entry.id}.png`);
      expect(formSpriteSource(id, facing)).toBe(`/sprites/forms/${id}-${facing}.${extension}`);
    }
    expect(formSpriteSource('unknown', 'front')).toBeUndefined();
  });
  it('includes locally decoded Ultra Necrozma front and back images for Ultra Burst',()=>{
    expect(availableFormSprites).toContain('necrozmaultra');
    expect(manifest.necrozmaultra).toMatchObject({id:10157,slug:'necrozma-ultra'});
    for(const facing of ['front','back'] as const){
      const bytes=readFileSync(new URL(`necrozmaultra-${facing}.png`,root));
      expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
      expect(formSpriteSource('necrozmaultra',facing)).toBe(`/sprites/forms/necrozmaultra-${facing}.png`);
    }
  });
});
