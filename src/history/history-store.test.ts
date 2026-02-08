import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from './history-store.js';
import type { Snapshot, MemberSnapshot } from './types.js';

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    teamName: 'Test Team',
    snapshotType: 'weekly',
    periodStart: '2026-01-31T00:00:00Z',
    periodEnd: '2026-02-07T00:00:00Z',
    totalCommits: 42,
    totalPRs: 10,
    prsMerged: 7,
    prsOpen: 3,
    totalAdditions: 1200,
    totalDeletions: 400,
    totalReviews: 15,
    avgMergeTimeH: 4.5,
    jiraTotal: 20,
    jiraCompleted: 16,
    jiraCompletionPct: 80,
    ...overrides,
  };
}

describe('HistoryStore', () => {
  let store: HistoryStore;

  beforeEach(() => {
    // In-memory database for fast, isolated tests
    store = new HistoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('saveSnapshot', () => {
    it('saves a snapshot and returns its ID', () => {
      const id = store.saveSnapshot(makeSnapshot());
      expect(id).toBeGreaterThan(0);
    });

    it('saves multiple snapshots with incrementing IDs', () => {
      const id1 = store.saveSnapshot(makeSnapshot());
      const id2 = store.saveSnapshot(makeSnapshot({ periodEnd: '2026-02-14T00:00:00Z' }));
      expect(id2).toBe(id1 + 1);
    });

    it('saves sprint snapshot with sprint name', () => {
      const id = store.saveSnapshot(
        makeSnapshot({ snapshotType: 'sprint', sprintName: 'Sprint 12' })
      );
      const latest = store.getLatestSnapshot('sprint');
      expect(latest).not.toBeNull();
      expect(latest!.sprintName).toBe('Sprint 12');
      expect(latest!.id).toBe(id);
    });

    it('saves snapshot with null merge time', () => {
      const id = store.saveSnapshot(makeSnapshot({ avgMergeTimeH: null }));
      const latest = store.getLatestSnapshot('weekly');
      expect(latest!.avgMergeTimeH).toBeNull();
      expect(latest!.id).toBe(id);
    });
  });

  describe('saveMemberSnapshots', () => {
    it('saves per-member data linked to a snapshot', () => {
      const snapshotId = store.saveSnapshot(makeSnapshot());

      const members: MemberSnapshot[] = [
        {
          memberGithub: 'alice',
          commits: 20,
          prs: 5,
          prsMerged: 4,
          reviewsGiven: 8,
          additions: 600,
          deletions: 200,
          jiraCompleted: 10,
        },
        {
          memberGithub: 'bob',
          commits: 22,
          prs: 5,
          prsMerged: 3,
          reviewsGiven: 7,
          additions: 600,
          deletions: 200,
          jiraCompleted: 6,
        },
      ];

      store.saveMemberSnapshots(snapshotId, members);

      const retrieved = store.getMemberSnapshots(snapshotId);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0]!.memberGithub).toBe('alice');
      expect(retrieved[0]!.commits).toBe(20);
      expect(retrieved[1]!.memberGithub).toBe('bob');
      expect(retrieved[1]!.snapshotId).toBe(snapshotId);
    });
  });

  describe('getLatestSnapshot', () => {
    it('returns the most recent snapshot of the given type', () => {
      store.saveSnapshot(makeSnapshot({ periodEnd: '2026-01-31T00:00:00Z', totalCommits: 30 }));
      store.saveSnapshot(makeSnapshot({ periodEnd: '2026-02-07T00:00:00Z', totalCommits: 42 }));

      const latest = store.getLatestSnapshot('weekly');
      expect(latest).not.toBeNull();
      expect(latest!.totalCommits).toBe(42);
    });

    it('returns null when no snapshots exist', () => {
      const latest = store.getLatestSnapshot('weekly');
      expect(latest).toBeNull();
    });

    it('filters by snapshot type', () => {
      store.saveSnapshot(makeSnapshot({ snapshotType: 'daily' }));

      const weekly = store.getLatestSnapshot('weekly');
      const daily = store.getLatestSnapshot('daily');

      expect(weekly).toBeNull();
      expect(daily).not.toBeNull();
    });
  });

  describe('getPreviousSnapshot', () => {
    it('returns the snapshot before a given date', () => {
      store.saveSnapshot(
        makeSnapshot({
          periodStart: '2026-01-24T00:00:00Z',
          periodEnd: '2026-01-31T00:00:00Z',
          totalCommits: 30,
        })
      );
      store.saveSnapshot(
        makeSnapshot({
          periodStart: '2026-01-31T00:00:00Z',
          periodEnd: '2026-02-07T00:00:00Z',
          totalCommits: 42,
        })
      );

      const previous = store.getPreviousSnapshot('weekly', '2026-02-07T00:00:00Z');
      expect(previous).not.toBeNull();
      expect(previous!.totalCommits).toBe(30);
    });

    it('returns null when no previous snapshot exists', () => {
      store.saveSnapshot(makeSnapshot({ periodEnd: '2026-02-07T00:00:00Z' }));

      const previous = store.getPreviousSnapshot('weekly', '2026-01-01T00:00:00Z');
      expect(previous).toBeNull();
    });
  });

  describe('getSprintHistory', () => {
    it('returns sprint snapshots in descending order', () => {
      store.saveSnapshot(
        makeSnapshot({
          snapshotType: 'sprint',
          sprintName: 'Sprint 10',
          periodEnd: '2026-01-13T00:00:00Z',
        })
      );
      store.saveSnapshot(
        makeSnapshot({
          snapshotType: 'sprint',
          sprintName: 'Sprint 11',
          periodEnd: '2026-01-27T00:00:00Z',
        })
      );
      store.saveSnapshot(
        makeSnapshot({
          snapshotType: 'sprint',
          sprintName: 'Sprint 12',
          periodEnd: '2026-02-07T00:00:00Z',
        })
      );

      const history = store.getSprintHistory(2);
      expect(history).toHaveLength(2);
      expect(history[0]!.sprintName).toBe('Sprint 12');
      expect(history[1]!.sprintName).toBe('Sprint 11');
    });

    it('excludes non-sprint snapshots', () => {
      store.saveSnapshot(makeSnapshot({ snapshotType: 'weekly' }));
      store.saveSnapshot(makeSnapshot({ snapshotType: 'sprint', sprintName: 'Sprint 1' }));

      const history = store.getSprintHistory();
      expect(history).toHaveLength(1);
    });
  });

  describe('getWeeklyHistory', () => {
    it('returns weekly snapshots in descending order', () => {
      store.saveSnapshot(makeSnapshot({ periodEnd: '2026-01-31T00:00:00Z', totalCommits: 30 }));
      store.saveSnapshot(makeSnapshot({ periodEnd: '2026-02-07T00:00:00Z', totalCommits: 42 }));

      const history = store.getWeeklyHistory(10);
      expect(history).toHaveLength(2);
      expect(history[0]!.totalCommits).toBe(42);
      expect(history[1]!.totalCommits).toBe(30);
    });
  });

  describe('schema resilience', () => {
    it('handles empty database gracefully', () => {
      expect(store.getLatestSnapshot('daily')).toBeNull();
      expect(store.getSprintHistory()).toEqual([]);
      expect(store.getWeeklyHistory()).toEqual([]);
      expect(store.getMemberSnapshots(999)).toEqual([]);
    });

    it('round-trips all fields correctly', () => {
      const snapshot = makeSnapshot({
        snapshotType: 'sprint',
        sprintName: 'Sprint 12',
        totalCommits: 100,
        totalPRs: 25,
        prsMerged: 20,
        prsOpen: 5,
        totalAdditions: 5000,
        totalDeletions: 2000,
        totalReviews: 30,
        avgMergeTimeH: 6.2,
        jiraTotal: 40,
        jiraCompleted: 35,
        jiraCompletionPct: 87.5,
      });

      store.saveSnapshot(snapshot);
      const retrieved = store.getLatestSnapshot('sprint')!;

      expect(retrieved.teamName).toBe(snapshot.teamName);
      expect(retrieved.snapshotType).toBe('sprint');
      expect(retrieved.sprintName).toBe('Sprint 12');
      expect(retrieved.totalCommits).toBe(100);
      expect(retrieved.totalPRs).toBe(25);
      expect(retrieved.prsMerged).toBe(20);
      expect(retrieved.prsOpen).toBe(5);
      expect(retrieved.totalAdditions).toBe(5000);
      expect(retrieved.totalDeletions).toBe(2000);
      expect(retrieved.totalReviews).toBe(30);
      expect(retrieved.avgMergeTimeH).toBe(6.2);
      expect(retrieved.jiraTotal).toBe(40);
      expect(retrieved.jiraCompleted).toBe(35);
      expect(retrieved.jiraCompletionPct).toBe(87.5);
    });
  });
});
