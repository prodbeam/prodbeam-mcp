/**
 * Time Range Utilities
 *
 * Pure functions to compute date ranges for different report types.
 * All times are in ISO 8601 format.
 */

export interface TimeRange {
  from: string;
  to: string;
}

/**
 * Last 24 hours from now.
 * Used by: standup, team_standup
 */
export function dailyTimeRange(): TimeRange {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

/**
 * Last 7 days, optionally offset by weeksAgo.
 * weeksAgo=0 (default) = current week, weeksAgo=1 = last week, etc.
 * Used by: weekly_summary
 */
export function weeklyTimeRange(weeksAgo = 0): TimeRange {
  const now = new Date();
  const offset = weeksAgo * 7 * 24 * 60 * 60 * 1000;
  const to = new Date(now.getTime() - offset);
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/**
 * Sprint date range from Jira sprint start/end dates.
 * If endDate is in the future, caps at now.
 * Used by: sprint_retro
 */
export function sprintTimeRange(startDate: string, endDate: string): TimeRange {
  const now = new Date();
  const end = new Date(endDate);
  return {
    from: new Date(startDate).toISOString(),
    to: end > now ? now.toISOString() : end.toISOString(),
  };
}
