import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(),{name:'arena-service-health',configureServer(server){server.middlewares.use('/__arena_health',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'ARENA web',projectFingerprint:createHash('sha256').update(resolve(process.cwd()).toLowerCase()).digest('hex').slice(0,16)}));});}}],
  build:{rolldownOptions:{output:{codeSplitting:{groups:[
    {name:'vendor',test:/node_modules/},
    {name:'battle-data',test:/src[\\/]data[\\/]/},
    {name:'sprite-metrics',test:/sprite-metrics\.generated\.json/},
  ]}}}},
  server: {
    proxy: {
      '/friend': { target: `ws://127.0.0.1:${process.env.FRIEND_PORT ?? '8787'}`, ws: true },
    },
  },
  test: {
    environment: 'node',
    pool: 'threads',
    fileParallelism: false,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/outputs/**', '**/work/**'],
  },
});
