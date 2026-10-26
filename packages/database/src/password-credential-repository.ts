import type { MigrationDatabase } from "./types.js";

export interface PasswordCredential {
  human_id: string;
  organization_id: string;
  password_hash: string;
  version: number;
}
export class PostgresPasswordCredentialRepository {
  constructor(private readonly database: MigrationDatabase) {}
  async findActive(
    login: string,
    organizationId: string,
  ): Promise<PasswordCredential | null> {
    const result = await this.database.query<PasswordCredential>(
      `SELECT c.human_id,c.organization_id,c.password_hash,c.version
      FROM identity.password_credentials c
      JOIN identity.humans h ON h.id=c.human_id AND h.organization_id=c.organization_id AND h.archived_at IS NULL
      JOIN core.organizations o ON o.id=c.organization_id AND o.archived_at IS NULL
      WHERE c.login_identifier=$1 AND c.organization_id=$2 AND c.state='ACTIVE' AND c.revoked_at IS NULL LIMIT 2`,
      [login, organizationId],
    );
    return result.rows.length === 1 ? result.rows[0]! : null;
  }
  /** Internal provisioning primitive only; never composed into a public route. */
  async register(input: {
    login: string;
    humanId: string;
    organizationId: string;
    hash: string;
  }): Promise<void> {
    try {
      const result = await this.database.query(
        `INSERT INTO identity.password_credentials(login_identifier,human_id,organization_id,password_hash)
      SELECT $1,h.id,h.organization_id,$4 FROM identity.humans h JOIN core.organizations o ON o.id=h.organization_id
      WHERE h.id=$2 AND h.organization_id=$3 AND h.archived_at IS NULL AND o.archived_at IS NULL RETURNING version`,
        [input.login, input.humanId, input.organizationId, input.hash],
      );
      if (result.rows.length !== 1)
        throw Error("CREDENTIAL_REGISTRATION_REJECTED");
    } catch {
      throw Error("CREDENTIAL_REGISTRATION_REJECTED");
    }
  }
  async revoke(
    login: string,
    organizationId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE identity.password_credentials SET state='REVOKED',revoked_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE login_identifier=$1 AND organization_id=$2 AND version=$3 AND state='ACTIVE' RETURNING version`,
      [login, organizationId, expectedVersion],
    );
    return result.rows.length === 1;
  }
}
