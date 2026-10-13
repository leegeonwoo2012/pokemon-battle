import { useSyncExternalStore } from 'react';
import { regulationSpecies } from '../data';
import { assetUrl, pngSignature, spriteKey, validateSpriteManifest } from './sprite-validation';
import type { Facing, SpriteLibrary } from './sprite-validation';

export interface SpriteIssue {key?:string;path?:string;reason:string;httpStatus?:number;contentType?:string}
interface Diagnostic {phase:'idle'|'checking'|'ready';issues:SpriteIssue[];manifestStatus?:number}
let library:SpriteLibrary={}, diagnostic:Diagnostic={phase:'idle',issues:[]};
let initialLoad:Promise<void>|null=null;
const listeners=new Set<()=>void>();
const subscribe=(callback:()=>void)=>{listeners.add(callback);return()=>listeners.delete(callback);};
const notify=()=>listeners.forEach(listener=>listener());
export function useSpriteLibrary(){return useSyncExternalStore(subscribe,()=>library);}
export function useSpriteDiagnostics(){return useSyncExternalStore(subscribe,()=>diagnostic);}
const base=import.meta.env.BASE_URL;
export const spriteFallbackUrl=assetUrl('/sprites/unavailable.svg',base);

async function database():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('arena-user-sprites',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function validatePng(blob:Blob,label:string):Promise<void>{
  if(blob.size>2_000_000)throw Error(`${label}: 파일은 2MB 이하여야 합니다.`);
  if(!pngSignature(new Uint8Array(await blob.slice(0,24).arrayBuffer())))throw Error(`${label}: 올바른 PNG가 아닙니다.`);
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(blob);}catch{throw Error(`${label}: PNG 디코딩에 실패했습니다.`);}
  const valid=bitmap.width>0&&bitmap.height>0&&bitmap.width<=2048&&bitmap.height<=2048;bitmap.close();
  if(!valid)throw Error(`${label}: 이미지 크기는 2048px 이하여야 합니다.`);
}

/** Publish only after HTTP, MIME, PNG bytes and actual decode all succeed. */
export function initializeSprites(force=false):Promise<void>{
  if(initialLoad&&diagnostic.phase==='checking')return initialLoad;
  if(initialLoad&&!force)return initialLoad;
  initialLoad=(async()=>{
    diagnostic={phase:'checking',issues:[]};notify();
    const result:SpriteLibrary={},issues:SpriteIssue[]=[];
    let manifestStatus:number|undefined;
    try{
      const path=assetUrl('/sprites/manifest.json',base),response=await fetch(path,{cache:'no-store'});
      manifestStatus=response.status;
      if(!response.ok)throw Error(`manifest HTTP ${response.status}`);
      const contentType=response.headers.get('content-type')??'';
      if(!contentType.includes('json'))throw Error(`manifest 응답이 JSON이 아닙니다 (${contentType||'Content-Type 없음'}).`);
      const manifest=validateSpriteManifest(await response.json());issues.push(...manifest.errors.map(reason=>({reason,path})));
      const queue=Object.entries(manifest.images);
      await Promise.all(Array.from({length:Math.min(6,queue.length)},async()=>{
        while(queue.length){
          const [key,relative]=queue.shift()!,url=assetUrl(relative,base);let response:Response|undefined;
          try{
            response=await fetch(url,{cache:'no-store'});
            if(!response.ok)throw Error(`로컬 파일 요청 실패: HTTP ${response.status}`);
            const type=response.headers.get('content-type')??'';
            if(!type.startsWith('image/png'))throw Error(`PNG 대신 ${type||'알 수 없는 형식'} 응답. 파일 누락 시 HTML 응답일 수 있습니다.`);
            await validatePng(await response.blob(),key);result[key]=url;
          }catch(error){issues.push({key,path:url,reason:error instanceof Error?error.message:'이미지 요청 실패',httpStatus:response?.status,contentType:response?.headers.get('content-type')??undefined});}
        }
      }));
    }catch(error){issues.push({path:assetUrl('/sprites/manifest.json',base),httpStatus:manifestStatus,reason:error instanceof Error?error.message:'manifest 로딩 실패'});}
    if(typeof indexedDB!=='undefined'){
      let db:IDBDatabase|undefined;
      try{
        db=await database();
        const stored=await new Promise<{key:string;blob:Blob}[]>((resolve,reject)=>{
          const rows:{key:string;blob:Blob}[]=[];const tx=db!.transaction('images'),cursor=tx.objectStore('images').openCursor();
          cursor.onsuccess=()=>{const row=cursor.result;if(row){rows.push({key:String(row.key),blob:row.value as Blob});row.continue();}};
          tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);
        });
        for(const row of stored){
          try{
            const mapping=validateSpriteManifest({version:1,images:{[row.key]:`/sprites/${row.key}.png`}});
            if(mapping.errors.length)throw Error(mapping.errors[0]);
            await validatePng(row.blob,row.key);result[row.key]=URL.createObjectURL(row.blob);
          }catch(error){issues.push({key:row.key,path:'IndexedDB',reason:error instanceof Error?error.message:'저장된 이미지 오류'});}
        }
      }catch(error){issues.push({path:'IndexedDB',reason:error instanceof Error?error.message:'브라우저 이미지 저장소 접근 실패'});}
      finally{db?.close();}
    }
    const previous=library;library=result;diagnostic={phase:'ready',issues,manifestStatus};notify();
    for(const url of Object.values(previous))if(url.startsWith('blob:')&&!Object.values(result).includes(url))URL.revokeObjectURL(url);
  })();return initialLoad;
}
export function spriteSources(speciesId:string,facing:Facing,entries:SpriteLibrary=library):string[]{
  const key=spriteKey(speciesId,facing),front=spriteKey(speciesId,'front');if(!key||!front)return [];
  return [...new Set([entries[key],facing==='back'?entries[front]:undefined].filter((value):value is string=>!!value))];
}
/** A render failure cannot remain counted as a ready asset. */
export function reportSpriteRenderFailure(source:string):void{
  const affected=Object.entries(library).filter(([,url])=>url===source);if(!affected.length)return;
  const next={...library};for(const [key] of affected)delete next[key];library=next;
  diagnostic={...diagnostic,issues:[...diagnostic.issues,...affected.map(([key])=>({key,path:source,reason:'브라우저 이미지 로딩 실패'}))]};notify();
}
export function spriteDiagnosticReport(){
  const entries=Object.values(regulationSpecies).flatMap(mon=>['front','back'].map(facing=>{
    const key=`${facing}/${mon.spriteId??mon.nationalDex}`;
    return {speciesId:mon.id,name:mon.name,nationalDex:mon.nationalDex,spriteId:mon.spriteId??mon.nationalDex,facing,key,expectedPath:assetUrl(`/sprites/${key}.png`,base),
      verified:!!library[key],source:library[key]??null,failure:diagnostic.issues.find(issue=>issue.key===key)??(!library[key]?{reason:'검증된 파일이 manifest 또는 가져오기 저장소에 없음'}:null)};
  }));
  return {expected:entries.length,success:entries.filter(row=>row.verified).length,failed:entries.filter(row=>!row.verified).length,manifestStatus:diagnostic.manifestStatus,issues:diagnostic.issues,entries};
}
/** Validate the entire batch before writing; duplicate keys count once. */
export async function importSpriteFiles(files:FileList|File[]):Promise<number>{
  await initializeSprites();
  const validDex=new Set(Object.values(regulationSpecies).map(mon=>mon.spriteId??mon.nationalDex)),records=new Map<string,File>();
  for(const file of Array.from(files)){
    const path=(file.webkitRelativePath||file.name).replace(/\\/g,'/'),match=path.match(/(?:^|\/)(front|back)\/([1-9]\d*)\.png$/i);
    if(!match||!validDex.has(Number(match[2])))continue;
    await validatePng(file,file.name);records.set(`${match[1].toLowerCase()}/${Number(match[2])}`,file);
  }
  if(!records.size)throw Error('front/도감번호.png 또는 back/도감번호.png 구조의 폴더를 선택하세요.');
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');for(const [key,file] of records)tx.objectStore('images').put(file,key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('이미지 저장 작업 취소'));
  });}finally{db.close();}
  const next={...library};for(const [key,file] of records){if(next[key]?.startsWith('blob:'))URL.revokeObjectURL(next[key]);next[key]=URL.createObjectURL(file);}
  library=next;diagnostic={...diagnostic,issues:diagnostic.issues.filter(issue=>!issue.key||!records.has(issue.key))};notify();return records.size;
}
