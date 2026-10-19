import { useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, Radio, Swords, Users, Wifi } from 'lucide-react';
import { species } from '../data';
import type { TeamSet } from '../engine/types';
import type { Format } from '../engine/types';
import type { FriendProfile } from '../network/friendBattle';
import type { RestrictedLimit } from '../team';

export interface FriendRoomView {
  role: 'host' | 'guest';
  code: string;
  name: string;
  peer?: FriendProfile;
}

interface Props {
  room: FriendRoomView | null;
  status: string;
  connecting: boolean;
  team: TeamSet[];
  format:Format;
  restrictedLimit:RestrictedLimit;
  onFormat:(format:Format)=>void;
  onRestricted:(limit:RestrictedLimit)=>void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onStart: () => void;
  onLeave: () => void;
  onHome: () => void;
}

export function FriendlyLobby({ room, status, connecting, team, format, restrictedLimit, onFormat, onRestricted, onCreate, onJoin, onStart, onLeave, onHome }: Props) {
  const [name, setName] = useState(localStorage.getItem('arena-trainer-name') ?? '트레이너');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('friendCode') ?? '');
  const [copied, setCopied] = useState(false);
  const canStart=!!room?.peer&&team.length===6&&room.peer.team.length===6;
  function updateName(value: string) { setName(value); localStorage.setItem('arena-trainer-name', value); }
  async function copyInvite() {
    const url = `${location.origin}/?friendCode=${room?.code ?? code}#friend`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  }

  return <main className="friendly-page page-enter" id="friend">
    <div className="friendly-heading"><button className="friendly-back" onClick={room ? onLeave : onHome}><ArrowLeft size={17} /> {room ? '방 나가기' : '메인 메뉴'}</button><div className="friendly-kicker"><Radio size={15} /> PRIVATE MATCH · {format.toUpperCase()}</div><h1>친구와 대전</h1><p>저장한 팀으로 싱글 또는 더블 친선전을 진행합니다. 호스트가 배틀 형식을 선택합니다.</p>
      {(!room||room.role==='host')?<div className="friendly-format" role="group" aria-label="친선 배틀 형식"><button aria-pressed={format==='singles'} onClick={()=>onFormat('singles')}>싱글 · 1대1</button><button aria-pressed={format==='doubles'} onClick={()=>onFormat('doubles')}>더블 · 2대2</button></div>:<span className="friendly-format-note">배틀 형식은 호스트가 선택합니다.</span>}
      <label className="restricted-rule">초전설·환상 제한 <select aria-label="친선전 초전설 제한" value={restrictedLimit} disabled={!!room&&room.role==='guest'} onChange={event=>onRestricted(Number(event.target.value) as RestrictedLimit)}><option value={0}>금지</option><option value={1}>최대 1마리</option><option value={2}>최대 2마리</option><option value={3}>최대 3마리</option><option value={4}>최대 4마리</option></select></label>
    </div>
    <div className="friendly-layout">
      <section className="friendly-board">
        <div className="friendly-board-top"><span><Wifi size={16} /> 연결 상태</span><strong className={room?.peer ? 'connected' : ''}>{room?.peer ? '상대 연결됨' : room ? '친구를 기다리는 중' : '준비 완료'}</strong></div>
        <div className="friendly-vs"><div className="friendly-trainer"><span className="trainer-emblem">A</span><strong>{room?.name ?? (name || '트레이너')}</strong><small>내 팀 · {team.length}마리</small></div><div className="friendly-versus-mark">VS</div><div className="friendly-trainer"><span className="trainer-emblem trainer-emblem-guest">{room?.peer ? 'B' : <Users size={25} />}</span><strong>{room?.peer?.name ?? '친구 대기 중'}</strong><small>{room?.peer ? `상대 팀 · ${room.peer.team.length}마리` : '초대 코드로 연결'}</small></div></div>
        {room && <div className="friend-code-panel"><span>친선 대전 코드</span><strong aria-label="친선 대전 코드">{room.code}</strong><button onClick={copyInvite}><Copy size={15} /> {copied ? '복사 완료' : '초대 링크 복사'}</button><small>코드 또는 초대 링크를 친구에게 보내세요.</small></div>}
        <div className="friendly-status" role="status"><i />{room?.peer&&!canStart?'팀 프리뷰에는 두 플레이어 모두 6마리 팀이 필요합니다. 팀 편성에서 완성하세요.':status || (room?.peer ? '양쪽 모두 연결됐습니다. 호스트가 대전을 시작합니다.' : room ? '친구가 방 코드로 참가하면 팀이 자동으로 연결됩니다.' : '방을 만들거나 친구의 코드를 입력하세요.')}</div>
        {room?.role === 'host' && room.peer && <button className="friendly-start" disabled={!canStart} onClick={onStart}><Swords size={19} /> 팀 프리뷰 시작 <span>{format==='singles'?'싱글 · 3마리 선출':'더블 · 4마리 선출'}</span></button>}
        {room?.role === 'guest' && room.peer && <div className="friendly-wait"><Check size={17} /> 팀이 준비됐어요. 호스트가 {format==='doubles'?'더블':'싱글'} 대전을 시작합니다.</div>}
      </section>
      {!room && <section className="friendly-controls">
        <label>트레이너 이름<input value={name} maxLength={18} onChange={event => updateName(event.target.value)} placeholder="이름" /></label>
        <button className="friendly-create" disabled={connecting} onClick={() => onCreate(name)}><Swords size={18} /><span><strong>{connecting ? '서버에 연결 중…' : '방 만들기'}</strong><small>내가 호스트가 되어 초대 코드를 만듭니다</small></span></button>
        <div className="friendly-separator"><span>또는 참가하기</span></div>
        <label>친구의 6자리 코드<input aria-label="친구의 방 코드" inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
        <button className="friendly-join" disabled={connecting || code.length !== 6} onClick={() => onJoin(name, code)}><Link2 size={17} /> 코드로 참가</button>
        <p>인터넷 친선전은 친구와 같은 공개 배포 주소를 사용해야 합니다. 로컬 개발 중에는 같은 네트워크에서 접속할 수 있어요.</p>
      </section>}
      {room && <section className="friendly-team-preview"><span>내 팀 프리뷰</span><div>{team.map((set, index) => <div key={`${set.speciesId}-${index}`}><strong>{species[set.speciesId]?.name ?? set.speciesId}</strong><small>{set.moves.length}개 기술</small></div>)}</div><span>상대 팀은 배틀 시작 시 확인할 수 있습니다.</span></section>}
    </div>
  </main>;
}
