import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';
import { serviceHealth } from './service-health.mjs';
import { startFriendServer } from './friend-server.mjs';

async function assertPortAvailable(port,host,message){
  if(!port)return;
  const probe=net.createServer();
  await new Promise((resolve,reject)=>{
    probe.once('error',error=>reject(error.code==='EADDRINUSE'?Error(message):error));
    probe.listen(port,host,()=>probe.close(resolve));
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flatMap(entries => (entries ?? [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry.address));
}

// Keep both services in one process; only services started here are closed here.
export async function startDevelopment({port=5173,friendPort=Number(process.env.FRIEND_PORT??8787),host='0.0.0.0',logger=console}={}) {
  let web,relay;
  const close=async()=>{await web?.close();await relay?.close();};
  try {
    if(friendPort&&await serviceHealth(friendPort,'friend'))logger.log(`친구 대전 서버는 이미 실행 중입니다. 확인된 ${friendPort} 서버를 사용합니다.`);
    else {
      await assertPortAvailable(friendPort,host,`${friendPort} 포트에 다른 프로그램 또는 이전 버전 서버가 실행 중입니다. 기존 서버의 CMD에서 Ctrl+C 후 다시 실행하세요.`);
      relay=startFriendServer(friendPort,host);
      try {await new Promise((resolve,reject)=>{relay.http.once('listening',resolve);relay.http.once('error',reject);});}
      catch(error){if(error.code==='EADDRINUSE')throw Error(`${friendPort} 포트에 다른 프로그램 또는 이전 버전 서버가 실행 중입니다. 기존 서버의 CMD에서 Ctrl+C 후 다시 실행하세요.`);throw error;}
      friendPort=relay.http.address().port;
      logger.log(`친구 대전 서버 listening on ${host}:${friendPort}/friend (서버 판정 · 재접속 지원)`);
    }
    if(port&&await serviceHealth(port,'web'))logger.log(`게임은 이미 http://localhost:${port}/ 에 실행 중입니다. 확인된 기존 서버를 사용합니다.`);
    else {
      await assertPortAvailable(port,host,`${port} 포트가 사용 중입니다. 기존 개발 서버의 CMD에서 Ctrl+C 후 다시 실행하세요. 주소와 포트는 임의로 변경하지 않습니다.`);
      web=await createServer({server:{host,port,strictPort:true,proxy:{'/friend':{target:`ws://127.0.0.1:${friendPort}`,ws:true}}},logLevel:'error'});
      try {await web.listen();}
      catch(error){if(error.code==='EADDRINUSE'||/already in use/.test(error.message))throw Error(`${port} 포트가 사용 중입니다. 기존 개발 서버의 CMD에서 Ctrl+C 후 다시 실행하세요. 주소와 포트는 임의로 변경하지 않습니다.`);throw error;}
      port=web.httpServer.address().port;
    }
    const addresses=lanAddresses();
    logger.log(`게임(이 PC): http://localhost:${port}/`);
    if(addresses.length) logger.log(`친구 접속 주소(Wi‑Fi): ${addresses.map(address=>`http://${address}:${port}/`).join('  ')}`);
    else logger.log('친구 접속 주소를 찾지 못했습니다. Wi‑Fi 연결과 네트워크 어댑터를 확인하세요.');
    return {web,relay,port,friendPort,close};
  }catch(error){await close();throw error;}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {
    const services=await startDevelopment();
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>services.close().then(()=>process.exit(0)));
  }catch(error){console.error(`실행 실패: ${error.message}`);process.exitCode=1;}
}
