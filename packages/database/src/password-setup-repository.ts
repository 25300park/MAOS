import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./types.js";
import { PostgresPasswordCredentialRepository } from "./password-credential-repository.js";
import { PostgresAuditRecordRepository } from "./audit-record-repository.js";

export interface InitialPasswordInput {
  setupId: string;
  token: string;
  login: string;
  humanId: string;
  organizationId: string;
  hash: string;
}
/** Private administrative path only; use a dedicated connection, never a pooled
 * connection concurrently used by other services. No authorization issuer.
 * Authorization rows must be provisioned only by the explicitly approved owner
 * verification path; database possession alone is not approval authority.
 */
export class PostgresPasswordSetupRepository {
  #pending: Promise<void> = Promise.resolve();
  constructor(private readonly database: MigrationDatabase) {}
  issue(input: {
    login: string;
    humanId: string;
    organizationId: string;
    issuerId: string;
  }) {
    const snapshot = { ...input };
    const run = () => this.#issue(snapshot);
    const result = this.#pending.then(run, run);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async #issue(input: {
    login: string;
    humanId: string;
    organizationId: string;
    issuerId: string;
  }) {
    let begun = false;
    try {
      await this.database.exec("BEGIN");
      begun = true;
      // Serialize issuance for this exact Human across independent connections.
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        ["initial-password:" + input.humanId],
      );
      const valid = await this.database.query(
        `SELECT h.id FROM identity.humans h JOIN core.organizations o ON o.id=h.organization_id
        JOIN identity.humans issuer ON issuer.id=$3 AND issuer.organization_id=o.id
        WHERE h.id=$1 AND o.id=$2 AND h.archived_at IS NULL AND o.archived_at IS NULL AND issuer.archived_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM identity.password_credentials c WHERE c.human_id=h.id)
        AND NOT EXISTS(SELECT 1 FROM identity.password_setup_authorizations a WHERE a.human_id=h.id AND a.consumed_at IS NULL AND a.expires_at>clock_timestamp())`,
        [input.humanId, input.organizationId, input.issuerId],
      );
      if (valid.rows.length !== 1) throw Error("SETUP_DENIED");
      const setupId = randomUUID(),
        token = randomBytes(32).toString("base64url"),
        digest = createHash("sha256").update(token).digest("hex");
      const reference = "evidence://identity/initial-password-setup/" + setupId;
      const inserted = await this.database.query<{ expires_at: Date | string }>(
        `INSERT INTO identity.password_setup_authorizations
        (id,login_identifier,human_id,organization_id,token_digest,authorized_by,authorization_ref,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+INTERVAL '5 minutes') RETURNING expires_at`,
        [
          setupId,
          input.login,
          input.humanId,
          input.organizationId,
          digest,
          input.issuerId,
          reference,
        ],
      );
      const locked = await this.database.query<{ locked: boolean }>(
        "SELECT identity.lock_native_login_setup_subject($1,$2,$3,$4) AS locked",
        [input.humanId, input.organizationId, setupId, digest],
      );
      if (locked.rows[0]?.locked !== true) throw Error("SETUP_DENIED");
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: "IDENTITY.ISSUE_INITIAL_PASSWORD_SETUP",
        actorId: input.issuerId,
        actorType: "HUMAN",
        targetType: "HUMAN",
        targetId: input.humanId,
        result: "SUCCEEDED",
        requestId: setupId,
        correlationId: setupId,
        traceId: setupId,
        spanId: setupId,
        evidenceRefs: [reference],
        idempotencyKey: setupId,
        metadata: {
          organization_id: input.organizationId,
          purpose: "INITIAL_PASSWORD_SETUP",
        },
      });
      await this.database.exec("COMMIT");
      begun = false;
      return {
        setupId,
        token,
        expiresAt: new Date(inserted.rows[0]!.expires_at).getTime(),
      };
    } catch {
      if (begun) await this.database.exec("ROLLBACK").catch(() => {});
      throw Error("SETUP_DENIED");
    }
  }
  async authorize(input: Omit<InitialPasswordInput, "hash">): Promise<{
    login: string;
    humanId: string;
    organizationId: string;
    expiresAt: number;
  } | null> {
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return null;
      const r = await this.database.query<{ expires_at: Date | string }>(
        `SELECT a.expires_at FROM identity.password_setup_authorizations a
        JOIN identity.humans h ON h.id=a.human_id AND h.organization_id=a.organization_id
        JOIN core.organizations o ON o.id=a.organization_id
        WHERE a.id=$1 AND a.token_digest=$2 AND a.login_identifier=$3 AND a.human_id=$4 AND a.organization_id=$5
        AND a.environment='staging' AND a.consumed_at IS NULL AND a.created_at<=clock_timestamp() AND a.expires_at>clock_timestamp()
        AND h.archived_at IS NULL AND o.archived_at IS NULL`,
        [
          input.setupId,
          createHash("sha256").update(input.token).digest("hex"),
          input.login,
          input.humanId,
          input.organizationId,
        ],
      );
      if (r.rows.length !== 1) return null;
      return {
        login: input.login,
        humanId: input.humanId,
        organizationId: input.organizationId,
        expiresAt: new Date(r.rows[0]!.expires_at).getTime(),
      };
    } catch {
      return null;
    }
  }
  complete(input: InitialPasswordInput): Promise<void> {
    const snapshot = { ...input };
    const run = () => this.#complete(snapshot);
    const result = this.#pending.then(run, run);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async #complete(input: InitialPasswordInput): Promise<void> {
    let begun = false;
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) throw Error("SETUP_DENIED");
      await this.database.exec("BEGIN");
      begun = true;
      const result = await this.database.query<{
        authorized_by: string;
        authorization_ref: string;
      }>(
        `SELECT authorized_by,authorization_ref FROM identity.password_setup_authorizations
         WHERE id=$1 AND token_digest=$2 AND login_identifier=$3 AND human_id=$4 AND organization_id=$5
         AND environment='staging' AND consumed_at IS NULL AND created_at<=clock_timestamp() AND expires_at>clock_timestamp()
         FOR UPDATE`,
        [
          input.setupId,
          createHash("sha256").update(input.token).digest("hex"),
          input.login,
          input.humanId,
          input.organizationId,
        ],
      );
      const permit = result.rows[0];
      if (result.rows.length !== 1 || !permit) throw Error("SETUP_DENIED");
      // Definer performs only exact parent locks, retained by this transaction.
      const owner = await this.database.query<{ locked: boolean }>(
        "SELECT identity.lock_native_login_setup_subject($1,$2,$3,$4) AS locked",
        [
          input.humanId,
          input.organizationId,
          input.setupId,
          createHash("sha256").update(input.token).digest("hex"),
        ],
      );
      if (owner.rows.length !== 1 || owner.rows[0]?.locked !== true)
        throw Error("SETUP_DENIED");
      const consumed = await this.database.query(
        `UPDATE identity.password_setup_authorizations SET consumed_at=clock_timestamp()
         WHERE id=$1 AND token_digest=$2 AND login_identifier=$3 AND human_id=$4 AND organization_id=$5
         AND environment='staging' AND consumed_at IS NULL AND created_at<=clock_timestamp() AND expires_at>clock_timestamp()
         RETURNING id`,
        [
          input.setupId,
          createHash("sha256").update(input.token).digest("hex"),
          input.login,
          input.humanId,
          input.organizationId,
        ],
      );
      if (consumed.rows.length !== 1) throw Error("SETUP_DENIED");
      await new PostgresPasswordCredentialRepository(this.database).register(
        input,
      );
      await new PostgresAuditRecordRepository(
        this.database,
      ).recordInTransaction({
        action: "PASSWORD.INITIAL_SETUP",
        actorId: input.humanId,
        actorType: "HUMAN",
        targetType: "HUMAN",
        targetId: input.humanId,
        result: "SUCCEEDED",
        requestId: input.setupId,
        correlationId: input.setupId,
        traceId: input.setupId,
        spanId: input.setupId,
        evidenceRefs: [permit.authorization_ref],
        idempotencyKey: input.setupId,
        metadata: {
          organization_id: input.organizationId,
          authorized_by: permit.authorized_by,
        },
      });
      // Reject expiry even if lock/audit latency crossed the validity boundary.
      const valid = await this.database.query(
        "SELECT id FROM identity.password_setup_authorizations WHERE id=$1 AND expires_at>clock_timestamp()",
        [input.setupId],
      );
      if (valid.rows.length !== 1) throw Error("SETUP_DENIED");
      await this.database.exec("COMMIT");
      begun = false;
    } catch {
      if (begun) {
        try {
          await this.database.exec("ROLLBACK");
        } catch {
          /* dedicated connection must be discarded */
        }
      }
      throw new Error("SETUP_DENIED");
    }
  }
}
