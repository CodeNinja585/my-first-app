import { describe, it, expect } from 'vitest';

describe('CI red probe', () => {
  it('fails on purpose to verify branch protection blocks merges', () => {
    expect(1).toBe(2);
  });
});
