import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    workers: 1,
    globals: true,
    passWithNoTests: true,
    reporters: ['verbose'],
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/dist/**', '**/node_modules/**', '**/test/**', '**/*.config.*'],
      thresholds: {
        'apps/api': {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },
        'apps/mobile/src/sync': {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        'packages/shared': {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
