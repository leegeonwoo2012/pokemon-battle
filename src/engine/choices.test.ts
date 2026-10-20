import { describe, expect, it } from 'vitest';
import { moves } from '../data';
import { createSet } from '../team';
import { chooseCpuActions } from './ai';
import { createBattle, runTurn } from './battle';
import { isMoveUsable, moveUnavailableReason, usableMoves } from './choices';

function battle() {
  const pikachu = { ...createSet('raichu'), itemId: 'choiceScarf', moves: ['thunderbolt', 'quickattack', 'thunderwave', 'protect'] };
  return createBattle({ format: 'singles', playerTeam: [createSet('blastoise')], cpuTeam: [pikachu], seed: 7 });
}

describe('shared move availability', () => {
  it('permits four moves before selection and only the held Choice lock afterward', () => {
    const pokemon = battle().sides.cpu.team[0];
    expect(usableMoves(pokemon)).toHaveLength(4);
    expect(isMoveUsable(pokemon, 'struggle')).toBe(false);
    pokemon.choiceLock = 'quickattack';
    expect(usableMoves(pokemon).map(move => move.id)).toEqual(['quickattack']);
    expect(isMoveUsable(pokemon, 'thunderbolt')).toBe(false);
    expect(moveUnavailableReason(pokemon, 'thunderbolt')).toContain('전광석화만');
  });

  it('uses Struggle when the locked move is exhausted despite remaining PP on other moves', () => {
    const pokemon = battle().sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    pokemon.pp.quickattack = 0;
    expect(pokemon.pp.thunderbolt).toBeGreaterThan(0);
    expect(usableMoves(pokemon)).toEqual([]);
    expect(isMoveUsable(pokemon, 'struggle')).toBe(true);
    pokemon.fainted = true;
    expect(isMoveUsable(pokemon, 'struggle')).toBe(false);
  });

  it('ignores a remembered lock without a Choice item and rejects unknown or unlearned moves', () => {
    const pokemon = battle().sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    pokemon.set.itemId = 'leftovers';
    expect(usableMoves(pokemon)).toHaveLength(4);
    expect(isMoveUsable(pokemon, 'earthquake')).toBe(false);
    expect(isMoveUsable(pokemon, 'unknown')).toBe(false);
  });

  it('makes the CPU obey its low-damage locked move and fall back to Struggle at zero PP', () => {
    const state = battle();
    const pokemon = state.sides.cpu.team[0];
    pokemon.choiceLock = 'quickattack';
    expect(chooseCpuActions(state)[0]).toMatchObject({ kind: 'move', moveId: 'quickattack' });
    pokemon.pp.quickattack = 0;
    expect(chooseCpuActions(state)[0]).toMatchObject({ kind: 'move', moveId: 'struggle' });
  });

  it('reserves a doubles bench member so two CPU slots cannot select the same replacement', () => {
    const state = createBattle({
      format: 'doubles', seed: 5,
      playerTeam: [createSet('blastoise'), createSet('venusaur')],
      cpuTeam: [createSet('raichu'), createSet('charizard'), createSet('snorlax')],
    });
    state.turn = 2;
    state.sides.cpu.team[0].hp = 1;
    state.sides.cpu.team[1].hp = 1;
    const actions = chooseCpuActions(state);
    const switches = actions.filter(action => action.kind === 'switch');
    expect(actions).toHaveLength(2);
    expect(switches).toHaveLength(1);
    expect(switches[0]).toMatchObject({ kind: 'switch', to: 2 });
    expect(actions[1].kind).toBe('move');
  });

  it.each([
    ['incineroar','fakeout'],
    ['golisopod','firstimpression'],
  ])('allows %s to use %s only on its first action turn', (speciesId,moveId) => {
    const entrant=createSet(speciesId);
    entrant.moves=[moveId,...entrant.moves.filter(id=>id!==moveId)].slice(0,4);
    const state=createBattle({format:'singles',playerTeam:[entrant],cpuTeam:[createSet('blastoise')],seed:31});

    expect(isMoveUsable(state.sides.player.team[0],moveId,false,state.turn)).toBe(true);
    const first=runTurn(state,[{kind:'move',slot:0,moveId}],[{kind:'move',slot:0,moveId:'protect'}]);
    const used=first.sides.player.team[0];
    expect(first.turn).toBe(2);
    expect(isMoveUsable(used,moveId,false,first.turn)).toBe(false);
    expect(moveUnavailableReason(used,moveId,false,first.turn)).toContain('첫 행동 턴');

    const ppAfterFirstUse=used.pp[moveId];
    const second=runTurn(first,[{kind:'move',slot:0,moveId}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(second.sides.player.team[0].pp[moveId]).toBe(ppAfterFirstUse);
    expect(second.log.slice(first.log.length).some(entry=>entry.text.includes(`${moves[moveId].name} 사용!`))).toBe(false);
  });

  it('restores first-turn-only moves for the first turn after a switch-in', () => {
    const entrant=createSet('golisopod');
    entrant.moves=['firstimpression',...entrant.moves.filter(id=>id!=='firstimpression')].slice(0,4);
    const state=createBattle({format:'singles',playerTeam:[entrant,createSet('raichu')],cpuTeam:[createSet('blastoise')],seed:33});
    const switchedOut=runTurn(state,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(switchedOut.sides.player.team[1].firstTurnMoveTurn).toBe(2);

    const switchedBack=runTurn(switchedOut,[{kind:'switch',slot:0,to:0}],[{kind:'move',slot:0,moveId:'protect'}]);
    const returned=switchedBack.sides.player.team[0];
    expect(switchedBack.turn).toBe(3);
    expect(returned.firstTurnMoveTurn).toBe(3);
    expect(isMoveUsable(returned,'firstimpression',false,switchedBack.turn)).toBe(true);

    const used=runTurn(switchedBack,[{kind:'move',slot:0,moveId:'firstimpression'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(isMoveUsable(used.sides.player.team[0],'firstimpression',false,used.turn)).toBe(false);
  });

  it('keeps the CPU from selecting Fake Out after its entry turn', () => {
    const cpu=createSet('incineroar');
    cpu.moves=['fakeout',...cpu.moves.filter(id=>id!=='fakeout')].slice(0,4);
    const state=createBattle({format:'singles',playerTeam:[createSet('blastoise')],cpuTeam:[cpu],seed:35});
    state.turn=2;
    for(const moveId of cpu.moves)if(moveId!=='fakeout')state.sides.cpu.team[0].pp[moveId]=0;
    expect(chooseCpuActions(state)[0]).toMatchObject({kind:'move',moveId:'struggle'});
  });

  it('allows a faint replacement to use a first-turn move immediately', () => {
    const entrant=createSet('golisopod');
    entrant.moves=['firstimpression',...entrant.moves.filter(id=>id!=='firstimpression')].slice(0,4);
    const state=createBattle({format:'singles',playerTeam:[createSet('raichu'),entrant],cpuTeam:[createSet('blastoise')],manualReplacementSides:['player'],seed:37});
    state.turn=4;
    state.sides.player.team[0].fainted=true;
    state.sides.player.team[0].hp=0;

    const replacement=runTurn(state,[{kind:'switch',slot:0,to:1}],[]);
    const active=replacement.sides.player.team[1];
    expect(replacement.turn).toBe(4);
    expect(active.firstTurnMoveTurn).toBe(4);
    expect(isMoveUsable(active,'firstimpression',false,replacement.turn)).toBe(true);

    const used=runTurn(replacement,[{kind:'move',slot:0,moveId:'firstimpression'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(isMoveUsable(used.sides.player.team[1],'firstimpression',false,used.turn)).toBe(false);
  });
});
