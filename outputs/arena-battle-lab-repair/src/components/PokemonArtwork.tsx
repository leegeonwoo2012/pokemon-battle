import { useEffect, useState } from 'react';
import { species } from '../data';
import { spriteSources, useSpriteLibrary } from '../presentation/sprites';

export function PokemonArtwork({speciesId,facing='front',size='normal',fainted=false}:{speciesId:string;facing?:'front'|'back';size?:'normal'|'large';fainted?:boolean}) {
  const library=useSpriteLibrary();
  const sources=spriteSources(speciesId,facing,library);
  const signature=sources.join('|');
  const [index,setIndex]=useState(0);
  useEffect(()=>setIndex(0),[signature]);
  const mon=species[speciesId];const source=sources[index];
  return <div className={`sprite-art ${size==='large'?'sprite-art-large':''} ${fainted?'sprite-fainted':''} ${!source?'artwork-incomplete':''}`} role="img" aria-label={`${mon?.name ?? speciesId} ${facing==='back'?'후면':'정면'} ${source?'스프라이트':'이미지 미완성'}`}>
    {source?<img src={source} alt="" onError={()=>setIndex(value=>value+1)} />:<div className="missing-artwork"><span>#{String(mon?.nationalDex ?? 0).padStart(3,'0')}</span><strong>{mon?.name ?? speciesId}</strong><small>이미지 준비 필요</small></div>}
  </div>;
}

export function SpeciesMark({speciesId,className=''}:{speciesId:string;className?:string}) {
  const mon=species[speciesId];const library=useSpriteLibrary();const [failed,setFailed]=useState(false);
  const source=spriteSources(speciesId,'front',library)[0];
  useEffect(()=>setFailed(false),[source]);
  return <span className={`species-mark ${className}`} title={mon?.name} aria-label={mon?.name}>
    {source&&!failed?<img src={source} alt="" onError={()=>setFailed(true)}/>:<span className="dex-number">{mon?.nationalDex}</span>}
  </span>;
}
