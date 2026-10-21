import { useState, type CSSProperties } from 'react';
import { spriteBounds, type SpriteBounds } from '../presentation/sprite-geometry';
import { species } from '../data';
import { formSpriteSource } from '../presentation/form-sprites';
import { reportSpriteRenderFailure, spriteFallbackUrl, spriteSources, useSpriteDiagnostics, useSpriteLibrary } from '../presentation/sprites';

export function PokemonArtwork({speciesId,formId,displayName,facing='front',size='normal',fainted=false}:{speciesId:string;formId?:string;displayName?:string;facing?:'front'|'back';size?:'normal'|'large';fainted?:boolean}) {
  const library=useSpriteLibrary();
  const checking=useSpriteDiagnostics().phase!=='ready';
  const sources=spriteSources(speciesId,facing,library);
  const [failedFormUrl,setFailedFormUrl]=useState('');
  const formUrl=formSpriteSource(formId,facing);
  const formReady=!!formUrl&&formUrl!==failedFormUrl;
  const mon=species[speciesId];const source=formReady?formUrl:sources[0];
  const spriteId=mon?.spriteId??mon?.nationalDex;
  const usingFront=!formReady&&facing==='back'&&source===library[`front/${spriteId}`]&&source!==library[`back/${spriteId}`];
  const [userBounds,setUserBounds]=useState<{source:string;bounds:SpriteBounds}>();
  const bounds=spriteBounds(source)??(userBounds&&userBounds.source===source?userBounds.bounds:undefined);
  const cropped=size==='large'&&!!bounds;
  const cropStyle:CSSProperties|undefined=cropped?{
    '--sprite-aspect':bounds.w/bounds.h, aspectRatio:`${bounds.w} / ${bounds.h}`,
  } as CSSProperties:undefined;
  const imageStyle:CSSProperties|undefined=cropped?{width:`${bounds.width/bounds.w*100}%`,height:`${bounds.height/bounds.h*100}%`,left:`${-bounds.x/bounds.w*100}%`,top:`${-bounds.y/bounds.h*100}%`}:undefined;
  return <div data-sprite-ready={!!source} data-form-sprite={formReady?'true':'false'} data-sprite-facing={source?(usingFront?'mirrored-front':facing):checking?'loading':'fallback'} className={`sprite-art ${size==='large'?'sprite-art-large':''} ${fainted?'sprite-fainted':''} ${!source?'artwork-incomplete':''}`} role="img" aria-label={`${displayName??mon?.name??speciesId} ${facing==='back'?'후면':'정면'} ${source?(usingFront?'대체: 정면 스프라이트 좌우 반전':'스프라이트'):checking?'이미지 확인 중':'이미지 미완성'}`}>
    {source?<div className={cropped?'sprite-crop':'sprite-uncropped'} style={usingFront?{...cropStyle,transform:'scaleX(-1)'}:cropStyle}><img className="pokemon-sprite" src={source} style={imageStyle} alt="" onLoad={event=>{
      if(size!=='large'||!source.startsWith('blob:'))return;
      const image=event.currentTarget,canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d');if(!context)return;context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let x=canvas.width,y=canvas.height,right=-1,bottom=-1;
      for(let py=0;py<canvas.height;py++)for(let px=0;px<canvas.width;px++)if(pixels[(py*canvas.width+px)*4+3]>=16){x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);}
      if(right>=0)setUserBounds({source,bounds:{width:canvas.width,height:canvas.height,x,y,w:right-x+1,h:bottom-y+1}});
    }} onError={event=>{
      if(event.currentTarget.getAttribute('src')!==source)return;
      if(formReady) setFailedFormUrl(source);
      else reportSpriteRenderFailure(source);
    }} /></div>:checking?<div className="artwork-loading"><span className="sprite-loading-indicator"/><small>이미지 확인 중…</small></div>:<div className="missing-artwork"><img className="sprite-fallback" src={spriteFallbackUrl} alt=""/><strong>{mon?.name ?? speciesId}</strong><small>#{String(mon?.nationalDex ?? 0).padStart(3,'0')} · 대체 이미지 (원본 없음)</small></div>}
  </div>;
}

export function SpeciesMark({speciesId,className=''}:{speciesId:string;className?:string}) {
  const mon=species[speciesId];const library=useSpriteLibrary();
  const checking=useSpriteDiagnostics().phase!=='ready';
  const source=spriteSources(speciesId,'front',library)[0];
  return <span className={`species-mark ${className}`} title={mon?.name} aria-label={mon?.name}>
    {source?<img className="pokemon-sprite" src={source} alt="" onError={()=>reportSpriteRenderFailure(source)}/>:checking?<span className="sprite-loading-indicator"/>:<img className="sprite-fallback" src={spriteFallbackUrl} alt=""/>}
  </span>;
}
