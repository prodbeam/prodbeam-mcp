import { describe, it, expect } from 'vitest';
import { assessTeamHealth } from './team-health.js';
import type { Snapshot, MemberSnapshot } from '../history/types.js';
import { resolveThresholds } from '../config/thresholds.js';

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    teamName: 'Test',
    snapshotType: 'weekly',
    periodStart: '2026-01-31T00:00:00Z',
    periodEnd: '2026-02-07T00:00:00Z',
    totalCommits: 40,
    totalPRs: 10,
    prsMerged: 8,
    prsOpen: 2,
    totalAdditions: 1000,
    totalDeletions: 400,
    totalReviews: 12,
    avgMergeTimeH: 4.0,
    jiraTotal: 20,
    jiraCompleted: 16,
    jiraCompletionPct: 80,
    ...overrides,
  };
}

function makeMemberSnapshot(overrides: Partial<MemberSnapshot> = {}): MemberSnapshot {
  return {
    memberGithub: 'alice',
    commits: 20,
    prs: 5,
    prsMerged: 4,
    reviewsGiven: 6,
    additions: 500,
    deletions: 200,
    jiraCompleted: 8,
    ...overrides,
  };
}

describe('team-health', () => {
  describe('assessTeamHealth', () => {
    it('returns overall score between 0 and 100', () => {
      const report = assessTeamHealth({
        current: makeSnapshot(),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('returns all four dimension scores', () => {
      const report = assessTeamHealth({
        current: makeSnapshot(),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.velocity).toBeDefined();
      expect(report.dimensions.throughput).toBeDefined();
      expect(report.dimensions.reviewCoverage).toBeDefined();
      expect(report.dimensions.issueFlow).toBeDefined();

      for (const dim of Object.values(report.dimensions)) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
        expect(['up', 'down', 'stable']).toContain(dim.trend);
      }
    });

    it('returns recommendations array', () => {
      const report = assessTeamHealth({
        current: makeSnapshot(),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('scores high for healthy team metrics', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({
          totalCommits: 50,
          totalPRs: 12,
          prsMerged: 10,
          prsOpen: 2,
          avgMergeTimeH: 3.0,
          jiraCompletionPct: 90,
        }),
        history: [makeSnapshot({ totalCommits: 45, prsMerged: 9, jiraCompletionPct: 85 })],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 5 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 4 }),
          makeMemberSnapshot({ memberGithub: 'charlie', reviewsGiven: 3 }),
        ],
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(60);
    });

    it('scores lower for poor metrics', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({
          totalCommits: 5,
          totalPRs: 3,
          prsMerged: 1,
          prsOpen: 2,
          avgMergeTimeH: 48.0,
          jiraCompletionPct: 20,
        }),
        history: [makeSnapshot({ totalCommits: 40, prsMerged: 8, jiraCompletionPct: 80 })],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 10 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 0 }),
        ],
      });

      expect(report.overallScore).toBeLessThan(60);
    });
  });

  describe('velocity', () => {
    it('detects upward trend when commits exceed history', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalCommits: 60 }),
        history: [makeSnapshot({ totalCommits: 40 }), makeSnapshot({ totalCommits: 35 })],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.velocity.trend).toBe('up');
    });

    it('detects downward trend when commits drop', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalCommits: 15 }),
        history: [makeSnapshot({ totalCommits: 40 }), makeSnapshot({ totalCommits: 45 })],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.velocity.trend).toBe('down');
      expect(report.dimensions.velocity.score).toBeLessThan(60);
    });

    it('handles no history gracefully', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalCommits: 30 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.velocity.trend).toBe('stable');
      expect(report.dimensions.velocity.score).toBeGreaterThan(0);
    });
  });

  describe('throughput', () => {
    it('scores high with good merge rate', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalPRs: 10, prsMerged: 9, avgMergeTimeH: 2.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.throughput.score).toBeGreaterThanOrEqual(70);
    });

    it('scores low with poor merge rate', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalPRs: 10, prsMerged: 2, avgMergeTimeH: 48.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.throughput.score).toBeLessThan(40);
    });

    it('scores low when no PRs exist', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalPRs: 0, prsMerged: 0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.throughput.score).toBeLessThanOrEqual(30);
    });
  });

  describe('review coverage', () => {
    it('scores high with balanced reviews', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalReviews: 9 }),
        history: [],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 3 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 3 }),
          makeMemberSnapshot({ memberGithub: 'charlie', reviewsGiven: 3 }),
        ],
      });

      expect(report.dimensions.reviewCoverage.score).toBeGreaterThanOrEqual(80);
    });

    it('scores low with imbalanced reviews', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalReviews: 10 }),
        history: [],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 9 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 1 }),
          makeMemberSnapshot({ memberGithub: 'charlie', reviewsGiven: 0 }),
        ],
      });

      expect(report.dimensions.reviewCoverage.score).toBeLessThan(60);
    });

    it('handles single member team', () => {
      const report = assessTeamHealth({
        current: makeSnapshot(),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.reviewCoverage.score).toBe(70);
    });
  });

  describe('issue flow', () => {
    it('scores based on Jira completion percentage', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ jiraCompletionPct: 90 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.issueFlow.score).toBeGreaterThanOrEqual(90);
    });

    it('returns neutral score when no Jira data', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ jiraTotal: 0, jiraCompletionPct: 0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.issueFlow.score).toBe(60);
    });

    it('detects downward trend in completion', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ jiraCompletionPct: 50 }),
        history: [makeSnapshot({ jiraCompletionPct: 80 }), makeSnapshot({ jiraCompletionPct: 75 })],
        memberSnapshots: [makeMemberSnapshot()],
      });

      expect(report.dimensions.issueFlow.trend).toBe('down');
    });
  });

  describe('recommendations', () => {
    it('recommends reducing merge time when high', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ avgMergeTimeH: 36.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      const mergeRec = report.recommendations.find((r) => r.includes('merge time'));
      expect(mergeRec).toBeDefined();
      expect(mergeRec).toContain('36h');
    });

    it('recommends reviewing PR backlog when many open', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ prsOpen: 8, prsMerged: 3 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      const backlogRec = report.recommendations.find((r) => r.includes('open'));
      expect(backlogRec).toBeDefined();
    });

    it('recommends rotating reviews when imbalanced', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ totalReviews: 10 }),
        history: [],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 10 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 0 }),
          makeMemberSnapshot({ memberGithub: 'charlie', reviewsGiven: 0 }),
        ],
      });

      const reviewRec = report.recommendations.find((r) => r.includes('review'));
      expect(reviewRec).toBeDefined();
    });

    it('returns empty recommendations for healthy team', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({
          totalCommits: 50,
          totalPRs: 10,
          prsMerged: 9,
          prsOpen: 1,
          avgMergeTimeH: 3.0,
          jiraCompletionPct: 95,
        }),
        history: [makeSnapshot({ totalCommits: 48, prsMerged: 8, jiraCompletionPct: 90 })],
        memberSnapshots: [
          makeMemberSnapshot({ memberGithub: 'alice', reviewsGiven: 4 }),
          makeMemberSnapshot({ memberGithub: 'bob', reviewsGiven: 3 }),
          makeMemberSnapshot({ memberGithub: 'charlie', reviewsGiven: 3 }),
        ],
      });

      // A healthy team should have few or no recommendations
      expect(report.recommendations.length).toBeLessThanOrEqual(1);
    });
  });

  describe('custom thresholds', () => {
    it('uses custom merge time warning for throughput scoring', () => {
      // With default 24h warning: 12h merge time should not trigger penalty
      const defaultReport = assessTeamHealth({
        current: makeSnapshot({ totalPRs: 10, prsMerged: 8, avgMergeTimeH: 12.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
      });

      // With 8h warning threshold: 12h should trigger penalty
      const strictReport = assessTeamHealth({
        current: makeSnapshot({ totalPRs: 10, prsMerged: 8, avgMergeTimeH: 12.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
        thresholds: resolveThresholds({ mergeTimeWarningH: 8 }),
      });

      expect(strictReport.dimensions.throughput.score).toBeLessThan(
        defaultReport.dimensions.throughput.score
      );
    });

    it('uses custom merge time threshold in recommendations', () => {
      const report = assessTeamHealth({
        current: makeSnapshot({ avgMergeTimeH: 10.0 }),
        history: [],
        memberSnapshots: [makeMemberSnapshot()],
        thresholds: resolveThresholds({ mergeTimeWarningH: 8 }),
      });

      const mergeRec = report.recommendations.find((r) => r.includes('merge time'));
      expect(mergeRec).toBeDefined();
      expect(mergeRec).toContain('under 8h');
    });
  });
});
