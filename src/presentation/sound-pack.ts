export interface ImportedSound {key:string;name:string;blob:Blob}
const databaseName='arena-battle-sounds-v1';
const commonKeys=new Set(['confirm','cursor','cancel','damage','heal','faint','switch-in','switch-out','low-hp','victory','defeat']);
const types=new Set(['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy','stellar']);
export function soundFileKey(name:string):string|undefined {
  if(!/\.(wav|mp3|ogg|m4a)$/i.test(name))return undefined;
  const key=name.split(/[\\/]/).at(-1)?.replace(/\.(wav|mp3|ogg|m4a)$/i,'').toLowerCase();
  if(!key)return undefined;
  if(commonKeys.has(key)||/^move-[a-z0-9]+$/.test(key))return key;
  if(key.startsWith('type-')&&types.has(key.slice(5)))return key;
  if(/^gimmick-(mega|tera|dynamax|z)$/.test(key)||/^status-(burn|poison|paralysis|sleep|freeze|confusion)$/.test(key))return key;
  return undefined;
}
function openDatabase():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>request.result.createObjectStore('sounds',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function readImportedSounds():Promise<ImportedSound[]> {
  if(typeof indexedDB==='undefined')return [];
  const db=await openDatabase();
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('sounds','readonly').objectStore('sounds').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function importBattleSounds(files:FileList|File[]):Promise<number> {
  const candidates=Array.from(files).map(file=>({file,key:soundFileKey(file.name)})).filter(entry=>entry.key);
  if(!candidates.length)throw Error('지원하는 파일 이름을 찾지 못했습니다. 예: move-surf.wav, type-electric.ogg, faint.mp3');
  if(candidates.length>100)throw Error('효과음은 한 번에 100개까지 가져올 수 있습니다.');
  const context=new AudioContext(),validated:ImportedSound[]=[];
  try{for(const {file,key} of candidates){
    if(file.size>8*1024*1024)throw Error(`${file.name}: 8MB 이하의 효과음을 사용하세요.`);
    let audio:AudioBuffer;try{audio=await context.decodeAudioData(await file.arrayBuffer());}catch{throw Error(`${file.name}: 재생 가능한 음원 형식이 아닙니다.`);}
    if(audio.duration<=0||audio.duration>20)throw Error(`${file.name}: 효과음 길이는 20초 이하여야 합니다.`);
    validated.push({key:key!,name:file.name,blob:file});
  }}finally{await context.close();}
  const db=await openDatabase();
  try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('sounds','readwrite');for(const sound of validated)transaction.objectStore('sounds').put(sound);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}finally{db.close();}
  return new Set(validated.map(sound=>sound.key)).size;
}
export async function clearImportedSounds():Promise<void> {
  const db=await openDatabase();try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('sounds','readwrite');transaction.objectStore('sounds').clear();transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});}finally{db.close();}
}
