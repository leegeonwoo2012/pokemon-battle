import { useSyncExternalStore } from 'react';
import { species } from '../data';

type Library = Record<string, string>;
let library: Library = {};
let initialLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export function useSpriteLibrary() { return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => library); }
const keyFor = (dex:number, facing:string) => `${facing}/${dex}`;

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open('arena-user-sprites',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}

export function initializeSprites(): Promise<void> {
  if (initialLoad) return initialLoad;
  initialLoad=(async () => {
    const result:Library={};
    try {
      const response=await fetch('/sprites/manifest.json');
      if (response.ok) {
        const manifest=await response.json() as { images?:Record<string,string> };
        for(const [key,path] of Object.entries(manifest.images ?? {})) if (/^(front|back)\/\d+$/.test(key) && /^\/sprites\/(front|back)\/\d+\.png$/.test(path)) result[key]=path;
      }
    } catch { /* No manifest means an explicitly incomplete artwork library. */ }
    if (typeof indexedDB!=='undefined') {
      try {
        const db=await database();
        await new Promise<void>((resolve,reject)=>{
          const tx=db.transaction('images');const cursor=tx.objectStore('images').openCursor();
          cursor.onsuccess=()=>{ const row=cursor.result;if(row){result[String(row.key)]=URL.createObjectURL(row.value as Blob);row.continue();} };
          tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
        });db.close();
      } catch { /* Private browsing may disable IndexedDB; public assets still work. */ }
    }
    library={...result,...library};notify();
  })();
  return initialLoad;
}

export function spriteSources(speciesId:string,facing:'front'|'back',entries:Library=library):string[] {
  const dex=species[speciesId]?.nationalDex;if(!dex)return [];
  return [...new Set([entries[keyFor(dex,facing)],facing==='back'?entries[keyFor(dex,'front')]:undefined].filter((x):x is string=>!!x))];
}

/** Import only caller-provided image files; no external artwork is downloaded. */
export async function importSpriteFiles(files:FileList|File[]):Promise<number> {
  const validDex=new Set(Object.values(species).map(mon=>mon.nationalDex));
  const records: {key:string,file:File}[]=[];
  for(const file of Array.from(files)) {
    const path=(file.webkitRelativePath||file.name).replace(/\\/g,'/');
    const match=path.match(/(?:^|\/)(front|back)\/(\d+)\.png$/i);
    if(!match || !validDex.has(Number(match[2])))continue;
    if(file.size>2_000_000)throw new Error(`${file.name}: 파일은 2MB 이하여야 합니다.`);
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    if(bytes.join(',')!=='137,80,78,71,13,10,26,10')throw new Error(`${file.name}: 올바른 PNG가 아닙니다.`);
    const bitmap=await createImageBitmap(file);
    const valid=bitmap.width>0 && bitmap.height>0 && bitmap.width<=2048 && bitmap.height<=2048;bitmap.close();
    if(!valid)throw new Error(`${file.name}: 이미지 크기는 2048px 이하여야 합니다.`);
    records.push({key:`${match[1].toLowerCase()}/${Number(match[2])}`,file});
  }
  if(!records.length)throw new Error('front/도감번호.png 또는 back/도감번호.png 구조의 폴더를 선택하세요.');
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('images','readwrite');for(const row of records)tx.objectStore('images').put(row.file,row.key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
  });db.close();
  const next={...library};
  for(const row of records){if(next[row.key]?.startsWith('blob:'))URL.revokeObjectURL(next[row.key]);next[row.key]=URL.createObjectURL(row.file);}
  library=next;notify();return records.length;
}
