import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import vm from 'node:vm';

const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/roster.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,module);
const roster=module.exports.roster;
const attributed=JSON.parse(fs.readFileSync('public/sprites/attribution.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('public/sprites/manifest.json','utf8'));
const catalog=new Map(fs.readFileSync('work/regmc/pokemon.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>{
  const [id,identifier,speciesId]=line.split(',');return [Number(id),{identifier,speciesId:Number(speciesId)}];
}));
const failures=[],entries=[];
for(const mon of roster){
  const source=attributed.images.find(row=>row.speciesId===mon.id);
  const identity=catalog.get(mon.spriteId);
  if(!source||identity?.speciesId!==mon.nationalDex||source.nationalDex!==mon.nationalDex||source.spriteId&&source.spriteId!==mon.spriteId){
    failures.push({id:mon.id,reason:'MISSING_OR_WRONG_SPECIES_ID',spriteId:mon.spriteId});continue;
  }
  const faces={};
  for(const face of ['front','back']){
    const expected=`${face}/${mon.spriteId}.png`,asset=source.images?.[face],file=`public/sprites/${expected}`;
    if(asset?.path!==expected||manifest.images?.[`${face}/${mon.spriteId}`]!==`/sprites/${expected}`||!fs.existsSync(file)){
      failures.push({id:mon.id,face,reason:'PATH_OR_MANIFEST_MISMATCH',expected,attributed:asset?.path});continue;
    }
    const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(sha256!==asset.sha256)failures.push({id:mon.id,face,reason:'LOCAL_SHA256_MISMATCH',expected});
    faces[face]={path:expected,sha256,source:asset.source??source.source};
  }
  entries.push({id:mon.id,name:mon.name,nationalDex:mon.nationalDex,spriteId:mon.spriteId,pokeapiIdentifier:identity.identifier,sourceProvider:source.sourceProvider??'PMDCollab/SpriteCollab or PokeAPI/sprites',faces});
}
const report={roster:roster.length,frontVerified:entries.filter(row=>row.faces.front&&!failures.some(f=>f.id===row.id&&f.face==='front')).length,backVerified:entries.filter(row=>row.faces.back&&!failures.some(f=>f.id===row.id&&f.face==='back')).length,failures,entries};
fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/regmc-asset-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({roster:report.roster,frontVerified:report.frontVerified,backVerified:report.backVerified,failures:failures.length}));
if(failures.length)process.exitCode=1;
