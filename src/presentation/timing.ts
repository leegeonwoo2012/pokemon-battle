/** Shared by the sprite reaction and HP HUD, at normal playback speed. */
export const battleTiming = {
  announce: 260,
  prepare: 340,
  impact: 420,
  hpDelay: 420,
  hpDuration: 720,
  recall: 650,
  sendOut: 950,
  faint: 750,
} as const;

export function animationPause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
    const timer = setTimeout(finish,ms);
    signal.addEventListener('abort',finish,{once:true});
  });
}
