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
type Splash = { x: number; y: number; age: number; size: number; seed: number };

interface Props {
  weather?: string;
  reducedMotion: boolean;
}

const PARTICLE_COUNTS: Record<Weather, [number, number]> = {
  rain: [400, 150],
  sand: [380, 160],
  snow: [180, 65],
  sun: [18, 8],
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
    let width = 1, height = 1, groundTop = .42, groundBottom = .8, dpr = 1, frame = 0, last = 0, elapsed = 0;
    let animate = !reducedMotion && !prefersReduced.matches;

    // Cache a soft, irregular cloud once. Moving overlapping clouds gives fog
    // volume without allocating gradients for every particle on every frame.
    const mist = document.createElement('canvas');
    mist.width = mist.height = 192;
    const mistContext = mist.getContext('2d');
    if (mistContext) {
      const color = kind === 'sand' ? '194,150,85' : kind === 'snow' ? '215,240,250' : '157,188,207';
      const gradient = mistContext.createRadialGradient(96,96,4,96,96,96);
      gradient.addColorStop(0,`rgba(${color},.6)`);
      gradient.addColorStop(.4,`rgba(${color},.3)`);
      gradient.addColorStop(1,`rgba(${color},0)`);
      mistContext.fillStyle = gradient;
      mistContext.fillRect(0,0,192,192);
    }
    const puddles = Array.from({length:16},(_,i)=>({
      x: .04 + ((i * .618034) % .92), y: (i * .381966) % 1,
      size: .025 + (i % 5) * .008, phase: i * 1.73,
    }));

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
        ground: height * (groundTop + Math.random() * (groundBottom-groundTop)),
      };
      if (kind === 'rain') {
        particle.vx = -100 - depth * 150;
        particle.vy = 620 + depth * 720;
        particle.phase = 12 + depth * 28;
      } else if (kind === 'snow') {
        particle.vx = -24 - depth * 55;
        particle.vy = 22 + depth * 55;
        particle.phase = Math.random() * Math.PI * 2;
      } else if (kind === 'sand') {
        particle.vx = -260 - depth * 490;
        particle.vy = 12 + Math.random() * 40;
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
      const scene = canvases[0].closest('.battle-scene');
      const far = scene?.querySelector('.platform-foe')?.getBoundingClientRect();
      const near = scene?.querySelector('.platform-player')?.getBoundingClientRect();
      groundTop = far ? Math.max(.3,(far.top + far.height/2 - rect.top)/height) : .42;
      groundBottom = near ? Math.min(.9,(near.bottom - rect.top)/height + .12) : .8;
      groundBottom = Math.max(groundTop+.12,groundBottom);
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvases.forEach((canvas, index) => {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctxs[index].setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      particles.forEach((layer, index) => {
        const target = Math.round(PARTICLE_COUNTS[kind][index] * Math.max(.4,Math.min(1.35, Math.sqrt(width * height / (1100 * 700)))));
        while (layer.length < Math.max(8, target)) layer.push(makeParticle(index));
        if (layer.length > target) layer.length = target;
        layer.forEach(particle => { particle.x %= width; particle.y %= height; particle.ground = height * (groundTop + Math.random() * (groundBottom-groundTop)); });
      });
    };

    const draw = (time: number) => {
      const dt = last && animate ? Math.min(.04, (time - last) / 1000) : 0;
      last = time;
      elapsed += dt;
      ctxs.forEach(context => context.clearRect(0, 0, width, height));
      if (kind === 'rain') {
        for(let i=splashes.length-1;i>=0;i--)if(splashes[i].age>.65)splashes.splice(i,1);
        const context=ctxs[0];
        puddles.forEach(puddle=>{
          const x=puddle.x*width,y=height*(groundTop+puddle.y*(groundBottom-groundTop));
          const rx=width*puddle.size*(.4+puddle.y),ry=rx*(.09+puddle.y*.06);
          const growth=animate ? .35+.65*Math.min(1,elapsed/8) : 1;
          context.save();context.translate(x,y);context.scale(growth,growth);
          const water=context.createRadialGradient(0,0,0,0,0,rx);
          water.addColorStop(0,'rgba(175,210,232,.25)');water.addColorStop(.7,'rgba(113,159,187,.17)');water.addColorStop(1,'rgba(99,154,185,0)');
          context.scale(1,ry/rx);context.fillStyle=water;context.beginPath();context.arc(0,0,rx,0,Math.PI*2);context.fill();context.restore();
          context.strokeStyle='rgba(210,235,250,.22)';context.lineWidth=.7;
          context.beginPath();context.ellipse(x,y,rx*growth,ry*growth,0,Math.PI*.95,Math.PI*1.9);context.stroke();
          const ripple=((elapsed*.6+puddle.phase)%1);
          context.strokeStyle=`rgba(215,238,252,${(1-ripple)*.24})`;
          context.beginPath();context.ellipse(x,y,rx*ripple,ry*ripple,0,0,Math.PI*2);context.stroke();
        });
      }

      if(kind!=='sun') {
        for(let i=0;i<12;i++) {
          const context=ctxs[i<8?0:1];
          const speed=kind==='sand' ? .13 : kind==='snow' ? .028 : .017;
          const x=(((i*.239-elapsed*speed*(1+(i%3)*.2))%1+1)%1)*width*1.8-width*.4;
          const y=height*(.22+(i%4)*.17)+Math.sin(elapsed*.35+i)*height*.045;
          const w=width*(.55+(i%3)*.2),h=height*(kind==='sand'?.36:.24);
          context.globalAlpha=(i<8?1:.36)*(kind==='sand'?.57:kind==='snow'?.28:.2);
          context.drawImage(mist,x-w/2,y-h/2,w,h);
          context.globalAlpha=1;
        }
      }

      particles.forEach((layer, layerIndex) => {
        const context = ctxs[layerIndex];
        const foreground = layerIndex === 1;
        layer.forEach(particle => {
          const depth = particle.size;
          if (animate) {
            const gust=kind==='sand' ? 1+Math.sin(elapsed*1.5)*.3+Math.sin(elapsed*.53)*.2 : 1;
            particle.x += particle.vx * dt * gust;
            particle.y += particle.vy * dt;
            if (kind === 'snow') particle.x += Math.sin(elapsed * (1.2 + depth) + particle.phase) * 20 * dt;
            if (kind === 'sand') particle.y += Math.sin(elapsed * 3 + particle.phase) * 45 * depth * dt;
          }
          if (kind === 'rain' && particle.y >= particle.ground) {
            if (foreground || Math.random() < .2) {
              if (splashes.length < 150) splashes.push({ x: particle.x, y: particle.ground, age: 0, size: 3 + depth * 6,seed:particle.phase });
            }
            particle.x = Math.random() * width + width * .18;
            particle.y = -particle.phase;
            particle.ground = height * (groundTop + Math.random() * (groundBottom-groundTop));
          } else if (particle.y > height + 20 || particle.y < -30 || particle.x < -40 || particle.x > width + 40) {
            Object.assign(particle, makeParticle(layerIndex));
            if (kind === 'rain' || kind === 'snow') particle.y = -Math.random() * height * .3;
            else if (kind === 'sand') { particle.x = width + Math.random() * width * .2; particle.y = Math.random() * height; }
            else { particle.x = Math.random() * width; particle.y = height * (.3 + Math.random() * .65); }
          }

          if (kind === 'rain') {
            const length = particle.phase;
            context.lineWidth = .45 + depth * 1.15;
            context.strokeStyle = `rgba(205,231,255,${particle.alpha * (foreground ? .65 : .37)})`;
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(particle.x - length * .18, particle.y + length);
            context.stroke();
            if (foreground && depth > .93) {
              context.fillStyle = `rgba(231,245,255,${particle.alpha * .3})`;
              context.beginPath(); context.ellipse(particle.x, particle.y + length, 1.1, 2.6, .2, 0, Math.PI * 2); context.fill();
            }
          } else if (kind === 'snow') {
            const radius = .7 + depth * (foreground ? 2.1 : 1.35);
            context.fillStyle = `rgba(245,252,255,${particle.alpha * (foreground ? .95 : .8)})`;
            context.beginPath(); context.arc(particle.x, particle.y, radius, 0, Math.PI * 2); context.fill();
            if (foreground && radius > 2.2) {
              context.globalAlpha = particle.alpha * .42; context.lineWidth = .55; context.strokeStyle = '#eaf8ff';
              context.beginPath(); context.moveTo(particle.x - radius * 1.5, particle.y); context.lineTo(particle.x + radius * 1.5, particle.y); context.moveTo(particle.x, particle.y - radius * 1.5); context.lineTo(particle.x, particle.y + radius * 1.5); context.stroke();
            }
            context.shadowBlur = 0; context.globalAlpha = 1;
          } else if (kind === 'sand') {
            const streak = particle.phase > 4.7;
            const length = streak ? 4 + depth * (foreground ? 22 : 12) : 1 + depth * 2;
            context.lineWidth = .45 + depth * .65;
            context.strokeStyle = `rgba(${depth>.65?'234,205,150':'128,91,49'},${particle.alpha * (foreground ? .8 : .65)})`;
            context.beginPath(); context.moveTo(particle.x, particle.y); context.lineTo(particle.x - length, particle.y + length * .16); context.stroke();
            if(foreground&&!streak&&depth>.85){
              context.fillStyle=`rgba(245,217,161,${particle.alpha*.7})`;
              context.beginPath();context.moveTo(particle.x-1.4,particle.y);context.lineTo(particle.x+.7,particle.y-1.1);context.lineTo(particle.x+1.8,particle.y+1.2);context.lineTo(particle.x-.6,particle.y+1.5);context.fill();
            }
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
        const context = ctxs[1];
        splashes.forEach(splash => {
          if (animate) splash.age += dt;
          const progress = Math.min(1, splash.age / .65);
          context.globalAlpha = (1 - progress) * .32;
          context.strokeStyle = '#d9f0ff'; context.lineWidth = .8;
          context.beginPath(); context.ellipse(splash.x, splash.y, splash.size * (.4 + progress*2), splash.size * (.12 + progress * .4), 0, 0, Math.PI * 2); context.stroke();
          if(progress<.55)for(let j=0;j<3;j++){
            const side=j-1;
            const x=splash.x+side*splash.size*progress*1.8;
            const y=splash.y-Math.sin(progress/.55*Math.PI)*splash.size*(.6+(splash.seed%3)*.2);
            context.fillStyle='#dfedfa';context.beginPath();context.ellipse(x,y,.65,1.2,side*.4,0,Math.PI*2);context.fill();
          }
          context.globalAlpha = 1;
        });
      }
      if (animate) frame = requestAnimationFrame(draw);
    };

    const start = () => { if (frame) cancelAnimationFrame(frame); last=0;frame = requestAnimationFrame(draw); };
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
    if (animate) start(); else draw(performance.now());
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
    <div className={`weather-lighting weather-lighting-${weather}${reducedMotion?' weather-still':''}`} aria-hidden="true"><i className="weather-glare"/><i className="weather-rays"/><i className="weather-ground-haze"/></div>
    <canvas ref={backRef} className={`weather-particles weather-depth-back weather-${weather}`} aria-hidden="true" />
    <canvas ref={frontRef} className={`weather-particles weather-depth-front weather-${weather}`} aria-hidden="true" />
  </>;
}
