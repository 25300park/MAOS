import type { MigrationDatabase } from "./types.js";
import { PostgresSessionRepository } from "./session-repository.js";

interface OrganizationProjectAdminRuleBase {
  readonly id: string;
  readonly action: "READ";
  readonly resource: "PROJECT_REGISTRY";
  readonly risk: "R0";
  readonly environment: "staging";
  readonly scope: string;
  readonly effect: "ALLOW" | "DENY" | "REQUIRE_ADDITIONAL_APPROVAL";
  readonly valid_from: string;
  readonly valid_until?: string;
  readonly revoked_at?: string;
}
export type OrganizationProjectAdminRule = OrganizationProjectAdminRuleBase & (
  | { readonly actor_id: string; readonly actor_type: "HUMAN" }
  | { readonly actor_id?: never; readonly actor_type?: never }
);
export interface TrustedOrganizationProjectAdminAuthority {
  readonly humanId: string;
  readonly organizationId: string;
  readonly rules: readonly OrganizationProjectAdminRule[];
}
export class PostgresOrganizationProjectAdminAuthorityRepository {
  private readonly identities: PostgresSessionRepository;
  constructor(private readonly database: MigrationDatabase) {
    this.identities = new PostgresSessionRepository(database);
  }
  async read(humanId: string, organizationId: string): Promise<TrustedOrganizationProjectAdminAuthority | null> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
    if (!uuid.test(humanId) || !uuid.test(organizationId)) return null;
    // Existing identity reader excludes archived Humans; membership is not an entitlement.
    const human = await this.identities.resolveIdentityByActorId(humanId);
    if (!human || human.actor_id !== humanId || human.organization_id !== organizationId) return null;
    const organizations = await this.database.query<{ id: string }>(
      "SELECT id::text AS id FROM core.organizations WHERE id=$1 AND archived_at IS NULL", [organizationId],
    );
    if (organizations.rows.length !== 1 || organizations.rows[0]?.id !== organizationId) return null;
    const result = await this.database.query<{
      id: string; actor_id: string | null; actor_type: "HUMAN" | null;
      effect: OrganizationProjectAdminRule["effect"];
      valid_from: Date | string; valid_until: Date | string | null; revoked_at: Date | string | null;
    }>(
      `SELECT id::text AS id, actor_id::text AS actor_id, actor_type, effect, valid_from, valid_until, revoked_at
       FROM governance.authority_rules
       WHERE action='READ' AND resource='PROJECT_REGISTRY' AND risk='R0'
         AND environment='staging' AND scope=$2 AND archived_at IS NULL
         AND ((actor_type='HUMAN' AND actor_id=$1) OR (actor_type IS NULL AND actor_id IS NULL))
       ORDER BY id`, [humanId, `organization:${organizationId}`],
    );
    const rules = result.rows.map(row => ({
      id: row.id, action: "READ" as const, resource: "PROJECT_REGISTRY" as const,
      risk: "R0" as const, environment: "staging" as const, scope: `organization:${organizationId}`,
      effect: row.effect, valid_from: new Date(row.valid_from).toISOString(),
      ...(row.valid_until === null ? {} : { valid_until: new Date(row.valid_until).toISOString() }),
      ...(row.revoked_at === null ? {} : { revoked_at: new Date(row.revoked_at).toISOString() }),
      ...(row.actor_id !== null && row.actor_type === "HUMAN" ? { actor_id: row.actor_id, actor_type: "HUMAN" as const } : {}),
    }));
    return { humanId, organizationId, rules };
  }
}
