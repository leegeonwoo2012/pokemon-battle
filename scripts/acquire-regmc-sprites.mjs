import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import vm from 'node:vm';
import { chromium } from 'playwright-core';

function loadRoster(file,key){const sandbox={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);return sandbox.exports[key];}
const roster=[...loadRoster('src/data/roster.generated.ts','roster'),...loadRoster('src/data/legendary-roster.generated.ts','legendaryRoster'),...loadRoster('src/data/signature-roster.generated.ts','signatureRoster'),...loadRoster('src/data/expansion-roster.generated.ts','expansionRoster')];
const catalog=new Map(fs.readFileSync('work/regmc/pokemon.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>{const [id,name,speciesId]=line.split(',');return [Number(id),{name,speciesId:Number(speciesId)}];}));
const old=JSON.parse(fs.readFileSync('public/sprites/attribution.json','utf8'));
const commit=old.sources?.pokeapiCommit??(await (await fetch('https://api.github.com/repos/PokeAPI/sprites/commits/master',{headers:{'User-Agent':'ArenaSpriteAudit'}})).json()).sha;
const base=`https://raw.githubusercontent.com/PokeAPI/sprites/${commit}/sprites/pokemon/`;
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if(!executablePath)throw Error('Chrome or Edge is required to validate actual PNG decoding.');
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const missing=roster.filter(p=>!['front','back'].every(f=>fs.existsSync(`public/sprites/${f}/${p.spriteId}.png`)));
const imported=[],failures=[],requests=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
try{
 const queue=[...missing];
 await Promise.all(Array.from({length:6},async()=>{
  const page=await browser.newPage();
  try{while(queue.length){
   const pokemon=queue.shift(),identity=catalog.get(pokemon.spriteId);
   if(!identity||identity.speciesId!==pokemon.nationalDex){failures.push({speciesId:pokemon.id,spriteId:pokemon.spriteId,reason:'POKEAPI_SPECIES_ID_MISMATCH'});continue;}
   const metadata={speciesId:pokemon.id,nationalDex:pokemon.nationalDex,spriteId:pokemon.spriteId,name:pokemon.name,englishName:pokemon.englishName,sourceProvider:'PokeAPI/sprites',source:`https://github.com/PokeAPI/sprites/tree/${commit}/sprites/pokemon`,commit,license:'Repository CC0 1.0; image copyright The Pokémon Company. See PokeAPI-sprites-LICENCE.txt.',authors:[{name:'The Pokémon Company'}],identity:{identifier:identity.name,speciesId:identity.speciesId,source:'PokeAPI pokemon.csv'},extraction:'Unmodified PNG, separately decoded and checked front/back.',images:{}};
   const pending=[];
   for(const facing of ['front','back']){
    const url=base+(facing==='back'?'back/':'')+`${pokemon.spriteId}.png`;
    try{
     const response=await fetch(url,{signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await response.arrayBuffer()),contentType=response.headers.get('content-type');
     requests.push({speciesId:pokemon.id,facing,url,status:response.status,contentType,bytes:bytes.length});
     if(!response.ok||!contentType?.startsWith('image/png')||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`HTTP ${response.status} / ${contentType}`);
     const decoded=await page.evaluate(async encoded=>{
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let opaque=0;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;
      const result={width:bitmap.width,height:bitmap.height,opaque};bitmap.close();return result;
     },bytes.toString('base64'));
     if(decoded.opaque<10||decoded.width>2048||decoded.height>2048)throw Error('EMPTY_OR_OVERSIZE_IMAGE');
     const relative=`${facing}/${pokemon.spriteId}.png`;
     metadata.images[facing]={path:relative,source:url,sha256:hash(bytes),...decoded};pending.push({relative,bytes});
    }catch(error){failures.push({speciesId:pokemon.id,spriteId:pokemon.spriteId,facing,url,reason:error.message});}
   }
   if(pending.length===2){for(const {relative,bytes} of pending)fs.writeFileSync(`public/sprites/${relative}`,bytes);imported.push(metadata);}
  }}finally{await page.close();}
 }));
}finally{await browser.close();}
const displayNames=new Map(roster.map(mon=>[mon.id,mon.name]));
const images=[...old.images.filter(row=>!imported.some(next=>next.speciesId===row.speciesId)),...imported]
  .map(row=>({...row,name:displayNames.get(row.speciesId)??row.name}))
  .sort((a,b)=>a.nationalDex-b.nationalDex);
fs.writeFileSync('public/sprites/attribution.json',JSON.stringify({...old,source:'PMDCollab/SpriteCollab + PokeAPI/sprites',sources:{...old.sources,pokeapiCommit:commit},images},null,2));
const credits=fs.readFileSync('public/sprites/CREDITS.md','utf8');
const section='\n## Regulation M-C additions';
const sectionAt=credits.indexOf(section);
const baseCredits=sectionAt<0?credits.trimEnd():credits.slice(0,sectionAt).trimEnd();
const previous=sectionAt<0?'':credits.slice(sectionAt);
const listedIds=new Set([...previous.matchAll(/PokeAPI #(\d+)/g)].map(match=>Number(match[1])));
for(const row of imported)listedIds.add(row.spriteId);
const listed=[...listedIds].map(id=>images.find(row=>row.spriteId===id)).filter(Boolean).sort((a,b)=>a.nationalDex-b.nationalDex||a.spriteId-b.spriteId);
if(listed.length)fs.writeFileSync('public/sprites/CREDITS.md',baseCredits+section+'\n\n'+listed.map(row=>`- ${row.name} (${row.englishName}, PokeAPI #${row.spriteId}): [front](${row.images.front.source}) / [back](${row.images.back.source}); image copyright The Pokémon Company.\n`).join(''));
fs.mkdirSync('outputs',{recursive:true});
const report={showdownCommit:fs.readFileSync('work/regmc/COMMIT','utf8').trim(),pokeapiSpriteCommit:commit,expected:missing.length,imported:imported.length,front:imported.length,back:imported.length,failures,requests};
fs.writeFileSync('outputs/regmc-sprite-acquisition.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({expected:report.expected,imported:report.imported,failedSpecies:new Set(failures.map(f=>f.speciesId)).size,front:report.front,back:report.back}));
if(failures.length)process.exitCode=1;
