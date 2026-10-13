import { describe,it,expect } from 'vitest';
import { regulationSpecies as species } from '../data';
import { availableFormSprites } from '../data/form-sprites.generated';
import { physicalDimensions,speciesVisualScale,spriteBounds } from './sprite-geometry';
describe('verified sprite geometry',()=>{
  it('has real dimensions and measured alpha bounds for all M-C front/back pairs and forms',()=>{
    for(const mon of Object.values(species)) {
      expect(physicalDimensions(mon.id)?.height,mon.id).toBeGreaterThan(0);
      for(const face of ['front','back']){const box=spriteBounds(`/sprites/${face}/${mon.spriteId??mon.nationalDex}.png`)!;expect(box,mon.id).toBeDefined();expect(box.w*box.h).toBeGreaterThan(0);expect(box.x+box.w).toBeLessThanOrEqual(box.width);expect(box.y+box.h).toBeLessThanOrEqual(box.height);}
    }
    for(const form of availableFormSprites)for(const face of ['front','back'])expect(spriteBounds(`/sprites/forms/${form}-${face}.png`)).toBeDefined();
  });
  it('preserves small/large relative sizes with bounded fit and supports nested deployments',()=>{
    expect(speciesVisualScale('dedenne')).toBeLessThan(speciesVisualScale('raichu'));
    expect(speciesVisualScale('raichu')).toBeLessThan(speciesVisualScale('charizard'));
    expect(speciesVisualScale('gourgeist')).toBeLessThanOrEqual(1.12);
    expect(spriteBounds('/my-game/sprites/back/6.png')).toEqual(spriteBounds('/sprites/back/6.png'));
    expect(spriteBounds('blob:custom')).toBeUndefined();
  });
});
