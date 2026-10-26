import { argon2id, hash, verify as verifyHash } from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { IdentityContext } from "@maos/module-identity";

const parameters = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || Buffer.byteLength(password) > 1024)
    throw Error("PASSWORD_POLICY_REJECTED");
  return hash(password, { ...parameters, salt: randomBytes(16) });
}
export interface PasswordRecord {
  human_id: string;
  organization_id: string;
  password_hash: string;
  version: number;
}
export interface NativePasswordOptions {
  organizationId: string;
  humanId: string;
  repository: {
    findActive(login: string, org: string): Promise<PasswordRecord | null>;
  };
  resolve(
    id: string,
  ): Promise<(IdentityContext & { organization_id: string }) | null>;
  now?: () => number;
}

export function nativePasswordBinding(
  env: Record<string, string | undefined>,
): { humanId: string; organizationId: string } | undefined {
  if (env.MAOS_AUTH_PROVIDER !== "native-password") return undefined;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    env.MAOS_ENV !== "staging" ||
    env.MAOS_STAGING_SESSION_INGRESS_ENABLED !== "true" ||
    !uuid.test(env.MAOS_NATIVE_PASSWORD_HUMAN_ID ?? "") ||
    !uuid.test(env.MAOS_NATIVE_PASSWORD_ORGANIZATION_ID ?? "")
  )
    throw Error("NATIVE_PASSWORD_CONFIG_INVALID");
  return {
    humanId: env.MAOS_NATIVE_PASSWORD_HUMAN_ID!,
    organizationId: env.MAOS_NATIVE_PASSWORD_ORGANIZATION_ID!,
  };
}

/** Process-local bounded limiter. Multi-replica activation requires an edge/shared limit. */
export function createNativePasswordVerifier(options: NativePasswordOptions) {
  const attempts = new Map<string, { count: number; until: number }>();
  const now = options.now ?? Date.now;
  let windowEnd = 0,
    total = 0,
    inflight = 0;
  // Generated per process, never persisted or logged. Equal-cost unknown-user verification.
  const dummy = hashPassword(randomBytes(32).toString("base64url"));
  return async (body: unknown): Promise<IdentityContext | null> => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const fields = body as Record<string, unknown>;
    if (
      Object.keys(fields).some((k) => k !== "email" && k !== "password") ||
      typeof fields.email !== "string" ||
      fields.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email) ||
      typeof fields.password !== "string" ||
      !fields.password ||
      Buffer.byteLength(fields.password) > 1024
    )
      return null;
    const login = fields.email.toLowerCase();
    const key = createHash("sha256").update(login).digest("hex"),
      time = now();
    if (time >= windowEnd) {
      total = 0;
      windowEnd = time + 60000;
    }
    for (const [k, v] of attempts) if (v.until <= time) attempts.delete(k);
    const attempt = attempts.get(key) ?? { count: 0, until: time + 15 * 60000 };
    if (
      total >= 30 ||
      attempt.count >= 5 ||
      inflight >= 2 ||
      (!attempts.has(key) && attempts.size >= 1000)
    )
      return null;
    total++;
    attempt.count++;
    attempts.set(key, attempt);
    inflight++;
    try {
      const record = await options.repository.findActive(
        login,
        options.organizationId,
      );
      const encoded = record?.password_hash ?? (await dummy);
      // Bound work even if a corrupt repository returns an attacker-selected PHC cost.
      if (
        !/^\$argon2id\$v=19\$m=19456,p=1,t=2\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/.test(
          encoded,
        )
      )
        return null;
      const valid = await verifyHash(encoded, fields.password);
      if (
        !valid ||
        !record ||
        record.human_id !== options.humanId ||
        record.organization_id !== options.organizationId
      )
        return null;
      const identity = await options.resolve(record.human_id);
      if (
        !identity ||
        identity.actor_type !== "HUMAN" ||
        identity.actor_id !== record.human_id ||
        identity.organization_id !== record.organization_id
      )
        return null;
      // Recheck revocation/version after expensive verification; never return the hash.
      const current = await options.repository.findActive(
        login,
        options.organizationId,
      );
      if (
        !current ||
        current.version !== record.version ||
        current.human_id !== record.human_id ||
        current.password_hash !== record.password_hash
      )
        return null;
      return identity;
    } catch {
      return null;
    } finally {
      inflight--;
    }
  };
}
