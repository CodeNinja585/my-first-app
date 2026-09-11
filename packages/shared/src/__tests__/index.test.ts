import { describe, it, expect } from 'vitest';
import { isValidDayKey } from '../index';

describe('isValidDayKey', () => {
  describe('valid dates', () => {
    it('returns true for a valid date in 2024 (leap year)', () => {
      expect(isValidDayKey('2024-02-29')).toBe(true);
    });

    it('returns true for a valid date in 2023 (non-leap year)', () => {
      expect(isValidDayKey('2023-06-15')).toBe(true);
    });

    it('returns true for the earliest valid date', () => {
      expect(isValidDayKey('0001-01-01')).toBe(true);
    });

    it('returns true for a date with 31 days', () => {
      expect(isValidDayKey('2023-07-31')).toBe(true);
    });

    it('returns true for December 31', () => {
      expect(isValidDayKey('2023-12-31')).toBe(true);
    });
  });

  describe('invalid dates', () => {
    it('returns false for February 30 in a non-leap year', () => {
      expect(isValidDayKey('2023-02-30')).toBe(false);
    });

    it('returns false for February 30 in a leap year', () => {
      expect(isValidDayKey('2024-02-30')).toBe(false);
    });

    it('returns false for April 31', () => {
      expect(isValidDayKey('2023-04-31')).toBe(false);
    });

    it('returns false for invalid month (0)', () => {
      expect(isValidDayKey('2023-00-15')).toBe(false);
    });

    it('returns false for invalid month (13)', () => {
      expect(isValidDayKey('2023-13-15')).toBe(false);
    });

    it('returns false for invalid day (0)', () => {
      expect(isValidDayKey('2023-06-00')).toBe(false);
    });

    it('returns false for invalid day (32)', () => {
      expect(isValidDayKey('2023-06-32')).toBe(false);
    });
  });

  describe('wrong format', () => {
    it('returns false for date with single-digit month', () => {
      expect(isValidDayKey('2023-1-15')).toBe(false);
    });

    it('returns false for date with single-digit day', () => {
      expect(isValidDayKey('2023-01-5')).toBe(false);
    });

    it('returns false for date with extra hyphens', () => {
      expect(isValidDayKey('2023-01-15-')).toBe(false);
    });

    it('returns false for date with letters', () => {
      expect(isValidDayKey('2023-a1-15')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidDayKey('')).toBe(false);
    });

    it('returns false for only date part without year', () => {
      expect(isValidDayKey('01-15')).toBe(false);
    });
  });
});
