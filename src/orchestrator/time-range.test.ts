import { describe, it, expect, vi, afterEach } from 'vitest';
import { dailyTimeRange, weeklyTimeRange, sprintTimeRange } from './time-range.js';

describe('time-range', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('dailyTimeRange', () => {
    it('returns a 24-hour window ending at now', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-07T12:00:00Z'));

      const range = dailyTimeRange();

      expect(range.from).toBe('2026-02-06T12:00:00.000Z');
      expect(range.to).toBe('2026-02-07T12:00:00.000Z');
    });
  });

  describe('weeklyTimeRange', () => {
    it('returns a 7-day window ending at now (default weeksAgo=0)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-07T12:00:00Z'));

      const range = weeklyTimeRange();

      expect(range.from).toBe('2026-01-31T12:00:00.000Z');
      expect(range.to).toBe('2026-02-07T12:00:00.000Z');
    });

    it('offsets by weeksAgo', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-07T12:00:00Z'));

      const range = weeklyTimeRange(1);

      // weeksAgo=1: window ends 7 days ago, starts 14 days ago
      expect(range.from).toBe('2026-01-24T12:00:00.000Z');
      expect(range.to).toBe('2026-01-31T12:00:00.000Z');
    });

    it('handles weeksAgo=2', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-07T12:00:00Z'));

      const range = weeklyTimeRange(2);

      expect(range.from).toBe('2026-01-17T12:00:00.000Z');
      expect(range.to).toBe('2026-01-24T12:00:00.000Z');
    });
  });

  describe('sprintTimeRange', () => {
    it('returns sprint start to end dates', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-20T12:00:00Z'));

      const range = sprintTimeRange('2026-01-27T00:00:00Z', '2026-02-07T00:00:00Z');

      expect(range.from).toBe('2026-01-27T00:00:00.000Z');
      expect(range.to).toBe('2026-02-07T00:00:00.000Z');
    });

    it('caps end date at now if sprint is in progress', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));

      const range = sprintTimeRange('2026-01-27T00:00:00Z', '2026-02-07T00:00:00Z');

      expect(range.from).toBe('2026-01-27T00:00:00.000Z');
      expect(range.to).toBe('2026-02-03T12:00:00.000Z');
    });
  });
});
