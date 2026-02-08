import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomaly-detector.js';
import type { DetectAnomaliesInput } from './anomaly-detector.js';
import type { GitHubPullRequest, GitHubReview } from '../types/github.js';
import type { JiraIssue } from '../types/jira.js';
import { resolveThresholds } from '../config/thresholds.js';

const NOW = new Date('2026-02-07T12:00:00Z');

function makeInput(overrides: Partial<DetectAnomaliesInput> = {}): DetectAnomaliesInput {
  return {
    pullRequests: [],
    reviews: [],
    jiraIssues: [],
    memberActivity: [],
    now: NOW,
    ...overrides,
  };
}

function makePR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 1,
    title: 'Test PR',
    state: 'open',
    author: 'alice',
    createdAt: '2026-02-06T10:00:00Z',
    updatedAt: '2026-02-06T10:00:00Z',
    repo: 'org/repo',
    url: '',
    ...overrides,
  };
}

function makeReview(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    pullRequestNumber: 1,
    pullRequestTitle: 'Test PR',
    author: 'alice',
    state: 'APPROVED',
    submittedAt: '2026-02-06T12:00:00Z',
    repo: 'org/repo',
    ...overrides,
  };
}

function makeJiraIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    key: 'PROJ-1',
    summary: 'Test issue',
    status: 'In Progress',
    priority: 'High',
    assignee: 'alice',
    issueType: 'Story',
    updatedAt: '2026-02-06T10:00:00Z',
    url: '',
    ...overrides,
  };
}

describe('anomaly-detector', () => {
  it('returns empty array with no data', () => {
    const anomalies = detectAnomalies(makeInput());
    expect(anomalies).toEqual([]);
  });

  describe('stale PRs', () => {
    it('detects PR open for 1+ days as warning (new default)', () => {
      const pr = makePR({
        createdAt: '2026-02-05T20:00:00Z', // ~1.7 days old
      });
      const anomalies = detectAnomalies(makeInput({ pullRequests: [pr] }));

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.type).toBe('stale_pr');
      expect(anomalies[0]!.severity).toBe('warning');
      expect(anomalies[0]!.message).toContain('1 days');
    });

    it('detects PR open for 2+ days as alert (new default)', () => {
      const pr = makePR({
        createdAt: '2026-02-04T12:00:00Z', // ~3 days old
      });
      const anomalies = detectAnomalies(makeInput({ pullRequests: [pr] }));

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.type).toBe('stale_pr');
      expect(anomalies[0]!.severity).toBe('alert');
    });

    it('ignores merged/closed PRs', () => {
      const merged = makePR({ state: 'merged', createdAt: '2026-01-20T10:00:00Z' });
      const closed = makePR({ state: 'closed', createdAt: '2026-01-20T10:00:00Z' });
      const anomalies = detectAnomalies(makeInput({ pullRequests: [merged, closed] }));

      expect(anomalies).toHaveLength(0);
    });

    it('ignores very recently opened PRs', () => {
      const pr = makePR({ createdAt: '2026-02-07T06:00:00Z' }); // ~6 hours old
      const anomalies = detectAnomalies(makeInput({ pullRequests: [pr] }));

      expect(anomalies).toHaveLength(0);
    });

    it('uses custom thresholds when provided', () => {
      const pr = makePR({
        createdAt: '2026-02-01T12:00:00Z', // ~6 days old
      });
      const customThresholds = resolveThresholds({
        stalePrWarningDays: 5,
        stalePrAlertDays: 10,
      });

      const anomalies = detectAnomalies(
        makeInput({ pullRequests: [pr], thresholds: customThresholds })
      );

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.severity).toBe('warning'); // 6 days >= 5 warning, < 10 alert
    });
  });

  describe('stale issues', () => {
    it('detects high-priority in-progress issue not updated in 7+ days', () => {
      const issue = makeJiraIssue({
        priority: 'High',
        status: 'In Progress',
        updatedAt: '2026-01-28T10:00:00Z', // ~10 days stale
      });
      const anomalies = detectAnomalies(makeInput({ jiraIssues: [issue] }));

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.type).toBe('stale_issue');
      expect(anomalies[0]!.severity).toBe('alert');
      expect(anomalies[0]!.message).toContain('PROJ-1');
      expect(anomalies[0]!.message).toContain('10 days');
    });

    it('ignores low-priority stale issues', () => {
      const issue = makeJiraIssue({
        priority: 'Low',
        status: 'In Progress',
        updatedAt: '2026-01-20T10:00:00Z',
      });
      const anomalies = detectAnomalies(makeInput({ jiraIssues: [issue] }));

      expect(anomalies).toHaveLength(0);
    });

    it('ignores done/closed issues', () => {
      const issue = makeJiraIssue({
        priority: 'Highest',
        status: 'Done',
        updatedAt: '2026-01-20T10:00:00Z',
      });
      const anomalies = detectAnomalies(makeInput({ jiraIssues: [issue] }));

      expect(anomalies).toHaveLength(0);
    });

    it('ignores recently updated issues', () => {
      const issue = makeJiraIssue({
        priority: 'High',
        status: 'In Progress',
        updatedAt: '2026-02-05T10:00:00Z', // ~2 days ago
      });
      const anomalies = detectAnomalies(makeInput({ jiraIssues: [issue] }));

      expect(anomalies).toHaveLength(0);
    });
  });

  describe('review imbalance', () => {
    it('detects one person handling 60%+ of reviews', () => {
      const reviews = [
        makeReview({ author: 'alice' }),
        makeReview({ author: 'alice' }),
        makeReview({ author: 'alice' }),
        makeReview({ author: 'bob' }),
        makeReview({ author: 'charlie' }),
      ];
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 3,
          additions: 100,
          deletions: 50,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 20,
        },
        {
          username: 'charlie',
          commits: 4,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 60,
          deletions: 30,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ reviews, memberActivity: members }));
      const imbalance = anomalies.find((a) => a.type === 'review_imbalance');

      expect(imbalance).toBeDefined();
      expect(imbalance!.severity).toBe('warning');
      expect(imbalance!.message).toContain('alice');
      expect(imbalance!.message).toContain('60%');
    });

    it('does not flag balanced reviews', () => {
      const reviews = [
        makeReview({ author: 'alice' }),
        makeReview({ author: 'bob' }),
        makeReview({ author: 'charlie' }),
      ];
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 1,
          additions: 100,
          deletions: 50,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 20,
        },
        {
          username: 'charlie',
          commits: 4,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 60,
          deletions: 30,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ reviews, memberActivity: members }));
      const imbalance = anomalies.find((a) => a.type === 'review_imbalance');

      expect(imbalance).toBeUndefined();
    });

    it('skips imbalance check for single-member teams', () => {
      const reviews = [makeReview({ author: 'alice' }), makeReview({ author: 'alice' })];
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 2,
          additions: 100,
          deletions: 50,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ reviews, memberActivity: members }));
      expect(anomalies.find((a) => a.type === 'review_imbalance')).toBeUndefined();
    });
  });

  describe('no activity', () => {
    it('flags members with zero activity', () => {
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 3,
          additions: 100,
          deletions: 50,
        },
        {
          username: 'bob',
          commits: 0,
          prsAuthored: 0,
          reviewsGiven: 0,
          additions: 0,
          deletions: 0,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ memberActivity: members }));
      const noActivity = anomalies.find((a) => a.type === 'no_activity');

      expect(noActivity).toBeDefined();
      expect(noActivity!.severity).toBe('info');
      expect(noActivity!.message).toContain('bob');
    });

    it('does not flag members with any activity', () => {
      const members = [
        {
          username: 'alice',
          commits: 1,
          prsAuthored: 0,
          reviewsGiven: 0,
          additions: 0,
          deletions: 0,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ memberActivity: members }));
      expect(anomalies.find((a) => a.type === 'no_activity')).toBeUndefined();
    });
  });

  describe('high churn', () => {
    it('flags member with 3x+ team average churn', () => {
      // Alice: 12000, Bob/Charlie/Dave ~150 each. Avg = 12450/4 = 3112. Alice ratio = 3.85x
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 1,
          additions: 8000,
          deletions: 4000,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 20,
        },
        {
          username: 'charlie',
          commits: 4,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 30,
        },
        {
          username: 'dave',
          commits: 2,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 60,
          deletions: 40,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ memberActivity: members }));
      const highChurn = anomalies.find((a) => a.type === 'high_churn');

      expect(highChurn).toBeDefined();
      expect(highChurn!.severity).toBe('warning');
      expect(highChurn!.message).toContain('alice');
      expect(highChurn!.message).toContain('team average');
    });

    it('does not flag when churn is evenly distributed', () => {
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 1,
          additions: 500,
          deletions: 200,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 400,
          deletions: 150,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ memberActivity: members }));
      expect(anomalies.find((a) => a.type === 'high_churn')).toBeUndefined();
    });

    it('requires minimum churn threshold of 1000', () => {
      // High ratio but low absolute churn
      const members = [
        {
          username: 'alice',
          commits: 2,
          prsAuthored: 1,
          reviewsGiven: 0,
          additions: 50,
          deletions: 50,
        },
        {
          username: 'bob',
          commits: 1,
          prsAuthored: 0,
          reviewsGiven: 0,
          additions: 5,
          deletions: 5,
        },
      ];

      const anomalies = detectAnomalies(makeInput({ memberActivity: members }));
      expect(anomalies.find((a) => a.type === 'high_churn')).toBeUndefined();
    });
  });

  describe('sorting', () => {
    it('sorts alerts before warnings before info', () => {
      const anomalies = detectAnomalies(
        makeInput({
          pullRequests: [
            makePR({ number: 1, createdAt: '2026-01-20T10:00:00Z' }), // alert (18 days)
          ],
          memberActivity: [
            {
              username: 'bob',
              commits: 0,
              prsAuthored: 0,
              reviewsGiven: 0,
              additions: 0,
              deletions: 0,
            }, // info
          ],
        })
      );

      expect(anomalies.length).toBeGreaterThanOrEqual(2);
      const severities = anomalies.map((a) => a.severity);
      const alertIdx = severities.indexOf('alert');
      const infoIdx = severities.indexOf('info');
      expect(alertIdx).toBeLessThan(infoIdx);
    });
  });

  describe('custom thresholds', () => {
    it('uses custom stale issue threshold', () => {
      const issue = makeJiraIssue({
        priority: 'High',
        status: 'In Progress',
        updatedAt: '2026-02-04T10:00:00Z', // ~3 days stale
      });
      const shortThresholds = resolveThresholds({ staleIssueDays: 2 });
      const anomalies = detectAnomalies(
        makeInput({ jiraIssues: [issue], thresholds: shortThresholds })
      );

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]!.type).toBe('stale_issue');
    });

    it('uses custom review imbalance threshold', () => {
      const reviews = [
        makeReview({ author: 'alice' }),
        makeReview({ author: 'alice' }),
        makeReview({ author: 'bob' }),
        makeReview({ author: 'charlie' }),
      ];
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 2,
          additions: 100,
          deletions: 50,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 20,
        },
        {
          username: 'charlie',
          commits: 4,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 60,
          deletions: 30,
        },
      ];

      // With default 0.6, alice at 50% should NOT trigger
      const defaultResult = detectAnomalies(makeInput({ reviews, memberActivity: members }));
      expect(defaultResult.find((a) => a.type === 'review_imbalance')).toBeUndefined();

      // With 0.4 threshold, alice at 50% SHOULD trigger
      const strictThresholds = resolveThresholds({ reviewImbalanceThreshold: 0.4 });
      const strictResult = detectAnomalies(
        makeInput({ reviews, memberActivity: members, thresholds: strictThresholds })
      );
      expect(strictResult.find((a) => a.type === 'review_imbalance')).toBeDefined();
    });

    it('uses custom high churn thresholds', () => {
      const members = [
        {
          username: 'alice',
          commits: 5,
          prsAuthored: 2,
          reviewsGiven: 1,
          additions: 400,
          deletions: 200,
        },
        {
          username: 'bob',
          commits: 3,
          prsAuthored: 1,
          reviewsGiven: 1,
          additions: 50,
          deletions: 20,
        },
      ];
      // Alice churn=600, Bob churn=70, avg=335. Alice ratio=1.79x. Default 3x won't trigger.
      const defaultResult = detectAnomalies(makeInput({ memberActivity: members }));
      expect(defaultResult.find((a) => a.type === 'high_churn')).toBeUndefined();

      // With 1.5x multiplier and 100 minimum, alice SHOULD trigger
      const sensitiveThresholds = resolveThresholds({
        highChurnMultiplier: 1.5,
        highChurnMinimum: 100,
      });
      const sensitiveResult = detectAnomalies(
        makeInput({ memberActivity: members, thresholds: sensitiveThresholds })
      );
      expect(sensitiveResult.find((a) => a.type === 'high_churn')).toBeDefined();
    });
  });
});
