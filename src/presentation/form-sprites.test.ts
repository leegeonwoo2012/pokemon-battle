import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { megaForms, gmaxForms } from '../data/gimmicks';
import { formSpriteSource } from './form-sprites';

const root = new URL('../../public/sprites/forms/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8')) as Record<string, {
  id: number; slug: string; front: { source: string; width: number; height: number }; back: { source: string; width: number; height: number };
}>;

describe('verified transformation sprites', () => {
  it('has unique PokeAPI identities and real PNG pairs for every supported Mega and Gmax form', () => {
    const requested = JSON.parse(readFileSync(new URL('../data/form-slugs.generated.json', import.meta.url), 'utf8')) as Record<string,string>;
    const supported = [...megaForms.map(form => form.id), ...Object.keys(gmaxForms).map(id => `${id}gmax`)];
    expect(supported.every(id=>manifest[id])).toBe(true);
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(requested).sort());
    expect(new Set(Object.values(manifest).map(entry => entry.id)).size).toBe(Object.keys(manifest).length);
    for (const [id, entry] of Object.entries(manifest)) for (const facing of ['front', 'back'] as const) {
      const bytes = readFileSync(new URL(`${id}-${facing}.png`, root));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBe(entry[facing].width);
      expect(bytes.readUInt32BE(20)).toBe(entry[facing].height);
      expect(entry[facing].source).toContain(`/pokemon/${facing === 'back' ? 'back/' : ''}${entry.id}.png`);
      expect(formSpriteSource(id, facing)).toBe(`/sprites/forms/${id}-${facing}.png`);
    }
    expect(formSpriteSource('unknown', 'front')).toBeUndefined();
  });
});
