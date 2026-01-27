import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ['./test/integration/global-setup.ts'],
    // Run test files sequentially to avoid DB conflicts
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  plugins: [swc.vite()],
});
