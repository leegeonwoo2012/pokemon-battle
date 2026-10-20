import { describe, expect, it } from 'vitest';
import { hasDedicatedAbilityMotion } from './ability-motions';

describe('ability battle choreography', () => {
  it('reserves the Intimidate reveal for its dedicated pressure-wave motion', () => {
    expect(hasDedicatedAbilityMotion('intimidate')).toBe(true);
    expect(hasDedicatedAbilityMotion('trace')).toBe(false);
    expect(hasDedicatedAbilityMotion()).toBe(false);
  });
});
