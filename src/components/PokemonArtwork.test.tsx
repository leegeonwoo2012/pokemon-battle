// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';

const {library}=vi.hoisted(()=>({library:{'front/12001':'/sprites/front/12001.png','front/12002':'/sprites/front/12002.png'}}));
vi.mock('../presentation/sprites',()=>({
  useSpriteLibrary:()=>library,
  useSpriteDiagnostics:()=>({phase:'ready'}),
  spriteSources:(speciesId:string,facing:'front'|'back',entries:Record<string,string>)=>{
    const spriteId=speciesId==='zephyreon'?'12001':'12002';
    return [entries[`${facing}/${spriteId}`]??(facing==='back'?entries[`front/${spriteId}`]:undefined)].filter(Boolean);
  },
  reportSpriteRenderFailure:vi.fn(),
  spriteFallbackUrl:'/sprites/unavailable.svg',
}));
vi.mock('../presentation/sprite-geometry',()=>({spriteBounds:()=>undefined}));
vi.mock('../presentation/form-sprites',()=>({formSpriteSource:()=>undefined}));

import {PokemonArtwork} from './PokemonArtwork';

afterEach(cleanup);

describe('fan-made Eeveelution battle sprites',()=>{
  it.each(['zephyreon','royaleon'])('%s faces the opponent when only its front sprite is available',speciesId=>{
    render(<PokemonArtwork speciesId={speciesId} facing="back"/>);
    expect(screen.getByRole('img').getAttribute('data-sprite-facing')).toBe('mirrored-front');
    expect((screen.getByRole('img').querySelector('.sprite-uncropped') as HTMLElement).style.transform).toBe('scaleX(-1)');
  });
});
