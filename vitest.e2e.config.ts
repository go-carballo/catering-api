import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 60000, // E2E tests need more time
    hookTimeout: 60000,
    globalSetup: ['./test/e2e-global-setup.ts'],
    // E2E tests require a full app instance
    // Run sequentially to avoid port conflicts
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  plugins: [swc.vite()],
});
