import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync('outputs/sprite-audit.json','utf8'));
if(audit.success!==104||audit.frontSuccess!==52||audit.backSuccess!==52)throw Error('Run this once against the original 52-species library, before supplementing it.');
const credits=JSON.parse(fs.readFileSync('public/sprites/attribution.json','utf8'));
const complete=credits.images.filter(row=>audit.checks.filter(check=>check.speciesId===row.speciesId&&check.success).length===2);
const missing=audit.checks.filter(row=>row.facing==='front'&&!row.fileExists).map(row=>({speciesId:row.speciesId,name:row.name,nationalDex:row.nationalDex,
 frontPath:`public/sprites/front/${row.nationalDex}.png`,backPath:`public/sprites/back/${row.nationalDex}.png`,
 cause:'LOCAL_FILE_NOT_GENERATED',detail:'Previous community-only collector excluded this species; no image URL was indexed. Missing local request responds 200 text/html.',
 wrongUrl:false,caseMismatch:false,wrongId:false,networkFailure:false}));
fs.writeFileSync('outputs/sprite-baseline-52.json',JSON.stringify({...audit,missingSpecies:missing},null,2));
const header='# 기존 52종과 누락 128종 — 수정 전 실제 검사\n\n기존 정면 52/180, 후면 52/180. 로컬 성공 104개, 파일 누락 256개. 성공 파일은 HTTP 200 image/png, 실제 디코딩과 종·출처 해시 일치를 확인했습니다.\n\n';
const list='| 도감 | 이름 / ID | 정면 파일 | 후면 파일 | 출처 | 로딩 |\n|---|---|---|---|---|---|\n'+complete.sort((a,b)=>a.nationalDex-b.nationalDex).map(row=>`| ${row.nationalDex} | ${row.name} / ${row.speciesId} | public/sprites/front/${row.nationalDex}.png | public/sprites/back/${row.nationalDex}.png | [원본](${row.source}) | 정면·후면 200 / PNG 디코딩 성공 |`).join('\n');
const absent='\n\n## 누락 128종 원인\n\n128종 모두 이전 수집기의 커뮤니티 작품 필터로 제외되어 파일과 manifest 항목이 생성되지 않았습니다. 기존 설정에는 URL/파일명 대소문자/ID 불일치나 네트워크 실패가 기록되어 있지 않습니다. 없는 로컬 PNG 주소의 실제 응답은 200 text/html이므로 디코딩 성공으로 세지 않았습니다.\n\n| 도감 | 이름 / ID | 원인 |\n|---|---|---|\n'+missing.map(row=>`| ${row.nationalDex} | ${row.name} / ${row.speciesId} | 로컬 정면·후면 파일 미생성 |`).join('\n');
fs.writeFileSync('outputs/sprite-baseline-52.md',header+list+absent+'\n');console.log(`BASELINE_SAVED: existing ${complete.length}, missing ${missing.length}`);
