import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {startDevelopment} from './dev.mjs';
import {serviceHealth} from './service-health.mjs';

test('development services start, reuse their own ports and reject unrelated services',async()=>{
  const logger={log(){}},first=await startDevelopment({port:0,friendPort:0,host:'127.0.0.1',logger});
  const unrelated=createServer((_req,res)=>res.end('another application'));
  try{
    assert(await serviceHealth(first.port,'web'));assert(await serviceHealth(first.friendPort,'friend'));
    const reused=await startDevelopment({port:first.port,friendPort:first.friendPort,host:'127.0.0.1',logger});
    assert.equal(reused.web,undefined);assert.equal(reused.relay,undefined);await reused.close();
    assert(await serviceHealth(first.port,'web'),'reused process must not close the original service');
    await new Promise(resolve=>unrelated.listen(0,'127.0.0.1',resolve));const busy=unrelated.address().port;
    await assert.rejects(startDevelopment({port:busy,friendPort:first.friendPort,host:'127.0.0.1',logger}),/포트가 사용 중/);
    await assert.rejects(startDevelopment({port:first.port,friendPort:busy,host:'127.0.0.1',logger}),/포트에 다른 프로그램/);
  }finally{await first.close();await new Promise(resolve=>unrelated.close(resolve));}
});
