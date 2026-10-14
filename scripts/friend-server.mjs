import { createHash,randomBytes } from 'node:crypto';
import runtime from './engine-runtime.cjs';
import { projectFingerprint,serviceHealth } from './service-health.mjs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_PREVIEW_MS, publicEntry, selectedTeam, selectionCount, validateSelection } from './team-preview.mjs';

const PORT = Number(process.env.FRIEND_PORT ?? process.env.PORT ?? 8787);
const MAX_MESSAGE = 1024 * 1024;

function encodeFrame(text, opcode = 1) {
  const payload = Buffer.from(text);
  const size = payload.length;
  if (size < 126) return Buffer.concat([Buffer.from([0x80 | opcode, size]), payload]);
  if (size < 65536) {
    const header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(size, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(size), 2);
  return Buffer.concat([header, payload]);
}

function write(client, message) {
  if (!client.socket.destroyed) client.socket.write(encodeFrame(JSON.stringify(message)));
}

export function startFriendServer(port = PORT, host = '0.0.0.0', { previewMs = TEAM_PREVIEW_MS } = {}) {
  const engine=runtime.loadEngine(),choices=runtime.loadChoices(),gimmicks=runtime.loadGimmicks(),species=runtime.loadData().species;
  const rooms = new Map();
  const clients = new Set();
  const rate = new Map();
  const http = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ service: 'ARENA friend battle relay', projectFingerprint,protocol:2, authority:'server', rooms: rooms.size, storage: 'ephemeral', reconnectSeconds:120 }));
  });

  function remove(client) {
    if(!clients.has(client))return;
    clients.delete(client);
    const room = rooms.get(client.code);
    if (!room) return;
    if (room[client.role] !== client)return;
    client.disconnectedAt=Date.now();
    const other = room[client.role === 'host' ? 'guest' : 'host'];
    if (other) write(other, { type: 'peer-left',recoverable:true });
  }

  function broadcast(room,message){for(const role of ['host','guest'])if(room[role])write(room[role],message);}
  function publicProfile(profile){return profile&&{name:profile.name,team:publicEntry(profile.team,species)};}
  function previewFor(room,role){
    const own=room[role]?.profile,peer=room[role==='host'?'guest':'host']?.profile;
    return {type:'team-preview-started',format:room.format,endsAt:room.preview.endsAt,durationMs:previewMs,
      own:publicEntry(own.team,species),opponent:publicEntry(peer.team,species),
      submitted:!!room.preview.selections[role],opponentSubmitted:!!room.preview.selections[role==='host'?'guest':'host']};
  }
  function startPreview(room,format){
    if(room.preview?.timer)clearTimeout(room.preview.timer);
    room.format=format;room.state=null;room.phase='TEAM_PREVIEW';room.pending={};room.busy=false;
    room.preview={endsAt:Date.now()+previewMs,selections:{},timer:null};
    room.preview.timer=setTimeout(()=>{
      if(room.phase!=='TEAM_PREVIEW')return;
      for(const role of ['host','guest'])if(!room.preview.selections[role]){
        room.preview.selections[role]=Array.from({length:selectionCount(room.format)},(_,index)=>index);
        broadcast(room,{type:'team-selection-status',role,submitted:true,automatic:true});
      }
      completePreview(room);
    },previewMs);
    for(const role of ['host','guest'])write(room[role],previewFor(room,role));
  }
  function completePreview(room){
    if(!room.preview?.selections.host||!room.preview?.selections.guest)return;
    clearTimeout(room.preview.timer);
    room.state=engine.createBattle({format:room.format,
      playerTeam:selectedTeam(room.host.profile.team,room.preview.selections.host),
      cpuTeam:selectedTeam(room.guest.profile.team,room.preview.selections.guest),
      seed:Date.now(),manualReplacementSides:['player','cpu']});
    room.preview=null;room.phase='BATTLE_START';room.revision++;
    broadcast(room,{type:'battle-started',state:room.state,revision:room.revision,hostName:room.host.profile.name,guestName:room.guest.profile.name});
  }
  function readyForNext(room){
    if(room.busy&&room.acks.host&&room.acks.guest){room.busy=false;room.pending={};broadcast(room,{type:'round-ready',revision:room.revision,state:room.state});}
  }
  function validateActions(room,role,actions){
    if(!room.state||room.state.winner||room.busy)return '현재는 행동을 제출할 수 없습니다.';
    if(room.pending[role])return '이미 행동을 제출했습니다.';
    if(!Array.isArray(actions)||actions.length>2)return '턴 행동이 올바르지 않습니다.';
    const side=role==='host'?'player':'cpu',state=room.state,own=state.sides[side];
    const slots=engine.needsReplacement(state)?engine.replacementSlots(state,side):own.active.flatMap((index,slot)=>own.team[index].fainted?[]:[slot]);
    if(actions.length!==slots.length||new Set(actions.map(a=>a?.slot)).size!==slots.length)return '출전한 포켓몬마다 행동 하나를 선택하세요.';
    const reserved=new Set();let powers=0;
    for(const action of actions){
      if(!action||!slots.includes(action.slot))return '잘못된 행동 자리입니다.';
      const mon=own.team[own.active[action.slot]];
      if(action.kind==='switch'){
        if(!Number.isInteger(action.to)||!own.team[action.to]||own.team[action.to].fainted||own.active.includes(action.to)||reserved.has(action.to))return '교체할 수 없는 포켓몬입니다.';
        reserved.add(action.to);
      }else if(action.kind==='move'&&!engine.needsReplacement(state)){
        const max=action.gimmick==='dynamax'?{...mon,transformation:{kind:'dynamax'}}:mon;
        if(!choices.isMoveUsable(max,action.moveId,action.gimmick==='z'))return '사용할 수 없는 기술입니다.';
        if(action.gimmick){if(!['mega','tera','z','dynamax'].includes(action.gimmick))return '알 수 없는 기믹입니다.';const reason=gimmicks.gimmickReason(state,side,mon,action.gimmick,action.moveId,action.teraType);if(reason)return reason;if(++powers>1)return '한 턴에 기믹을 중복 예약할 수 없습니다.';}
        if(action.target){
          const target=state.sides[action.target.side];if(!target||!Number.isInteger(action.target.slot)||!target.team[target.active[action.target.slot]]||target.team[target.active[action.target.slot]].fainted)return '잘못된 기술 대상입니다.';
          const base=choices.usableMoves(max,action.gimmick==='z').find(move=>move.id===action.moveId);
          const move=base?gimmicks.previewMove(max,base,action.gimmick):{target:'enemy'};
          const ally=action.target.side===side,self=ally&&action.target.slot===action.slot;
          if(move.target==='enemy'&&ally||move.target==='ally'&&(!ally||self)||move.target==='any'&&self||move.target==='self'&&!self)return '이 기술로 선택할 수 없는 대상입니다.';
        }
      }else return '잘못된 턴 행동입니다.';
    }
    return null;
  }

  function fail(client, reason) {
    write(client, { type: 'error', message: reason });
  }

  function handle(client, message) {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return fail(client, '잘못된 배틀 메시지입니다.');
    if (message.type === 'create-room') {
      if (client.code) return fail(client, '이미 배틀 방에 연결되어 있습니다.');
      let code;
      do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(code));
      client.code = code; client.role = 'host';
      client.token=randomBytes(24).toString('base64url');
      rooms.set(code, { host: client, guest: null,format:'singles',revision:0,state:null,phase:'LOBBY',preview:null,pending:{},acks:{},busy:false });
      write(client, { type: 'room-created', code, role: 'host',token:client.token });
      return;
    }
    if(message.type==='resume-room'){
      const room=rooms.get(message.code),role=['host','guest'].find(role=>room?.[role]?.token===message.token);
      const previous=role&&room[role];
      if(!previous||previous.disconnectedAt&&Date.now()-previous.disconnectedAt>120_000)return fail(client,'재접속 시간이 지났거나 방 정보가 없습니다.');
      // Same secret replaces a stale connection; unrelated clients cannot take its seat.
      previous.socket.destroy();clients.delete(previous);
      client.code=message.code;client.role=role;client.token=previous.token;client.profile=previous.profile;room[role]=client;
      if(room.busy)room.acks[role]=true;
      const peer=room[role==='host'?'guest':'host'];
      write(client,{type:'room-resumed',code:client.code,role,token:client.token,profile:client.profile,peer:publicProfile(peer?.profile),state:room.state,format:room.format,revision:room.revision,waiting:room.busy||!!room.pending[role],peerConnected:!!peer&&!peer.disconnectedAt,preview:room.preview?previewFor(room,role):null});
      if(peer)write(peer,{type:'peer-reconnected'});
      readyForNext(room);return;
    }
    if (message.type === 'join-room') {
      if (client.code) return fail(client, '이미 배틀 방에 연결되어 있습니다.');
      const now = Date.now(); const attempts = (rate.get(client.ip) ?? []).filter(stamp => now - stamp < 60_000);
      if (attempts.length >= 20) return fail(client, '잠시 후 다시 방 코드를 입력해 주세요.');
      attempts.push(now); rate.set(client.ip, attempts);
      const code = String(message.code ?? '').replace(/\D/g, '').slice(0, 6);
      const room = rooms.get(code);
      if (!room?.host) return fail(client, '방을 찾지 못했습니다. 방 코드와 호스트 연결을 확인해 주세요.');
      if (room.guest) return fail(client, '이 방은 이미 두 명이 참가했습니다.');
      client.code = code; client.role = 'guest';client.token=randomBytes(24).toString('base64url'); room.guest = client;
      write(client, { type: 'room-joined', code, role: 'guest',token:client.token });
      write(room.host, { type: 'peer-joined' });
      return;
    }
    const room = rooms.get(client.code);
    if (!room || room[client.role] !== client) return fail(client, '먼저 친선 대전 방을 만들거나 참가해 주세요.');
    const peer = room[client.role === 'host' ? 'guest' : 'host'];
    if (message.type === 'ready') {
      if(room.phase!=='LOBBY')return fail(client,'선출 또는 배틀 중에는 팀을 변경할 수 없습니다.');
      if (typeof message.name !== 'string' || !Array.isArray(message.team) || message.team.length < 1 || message.team.length > 6) return fail(client, '트레이너 이름 또는 팀 설정을 확인해 주세요.');
      const issues=engine.validateTeam(message.team);if(issues.length)return fail(client,issues[0]);
      client.profile = { name: message.name.trim().slice(0, 18) || (client.role === 'host' ? '호스트' : '도전자'), team: message.team };
      if(client.role==='host'&&(message.format==='singles'||message.format==='doubles'))room.format=message.format;
      if (peer?.profile) {
        write(client, { type: 'peer-ready', peer: publicProfile(peer.profile) });
        write(peer, { type: 'peer-ready', peer: publicProfile(client.profile) });
        write(client,{type:'format-selected',format:room.format??'singles'});write(peer,{type:'format-selected',format:room.format??'singles'});
      }
      return;
    }
    if(message.type==='leave-room'){if(room.preview?.timer)clearTimeout(room.preview.timer);broadcast(room,{type:'room-left'});rooms.delete(client.code);client.code=undefined;client.role=undefined;return;}
    if(message.type==='select-format'&&client.role==='host'&&room.phase==='LOBBY'&&(message.format==='singles'||message.format==='doubles')){room.format=message.format;broadcast(room,{type:'format-selected',format:room.format});return;}
    if (!peer) return fail(client, '상대와 연결이 끊겼습니다.');
    if ((message.type === 'start_team_preview'||message.type==='start-battle') && client.role === 'host') {
      if(room.phase!=='LOBBY')return fail(client,'이미 시작된 배틀입니다.');
      if(!room.host.profile||!room.guest?.profile)return fail(client,'양쪽 팀을 먼저 준비하세요.');
      const format=message.format==='doubles'?'doubles':message.format==='singles'||message.format===undefined?'singles':null;
      if(!format)return fail(client,'싱글 또는 더블 배틀을 선택해 주세요.');
      for(const profile of [room.host.profile,room.guest.profile]){const issues=engine.validateTeam(profile.team,format);if(issues.length)return fail(client,issues[0]);}
      if([room.host.profile,room.guest.profile].some(profile=>profile.team.length<6))return fail(client,'팀 프리뷰에는 각자 포켓몬 6마리가 필요합니다.');
      startPreview(room,format);
      return;
    }
    if(message.type==='submit_team_selection'){
      if(room.phase!=='TEAM_PREVIEW'||!room.preview)return fail(client,'지금은 선출을 제출할 수 없습니다.');
      if(room.preview.selections[client.role])return fail(client,'이미 선출을 확정했습니다.');
      if(!validateSelection(message.indices,client.profile.team.length,room.format))return fail(client,'선출할 포켓몬과 순서를 확인해 주세요.');
      room.preview.selections[client.role]=[...message.indices];
      broadcast(room,{type:'team-selection-status',role:client.role,submitted:true});
      completePreview(room);
      return;
    }
    if (message.type === 'actions' && (client.role === 'guest' || client.role === 'host')) {
      if(message.revision!==room.revision)return fail(client,'지난 턴의 행동입니다. 최신 상태에서 다시 선택하세요.');
      const issue=validateActions(room,client.role,message.actions);if(issue)return fail(client,issue);
      room.pending[client.role]=structuredClone(message.actions);write(client,{type:'actions-accepted',revision:room.revision});
      if(room.pending.host&&room.pending.guest){
        const result=engine.runTurnWithEvents(room.state,room.pending.host,room.pending.guest);
        room.state=result.state;room.revision++;room.busy=true;room.acks={host:false,guest:false};room.pending={};
        broadcast(room,{type:'turn-resolved',state:result.state,events:result.events,revision:room.revision,rate:room.rate??1});
      }
      return;
    }
    if(message.type==='playback-ready'&&message.revision===room.revision){room.acks[client.role]=true;readyForNext(room);return;}
    if(message.type==='skip-playback'&&client.role==='host'&&room.busy){room.acks={host:true,guest:true};broadcast(room,{type:'turn-complete',state:room.state,skipped:true,revision:room.revision});readyForNext(room);return;}
    if(message.type==='playback-rate'&&client.role==='host'&&[.75,1,1.5].includes(message.rate)){room.rate=message.rate;return;}
    if(message.type==='rematch-state'&&client.role==='host'&&room.state?.winner){startPreview(room,room.format);return;}
    if (message.type === 'rematch-request') { write(peer, { type: 'rematch-request', from: client.role }); return; }
    return fail(client, '이 대전 단계에서는 해당 요청을 처리할 수 없습니다.');
  }

  http.on('upgrade', (request, socket) => {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/friend' || !request.headers['sec-websocket-key']) { socket.destroy(); return; }
    const accept = createHash('sha1').update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '\r\n'].join('\r\n'));
    const client = { socket, ip: request.socket.remoteAddress ?? 'unknown', code: undefined, role: undefined, profile: undefined, buffer: Buffer.alloc(0),lastSeen:Date.now() };
    clients.add(client);
    socket.on('data', chunk => {
      client.lastSeen=Date.now();
      client.buffer = Buffer.concat([client.buffer, chunk]);
      while (client.buffer.length >= 2) {
        const first = client.buffer[0], second = client.buffer[1];
        let length = second & 0x7f, offset = 2;
        if (length === 126) { if (client.buffer.length < 4) return; length = client.buffer.readUInt16BE(2); offset = 4; }
        else if (length === 127) { if (client.buffer.length < 10) return; const wide = client.buffer.readBigUInt64BE(2); if (wide > BigInt(MAX_MESSAGE)) return socket.destroy(); length = Number(wide); offset = 10; }
        const masked = Boolean(second & 0x80); const maskOffset = offset;
        if (masked) offset += 4;
        if (length > MAX_MESSAGE) return socket.destroy();
        if (client.buffer.length < offset + length) return;
        const payload = Buffer.from(client.buffer.subarray(offset, offset + length));
        if (masked) for (let index = 0; index < payload.length; index++) payload[index] ^= client.buffer[maskOffset + (index % 4)];
        client.buffer = client.buffer.subarray(offset + length);
        const opcode = first & 0x0f;
        if (opcode === 8) { socket.end(encodeFrame('', 8)); remove(client); return; }
        if (opcode === 9) { socket.write(encodeFrame(payload, 10)); continue; }
        if (opcode !== 1) continue;
        try { handle(client, JSON.parse(payload.toString('utf8'))); }
        catch { fail(client, '메시지를 읽지 못했습니다.'); }
      }
    });
    socket.on('close', () => remove(client));
    socket.on('error', () => remove(client));
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for(const client of clients){if(now-client.lastSeen>60_000)client.socket.destroy();else client.socket.write(encodeFrame('',9));}
    for (const [code, room] of rooms) if (['host','guest'].some(role=>room[role]?.disconnectedAt&&now-room[role].disconnectedAt>120_000)){if(room.preview?.timer)clearTimeout(room.preview.timer);broadcast(room,{type:'room-left'});rooms.delete(code);}
    for (const [ip, attempts] of rate) { const recent = attempts.filter(stamp => now - stamp < 60_000); if (recent.length) rate.set(ip, recent); else rate.delete(ip); }
  }, 20_000);
  cleanup.unref();
  http.listen(port, host);
  return { http, rooms, close: () => new Promise(resolve => { clearInterval(cleanup);for(const room of rooms.values())if(room.preview?.timer)clearTimeout(room.preview.timer); for (const client of clients) client.socket.destroy(); http.close(() => resolve()); }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const relay = startFriendServer();
  relay.http.once('listening',()=>console.log(`친구 대전 서버 listening on 0.0.0.0:${PORT}/friend (서버 판정 · 재접속 지원)`));
  relay.http.once('error', async error => {
    if (error?.code === 'EADDRINUSE') {
      if(await serviceHealth(PORT,'friend')){console.log(`친구 대전 서버가 이미 실행 중입니다. 기존 ${PORT} 포트를 사용합니다.`);process.exit(0);}
      console.error(`${PORT} 포트를 다른 프로그램 또는 이전 버전 서버가 사용 중입니다. 그 서버의 CMD에서 Ctrl+C를 누른 뒤 npm run dev를 실행하세요.`);process.exit(1);
    }
    console.error(`친구 대전 서버 시작 실패: ${error.message}`);process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => relay.close().then(() => process.exit(0)));
}
