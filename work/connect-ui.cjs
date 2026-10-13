const fs=require('node:fs');const p='src/App.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace("import type { CSSProperties } from 'react';", "import { flushSync } from 'react-dom';\nimport { PokemonArtwork, SpeciesMark } from './components/PokemonArtwork';\nimport { animateBattleEvent } from './presentation/animate';\nimport { playEvents } from './presentation/queue';\nimport { initializeSprites, importSpriteFiles, useSpriteLibrary } from './presentation/sprites';");
s=s.replace("import { spritePathFor } from './data/sprites';\n",'');s=s.replace('createBattle, runTurn','createBattle, runTurnWithEvents');s=s.replace('BattleAction, BattleState,','BattleAction, BattleEvent, BattleState,');
s=s.slice(0,s.indexOf('function PokemonArtwork'))+s.slice(s.indexOf('function Header'));
s=s.replace('className={`battle-status-plate plate-${side}`}','className={`battle-status-plate plate-${side}`} data-status-uid={pokemon.uid}');
const actorStart=s.indexOf('function SceneActor');const actorEnd=s.indexOf('type BattleMenu',actorStart);
s=s.slice(0,actorStart)+`function SceneActor({ pokemon, side, slot }: { pokemon: Combatant; side: 'player' | 'cpu'; slot: number }) {
  return <div data-uid={pokemon.uid} data-species={pokemon.set.speciesId} data-slot={slot} className={\`scene-actor actor-\${side} actor-slot-\${slot} \${pokemon.fainted ? 'actor-fainted' : ''}\`}>
    <div className="actor-shadow" />
    <PokemonArtwork speciesId={pokemon.set.speciesId} facing={side === 'player' ? 'back' : 'front'} size="large" />
    {pokemon.protected && !pokemon.fainted && <span className="protected-dome" aria-label="방어 중" />}
  </div>;
}

`+s.slice(actorEnd);
s=s.replace('compactLog, animating }: { state:', 'compactLog, animating, playbackEvent }: { state:');
s=s.replace('compactLog: boolean; animating: boolean })', 'compactLog: boolean; animating: boolean; playbackEvent: BattleEvent | null })');
const oldStart=s.indexOf('  const [effects, setEffects]');const oldEnd=s.indexOf("  useEffect(() => { setPending",oldStart);
s=s.slice(0,oldStart)+`  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (playbackEvent) setEventMessage(playbackEvent.text); }, [playbackEvent]);
`+s.slice(oldEnd);
s=s.replace(/ attacking=\{effects\.cpuAttack\} hit=\{effects\.cpuHit\}/g,'').replace(/ attacking=\{effects\.playerAttack\} hit=\{effects\.playerHit\}/g,'');
s=s.replace('<section className="battle-action-box" aria-label="전투 행동 선택">','<fieldset className="battle-action-box" aria-label="전투 행동 선택" disabled={animating}>');
s=s.replace('        </section>\n      </div>\n      {showLog','        </fieldset>\n      </div>\n      {showLog');
s=s.replace('<span>{active?.speciesName ?? \'포켓몬\'}의 차례</span>', '<span>{animating ? \'전투 재생 중 · 입력 잠금\' : `${active?.speciesName ?? \'포켓몬\'}의 차례`}</span>');
s=s.replace('className="scene-top-button" onClick={onExit}', 'className="scene-top-button" disabled={animating} onClick={onExit}');
s=s.replace('className="battle-scene" aria-label=', 'className="battle-scene" data-event-kind={playbackEvent?.kind} data-event-id={playbackEvent?.id} aria-busy={animating} aria-label=');
s=s.replace("  const [animating, setAnimating] = useState(false);", `  const [animating, setAnimating] = useState(false);
  const [playbackEvent, setPlaybackEvent] = useState<BattleEvent | null>(null);
  const playbackController = useRef<AbortController | null>(null);
  const playbackLocked = useRef(false);
  useEffect(() => { void initializeSprites(); return () => playbackController.current?.abort(); }, []);`);
s=s.replace("      setFormat(nextFormat);", "      setPlaybackEvent(null); setFormat(nextFormat);");
const turnStart=s.indexOf('  function runPlayerTurn');const turnEnd=s.indexOf('  function addFromDex',turnStart);
s=s.slice(0,turnStart)+`  async function runPlayerTurn(actions: BattleAction[]) {
    if (!battle || playbackLocked.current || battle.winner) return;
    playbackLocked.current = true;
    setAnimating(true);
    const controller = new AbortController(); playbackController.current = controller;
    try {
      const result = runTurnWithEvents(battle, actions);
      await playEvents(result.events, {
        present: event => flushSync(() => { setBattle(event.snapshot); setPlaybackEvent(event); }),
        animate: (event, signal) => animateBattleEvent(document.querySelector('.battle-scene'), event, signal, reducedMotion),
        recover: () => setMessage('연출을 건너뛰고 실제 전투 결과로 복구했습니다.'),
      }, controller.signal);
      if (!controller.signal.aborted) setBattle(result.state);
    } catch (error) { setMessage(error instanceof Error ? error.message : '턴 처리 중 오류가 발생했습니다.'); }
    finally { playbackLocked.current = false; if (!controller.signal.aborted) setAnimating(false); }
  }
`+s.slice(turnEnd);
s=s.replace('compactLog={compactLog} animating={animating}', 'compactLog={compactLog} animating={animating} playbackEvent={playbackEvent}');
s=s.replace('비공식 팬 제작 배틀 프로토타입 · 오리지널 그래픽','비공식 팬 제작 배틀 · 사용자 이미지 라이브러리');
fs.writeFileSync(p,s);
