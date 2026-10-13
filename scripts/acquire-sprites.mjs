import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { chromium } from 'playwright-core';

const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const roster=sandbox.exports.roster;
const pilot=['charizard','venusaur','tyranitar','lapras','lucario'];
const full=process.argv.includes('--all');
const work='work/sprite-source';
fs.mkdirSync(work,{recursive:true});
const requests=[];
async function download(url, kind) {
 const response=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'ArenaSpriteAudit/1.0'}});
 const bytes=Buffer.from(await response.arrayBuffer());
 requests.push({url,kind,status:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length});
 if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);
 return bytes;
}
const commit=JSON.parse((await download('https://api.github.com/repos/PMDCollab/SpriteCollab/commits/master','metadata')).toString()).sha;
const base=`https://raw.githubusercontent.com/PMDCollab/SpriteCollab/${commit}/`;
const tracker=JSON.parse((await download(base+'tracker.json','metadata')).toString());
const creditText=(await download(base+'credit_names.txt','credits')).toString();
const license=await download(base+'LICENSE.md','license');
const policy=await download(base+'README.md','policy');
if(!license.toString().includes('Attribution-NonCommercial 4.0')||!policy.toString().includes('permission for others to copy and redistribute'))throw Error('Source reuse policy changed; review required.');
fs.writeFileSync(work+'/tracker.json',JSON.stringify(tracker));
fs.writeFileSync(work+'/LICENSE.md',license);
fs.writeFileSync(work+'/README.md',policy);
const authors=Object.fromEntries(creditText.trim().split(/\r?\n/).slice(1).map(line=>{const [name,id,contact]=line.split('\t');return [id,{name,contact}];}));
const normalize=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
function candidates(pokemon) {
 const id=String(pokemon.nationalDex).padStart(4,'0'),root=tracker[id];
 if(!root||normalize(root.name)!==normalize(pokemon.englishName))return [];
 const result=[{path:id,node:root}];
 // Alternate is another drawing of the same species. Regional, Mega, shiny and other forms are excluded.
 for(const [key,child] of Object.entries(root.subgroups ?? {}))if(/^Alternate(?: \d+)?$/.test(child.name))result.push({path:`${id}/${key}`,node:child});
 return result.filter(row=>row.node.sprite_complete>=1 && row.node.sprite_credit?.primary
   && !JSON.stringify(row.node.sprite_credit).includes('CHUNSOFT'));
}
const browserPath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
if(!browserPath)throw Error('CHROME_PATH is required for actual PNG decoding and atlas extraction.');
const browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const imported=[],excluded=[];
try {
 for(const pokemon of (full?roster:pilot.map(id=>roster.find(row=>row.id===id)))) {
  const options=candidates(pokemon); let done=false;
  for(const candidate of options) {
   try {
    const source=`sprite/${candidate.path}`;
    const credits=(await download(base+source+'/credits.txt','credits')).toString();
    if(credits.includes('CHUNSOFT'))continue;
    const xml=(await download(base+source+'/AnimData.xml','animation')).toString();
    const idle=xml.match(/<Anim>\s*<Name>Idle<\/Name>([\s\S]*?)<\/Anim>/)?.[1];
    if(!idle||idle.includes('<CopyOf>'))throw Error('No independently described Idle atlas.');
    const width=Number(idle.match(/<FrameWidth>(\d+)<\/FrameWidth>/)?.[1]);
    const height=Number(idle.match(/<FrameHeight>(\d+)<\/FrameHeight>/)?.[1]);
    if(!(width>0&&height>0))throw Error('Invalid frame size.');
    const png=await download(base+source+'/Idle-Anim.png','image');
    if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Image response is not PNG.');
    const frames=await page.evaluate(async ({encoded,width,height})=>{
     const binary=atob(encoded), bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
     const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
     if(bitmap.width%width||bitmap.height!==height*8)throw Error('Atlas does not contain eight exact direction rows.');
     const result={};
     for(const [facing,row] of [['front',0],['back',4]]) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,row*height,width,height,0,0,width,height);
      const pixels=ctx.getImageData(0,0,width,height).data;
      let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])opaque++;
      if(opaque<10)throw Error(`Empty ${facing} frame.`);
      result[facing]={encoded:canvas.toDataURL('image/png').split(',')[1],width,height,opaque};
     }
     bitmap.close();return result;
    },{encoded:png.toString('base64'),width,height});
    const directory=`${work}/${pokemon.nationalDex}`;fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(directory+'/Idle-Anim.png',png);fs.writeFileSync(directory+'/AnimData.xml',xml);fs.writeFileSync(directory+'/credits.txt',credits);
    const ids=[...new Set(credits.trim().split(/\r?\n/).map(line=>line.split('\t')[1]).filter(Boolean))];
    const contributorIds=[...new Set([candidate.node.sprite_credit.primary,...candidate.node.sprite_credit.secondary,...ids])];
    const metadata={speciesId:pokemon.id,nationalDex:pokemon.nationalDex,name:pokemon.name,englishName:pokemon.englishName,
     source:base+source+'/Idle-Anim.png',trackerPath:candidate.path,sourceVariant:candidate.node.name,
     license:'CC BY-NC 4.0',authors:contributorIds.map(id=>({...authors[id],id})),
     extraction:'Idle animation, first frame; direction row 0 (front/South), row 4 (back/North). No resizing or repainting.',
     sourceSha256:crypto.createHash('sha256').update(png).digest('hex'),images:{}};
    for(const facing of ['front','back']) {
     const bytes=Buffer.from(frames[facing].encoded,'base64');
     fs.mkdirSync(`public/sprites/${facing}`,{recursive:true});fs.writeFileSync(`public/sprites/${facing}/${pokemon.nationalDex}.png`,bytes);
     metadata.images[facing]={path:`${facing}/${pokemon.nationalDex}.png`,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width,height,opaque:frames[facing].opaque};
    }
    imported.push(metadata);done=true;break;
   } catch(error) {excluded.push({speciesId:pokemon.id,candidate:candidate.path,reason:error.message});}
  }
  if(!done)excluded.push({speciesId:pokemon.id,nationalDex:pokemon.nationalDex,name:pokemon.name,reason:options.length?'No verified eligible atlas':'No credited community base/Alternate sprite; official or different-form material excluded'});
 }
} finally {await browser.close();}
fs.mkdirSync('public/sprites/licenses',{recursive:true});fs.writeFileSync('public/sprites/licenses/PMDCollab-CC-BY-NC-4.0.md',license);
const old=fs.existsSync('public/sprites/attribution.json')?JSON.parse(fs.readFileSync('public/sprites/attribution.json')):{images:[]};
const merged=[...old.images.filter(row=>!imported.some(next=>next.speciesId===row.speciesId)),...imported];
fs.writeFileSync('public/sprites/attribution.json',JSON.stringify({...old,source:merged.some(row=>row.sourceProvider==='PokeAPI/sprites')?'PMDCollab/SpriteCollab + PokeAPI/sprites':'PMDCollab/SpriteCollab',commit,sources:{...old.sources,communityCommit:commit},license:'See individual image entries and licenses/',images:merged},null,2));
const previousCredits=fs.existsSync('public/sprites/CREDITS.md')?fs.readFileSync('public/sprites/CREDITS.md','utf8'):'';
const supplementalCredits=previousCredits.includes('\n## PokeAPI supplemental sprites')?'\n## PokeAPI supplemental sprites'+previousCredits.split('\n## PokeAPI supplemental sprites')[1]:'';
fs.writeFileSync('public/sprites/CREDITS.md',`# Community sprite credits\n\nSource: https://github.com/PMDCollab/SpriteCollab/tree/${commit}\n\nLicense: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — noncommercial use and attribution required. Artwork is provided without warranty. Pokémon names and characters belong to their respective owners. This project is unofficial.\n\nChanges: first Idle frame extracted from directions South (front) and North (back), without repainting or resizing. Official CHUNSOFT assets and different forms were excluded.\n\n`+merged.filter(row=>row.sourceProvider!=='PokeAPI/sprites').map(row=>`- #${row.nationalDex} ${row.name} (${row.englishName}): ${row.authors.map(a=>a.contact&&a.contact.startsWith('http')?`[${a.name??a.id}](${a.contact})`:a.name??a.id).join(', ')}. [Source](${row.source}).\n`).join('')+supplementalCredits);
const report={stage:full?`all${roster.length}`:'pilot5',commit,expectedSpecies:full?roster.length:5,importedSpecies:imported.length,front:imported.length,back:imported.length,imported,excluded,requests};
fs.writeFileSync(`${work}/${full?'all':'pilot'}-report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({stage:report.stage,expectedSpecies:report.expectedSpecies,importedSpecies:imported.length,front:imported.length,back:imported.length,excludedSpecies:new Set(excluded.map(x=>x.speciesId)).size}));
