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
