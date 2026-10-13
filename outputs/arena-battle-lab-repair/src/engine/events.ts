import type { BattleEvent, BattleState } from './types';

export type EventDetails = Partial<Omit<BattleEvent, 'id' | 'text' | 'snapshot'>>;
interface Recorder { events: BattleEvent[]; context: EventDetails }
const recorders = new WeakMap<BattleState, Recorder>();

export function startRecording(state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  recorders.set(state, { events, context: {} });
  return events;
}

export function stopRecording(state: BattleState): void { recorders.delete(state); }

export function recordEvent(state: BattleState, text: string, details: EventDetails = {}): void {
  const recorder = recorders.get(state);
  if (!recorder) return;
  recorder.events.push({ ...recorder.context, ...details, id: recorder.events.length,
    kind: details.kind ?? 'message', text, snapshot: structuredClone(state) });
}

/** Context is synchronous, scoped, and never leaks to later attacks or residual effects. */
export function withEventContext<T>(state: BattleState, details: EventDetails, operation: () => T): T {
  const recorder = recorders.get(state);
  if (!recorder) return operation();
  const previous = recorder.context;
  recorder.context = { ...previous, ...details };
  try { return operation(); } finally { recorder.context = previous; }
}
