import test from 'node:test';
import assert from 'node:assert/strict';
import { startFriendServer } from './friend-server.mjs';
import runtime from './engine-runtime.cjs';
import { serviceHealth } from './service-health.mjs';

async function client(port){
  const socket=new WebSocket(`ws://127.0.0.1:${port}/friend`),messages=[],waiting=[];
  socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));const index=waiting.findIndex(row=>row.type===message.type);if(index<0)messages.push(message);else waiting.splice(index,1)[0].resolve(message);});
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const wait=type=>{const index=messages.findIndex(message=>message.type===type);if(index>=0)return Promise.resolve(messages.splice(index,1)[0]);return new Promise((resolve,reject)=>{const row={type,resolve:value=>{clearTimeout(timer);resolve(value);}};const timer=setTimeout(()=>{waiting.splice(waiting.indexOf(row),1);reject(Error('Missing message '+type));},8000);waiting.push(row);});};
  return {socket,wait,send:message=>socket.send(JSON.stringify(message)),close:()=>socket.close()};
}
test('server calculates real outcomes, rejects forged/stale choices, and resumes pending and finished rounds',async()=>{
  const relay=startFriendServer(0,'127.0.0.1');await new Promise(resolve=>relay.http.once('listening',resolve));
  const port=relay.http.address().port,sockets=[];
  try {
    assert.equal(await serviceHealth(port,'friend'),true);
    const host=await client(port),guest=await client(port);sockets.push(host,guest);
    host.send({type:'create-room'});const room=await host.wait('room-created');
    guest.send({type:'join-room',code:room.code});const join=await guest.wait('room-joined');
    const team={speciesId:'raichu',moves:['thunderbolt','quickattack','thunderwave','protect'],abilityId:'static',itemId:'none',natureId:'hardy'};
    host.send({type:'ready',name:'호스트',team:Array(6).fill(team)});guest.send({type:'ready',name:'친구',team:Array(6).fill(team)});await Promise.all([host.wait('peer-ready'),guest.wait('peer-ready')]);
    host.send({type:'start_team_preview',format:'singles',state:{winner:'player',hp:999999}});
    const [preview,peerPreview]=await Promise.all([host.wait('team-preview-started'),guest.wait('team-preview-started')]);
    assert.equal(preview.own.length,6);assert.equal(peerPreview.opponent.length,6);
    assert.equal(JSON.stringify(peerPreview.opponent).includes('thunderbolt'),false);
    assert.equal(preview.opponent[0].itemRevealed,false);
    host.send({type:'submit_team_selection',indices:[0,1,2]});guest.send({type:'submit_team_selection',indices:[0,1,2]});
    const start=await host.wait('battle-started');await guest.wait('battle-started');
    assert.equal(start.state.winner,null);assert.equal(start.state.sides.player.team[0].hp,start.state.sides.player.team[0].maxHp);
    host.send({type:'ready',name:'바뀐 팀',team:[team]});assert.match((await host.wait('error')).message,/팀을 변경/);
    host.send({type:'actions',revision:0,actions:[{kind:'move',slot:0,moveId:'thunderbolt'}]});assert.match((await host.wait('error')).message,/지난 턴/);
    host.send({type:'actions',revision:start.revision,actions:[{kind:'move',slot:0,moveId:'earthquake'}]});assert.match((await host.wait('error')).message,/기술/);
    host.send({type:'battle-frame',state:{winner:'player'}});assert.equal((await host.wait('error')).type,'error');
    const action={kind:'move',slot:0,moveId:'quickattack'};
    host.send({type:'actions',revision:start.revision,actions:[action]});await host.wait('actions-accepted');
    host.close();await guest.wait('peer-left');
    const restored=await client(port);sockets.push(restored);restored.send({type:'resume-room',code:room.code,token:room.token});const resumed=await restored.wait('room-resumed');assert.equal(resumed.waiting,true);assert.equal(resumed.state.turn,1);
    restored.send({type:'actions',revision:resumed.revision,actions:[action]});assert.match((await restored.wait('error')).message,/이미/);
    guest.send({type:'actions',revision:start.revision,actions:[action]});const [result,remote]=await Promise.all([restored.wait('turn-resolved'),guest.wait('turn-resolved')]);
    const expected=runtime.loadEngine().runTurnWithEvents(start.state,[action],[action]);assert.deepEqual(result.state,expected.state);assert.deepEqual(remote.state,result.state);assert(result.events.some(event=>event.kind==='damage'));
    restored.send({type:'playback-ready',revision:result.revision});guest.send({type:'playback-ready',revision:result.revision});await Promise.all([restored.wait('round-ready'),guest.wait('round-ready')]);
    guest.close();await restored.wait('peer-left');const resumedGuest=await client(port);sockets.push(resumedGuest);
    resumedGuest.send({type:'resume-room',code:room.code,token:join.token});const saved=await resumedGuest.wait('room-resumed');assert.deepEqual(saved.state,result.state);assert.equal(saved.waiting,false);
    const intruder=await client(port);sockets.push(intruder);intruder.send({type:'resume-room',code:room.code,token:'not-a-token'});assert.equal((await intruder.wait('error')).type,'error');
    restored.send({type:'leave-room'});await resumedGuest.wait('room-left');assert.equal(relay.rooms.size,0);
  }finally{for(const socket of sockets)socket.close();await relay.close();}
});

test('an unprepared lobby can resume and an unrelated service is not reused',async()=>{
  const relay=startFriendServer(0,'127.0.0.1');await new Promise(resolve=>relay.http.once('listening',resolve));
  const port=relay.http.address().port,sockets=[];
  try{
    assert.equal(await serviceHealth(port,'web'),false);
    const host=await client(port);sockets.push(host);host.send({type:'create-room'});const room=await host.wait('room-created');host.close();
    const restored=await client(port);sockets.push(restored);restored.send({type:'resume-room',code:room.code,token:room.token});
    const resume=await restored.wait('room-resumed');assert.equal(resume.profile,undefined);assert.equal(resume.state,null);
    const guest=await client(port);sockets.push(guest);guest.send({type:'join-room',code:room.code});await guest.wait('room-joined');
    const team={speciesId:'raichu',moves:['thunderbolt','quickattack','thunderwave','protect'],abilityId:'static',itemId:'none',natureId:'hardy'};
    restored.send({type:'ready',name:'복구',team:[team]});guest.send({type:'ready',name:'친구',team:[team]});await Promise.all([restored.wait('peer-ready'),guest.wait('peer-ready')]);
  }finally{for(const socket of sockets)socket.close();await relay.close();}
});

test('double preview preserves submitted order and refuses duplicate or short selections',async()=>{
  const relay=startFriendServer(0,'127.0.0.1');await new Promise(resolve=>relay.http.once('listening',resolve));
  const sockets=[];
  try{
    const port=relay.http.address().port,host=await client(port),guest=await client(port);sockets.push(host,guest);
    host.send({type:'create-room'});const {code}=await host.wait('room-created');
    guest.send({type:'join-room',code});const joined=await guest.wait('room-joined');
    const data=runtime.loadData().species,ids=['raichu','charizard','gyarados','blastoise','venusaur','arcanine'];
    const team=ids.map(speciesId=>({speciesId,moves:data[speciesId].learnset.slice(0,4),abilityId:data[speciesId].abilities[0],itemId:'none',natureId:'hardy'}));
    host.send({type:'ready',name:'A',team});guest.send({type:'ready',name:'B',team});
    await Promise.all([host.wait('peer-ready'),guest.wait('peer-ready')]);
    host.send({type:'start_team_preview',format:'doubles'});
    await Promise.all([host.wait('team-preview-started'),guest.wait('team-preview-started')]);
    host.send({type:'submit_team_selection',indices:[3,3,0,1]});assert.match((await host.wait('error')).message,/선출/);
    host.send({type:'submit_team_selection',indices:[3,0,5]});assert.match((await host.wait('error')).message,/선출/);
    host.send({type:'submit_team_selection',indices:[3,0,5,2]});
    guest.close();await host.wait('peer-left');
    const restored=await client(port);sockets.push(restored);
    restored.send({type:'resume-room',code,token:joined.token});
    const resumed=await restored.wait('room-resumed');
    assert.equal(resumed.preview?.submitted,false);assert.equal(resumed.preview?.opponentSubmitted,true);
    assert.equal(resumed.preview?.opponent.length,6);
    restored.send({type:'submit_team_selection',indices:[1,4,2,0]});
    const start=await host.wait('battle-started');await restored.wait('battle-started');
    assert.equal(start.state.format,'doubles');
    assert.deepEqual(start.state.sides.player.team.map(mon=>mon.set.speciesId),['blastoise','raichu','arcanine','gyarados']);
    assert.deepEqual(start.state.sides.cpu.team.map(mon=>mon.set.speciesId),['charizard','venusaur','gyarados','raichu']);
    assert.deepEqual(start.state.sides.player.active,[0,1]);
  }finally{for(const socket of sockets)socket.close();await relay.close();}
});

test('preview timer automatically selects the first three for an unsubmitted trainer',async()=>{
  const relay=startFriendServer(0,'127.0.0.1',{previewMs:120});await new Promise(resolve=>relay.http.once('listening',resolve));
  const sockets=[];
  try{
    const port=relay.http.address().port,host=await client(port),guest=await client(port);sockets.push(host,guest);
    host.send({type:'create-room'});const {code}=await host.wait('room-created');
    guest.send({type:'join-room',code});await guest.wait('room-joined');
    const data=runtime.loadData().species,ids=['raichu','charizard','gyarados','blastoise','venusaur','arcanine'];
    const team=ids.map(speciesId=>({speciesId,moves:data[speciesId].learnset.slice(0,4),abilityId:data[speciesId].abilities[0],itemId:'none',natureId:'hardy'}));
    host.send({type:'ready',name:'A',team});guest.send({type:'ready',name:'B',team});
    await Promise.all([host.wait('peer-ready'),guest.wait('peer-ready')]);
    host.send({type:'start_team_preview',format:'singles'});
    const [preview]=await Promise.all([host.wait('team-preview-started'),guest.wait('team-preview-started')]);
    assert.equal(preview.durationMs,120);
    host.send({type:'submit_team_selection',indices:[5,4,3]});
    const start=await host.wait('battle-started');await guest.wait('battle-started');
    assert.deepEqual(start.state.sides.player.team.map(mon=>mon.set.speciesId),['arcanine','venusaur','blastoise']);
    assert.deepEqual(start.state.sides.cpu.team.map(mon=>mon.set.speciesId),ids.slice(0,3));
  }finally{for(const socket of sockets)socket.close();await relay.close();}
});
