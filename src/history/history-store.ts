/**
 * History Store
 *
 * SQLite-backed persistence for metric snapshots.
 * Uses better-sqlite3 for synchronous, fast local storage.
 * Database lives at ~/.prodbeam/history.db by default.
 *
 * Only aggregated numbers are stored — never sensitive content.
 */

import Database from 'better-sqlite3';
import type { Snapshot, MemberSnapshot } from './types.js';
import { historyDbPath, ensureConfigDir } from '../config/paths.js';

export class HistoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? historyDbPath();
    if (!dbPath) {
      ensureConfigDir();
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  /**
   * Save a team-level snapshot. Returns the inserted row ID.
   */
  saveSnapshot(snapshot: Snapshot): number {
    const stmt = this.db.prepare(`
      INSERT INTO snapshots (
        team_name, snapshot_type, period_start, period_end, sprint_name,
        total_commits, total_prs, prs_merged, prs_open,
        total_additions, total_deletions, total_reviews, avg_merge_time_h,
        jira_total, jira_completed, jira_completion_pct
      ) VALUES (
        @teamName, @snapshotType, @periodStart, @periodEnd, @sprintName,
        @totalCommits, @totalPRs, @prsMerged, @prsOpen,
        @totalAdditions, @totalDeletions, @totalReviews, @avgMergeTimeH,
        @jiraTotal, @jiraCompleted, @jiraCompletionPct
      )
    `);

    const result = stmt.run({
      teamName: snapshot.teamName,
      snapshotType: snapshot.snapshotType,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      sprintName: snapshot.sprintName ?? null,
      totalCommits: snapshot.totalCommits,
      totalPRs: snapshot.totalPRs,
      prsMerged: snapshot.prsMerged,
      prsOpen: snapshot.prsOpen,
      totalAdditions: snapshot.totalAdditions,
      totalDeletions: snapshot.totalDeletions,
      totalReviews: snapshot.totalReviews,
      avgMergeTimeH: snapshot.avgMergeTimeH,
      jiraTotal: snapshot.jiraTotal,
      jiraCompleted: snapshot.jiraCompleted,
      jiraCompletionPct: snapshot.jiraCompletionPct,
    });

    return Number(result.lastInsertRowid);
  }

  /**
   * Save per-member snapshots linked to a team snapshot.
   */
  saveMemberSnapshots(snapshotId: number, members: MemberSnapshot[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO member_snapshots (
        snapshot_id, member_github,
        commits, prs, prs_merged, reviews_given,
        additions, deletions, jira_completed
      ) VALUES (
        @snapshotId, @memberGithub,
        @commits, @prs, @prsMerged, @reviewsGiven,
        @additions, @deletions, @jiraCompleted
      )
    `);

    const insertMany = this.db.transaction((items: MemberSnapshot[]) => {
      for (const m of items) {
        stmt.run({
          snapshotId,
          memberGithub: m.memberGithub,
          commits: m.commits,
          prs: m.prs,
          prsMerged: m.prsMerged,
          reviewsGiven: m.reviewsGiven,
          additions: m.additions,
          deletions: m.deletions,
          jiraCompleted: m.jiraCompleted,
        });
      }
    });

    insertMany(members);
  }

  /**
   * Get the most recent snapshot of a given type.
   */
  getLatestSnapshot(type: 'daily' | 'weekly' | 'sprint'): Snapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM snapshots WHERE snapshot_type = ? ORDER BY period_end DESC, id DESC LIMIT 1`
      )
      .get(type) as SnapshotRow | undefined;

    return row ? mapRow(row) : null;
  }

  /**
   * Get the snapshot before a given date, of the specified type.
   * Used for trend comparison (e.g., "what did last week look like?").
   */
  getPreviousSnapshot(type: 'daily' | 'weekly' | 'sprint', beforeDate: string): Snapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM snapshots
         WHERE snapshot_type = ? AND period_end < ?
         ORDER BY period_end DESC LIMIT 1`
      )
      .get(type, beforeDate) as SnapshotRow | undefined;

    return row ? mapRow(row) : null;
  }

  /**
   * Get sprint history, most recent first.
   */
  getSprintHistory(limit = 10): Snapshot[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM snapshots WHERE snapshot_type = 'sprint'
         ORDER BY period_end DESC LIMIT ?`
      )
      .all(limit) as SnapshotRow[];

    return rows.map(mapRow);
  }

  /**
   * Get weekly history, most recent first.
   */
  getWeeklyHistory(limit = 10): Snapshot[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM snapshots WHERE snapshot_type = 'weekly'
         ORDER BY period_end DESC LIMIT ?`
      )
      .all(limit) as SnapshotRow[];

    return rows.map(mapRow);
  }

  /**
   * Get member-level snapshots for a specific team snapshot.
   */
  getMemberSnapshots(snapshotId: number): MemberSnapshot[] {
    const rows = this.db
      .prepare(`SELECT * FROM member_snapshots WHERE snapshot_id = ?`)
      .all(snapshotId) as MemberSnapshotRow[];

    return rows.map(mapMemberRow);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  // ─── Schema Migration ─────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        team_name       TEXT NOT NULL,
        snapshot_type   TEXT NOT NULL,
        period_start    TEXT NOT NULL,
        period_end      TEXT NOT NULL,
        sprint_name     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),

        total_commits     INTEGER NOT NULL DEFAULT 0,
        total_prs         INTEGER NOT NULL DEFAULT 0,
        prs_merged        INTEGER NOT NULL DEFAULT 0,
        prs_open          INTEGER NOT NULL DEFAULT 0,
        total_additions   INTEGER NOT NULL DEFAULT 0,
        total_deletions   INTEGER NOT NULL DEFAULT 0,
        total_reviews     INTEGER NOT NULL DEFAULT 0,
        avg_merge_time_h  REAL,

        jira_total          INTEGER DEFAULT 0,
        jira_completed      INTEGER DEFAULT 0,
        jira_completion_pct REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS member_snapshots (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id     INTEGER NOT NULL REFERENCES snapshots(id),
        member_github   TEXT NOT NULL,

        commits         INTEGER NOT NULL DEFAULT 0,
        prs             INTEGER NOT NULL DEFAULT 0,
        prs_merged      INTEGER NOT NULL DEFAULT 0,
        reviews_given   INTEGER NOT NULL DEFAULT 0,
        additions       INTEGER NOT NULL DEFAULT 0,
        deletions       INTEGER NOT NULL DEFAULT 0,
        jira_completed  INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_type_period
        ON snapshots(snapshot_type, period_end);
      CREATE INDEX IF NOT EXISTS idx_member_snapshots
        ON member_snapshots(snapshot_id);
    `);
  }
}

// ─── Row Mapping ────────────────────────────────────────────

interface SnapshotRow {
  id: number;
  team_name: string;
  snapshot_type: string;
  period_start: string;
  period_end: string;
  sprint_name: string | null;
  created_at: string;
  total_commits: number;
  total_prs: number;
  prs_merged: number;
  prs_open: number;
  total_additions: number;
  total_deletions: number;
  total_reviews: number;
  avg_merge_time_h: number | null;
  jira_total: number;
  jira_completed: number;
  jira_completion_pct: number;
}

interface MemberSnapshotRow {
  id: number;
  snapshot_id: number;
  member_github: string;
  commits: number;
  prs: number;
  prs_merged: number;
  reviews_given: number;
  additions: number;
  deletions: number;
  jira_completed: number;
}

function mapRow(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    teamName: row.team_name,
    snapshotType: row.snapshot_type as Snapshot['snapshotType'],
    periodStart: row.period_start,
    periodEnd: row.period_end,
    sprintName: row.sprint_name ?? undefined,
    createdAt: row.created_at,
    totalCommits: row.total_commits,
    totalPRs: row.total_prs,
    prsMerged: row.prs_merged,
    prsOpen: row.prs_open,
    totalAdditions: row.total_additions,
    totalDeletions: row.total_deletions,
    totalReviews: row.total_reviews,
    avgMergeTimeH: row.avg_merge_time_h,
    jiraTotal: row.jira_total,
    jiraCompleted: row.jira_completed,
    jiraCompletionPct: row.jira_completion_pct,
  };
}

function mapMemberRow(row: MemberSnapshotRow): MemberSnapshot {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    memberGithub: row.member_github,
    commits: row.commits,
    prs: row.prs,
    prsMerged: row.prs_merged,
    reviewsGiven: row.reviews_given,
    additions: row.additions,
    deletions: row.deletions,
    jiraCompleted: row.jira_completed,
  };
}
