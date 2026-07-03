import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests target the pure lib/store modules (no DOM needed) — node env.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
