import { describe, expect, it } from 'vitest';
import { createBattle } from '../engine/battle';
import { createSet } from '../team';
import { swapBattleEvent, swapBattleSides, swapTargetSides } from './friendBattle';

describe('friend match perspective mapping', () => {
  it('maps field messages and history to the guest without changing nicknames or server state',()=>{
    const state=createBattle({format:'singles',playerTeam:[createSet('raichu')],cpuTeam:[createSet('charizard')]});
    const text='상대 진영에 스텔스록 설치!';state.log.push({turn:1,kind:'status',text});
    const event={id:0,kind:'message' as const,text,snapshot:state};
    expect(swapBattleEvent(event).text).toBe('아군 진영에 스텔스록 설치!');
    expect(swapBattleSides(state).log.at(-1)?.text).toBe('아군 진영에 스텔스록 설치!');
    expect(swapBattleSides(swapBattleSides(state))).toEqual(state);
    expect(state.log.at(-1)?.text).toBe(text);
    expect(swapBattleEvent({...event,text:'상대왕의 화염방사!'}).text).toBe('상대왕의 화염방사!');
  });
  it('maps the event actor side and snapshot together without changing its stable UID', () => {
    const snapshot = createBattle({ format: 'singles', playerTeam: [createSet('raichu')], cpuTeam: [createSet('charizard')], manualReplacementSides: ['player'] });
    const event = { id: 0, kind: 'move' as const, text: '화염방사', actorUid: 'cpu-0', side: 'cpu' as const, snapshot };
    const mapped = swapBattleEvent(event);
    expect(mapped.actorUid).toBe('cpu-0'); expect(mapped.side).toBe('player');
    expect(mapped.snapshot.sides.player.team[0].uid).toBe(mapped.actorUid);
    expect(mapped.snapshot.manualReplacementSides).toEqual(['cpu']);
    expect(event.snapshot.sides.cpu.team[0].uid).toBe('cpu-0');
  });
  it('swaps the local and remote side without changing the authoritative battle', () => {
    const battle = createBattle({ format: 'singles', playerTeam: [createSet('raichu')], cpuTeam: [createSet('charizard')], seed: 19 });
    const view = swapBattleSides(battle);
    expect(view.sides.player.team[0].set.speciesId).toBe('charizard');
    expect(view.sides.cpu.team[0].set.speciesId).toBe('raichu');
    expect(battle.sides.player.team[0].set.speciesId).toBe('raichu');
    expect(battle.sides.cpu.team[0].set.speciesId).toBe('charizard');
  });

  it('maps selected targets back to the host authoritative sides', () => {
    const guestActions = [{ kind: 'move' as const, slot: 0, moveId: 'thunderbolt', target: { side: 'cpu' as const, slot: 0 } }];
    expect(swapTargetSides(guestActions)).toEqual([{ kind: 'move', slot: 0, moveId: 'thunderbolt', target: { side: 'player', slot: 0 } }]);
    expect(swapTargetSides(swapTargetSides(guestActions))).toEqual(guestActions);
  });
});
