import { availableFormSprites, formSpriteFormats } from '../data/form-sprites.generated';

const verified = new Set<string>(availableFormSprites);

export function formSpriteSource(formId: string | undefined, facing: 'front' | 'back'): string | undefined {
  if (!formId || !verified.has(formId)) return undefined;
  return `${import.meta.env.BASE_URL}sprites/forms/${formId}-${facing}.${formSpriteFormats[formId]??'png'}`;
}

export function hasFormSprite(formId: string | undefined): boolean {
  return !!formId && verified.has(formId);
}
