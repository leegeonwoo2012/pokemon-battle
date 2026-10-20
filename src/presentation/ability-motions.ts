const dedicatedAbilityMotionIds = new Set(['intimidate']);

/** Ability ids that have a bespoke battle reveal in the presentation layer. */
export function hasDedicatedAbilityMotion(sourceId?: string): boolean {
  return !!sourceId && dedicatedAbilityMotionIds.has(sourceId);
}
