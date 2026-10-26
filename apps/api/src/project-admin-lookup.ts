import {
  validCoreProjectLookupSelector,
  type CoreProjectLookupRecord,
  type CoreProjectLookupSelector,
  type PostgresCoreBootstrapRepository,
} from "@maos/database";
import { authorize, type IdentityContext } from "@maos/module-identity";

export type ProjectAdminLookupResult =
  | { readonly state: "FOUND"; readonly project: CoreProjectLookupRecord;
      readonly match_evidence: { readonly organization_id: string; readonly selector: CoreProjectLookupSelector } }
  | { readonly state: "NOT_FOUND" | "RESTRICTED" | "AMBIGUOUS" | "NOT_VERIFIED" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** Local service only. Proposed permission is not provisioned by constructing this service. */
export class ProjectAdminLookup {
  private readonly organizationId: string;
  private readonly environment: "staging";

  constructor(
    private readonly repository: Pick<PostgresCoreBootstrapRepository, "findProjectsExact">,
    trusted: { readonly organizationId: string; readonly environment: "staging" },
  ) {
    this.organizationId = trusted.organizationId;
    this.environment = trusted.environment;
  }

  async lookup(identity: IdentityContext | null, input: {
    readonly organization_id: string; readonly selector: unknown;
  }): Promise<ProjectAdminLookupResult> {
    if (!identity || !UUID.test(this.organizationId) || this.environment !== "staging" ||
        !input || input.organization_id !== this.organizationId || !authorize(identity, {
          action: "READ", resource: "PROJECT_REGISTRY", risk: "R0", environment: this.environment,
          scope: `organization:${this.organizationId}`,
        }).allowed) return { state: "RESTRICTED" };
    if (!validCoreProjectLookupSelector(input.selector)) return { state: "NOT_VERIFIED" };
    // Freeze a detached selector before the asynchronous DB read; never reinterpret a URL/name.
    const selector = Object.freeze({ ...input.selector });
    try {
      const rows = await this.repository.findProjectsExact(this.organizationId, selector);
      if (rows.some(row => row.organization_id !== this.organizationId)) return { state: "NOT_VERIFIED" };
      if (rows.length === 0) return { state: "NOT_FOUND" };
      if (rows.length !== 1) return { state: "AMBIGUOUS" };
      const row = rows[0]!;
      return { state: "FOUND", project: {
        project_id: row.project_id, organization_id: row.organization_id, department_id: row.department_id,
        name: row.name, version: row.version, archived_at: row.archived_at,
      }, match_evidence: { organization_id: this.organizationId, selector } };
    } catch (error) {
      return { state: error && typeof error === "object" && "code" in error && error.code === "42501"
        ? "RESTRICTED" : "NOT_VERIFIED" };
    }
  }
}
