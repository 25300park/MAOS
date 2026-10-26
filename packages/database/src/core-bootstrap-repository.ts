import type { MigrationDatabase } from "./types.js";

export interface CoreBootstrapManifest {
  readonly departmentId: string;
  readonly departmentName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationSlug: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly scope: "project-maos";
}

export interface CoreBootstrapResult {
  readonly manifest: CoreBootstrapManifest;
  readonly outcome: "CREATED" | "REUSED";
}

export type CoreProjectLookupSelector =
  | { readonly project_id: string }
  | { readonly repository_reference: string }
  | { readonly department_id: string; readonly project_name: string };

export interface CoreProjectLookupRecord {
  readonly project_id: string;
  readonly organization_id: string;
  readonly department_id: string;
  readonly name: string;
  readonly version: number;
  readonly archived_at: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function validCoreProjectLookupSelector(value: unknown): value is CoreProjectLookupSelector {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort().join(",");
  if (keys === "project_id") return typeof input.project_id === "string" && UUID.test(input.project_id);
  if (keys === "repository_reference") return typeof input.repository_reference === "string" &&
    input.repository_reference.length <= 512 && /^registry:\/\/[^\s?#]+$/u.test(input.repository_reference);
  return keys === "department_id,project_name" && typeof input.department_id === "string" &&
    UUID.test(input.department_id) && typeof input.project_name === "string" &&
    input.project_name.length > 0 && input.project_name.length <= 512 && input.project_name.trim() === input.project_name;
}

type OrganizationRow = {
  archived_at: Date | string | null;
  id: string;
  name: string;
  slug: string;
};

type DepartmentRow = {
  archived_at: Date | string | null;
  id: string;
  name: string;
  organization_id: string;
};

type ProjectRow = {
  archived_at: Date | string | null;
  department_id: string;
  id: string;
  idempotency_key: string | null;
  name: string;
  organization_id: string;
};

export class CoreBootstrapConflictError extends Error {
  readonly code = "CORE_BOOTSTRAP_CONFLICT";

  constructor() {
    super("CORE_BOOTSTRAP_CONFLICT");
  }
}

function exactOrganization(
  row: OrganizationRow,
  manifest: CoreBootstrapManifest,
): boolean {
  return (
    row.id === manifest.organizationId &&
    row.name === manifest.organizationName &&
    row.slug === manifest.organizationSlug &&
    row.archived_at === null
  );
}

function exactDepartment(
  row: DepartmentRow,
  manifest: CoreBootstrapManifest,
): boolean {
  return (
    row.id === manifest.departmentId &&
    row.organization_id === manifest.organizationId &&
    row.name === manifest.departmentName &&
    row.archived_at === null
  );
}

function exactProject(
  row: ProjectRow,
  manifest: CoreBootstrapManifest,
  idempotencyKey: string,
): boolean {
  return (
    row.id === manifest.projectId &&
    row.organization_id === manifest.organizationId &&
    row.department_id === manifest.departmentId &&
    row.name === manifest.projectName &&
    row.idempotency_key === idempotencyKey &&
    row.archived_at === null
  );
}

export class PostgresCoreBootstrapRepository {
  constructor(private readonly database: MigrationDatabase) {}

  /** Caller must establish administrative read authority for this exact organization first. */
  async findProjectsExact(
    organizationId: string,
    selector: CoreProjectLookupSelector,
  ): Promise<readonly CoreProjectLookupRecord[]> {
    if (!UUID.test(organizationId) || !validCoreProjectLookupSelector(selector)) {
      throw new Error("CORE_PROJECT_LOOKUP_INVALID");
    }
    const params: unknown[] = [organizationId];
    let predicate: string;
    if ("project_id" in selector) {
      predicate = "p.id=$2";
      params.push(selector.project_id);
    } else if ("repository_reference" in selector) {
      // EXISTS deduplicates multiple system/repository links to one canonical project.
      predicate = `EXISTS (SELECT 1 FROM core.project_system_links link
        JOIN operations.repositories repository
          ON repository.system_id=link.system_id AND repository.id=link.repository_id
        WHERE link.project_id=p.id AND repository.reference=$2)`;
      params.push(selector.repository_reference);
    } else {
      predicate = "p.department_id=$2 AND p.name=$3";
      params.push(selector.department_id, selector.project_name);
    }
    const result = await this.database.query<{
      project_id: string; organization_id: string; department_id: string;
      name: string; version: string; archived_at: Date | string | null;
    }>(
      `SELECT p.id::text AS project_id, p.organization_id::text AS organization_id,
              p.department_id::text AS department_id, p.name, p.version::text AS version, p.archived_at
       FROM core.projects p WHERE p.organization_id=$1 AND ${predicate}
       ORDER BY p.id LIMIT 2`,
      params,
    );
    return result.rows.map(row => {
      const version = Number(row.version);
      if (!Number.isSafeInteger(version) || version < 1) throw new Error("CORE_PROJECT_LOOKUP_INVALID_RECORD");
      return {
        project_id: row.project_id, organization_id: row.organization_id,
        department_id: row.department_id, name: row.name, version,
        archived_at: row.archived_at === null ? null : new Date(row.archived_at).toISOString(),
      };
    });
  }

  async bootstrap(input: {
    idempotencyKey: string;
    manifest: CoreBootstrapManifest;
  }): Promise<CoreBootstrapResult> {
    if (
      input.manifest.scope !== "project-maos" ||
      !input.idempotencyKey ||
      input.idempotencyKey !== input.idempotencyKey.trim()
    ) {
      throw new CoreBootstrapConflictError();
    }

    const [organizations, departments, projects] = await Promise.all([
      this.database.query<OrganizationRow>(
        `SELECT id, name, slug, archived_at
         FROM core.organizations
         WHERE id = $1 OR slug = $2`,
        [input.manifest.organizationId, input.manifest.organizationSlug],
      ),
      this.database.query<DepartmentRow>(
        `SELECT id, organization_id, name, archived_at
         FROM core.departments
         WHERE id = $1 OR (organization_id = $2 AND name = $3)`,
        [
          input.manifest.departmentId,
          input.manifest.organizationId,
          input.manifest.departmentName,
        ],
      ),
      this.database.query<ProjectRow>(
        `SELECT id, organization_id, department_id, name,
                idempotency_key, archived_at
         FROM core.projects
         WHERE id = $1
            OR (organization_id = $2 AND department_id = $3 AND name = $4)
            OR (organization_id = $2 AND idempotency_key = $5)`,
        [
          input.manifest.projectId,
          input.manifest.organizationId,
          input.manifest.departmentId,
          input.manifest.projectName,
          input.idempotencyKey,
        ],
      ),
    ]);

    const counts = [
      organizations.rows.length,
      departments.rows.length,
      projects.rows.length,
    ];
    if (counts.every((count) => count === 0)) {
      try {
        await this.database.query(
          `WITH organization AS (
             INSERT INTO core.organizations (id, name, slug)
             VALUES ($1, $2, $3)
             RETURNING id
           ), department AS (
             INSERT INTO core.departments (id, organization_id, name)
             SELECT $4, id, $5 FROM organization
             RETURNING id, organization_id
           )
           INSERT INTO core.projects (
             id, organization_id, department_id, name, idempotency_key
           )
           SELECT $6, organization_id, id, $7, $8 FROM department`,
          [
            input.manifest.organizationId,
            input.manifest.organizationName,
            input.manifest.organizationSlug,
            input.manifest.departmentId,
            input.manifest.departmentName,
            input.manifest.projectId,
            input.manifest.projectName,
            input.idempotencyKey,
          ],
        );
      } catch {
        throw new CoreBootstrapConflictError();
      }
      return { manifest: input.manifest, outcome: "CREATED" };
    }

    if (
      organizations.rows.length === 1 &&
      departments.rows.length === 1 &&
      projects.rows.length === 1 &&
      exactOrganization(organizations.rows[0]!, input.manifest) &&
      exactDepartment(departments.rows[0]!, input.manifest) &&
      exactProject(projects.rows[0]!, input.manifest, input.idempotencyKey)
    ) {
      return { manifest: input.manifest, outcome: "REUSED" };
    }

    throw new CoreBootstrapConflictError();
  }
}
