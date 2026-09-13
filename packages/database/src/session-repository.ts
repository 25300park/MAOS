import type { MigrationDatabase } from "./types.js";

export interface StoredAssignmentPermission {
  readonly action: string;
  readonly effect: "ALLOW" | "DENY";
  readonly environment: "staging";
  readonly resource: string;
  readonly risk: "R2";
  readonly scope: string;
}

export interface StoredHumanProvisioning {
  readonly assignment_id: string;
  readonly display_name: string;
  readonly external_subject: string;
  readonly human_id: string;
  readonly organization_id: string;
  readonly permissions: readonly Omit<StoredAssignmentPermission, "scope">[];
  readonly project_id: string;
  readonly scope: string;
}

export interface StoredHumanIdentity {
  readonly actor_id: string;
  readonly actor_type: "HUMAN";
  readonly display_name: string;
  readonly external_subject: string;
  readonly organization_id: string;
  readonly roles: readonly {
    readonly id: string;
    readonly name: "project-assignment";
    readonly permissions: readonly StoredAssignmentPermission[];
  }[];
}

export interface StoredSessionCreation {
  readonly absolute_expires_at: string;
  readonly actor_id: string;
  readonly audit_evidence_ref?: string;
  readonly created_at: string;
  readonly issued_at: string;
  readonly last_accessed_at: string;
  readonly mfa_verification_ref?: string;
  readonly mfa_verified_at?: string;
  readonly organization_id: string;
  readonly session_id: string;
  readonly session_version: 1;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref?: string;
}

export interface StoredSession extends Omit<
  StoredSessionCreation,
  "session_version"
> {
  readonly revocation_evidence_ref?: string;
  readonly revoked_at?: string;
  readonly session_version: number;
}

export interface StoredSessionRevocation {
  readonly actor_id: string;
  readonly audit_evidence_ref?: string;
  readonly expected_version: number;
  readonly revocation_evidence_ref: string;
  readonly revoked_at: string;
  readonly session_id: string;
}

type IdentityRow = {
  action: string | null;
  actor_id: string;
  assignment_id: string | null;
  display_name: string;
  effect: "ALLOW" | "DENY" | null;
  environment: "staging" | null;
  external_subject: string;
  organization_id: string;
  resource: string | null;
  risk: "R2" | null;
  scope: string | null;
};

type SessionRow = {
  absolute_expires_at: Date | string;
  actor_id: string;
  audit_evidence_ref: string | null;
  created_at: Date | string;
  id: string;
  issued_at: Date | string;
  last_accessed_at: Date | string;
  mfa_verification_ref: string | null;
  mfa_verified_at: Date | string | null;
  organization_id: string;
  revocation_evidence_ref: string | null;
  revoked_at: Date | string | null;
  session_version: number | string;
  tenant_binding_origin: string;
  tenant_binding_ref: string | null;
};

const iso = (value: Date | string): string => new Date(value).toISOString();

function mapIdentity(rows: readonly IdentityRow[]): StoredHumanIdentity | null {
  const first = rows[0];
  if (!first) return null;
  const assignments = new Map<string, StoredAssignmentPermission[]>();
  for (const row of rows) {
    if (
      row.assignment_id &&
      row.action &&
      row.effect &&
      row.environment &&
      row.resource &&
      row.risk &&
      row.scope
    ) {
      const permissions = assignments.get(row.assignment_id) ?? [];
      permissions.push({
        action: row.action,
        effect: row.effect,
        environment: row.environment,
        resource: row.resource,
        risk: row.risk,
        scope: row.scope,
      });
      assignments.set(row.assignment_id, permissions);
    }
  }
  return {
    actor_id: first.actor_id,
    actor_type: "HUMAN",
    display_name: first.display_name,
    external_subject: first.external_subject,
    organization_id: first.organization_id,
    roles: [...assignments.entries()].map(([id, permissions]) => ({
      id,
      name: "project-assignment",
      permissions,
    })),
  };
}

function mapSession(row: SessionRow): StoredSession {
  return {
    absolute_expires_at: iso(row.absolute_expires_at),
    actor_id: row.actor_id,
    ...(row.audit_evidence_ref
      ? { audit_evidence_ref: row.audit_evidence_ref }
      : {}),
    created_at: iso(row.created_at),
    issued_at: iso(row.issued_at),
    last_accessed_at: iso(row.last_accessed_at),
    ...(row.mfa_verification_ref
      ? { mfa_verification_ref: row.mfa_verification_ref }
      : {}),
    ...(row.mfa_verified_at
      ? { mfa_verified_at: iso(row.mfa_verified_at) }
      : {}),
    organization_id: row.organization_id,
    ...(row.revocation_evidence_ref
      ? { revocation_evidence_ref: row.revocation_evidence_ref }
      : {}),
    ...(row.revoked_at ? { revoked_at: iso(row.revoked_at) } : {}),
    session_id: row.id,
    session_version: Number(row.session_version),
    tenant_binding_origin: row.tenant_binding_origin,
    ...(row.tenant_binding_ref
      ? { tenant_binding_ref: row.tenant_binding_ref }
      : {}),
  };
}

const identitySelect = `
  SELECT h.id AS actor_id, h.organization_id, h.display_name,
         h.external_subject, a.id AS assignment_id, a.scope,
         p.action, p.resource, p.environment, p.risk, p.effect
  FROM identity.humans h
  LEFT JOIN identity.human_project_assignments a
    ON a.human_id = h.id AND a.organization_id = h.organization_id
   AND a.revoked_at IS NULL
  LEFT JOIN identity.assignment_permissions p ON p.assignment_id = a.id`;

const sessionSelect = `
  SELECT id, actor_id, organization_id, tenant_binding_origin,
         tenant_binding_ref, issued_at, last_accessed_at, absolute_expires_at,
         session_version, revoked_at, revocation_evidence_ref,
         audit_evidence_ref, mfa_verified_at, mfa_verification_ref, created_at
  FROM identity.sessions`;

export class PostgresSessionRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async provisionHuman(
    input: StoredHumanProvisioning,
  ): Promise<StoredHumanIdentity> {
    const result = await this.database.query<{ actor_id: string }>(
      `WITH conflicting_subject AS (
         SELECT 1 FROM identity.humans
         WHERE external_subject = $3 AND organization_id <> $2
       ), provisioned_human AS (
         INSERT INTO identity.humans (
           id, organization_id, display_name, external_subject
         )
         SELECT $1, $2, $4, $3
         WHERE NOT EXISTS (SELECT 1 FROM conflicting_subject)
         ON CONFLICT (organization_id, external_subject) DO UPDATE
           SET display_name = identity.humans.display_name
         WHERE identity.humans.id = $1
           AND identity.humans.display_name = $4
           AND identity.humans.archived_at IS NULL
         RETURNING id, organization_id
       ), provisioned_assignment AS (
         INSERT INTO identity.human_project_assignments (
           id, human_id, organization_id, project_id, scope
         )
         SELECT $5, id, organization_id, $6, $7 FROM provisioned_human
         ON CONFLICT (human_id, organization_id, project_id, scope) DO UPDATE
           SET updated_at = identity.human_project_assignments.updated_at
         WHERE identity.human_project_assignments.id = $5
           AND identity.human_project_assignments.revoked_at IS NULL
         RETURNING id, human_id
       ), provisioned_permissions AS (
         INSERT INTO identity.assignment_permissions (
           assignment_id, action, resource, environment, risk, effect
         )
         SELECT a.id, permission.action, permission.resource,
                permission.environment, permission.risk, permission.effect
         FROM provisioned_assignment a
         CROSS JOIN jsonb_to_recordset($8::jsonb) AS permission(
           action text, resource text, environment text, risk text, effect text
         )
         ON CONFLICT DO NOTHING
       )
       SELECT human_id AS actor_id FROM provisioned_assignment`,
      [
        input.human_id,
        input.organization_id,
        input.external_subject,
        input.display_name,
        input.assignment_id,
        input.project_id,
        input.scope,
        JSON.stringify(input.permissions),
      ],
    );
    if (!result.rows[0]) {
      throw new Error(
        "External subject conflicts with the requested organization or identity",
      );
    }
    const identity = await this.resolveIdentityByActorId(
      result.rows[0].actor_id,
    );
    if (!identity)
      throw new Error("Provisioned identity could not be resolved");
    return identity;
  }

  async resolveIdentityByExternalSubject(
    externalSubject: string,
  ): Promise<StoredHumanIdentity | null> {
    const result = await this.database.query<IdentityRow>(
      `${identitySelect}
       WHERE h.external_subject = $1 AND h.archived_at IS NULL
       ORDER BY a.id, p.action, p.resource, p.effect`,
      [externalSubject],
    );
    return mapIdentity(result.rows);
  }

  async resolveIdentityByActorId(
    actorId: string,
  ): Promise<StoredHumanIdentity | null> {
    const result = await this.database.query<IdentityRow>(
      `${identitySelect}
       WHERE h.id = $1 AND h.archived_at IS NULL
       ORDER BY a.id, p.action, p.resource, p.effect`,
      [actorId],
    );
    return mapIdentity(result.rows);
  }

  async createSession(input: StoredSessionCreation): Promise<StoredSession> {
    const result = await this.database.query<SessionRow>(
      `INSERT INTO identity.sessions (
         id, actor_id, organization_id, tenant_binding_origin,
         tenant_binding_ref, issued_at, last_accessed_at, absolute_expires_at,
         session_version, audit_evidence_ref, mfa_verified_at,
         mfa_verification_ref, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
       )
       RETURNING *`,
      [
        input.session_id,
        input.actor_id,
        input.organization_id,
        input.tenant_binding_origin,
        input.tenant_binding_ref ?? null,
        input.issued_at,
        input.last_accessed_at,
        input.absolute_expires_at,
        input.session_version,
        input.audit_evidence_ref ?? null,
        input.mfa_verified_at ?? null,
        input.mfa_verification_ref ?? null,
        input.created_at,
      ],
    );
    const session = result.rows[0];
    if (!session) throw new Error("Session was not created");
    return mapSession(session);
  }

  async findSession(sessionId: string): Promise<StoredSession | null> {
    const result = await this.database.query<SessionRow>(
      `${sessionSelect} WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async touchSession(input: {
    accessedAt: string;
    expectedVersion: number;
    sessionId: string;
  }): Promise<StoredSession | null> {
    const result = await this.database.query<SessionRow>(
      `UPDATE identity.sessions
       SET last_accessed_at = $3, session_version = session_version + 1
       WHERE id = $1 AND session_version = $2 AND revoked_at IS NULL
       RETURNING *`,
      [input.sessionId, input.expectedVersion, input.accessedAt],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async revokeSession(
    input: StoredSessionRevocation,
  ): Promise<StoredSession | null> {
    const result = await this.database.query<SessionRow>(
      `WITH revoked AS (
         UPDATE identity.sessions
         SET revoked_at = $3,
             revocation_evidence_ref = $4,
             audit_evidence_ref = COALESCE($6, audit_evidence_ref),
             session_version = session_version + 1
         WHERE id = $1 AND session_version = $2 AND revoked_at IS NULL
         RETURNING *
       ), recorded AS (
         INSERT INTO identity.session_revocations (
           session_id, revoked_version, revoked_at, actor_id, evidence_ref
         )
         SELECT id, session_version, revoked_at, $5, revocation_evidence_ref
         FROM revoked
         RETURNING session_id
       )
       SELECT revoked.* FROM revoked JOIN recorded ON recorded.session_id = revoked.id`,
      [
        input.session_id,
        input.expected_version,
        input.revoked_at,
        input.revocation_evidence_ref,
        input.actor_id,
        input.audit_evidence_ref ?? null,
      ],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }
}
