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
    },
  },
});
