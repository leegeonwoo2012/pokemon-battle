import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);
beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',undefined);vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:96,height:96,close:vi.fn()})));});
afterEach(()=>{vi.unstubAllGlobals();});
async function setup(images:Record<string,string>,responses:Record<string,Response>){
  const request=vi.fn(async(path:string)=>path==='/sprites/manifest.json'?new Response(JSON.stringify({version:1,images}),{headers:{'content-type':'application/json'}}):responses[path]);
  vi.stubGlobal('fetch',request);
  const sprites=await import('./sprites');await sprites.initializeSprites();return {sprites,request};
}
describe('verified sprite loading',()=>{
  it('counts decoded images and falls back only to the same species front',async()=>{
    const {sprites}=await setup({'front/26':'/sprites/front/26.png'},{'/sprites/front/26.png':new Response(png,{headers:{'content-type':'image/png'}})});
    expect(sprites.spriteDiagnosticReport().success).toBe(1);
    expect(sprites.spriteSources('raichu','back')).toEqual(['/sprites/front/26.png']);
    expect(sprites.spriteSources('charizard','front')).toEqual([]);
  });
  it('classifies 404 and 200 HTML responses as failures',async()=>{
    const {sprites}=await setup({'front/26':'/sprites/front/26.png','back/26':'/sprites/back/26.png'},{
      '/sprites/front/26.png':new Response('missing',{status:404}),
      '/sprites/back/26.png':new Response('<html>SPA fallback</html>',{headers:{'content-type':'text/html'}}),
    });
    const report=sprites.spriteDiagnosticReport();expect(report.success).toBe(0);
    expect(report.issues.map(issue=>issue.httpStatus)).toEqual(expect.arrayContaining([404,200]));
    expect(report.issues.find(issue=>issue.key==='back/26')?.reason).toContain('HTML');
  });
  it('never requests a manifest mapping to the wrong Pokemon',async()=>{
    const {sprites,request}=await setup({'front/26':'/sprites/front/6.png'},{});
    expect(sprites.spriteDiagnosticReport().success).toBe(0);expect(request).toHaveBeenCalledTimes(1);
    expect(sprites.spriteDiagnosticReport().issues[0].reason).toContain('일치');
  });
  it('rejects a decode error even with valid PNG signature bytes',async()=>{
    vi.stubGlobal('createImageBitmap',vi.fn(async()=>{throw Error('truncated PNG');}));
    const {sprites}=await setup({'front/26':'/sprites/front/26.png'},{'/sprites/front/26.png':new Response(png,{headers:{'content-type':'image/png'}})});
    expect(sprites.spriteDiagnosticReport().success).toBe(0);
    expect(sprites.spriteDiagnosticReport().issues[0].reason).toContain('디코딩');
  });
  it('removes a late failed rendering from the ready count',async()=>{
    const {sprites}=await setup({'front/26':'/sprites/front/26.png'},{'/sprites/front/26.png':new Response(png,{headers:{'content-type':'image/png'}})});
    sprites.reportSpriteRenderFailure('/sprites/front/26.png');expect(sprites.spriteDiagnosticReport().success).toBe(0);
    expect(sprites.spriteSources('raichu','front')).toEqual([]);
  });
  it('surfaces a failed manifest fetch',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('not found',{status:404})));
    const sprites=await import('./sprites');await sprites.initializeSprites();
    expect(sprites.spriteDiagnosticReport().manifestStatus).toBe(404);
    expect(sprites.spriteDiagnosticReport().issues[0].reason).toContain('404');
  });
});
