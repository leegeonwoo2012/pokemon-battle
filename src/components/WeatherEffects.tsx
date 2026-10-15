import { useEffect, useRef } from 'react';

type Weather = 'rain' | 'sand' | 'snow' | 'sun';
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  ground: number;
};
type Splash = { x: number; y: number; age: number; size: number };

interface Props {
  weather?: string;
  reducedMotion: boolean;
}

const PARTICLE_COUNTS: Record<Weather, [number, number]> = {
  rain: [112, 42],
  sand: [120, 38],
  snow: [82, 30],
  sun: [22, 10],
};

/** Layered atmospheric particles add depth while leaving battle state and sprites untouched. */
export function WeatherEffects({ weather, reducedMotion }: Props) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!weather || !(['rain', 'sand', 'snow', 'sun'] as string[]).includes(weather)) return;
    const kind = weather as Weather;
    const canvases = [backRef.current, frontRef.current].filter((canvas): canvas is HTMLCanvasElement => !!canvas);
    const contexts = canvases.map(canvas => canvas.getContext('2d', { alpha: true }));
    if (contexts.some(context => !context)) return;
    const ctxs = contexts as CanvasRenderingContext2D[];
    const particles: Particle[][] = [[], []];
    const splashes: Splash[] = [];
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1, height = 1, dpr = 1, frame = 0, last = 0, elapsed = 0;
    let animate = !reducedMotion && !prefersReduced.matches;

    const makeParticle = (layer: number): Particle => {
      const depth = layer === 0 ? .35 + Math.random() * .45 : .78 + Math.random() * .22;
      const particle: Particle = {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0,
        vy: 0,
        size: depth,
        alpha: .25 + Math.random() * .55,
        phase: Math.random() * Math.PI * 2,
        ground: height * (.65 + Math.random() * .28),
      };
      if (kind === 'rain') {
        particle.vx = 85 + depth * 135;
        particle.vy = 430 + depth * 510;
        particle.phase = 10 + depth * 20;
      } else if (kind === 'snow') {
        particle.vx = -12 - depth * 36;
        particle.vy = 18 + depth * 54;
        particle.phase = Math.random() * Math.PI * 2;
      } else if (kind === 'sand') {
        particle.vx = -45 - depth * 155;
        particle.vy = 5 + Math.random() * 36;
        particle.phase = Math.random() * Math.PI * 2;
      } else {
        particle.vx = -4 + Math.random() * 8;
        particle.vy = -3 - depth * 12;
        particle.phase = Math.random() * Math.PI * 2;
      }
      return particle;
    };

    const resize = () => {
      const rect = canvases[0].parentElement?.getBoundingClientRect();
      if (!rect) return;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvases.forEach((canvas, index) => {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctxs[index].setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      particles.forEach((layer, index) => {
        const target = Math.round(PARTICLE_COUNTS[kind][index] * Math.min(1, width * height / (1100 * 700)));
        while (layer.length < Math.max(8, target)) layer.push(makeParticle(index));
        if (layer.length > target) layer.length = target;
        layer.forEach(particle => { particle.x %= width; particle.y %= height; particle.ground = height * (.65 + Math.random() * .28); });
      });
    };

    const draw = (time: number) => {
      const dt = last ? Math.min(.04, (time - last) / 1000) : 0;
      last = time;
      elapsed += dt;
      ctxs.forEach(context => context.clearRect(0, 0, width, height));
      if (kind === 'rain') splashes.splice(0, splashes.length, ...splashes.filter(splash => splash.age < .42));

      particles.forEach((layer, layerIndex) => {
        const context = ctxs[layerIndex];
        const foreground = layerIndex === 1;
        layer.forEach(particle => {
          const depth = particle.size;
          if (animate) {
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            if (kind === 'snow') particle.x += Math.sin(elapsed * (1.2 + depth) + particle.phase) * 20 * dt;
            if (kind === 'sand') particle.y += Math.sin(elapsed * 2 + particle.phase) * 10 * dt;
          }
          if (kind === 'rain' && particle.y >= particle.ground) {
            if (foreground || Math.random() < .2) {
              if (splashes.length < 26) splashes.push({ x: particle.x, y: particle.ground, age: 0, size: 2 + depth * 4 });
            }
            particle.x = Math.random() * width - width * .18;
            particle.y = -particle.phase;
            particle.ground = height * (.64 + Math.random() * .3);
          } else if (particle.y > height + 20 || particle.y < -30 || particle.x < -40 || particle.x > width + 40) {
            Object.assign(particle, makeParticle(layerIndex));
            if (kind === 'rain' || kind === 'snow') particle.y = -Math.random() * height * .3;
            else if (kind === 'sand') { particle.x = width + Math.random() * width * .2; particle.y = Math.random() * height; }
            else { particle.x = Math.random() * width; particle.y = height * (.3 + Math.random() * .65); }
          }

          if (kind === 'rain') {
            const length = particle.phase;
            context.lineWidth = .45 + depth * 1.15;
            context.strokeStyle = `rgba(205,231,255,${particle.alpha * (foreground ? .44 : .26)})`;
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(particle.x + length * .23, particle.y + length);
            context.stroke();
            if (foreground && depth > .93) {
              context.fillStyle = `rgba(231,245,255,${particle.alpha * .3})`;
              context.beginPath(); context.ellipse(particle.x, particle.y + length, 1.1, 2.6, .2, 0, Math.PI * 2); context.fill();
            }
          } else if (kind === 'snow') {
            const radius = .7 + depth * (foreground ? 2.1 : 1.35);
            context.fillStyle = `rgba(${foreground ? '235,248,255' : '199,225,245'},${particle.alpha * (foreground ? .72 : .48)})`;
            context.shadowColor = '#d9f2ff'; context.shadowBlur = foreground ? radius * 3 : radius;
            context.beginPath(); context.arc(particle.x, particle.y, radius, 0, Math.PI * 2); context.fill();
            if (foreground && radius > 2.2) {
              context.globalAlpha = particle.alpha * .42; context.lineWidth = .55; context.strokeStyle = '#eaf8ff';
              context.beginPath(); context.moveTo(particle.x - radius * 1.5, particle.y); context.lineTo(particle.x + radius * 1.5, particle.y); context.moveTo(particle.x, particle.y - radius * 1.5); context.lineTo(particle.x, particle.y + radius * 1.5); context.stroke();
            }
            context.shadowBlur = 0; context.globalAlpha = 1;
          } else if (kind === 'sand') {
            const length = 2 + depth * (foreground ? 15 : 10);
            context.lineWidth = .45 + depth * .65;
            context.strokeStyle = `rgba(238,211,151,${particle.alpha * (foreground ? .38 : .22)})`;
            context.beginPath(); context.moveTo(particle.x, particle.y); context.lineTo(particle.x - length, particle.y + length * .16); context.stroke();
            if (depth > .92 && particle.y > height * .48) {
              context.fillStyle = `rgba(227,196,135,${particle.alpha * .12})`;
              context.beginPath(); context.ellipse(particle.x, particle.y, 12 * depth, 3 * depth, -.08, 0, Math.PI * 2); context.fill();
            }
          } else {
            const radius = .6 + depth * (foreground ? 1.6 : 1.1);
            context.fillStyle = `rgba(255,224,158,${particle.alpha * (foreground ? .44 : .3)})`;
            context.shadowColor = '#ffd984'; context.shadowBlur = radius * 3;
            context.beginPath(); context.arc(particle.x, particle.y, radius, 0, Math.PI * 2); context.fill();
            context.shadowBlur = 0;
          }
        });
      });

      if (kind === 'rain') {
        const context = ctxs[0];
        splashes.forEach(splash => {
          if (animate) splash.age += dt;
          const progress = Math.min(1, splash.age / .42);
          context.globalAlpha = (1 - progress) * .5;
          context.strokeStyle = '#d9f0ff'; context.lineWidth = .8;
          context.beginPath(); context.ellipse(splash.x, splash.y, splash.size * (.5 + progress), splash.size * (.18 + progress * .25), 0, Math.PI, Math.PI * 2); context.stroke();
          context.globalAlpha = 1;
        });
      }
      if (animate) frame = requestAnimationFrame(draw);
    };

    const start = () => { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const onMotionPreference = (event: MediaQueryListEvent) => {
      animate = !reducedMotion && !event.matches;
      if (animate) start(); else { if (frame) cancelAnimationFrame(frame); frame = 0; draw(performance.now()); }
    };
    const onVisibility = () => { if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; } else if (animate) start(); };
    const onResize = () => { resize(); if (!animate) draw(performance.now()); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    observer?.observe(canvases[0].parentElement!);
    window.addEventListener('resize', onResize);
    resize();
    draw(performance.now());
    if (animate) start();
    prefersReduced.addEventListener('change', onMotionPreference);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
      prefersReduced.removeEventListener('change', onMotionPreference);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [weather, reducedMotion]);

  if (!weather || !(['rain', 'sand', 'snow', 'sun'] as string[]).includes(weather)) return null;
  return <>
    <canvas ref={backRef} className={`weather-particles weather-depth-back weather-${weather}`} aria-hidden="true" />
    <canvas ref={frontRef} className={`weather-particles weather-depth-front weather-${weather}`} aria-hidden="true" />
  </>;
}
