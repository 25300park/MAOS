import type { MigrationDatabase } from "./types.js";

export interface SystemsReadInput {
  actorId: string;
  projectId: string;
  scope: string;
  environment: "staging";
}

export interface SystemReadRecord {
  id: string;
  name: string;
  lifecycle: string;
  source_of_truth: string;
  owner: { id: string; type: string };
  health: "UNKNOWN";
}

/** Read-only, assignment-bound projection. No organization-wide enumeration. */
export class PostgresSystemsReadRepository {
  constructor(private readonly database: Pick<MigrationDatabase, "query">) {}

  async list(input: SystemsReadInput): Promise<SystemReadRecord[]> {
    if (
      input.environment !== "staging" ||
      !/^[a-z0-9][a-z0-9-]*$/u.test(input.scope)
    )
      return [];
    const result = await this.database.query<{
      id: string;
      name: string;
      lifecycle: string;
      source_of_truth: string;
      owner_actor_id: string;
      owner_actor_type: string;
    }>(
      `SELECT DISTINCT s.id, s.name, s.lifecycle, s.source_of_truth,
          s.owner_actor_id, s.owner_actor_type
        FROM identity.humans h
        JOIN core.organizations o ON o.id=h.organization_id AND o.archived_at IS NULL
        JOIN identity.human_project_assignments a
          ON a.human_id=h.id AND a.organization_id=h.organization_id AND a.revoked_at IS NULL
        JOIN core.projects p ON p.id=a.project_id AND p.organization_id=h.organization_id AND p.archived_at IS NULL
        JOIN core.departments d ON d.id=p.department_id AND d.organization_id=p.organization_id AND d.archived_at IS NULL
        JOIN core.project_system_links l ON l.project_id=p.id
        JOIN integration.systems s ON s.id=l.system_id AND s.archived_at IS NULL
        JOIN operations.system_environments e ON e.system_id=s.id AND e.name='STAGING'
        WHERE h.id=$1 AND h.archived_at IS NULL AND p.id=$2 AND a.scope=$3
          AND EXISTS (SELECT 1 FROM identity.assignment_permissions ap WHERE ap.assignment_id=a.id
            AND ap.resource='SYSTEM' AND ap.action='READ' AND ap.risk='R0' AND ap.environment=$4 AND ap.effect='ALLOW')
          AND NOT EXISTS (SELECT 1 FROM identity.human_project_assignments da
            JOIN identity.assignment_permissions dp ON dp.assignment_id=da.id
            WHERE da.human_id=h.id AND da.organization_id=h.organization_id AND da.revoked_at IS NULL
              AND da.scope=$3 AND dp.resource='SYSTEM' AND dp.action='READ'
              AND dp.risk='R0' AND dp.environment=$4 AND dp.effect='DENY')
        ORDER BY s.id`,
      [input.actorId, input.projectId, input.scope, input.environment],
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      lifecycle: row.lifecycle,
      source_of_truth: row.source_of_truth,
      owner: { id: row.owner_actor_id, type: row.owner_actor_type },
      // Registry presence is not evidence of current operational health.
      health: "UNKNOWN",
    }));
  }
}
