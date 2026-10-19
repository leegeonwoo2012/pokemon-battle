"""Register local mythical PNGs and their source credits after image acquisition."""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
roster = json.loads((ROOT / 'docs/mythical-roster.json').read_text(encoding='utf-8'))
metrics_path = ROOT / 'src/presentation/sprite-metrics.generated.json'
metrics = json.loads(metrics_path.read_text(encoding='utf-8'))
credits_path = ROOT / 'public/sprites/attribution.json'
credits = json.loads(credits_path.read_text(encoding='utf-8'))
credit_ids = {row['speciesId'] for row in credits['images']}
species_text = (ROOT / 'src/data/mythical-roster.generated.ts').read_text(encoding='utf-8')
species = json.loads(species_text.split('mythicalRoster:Species[]=', 1)[1].split(';', 1)[0])

for mon in species:
    dex = mon['nationalDex']
    ident = mon['id']
    metrics['dimensions'][ident] = roster['dimensions'][ident]
    images = {}
    for facing in ('front', 'back'):
        rel = f'{facing}/{dex}.png'
        path = ROOT / 'public/sprites' / rel
        data = path.read_bytes()
        with Image.open(path) as png:
            rgba = png.convert('RGBA')
            alpha = rgba.getchannel('A')
            mask = alpha.point(lambda value: 255 if value >= 16 else 0)
            bounds = mask.getbbox()
            if not bounds:
                raise ValueError(f'Empty image: {rel}')
            x0, y0, x1, y1 = bounds
            width, height = rgba.size
            opaque = sum(1 for pixel in alpha.getdata() if pixel >= 16)
        metrics['images'][f'/sprites/{rel}'] = dict(width=width, height=height, x=x0, y=y0, w=x1-x0, h=y1-y0)
        source = f'https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/{"back/" if facing == "back" else ""}{dex}.png'
        digest = hashlib.sha256(data).hexdigest()
        images[facing] = dict(path=rel, source=source, sha256=digest, sourceSha256=digest,
                              width=width, height=height, opaque=opaque)
    if ident not in credit_ids:
        credits['images'].append(dict(speciesId=ident, nationalDex=dex, name=mon['name'],
                                     englishName=mon['englishName'], sourceProvider='PokeAPI/sprites',
                                     source='https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon',
                                     license='Repository CC0 1.0; image copyright The Pokémon Company. See PokeAPI-sprites-LICENCE.txt.',
                                     authors=[{'name': 'The Pokémon Company'}],
                                     extraction='Unmodified default National Dex PNG, separately verified front and back.',
                                     images=images))

form_id='meloettapirouette'
form_manifest_path=ROOT / 'public/sprites/forms/manifest.json'
form_manifest=json.loads(form_manifest_path.read_text(encoding='utf-8'))
form_record={'id':10018,'slug':'meloetta-pirouette','format':'png'}
for facing in ('front','back'):
    rel=f'{form_id}-{facing}.png'
    path=ROOT / 'public/sprites/forms' / rel
    data=path.read_bytes()
    with Image.open(path) as png:
        rgba=png.convert('RGBA')
        mask=rgba.getchannel('A').point(lambda value: 255 if value >= 16 else 0)
        x0,y0,x1,y1=mask.getbbox()
        width,height=rgba.size
    metrics['images'][f'/sprites/forms/{rel}']=dict(width=width,height=height,x=x0,y=y0,w=x1-x0,h=y1-y0)
    form_record[facing]=dict(source=f'https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/{"back/" if facing == "back" else ""}10018.png',
                             width=width,height=height,bytes=len(data),contentType='image/png',sha256=hashlib.sha256(data).hexdigest())
form_manifest[form_id]=form_record
form_manifest_path.write_text(json.dumps(form_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
metrics['dimensions'][form_id]={'height':0.6,'weight':6.5}

metrics_path.write_text(json.dumps(metrics, ensure_ascii=False), encoding='utf-8')
credits_path.write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding='utf-8')
credits_md = ROOT / 'public/sprites/CREDITS.md'
markdown = credits_md.read_text(encoding='utf-8')
if '## Additional mythical Pokémon' not in markdown:
    lines = ['\n## Additional mythical Pokémon\n']
    for mon in species:
        if mon['nationalDex'] not in (251, 386, 489, 490, 492, 494, 647, 649, 720, 721, 808):
            continue
        dex = mon['nationalDex']
        front = f'https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/{dex}.png'
        back = f'https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/back/{dex}.png'
        lines.append(f'- {mon["name"]} ({mon["englishName"]}, PokeAPI #{dex}): [front]({front}) / [back]({back}); image copyright The Pokémon Company.')
    credits_md.write_text(markdown.rstrip() + '\n' + '\n'.join(lines) + '\n', encoding='utf-8')
markdown=credits_md.read_text(encoding='utf-8')
if 'Meloetta-Pirouette' not in markdown:
    credits_md.write_text(markdown.rstrip()+'\n- 메로엣타 스텝폼 (Meloetta-Pirouette, PokeAPI #10018): [front](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/10018.png) / [back](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/back/10018.png); image copyright The Pokémon Company.\n',encoding='utf-8')
print(f'Registered {len(species)} mythical species; {len(credits["images"])} credited species total')
