/**
 * GitHub Discovery
 *
 * Resolves team member emails into GitHub usernames, discovers
 * org memberships, and finds active repos across the team.
 */

import { GitHubClient } from '../clients/github-client.js';
import type { GitHubMemberDiscovery, GitHubTeamDiscovery } from './types.js';

const RECENT_REPO_DAYS = 90;

/**
 * Discover GitHub identities and active repos for a list of emails.
 *
 * For each email:
 * 1. Search GitHub for the user by email
 * 2. If found, get their org memberships
 * 3. Get repos they've pushed to in the last 90 days
 *
 * Results are aggregated: orgs and repos are deduplicated across all members.
 */
export async function discoverGitHubTeam(
  client: GitHubClient,
  emails: string[]
): Promise<GitHubTeamDiscovery> {
  const members = await Promise.all(emails.map((email) => discoverGitHubMember(client, email)));

  // Deduplicate orgs and repos across all members
  const orgSet = new Set<string>();
  const repoSet = new Set<string>();

  for (const member of members) {
    for (const org of member.orgs) {
      orgSet.add(org);
    }
    for (const repo of member.repos) {
      repoSet.add(repo);
    }
  }

  return {
    members,
    orgs: Array.from(orgSet).sort(),
    repos: Array.from(repoSet).sort(),
  };
}

/**
 * Discover a single member's GitHub identity.
 * Gracefully handles failures — returns partial results with error message.
 */
async function discoverGitHubMember(
  client: GitHubClient,
  email: string
): Promise<GitHubMemberDiscovery> {
  const result: GitHubMemberDiscovery = {
    email,
    username: null,
    orgs: [],
    repos: [],
  };

  try {
    const username = await client.searchUserByEmail(email);
    if (!username) {
      result.error = `No GitHub user found for ${email}`;
      return result;
    }

    result.username = username;

    // Fetch orgs and repos in parallel
    const [orgs, repos] = await Promise.all([
      client.getUserOrgs(username).catch(() => [] as string[]),
      client.getRecentRepos(username, RECENT_REPO_DAYS).catch(() => [] as string[]),
    ]);

    result.orgs = orgs;
    result.repos = repos;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}
