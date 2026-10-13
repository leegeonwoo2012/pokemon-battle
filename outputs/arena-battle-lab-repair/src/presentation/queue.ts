import type { BattleEvent } from '../engine/types';

export interface PlaybackHooks {
  present: (event: BattleEvent) => void;
  animate: (event: BattleEvent, signal: AbortSignal) => Promise<void>;
  recover?: (error: unknown, event: BattleEvent) => void;
}

/** Each frame is an actual engine snapshot. Only animation completion advances the queue. */
export async function playEvents(events: readonly BattleEvent[], hooks: PlaybackHooks, signal: AbortSignal): Promise<void> {
  for (const event of events) {
    if (signal.aborted) return;
    hooks.present(event);
    try { await hooks.animate(event, signal); }
    catch (error) { if (!signal.aborted) hooks.recover?.(error, event); }
  }
}
