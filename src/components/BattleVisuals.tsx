import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { speciesVisualProfile } from '../presentation/sprite-geometry';
import { battleTiming } from '../presentation/timing';
import { BATTLE_LEVEL } from '../team';
import { Flame, Droplets, Zap, Moon, Snowflake, Orbit, Heart, Waves } from 'lucide-react';
import { PokemonArtwork } from './PokemonArtwork';
import { abilities, items, typeNames } from '../data';
import { gimmickNames } from '../data/gimmicks';
import { hasFormSprite } from '../presentation/form-sprites';
import type { BattleEvent, Combatant, Side } from '../engine/types';

const statuses: Record<string, string> = { burn: '화상', poison: '독', paralysis: '마비', sleep: '잠듦', freeze: '얼음' };
const stats: Record<string, string> = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드', accuracy: '명중', evasion: '회피' };
const conditionIcons = {burn:Flame,poison:Droplets,paralysis:Zap,sleep:Moon,freeze:Snowflake,confusion:Orbit,infatuation:Heart,aquaring:Waves};

function ActorConditions({pokemon,event}:{pokemon:Combatant;event:BattleEvent|null}) {
  if(pokemon.fainted)return null;
  const active: {id:keyof typeof conditionIcons;label:string}[]=[];
  if(pokemon.status)active.push({id:pokemon.status,label:statuses[pokemon.status]});
  if(pokemon.confusionTurns)active.push({id:'confusion',label:'혼란'});
  if(pokemon.infatuatedBy)active.push({id:'infatuation',label:'헤롱헤롱'});
  if(pokemon.aquaRing)active.push({id:'aquaring',label:'아쿠아링'});
  return <div className="actor-conditions" aria-label="현재 상태">{active.map(condition=>{
    const Icon=conditionIcons[condition.id];
    const pulse=event?.targetUid===pokemon.uid&&(event.kind==='status'||event.kind==='blocked');
    return <span key={condition.id} className={`condition-orbit condition-${condition.id} ${pulse?'condition-pulse':''}`} role="img" aria-label={condition.label} title={condition.label}><Icon size={15}/></span>;
  })}</div>;
}

/** Interpolates only between HP values emitted by the engine, never recalculates damage. */
export function usePresentedHp(pokemon: Combatant, event: BattleEvent | null, motion: boolean, rate: number): number {
  const [hp, setHp] = useState(pokemon.hp);
  useLayoutEffect(() => {
    if (!motion || event?.targetUid !== pokemon.uid || !['damage', 'heal'].includes(event.kind) || event.beforeHp === undefined) {
      setHp(pokemon.hp); return;
    }
    const from = event.beforeHp, to = pokemon.hp, duration = battleTiming.hpDuration / rate;
    setHp(from);
    let frame = 0, start: number | undefined;
    const update = (time: number) => {
      start ??= time;
      const progress = Math.max(0, Math.min(1, (time - start - battleTiming.hpDelay / rate) / duration));
      setHp(Math.round(from + (to - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [pokemon.uid, pokemon.hp, event, motion, rate]);
  return hp;
}

export function HpBar({ pokemon, hp = pokemon.hp }: { pokemon: Combatant; hp?: number }) {
  const percent = Math.max(0, hp / pokemon.maxHp * 100);
  return <div className={`scene-hp ${percent <= 20 ? 'scene-hp-low' : percent <= 50 ? 'scene-hp-mid' : ''}`} role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={pokemon.maxHp} aria-valuenow={hp}><span style={{ width: `${percent}%` }} /></div>;
}

export function BattleStatusPlate({ pokemon, side, slot, event, motion, rate }: { pokemon: Combatant; side: Side; slot: number; event: BattleEvent | null; motion: boolean; rate: number }) {
  const hp = usePresentedHp(pokemon, event, motion, rate);
  const source = event?.targetUid === pokemon.uid || event?.actorUid === pokemon.uid ? event : null;
  const passive = source && ['ability', 'item'].includes(source.kind) && source.sourceId
    ? (source.kind === 'ability' ? abilities : items)[source.sourceId]?.name : null;
  return <div className={`battle-status-plate plate-${side} ${hp/pokemon.maxHp<=.2&&!pokemon.fainted?'plate-low-hp':''}`} data-status-uid={pokemon.uid} data-actual-hp={pokemon.hp}>
    {passive && <div className={`passive-notice passive-${source?.kind}`} role="status">{source?.kind === 'ability' ? '특성' : '도구'} · {passive}</div>}
    <div className="plate-heading"><strong>{pokemon.set.nickname||pokemon.speciesName}<span className={`plate-gender gender-${pokemon.gender}`} aria-label={pokemon.gender==='M'?'수컷':pokemon.gender==='F'?'암컷':undefined}>{pokemon.gender==='M'?'♂':pokemon.gender==='F'?'♀':''}</span></strong><span className="plate-level"><small>Lv.</small> {BATTLE_LEVEL}</span></div>
    <div className="plate-subline">{pokemon.types.map(type => <span key={type} className={`type-badge type-${type}`}>{typeNames[type]}</span>)}{pokemon.status && <span className={`status-pill status-${pokemon.status}`}>{statuses[pokemon.status]}</span>}{(pokemon.confusionTurns ?? 0) > 0 && <span className="status-pill" data-condition="confusion">혼란</span>}{pokemon.flinched && <span className="status-pill" data-condition="flinch">풀죽음</span>}{pokemon.fainted && <span className="status-pill">기절</span>}{pokemon.transformation && <small className="transformation-label">{gimmickNames[pokemon.transformation.kind]}{pokemon.transformation.turns !== undefined ? ` · ${pokemon.transformation.turns}턴` : ''}</small>}</div>
    <div className="plate-hp-row"><span className="hp-label">HP</span><HpBar pokemon={pokemon} hp={hp} /></div>
    <div className="plate-hp-text">{side==='player'?<><strong>{hp}</strong><span>/ {pokemon.maxHp}</span></>:<span>{Math.ceil(hp/pokemon.maxHp*100)}%</span>}</div>
    <div className="plate-boosts">{Object.entries(pokemon.stages).filter(([, value]) => value !== 0).map(([key, value]) => <span key={key} className={value>0?'boost-positive':'boost-negative'}>{stats[key]} {value>0?'▲':'▼'}{Math.abs(value)}</span>)}</div>
    {(!!pokemon.tauntTurns||!!pokemon.encore||!!pokemon.toxicCounter||!!pokemon.substituteHp||!!pokemon.trapped||!!pokemon.yawnTurns||!!pokemon.gmaxCritStages)&&<div className="plate-boosts">{!!pokemon.tauntTurns&&<span>도발 {pokemon.tauntTurns}턴</span>}{pokemon.encore&&<span>앵콜 {pokemon.encore.turns}턴</span>}{!!pokemon.toxicCounter&&<span>맹독</span>}{!!pokemon.substituteHp&&<span>대타 HP {pokemon.substituteHp}</span>}{pokemon.trapped&&<span>교체 불가</span>}{!!pokemon.yawnTurns&&<span>졸음</span>}{!!pokemon.gmaxCritStages&&<span>급소 +{pokemon.gmaxCritStages}</span>}</div>}
    <span className="plate-slot-index">{slot + 1}</span>
  </div>;
}

export function SceneActor({ pokemon, side, slot, event, commanding, onTarget, targetPreview }: { pokemon: Combatant; side: Side; slot: number; event: BattleEvent | null; commanding?: boolean; onTarget?: () => void; targetPreview?:'single'|'spread' }) {
  // The engine has already recorded fainting; keep the sprite visible until its exit animation plays.
  const fainting = event?.kind === 'faint' && event.targetUid === pokemon.uid;
  const performing = event?.kind === 'move' && event.actorUid === pokemon.uid;
  const formId=pokemon.battleFormId??pokemon.transformation?.formId;
  const dimensions=speciesVisualProfile(pokemon.appearanceSpeciesId??pokemon.set.speciesId,formId);
  return <div data-uid={pokemon.uid} data-species={pokemon.set.speciesId} data-height-m={dimensions.height} data-weight-kg={dimensions.weight} data-visual-scale={dimensions.scale} data-target-preview={targetPreview} style={{'--species-scale':dimensions.scale,'--shadow-scale':dimensions.shadowScale} as CSSProperties} data-slot={slot} data-transformation={pokemon.transformation?.kind} className={`scene-actor actor-${side} actor-slot-${slot} ${pokemon.fainted && !fainting ? 'actor-fainted' : ''} ${commanding ? 'actor-commanding' : ''} ${performing ? 'actor-performing' : ''} ${onTarget ? 'actor-targetable' : ''} form-${pokemon.transformation?.kind ?? 'base'} ${pokemon.transformation?.formId==='necrozmaultra'?'form-ultra':''} ${pokemon.transformation?.kind === 'dynamax' && pokemon.transformation.formId ? 'form-gmax' : ''} tera-${pokemon.types[0]}`}>
    <div className="actor-shadow" />
    <PokemonArtwork speciesId={pokemon.appearanceSpeciesId??pokemon.set.speciesId} formId={formId} displayName={pokemon.speciesName} facing={side === 'player' ? 'back' : 'front'} size="large" />
    <ActorConditions pokemon={pokemon} event={event}/>
    {targetPreview&&!pokemon.fainted&&<span className={`actor-lock-on lock-on-${targetPreview}`} aria-label={targetPreview==='spread'?'범위 공격 대상':'단일 공격 대상'}><i/><i/><i/><i/><b>{targetPreview==='spread'?'범위':'대상'}</b></span>}
    {pokemon.transformation?.kind === 'tera' && <span className={`tera-crown type-${pokemon.transformation.teraType}`} aria-label={`${typeNames[pokemon.transformation.teraType??pokemon.types[0]]} 테라 크라운`}><i className="tera-crown-spire"/><i className="tera-crown-core"/><b>{typeNames[pokemon.transformation.teraType??pokemon.types[0]]}</b></span>}
    {formId && !hasFormSprite(formId) && <small className="form-art-note">전용 폼 이미지 없음 · 원본 + 오라</small>}
    {pokemon.transformation?.kind === 'dynamax' && <span className="max-form-label">{pokemon.transformation.formId ? 'GIGANTAMAX' : 'DYNAMAX'}</span>}
    {pokemon.protected && !pokemon.fainted && <span className="protected-dome" aria-label="방어 중" />}
    {onTarget && <button className="actor-target-button" aria-label={`${pokemon.speciesName}에게 기술 사용`} onClick={onTarget}><span>선택</span></button>}
  </div>;
}
