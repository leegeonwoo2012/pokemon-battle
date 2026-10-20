import type { BattleEvent } from '../engine/types';

export interface PlaybackHooks {
  present: (event: BattleEvent) => void;
  animate: (event: BattleEvent, signal: AbortSignal) => Promise<void>;
  recover?: (error: unknown, event: BattleEvent) => void;
  minDurationMs?: (event: BattleEvent) => number;
}

export function readableFrameDuration(event: BattleEvent): number {
  switch (event.kind) {
    case 'move': return 2000;
    case 'focus-prepare': return 1450;
    case 'damage': case 'heal': return 1400;
    case 'gimmick-transform': return 2100;
    case 'gimmick-start': return 1000;
    case 'switch-out': return 1050;
    case 'switch-in': return 1500;
    case 'faint': case 'result': return 1400;
    case 'ability': return event.sourceId === 'intimidate' ? 1250 : 820;
    case 'effectiveness': case 'critical': case 'miss': return 1050;
    case 'turn-end': return 380;
    default: return 820;
  }
}

/** Reduced motion removes motion, not the time needed to understand the result. */
export function playbackDuration(event: BattleEvent, reducedMotion: boolean, rate: number): number {
  return (reducedMotion ? Math.min(700, readableFrameDuration(event)) : readableFrameDuration(event)) / rate;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/** Each frame is an actual engine snapshot. Only animation completion advances the queue. */
export async function playEvents(events: readonly BattleEvent[], hooks: PlaybackHooks, signal: AbortSignal): Promise<void> {
  for (const event of events) {
    if (signal.aborted) return;
    hooks.present(event);
    try {
      const started = performance.now();
      await hooks.animate(event, signal);
      await pause((hooks.minDurationMs ?? readableFrameDuration)(event) - (performance.now() - started), signal);
    }
    catch (error) { if (!signal.aborted) hooks.recover?.(error, event); }
  }
}
