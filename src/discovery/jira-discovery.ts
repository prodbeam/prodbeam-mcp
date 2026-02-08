/**
 * Jira Discovery
 *
 * Resolves team member emails into Jira accounts, discovers
 * accessible projects, boards, and active sprints.
 */

import { JiraClient } from '../clients/jira-client.js';
import type {
  JiraMemberDiscovery,
  JiraTeamDiscovery,
  JiraProjectDiscovery,
  JiraSprintDiscovery,
} from './types.js';

/**
 * Discover Jira identities, projects, and sprints for a list of emails.
 *
 * 1. Resolve each email to a Jira account
 * 2. Get all projects accessible to the authenticated user
 * 3. For each project, find boards and active sprints
 */
export async function discoverJiraTeam(
  client: JiraClient,
  emails: string[],
  host: string
): Promise<JiraTeamDiscovery> {
  // Resolve members and get projects in parallel
  const [members, apiProjects] = await Promise.all([
    Promise.all(emails.map((email) => discoverJiraMember(client, email))),
    client.getProjects().catch(() => []),
  ]);

  const projects: JiraProjectDiscovery[] = apiProjects.map((p) => ({
    key: p.key,
    name: p.name,
  }));

  // Find active sprints across all project boards
  const activeSprints = await discoverActiveSprints(client, projects);

  return {
    members,
    projects,
    activeSprints,
    host,
  };
}

/**
 * Discover a single member's Jira identity.
 * Gracefully handles failures.
 */
async function discoverJiraMember(client: JiraClient, email: string): Promise<JiraMemberDiscovery> {
  const result: JiraMemberDiscovery = {
    email,
    accountId: null,
    displayName: null,
  };

  try {
    const user = await client.searchUserByEmail(email);
    if (user) {
      result.accountId = user.accountId;
      result.displayName = user.displayName;
    } else {
      result.error = `No Jira user found for ${email}`;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * Find active sprints across all project boards.
 * Checks each project's boards and collects active sprints.
 */
async function discoverActiveSprints(
  client: JiraClient,
  projects: JiraProjectDiscovery[]
): Promise<JiraSprintDiscovery[]> {
  const sprintMap = new Map<number, JiraSprintDiscovery>();

  for (const project of projects) {
    try {
      const boards = await client.getBoards(project.key);

      for (const board of boards) {
        try {
          const sprints = await client.getSprints(board.id, 'active');
          for (const sprint of sprints) {
            if (!sprintMap.has(sprint.id)) {
              sprintMap.set(sprint.id, {
                id: sprint.id,
                name: sprint.name,
                state: sprint.state,
                startDate: sprint.startDate,
                endDate: sprint.endDate,
              });
            }
          }
        } catch {
          // Board may not support sprints (kanban), skip
        }
      }
    } catch {
      // Project may not have boards, skip
    }
  }

  return Array.from(sprintMap.values());
}
