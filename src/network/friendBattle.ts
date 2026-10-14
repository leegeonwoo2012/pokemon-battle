import type { BattleAction, BattleEvent, BattleState, TeamSet } from '../engine/types';

export type BattlePhase = 'LOBBY' | 'TEAM_PREVIEW' | 'BATTLE_START';
export interface TeamPreviewEntry {
  speciesId: string;
  speciesName: string;
  level: number;
  gender: 'M' | 'F' | 'N' | null;
  form: string;
  itemRevealed: boolean;
  abilityRevealed: boolean;
}
export interface FriendProfile { name: string; team: TeamPreviewEntry[] }
export interface TeamSelectionPayload { indices: number[] }
export interface TeamPreviewState {
  type: 'team-preview-started';
  format: 'singles' | 'doubles';
  endsAt: number;
  durationMs: number;
  own: TeamPreviewEntry[];
  opponent: TeamPreviewEntry[];
  submitted: boolean;
  opponentSubmitted: boolean;
}

export type FriendMessage =
  | { type: 'room-created' | 'room-joined'; code: string; role: 'host' | 'guest'; token:string }
  | { type:'room-resumed';code:string;role:'host'|'guest';token:string;peer?:FriendProfile;profile?:{name:string;team:TeamSet[]};state:BattleState|null;format?:'singles'|'doubles';revision:number;waiting:boolean;peerConnected:boolean;preview?:TeamPreviewState|null }
  | { type:'format-selected';format:'singles'|'doubles' }
  | { type: 'peer-joined' }
  | { type: 'peer-ready'; peer: FriendProfile }
  | TeamPreviewState
  | { type:'team-selection-status';role:'host'|'guest';submitted:boolean;automatic?:boolean }
  | { type: 'battle-started'; state: BattleState; hostName: string; guestName: string;revision:number }
  | { type:'turn-resolved';state:BattleState;events:BattleEvent[];revision:number;rate:number }
  | { type:'actions-accepted';revision:number }
  | { type:'round-ready';state:BattleState;revision:number }
  | { type: 'turn-complete'; state: BattleState; skipped?: boolean;revision:number }
  | { type: 'rematch-state'; state: BattleState;revision:number }
  | { type: 'rematch-request'; from: string }
  | { type: 'peer-left';recoverable?:boolean }
  | { type:'peer-reconnected' | 'room-left' }
  | { type: 'error'; message: string };

export type FriendOutgoing =
  | { type: 'create-room' }
  | { type: 'join-room'; code: string }
  | { type:'resume-room';code:string;token:string }
  | { type: 'ready'; name: string; team: TeamSet[]; format?:'singles'|'doubles' }
  | { type: 'start-battle'; format?:'singles'|'doubles' }
  | { type: 'start_team_preview'; format:'singles'|'doubles' }
  | ({ type: 'submit_team_selection' } & TeamSelectionPayload)
  | { type:'select-format';format:'singles'|'doubles' }
  | { type: 'actions'; actions: BattleAction[];revision:number }
  | { type:'playback-ready';revision:number }
  | { type:'playback-rate';rate:number }
  | { type:'skip-playback' }
  | { type: 'rematch-state' }
  | { type: 'rematch-request' }
  | { type: 'leave-room' };

export function friendSocketUrl(): string {
  const configured = import.meta.env.VITE_FRIEND_SOCKET_URL as string | undefined;
  if (configured) return configured;
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/friend`;
}

export function swapTargetSides(actions: BattleAction[]): BattleAction[] {
  return actions.map(action => action.kind === 'move' && action.target
    ? { ...action, target: { ...action.target, side: action.target.side === 'player' ? 'cpu' : 'player' } }
    : { ...action });
}

export function swapBattleSides(state: BattleState): BattleState {
  return {
    ...state,
    log:state.log.map(entry=>({...entry,text:swapFieldText(entry.text)})),
    sides: { player: state.sides.cpu, cpu: state.sides.player },
    manualReplacementSides: state.manualReplacementSides?.map(side => side === 'player' ? 'cpu' : 'player'),
    winner: state.winner === 'player' ? 'cpu' : state.winner === 'cpu' ? 'player' : state.winner,
  };
}

export function swapBattleEvent(event: BattleEvent): BattleEvent {
  return { ...event,text:swapFieldText(event.text), side: event.side === 'player' ? 'cpu' : event.side === 'cpu' ? 'player' : undefined, snapshot: swapBattleSides(event.snapshot) };
}

/** Field messages are authored from the server's host perspective. Names remain untouched. */
function swapFieldText(text:string):string {
  return text.replace(/(?:아군|상대)(?= 진영| 장막| 리플렉터| 빛의장막| 오로라베일)/g,word=>word==='아군'?'상대':'아군');
}
