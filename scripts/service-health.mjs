import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
export const projectFingerprint=createHash('sha256').update(resolve(process.cwd()).toLowerCase()).digest('hex').slice(0,16);
export async function serviceHealth(port,kind){
  try {
    const response=await fetch(`http://127.0.0.1:${port}/${kind==='web'?'__arena_health':''}`,{signal:AbortSignal.timeout(1500)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return false;
    const data=await response.json();return data.projectFingerprint===projectFingerprint&&(kind==='web'?data.service==='ARENA web':data.protocol===2&&data.authority==='server');
  }catch{return false;}
}
