import { describe, expect, it } from 'vitest';
import { moves } from '../data';
import { hasDedicatedMoveMotion, moveMotion } from './move-motions';

describe('per-move battle choreography', () => {
  it('provides a type motion and Korean action cue for every shipped move', () => {
    for (const move of Object.values(moves)) {
      expect(moveMotion(move).family, move.id).toBeTruthy();
      expect(moveMotion(move).cue.length, move.id).toBeGreaterThan(3);
      expect(moveMotion(move).cue, move.id).toMatch(/[가-힣]/);
    }
    for(const id of ['counter','mirrorcoat','electroshot','voltswitch','lastrespects','steelbeam','waterspout','eruption','outrage','scaleshot','spectralthief','sunsteelstrike','moongeistbeam','photongeyser','coreenforcer','thousandarrows','thousandwaves','dragonascent','dracometeor','spacialrend','roaroftime','originpulse','precipiceblades','seedflare','fleurcannon','prismaticlaser','catastropika','10000000voltthunderbolt','clangoroussoulblaze','extremeevoboost','genesissupernova','guardianofalola','letssnuggleforever','lightthatburnsthesky','maliciousmoonsault','menacingmoonrazemaelstrom','oceanicoperetta','pulverizingpancake','searingsunrazesmash','sinisterarrowraid','soulstealing7starstrike','splinteredstormshards','stokedsparksurfer','nihillight'])expect(hasDedicatedMoveMotion(id)).toBe(true);
  });

  it('uses distinctly shaped choreography for signature move styles', () => {
    expect(moveMotion(moves.flamethrower)).toMatchObject({ family: 'flame', cue: '불꽃을 길게 뿜어냄' });
    expect(moveMotion(moves.thunderbolt)).toMatchObject({ family: 'lightning' });
    expect(moveMotion(moves.leafstorm)).toMatchObject({ family: 'leaf' });
    expect(moveMotion(moves.earthquake)).toMatchObject({ family: 'earth' });
    expect(moveMotion(moves.closecombat)).toMatchObject({ family: 'strike' });
  });
});
