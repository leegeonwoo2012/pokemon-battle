import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const roster=sandbox.exports.roster;
const pilot=['flareon','incineroar','rillaboom','kyurem','gholdengo'];
const full=process.argv.includes('--all');
const attribution=JSON.parse(fs.readFileSync('public/sprites/attribution.json','utf8'));
const requests=[],failures=[],imported=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
fs.mkdirSync('work/sprite-supplement',{recursive:true});fs.mkdirSync('outputs',{recursive:true});
async function download(url,kind){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'ArenaSpriteAudit/1.0'}});
   const bytes=Buffer.from(await response.arrayBuffer());
   const http={url,kind,attempt,status:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length};requests.push(http);
   if(!response.ok){if(attempt<3&&(response.status===429||response.status>=500))continue;throw Error(`HTTP ${response.status}: ${url}`);}
   return {bytes,http};
  }catch(error){if(!requests.some(row=>row.url===url&&row.attempt===attempt))requests.push({url,kind,attempt,error:error.message});if(attempt===3||/HTTP 404/.test(error.message))throw error;}
 }
}
const commit=JSON.parse((await download('https://api.github.com/repos/PokeAPI/sprites/commits/master','metadata')).bytes).sha;
const base=`https://raw.githubusercontent.com/PokeAPI/sprites/${commit}/`;
const license=(await download(base+'LICENCE.txt','license')).bytes;
const readme=(await download(base+'README.md','usage')).bytes.toString();
if(!readme.includes('download the entire contents directly')||!license.toString().includes('Copyright The Pokémon Company'))throw Error('Source usage/rights notice changed: review the primary source.');
const catalogCommit=JSON.parse((await download('https://api.github.com/repos/PokeAPI/pokeapi/commits/master','identity')).bytes).sha;
const catalogUrl=`https://raw.githubusercontent.com/PokeAPI/pokeapi/${catalogCommit}/data/v2/csv/pokemon_species.csv`;
const catalog=(await download(catalogUrl,'identity')).bytes;
const names=new Map(catalog.toString().trim().split(/\r?\n/).slice(1).map(line=>{const [id,name]=line.split(',');return [Number(id),name];}));
fs.writeFileSync('work/sprite-supplement/pokemon_species.csv',catalog);
fs.mkdirSync('public/sprites/licenses',{recursive:true});fs.writeFileSync('public/sprites/licenses/PokeAPI-sprites-LICENCE.txt',license);
const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if(!executablePath)throw Error('Actual sprite validation requires Chrome: set CHROME_PATH.');
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const hasVerifiedPair=p=>{
 const record=attribution.images.find(row=>row.speciesId===p.id&&row.nationalDex===p.nationalDex);
 return !!record?.images?.front?.sha256&&!!record?.images?.back?.sha256&&['front','back'].every(facing=>fs.existsSync(`public/sprites/${facing}/${p.nationalDex}.png`));
};
const selected=full?roster.filter(p=>!hasVerifiedPair(p)):pilot.map(id=>roster.find(row=>row.id===id)).filter(p=>p&&!hasVerifiedPair(p));
try{
 const queue=[...selected];
 await Promise.all(Array.from({length:6},async()=>{
  while(queue.length){
   const pokemon=queue.shift();
   const catalogName=names.get(pokemon.nationalDex);
   if(!catalogName||![pokemon.id,pokemon.englishName].some(name=>normalize(name)===normalize(catalogName))){failures.push({speciesId:pokemon.id,nationalDex:pokemon.nationalDex,reason:'POKEMON_ID_MISMATCH',catalogName});continue;}
   const metadata={speciesId:pokemon.id,nationalDex:pokemon.nationalDex,name:pokemon.name,englishName:pokemon.englishName,
    sourceProvider:'PokeAPI/sprites',source:`https://github.com/PokeAPI/sprites/tree/${commit}/sprites/pokemon`,commit,
    license:'Repository CC0 1.0; image copyright The Pokémon Company. See PokeAPI-sprites-LICENCE.txt.',authors:[{name:'The Pokémon Company'}],
    identity:{identifier:catalogName,source:catalogUrl,sha256:hash(catalog)},extraction:'Unmodified default National Dex PNG, separately verified front and back.',images:{}};
   const pending=[];
   for(const facing of ['front','back']){
    const url=base+`sprites/pokemon/${facing==='back'?'back/':''}${pokemon.nationalDex}.png`;
    try{
     const {bytes,http}=await download(url,'image');
     if(!http.contentType?.startsWith('image/png')||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('RESPONSE_NOT_PNG');
     const decoded=await page.evaluate(async encoded=>{
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;
      const result={width:bitmap.width,height:bitmap.height,opaque};bitmap.close();return result;
     },bytes.toString('base64'));
     if(decoded.opaque<10||decoded.width>2048||decoded.height>2048)throw Error('EMPTY_OR_OVERSIZE_IMAGE');
     const relative=`${facing}/${pokemon.nationalDex}.png`;
     metadata.images[facing]={path:relative,source:url,sha256:hash(bytes),sourceSha256:hash(bytes),...decoded,http};pending.push({relative,bytes});
    }catch(error){failures.push({speciesId:pokemon.id,name:pokemon.name,nationalDex:pokemon.nationalDex,facing,url,reason:error.message});}
   }
   // No incomplete pair is published as a complete species.
   if(pending.length===2){for(const {relative,bytes} of pending){fs.mkdirSync(`public/sprites/${relative.split('/')[0]}`,{recursive:true});fs.writeFileSync(`public/sprites/${relative}`,bytes);}imported.push(metadata);}
  }
 }));
}finally{await browser.close();}
const merged=[...attribution.images.filter(row=>!imported.some(next=>next.speciesId===row.speciesId)),...imported].sort((a,b)=>a.nationalDex-b.nationalDex);
fs.writeFileSync('public/sprites/attribution.json',JSON.stringify({...attribution,source:'PMDCollab/SpriteCollab + PokeAPI/sprites',license:'See individual images: community CC BY-NC 4.0 and PokeAPI image copyright notice.',sources:{communityCommit:attribution.sources?.communityCommit??attribution.commit,pokeapiCommit:commit},images:merged},null,2));
const existing=fs.readFileSync('public/sprites/CREDITS.md','utf8').split('\n## PokeAPI supplemental sprites')[0];
fs.writeFileSync('public/sprites/CREDITS.md',existing+`\n## PokeAPI supplemental sprites\n\nSource: https://github.com/PokeAPI/sprites/tree/${commit}\n\nThe repository README recommends directly downloading sprites for applications. Its repository notice is CC0 1.0 and explicitly states that image contents are Copyright The Pokémon Company. This is not a claim that character artwork is public domain or that Pokémon IP ownership transfers. Preserve licenses/PokeAPI-sprites-LICENCE.txt. These supplemental PNGs are copied unchanged. Existing PMDCollab works above retain their individual CC BY-NC 4.0 conditions.\n\n`+merged.filter(row=>row.sourceProvider==='PokeAPI/sprites').map(row=>`- #${row.nationalDex} ${row.name} (${row.englishName}): [front](${row.images.front.source}) / [back](${row.images.back.source}); local front/${row.nationalDex}.png / back/${row.nationalDex}.png.\n`).join(''));
const report={checkedAt:new Date().toISOString(),phase:full?'supplementMissing':'supplementPilot',commit,catalogCommit,expectedSpecies:selected.length,importedSpecies:imported.length,
 frontSuccess:imported.length,backSuccess:imported.length,failures,requests,imported};
fs.writeFileSync(`outputs/sprite-supplement-${full?'all':'pilot'}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({phase:report.phase,expectedSpecies:report.expectedSpecies,front:report.frontSuccess,back:report.backSuccess,failed:failures.length}));
if(failures.length)process.exitCode=1;
