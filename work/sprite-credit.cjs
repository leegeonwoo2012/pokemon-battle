const fs=require('node:fs');const t=JSON.parse(fs.readFileSync('work/sprite-research/tracker.json'));
for(const id of ['0025','0248','0445','0006']){const r=t[id];console.log(id,r.name,r.sprite_credit, Object.entries(r.subgroups).filter(([k,v])=>!['','Shiny'].includes(v.name)).map(([k,v])=>({key:k,name:v.name,credit:v.sprite_credit,exists:v.sprite_complete})));}
