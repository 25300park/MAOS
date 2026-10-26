import type { Environment } from "@maos/config";
import type { IncomingMessage } from "node:http";
import {
  HUMAN_ROUTING_OVERRIDE_REASON_CODES,
  ROUTING_MODES,
  ROUTING_PURPOSES,
  ROUTING_ROLE_CLASSES,
  RoutingContractError,
  type ApprovalRequirementQuery,
  type ExactRequestContext,
  type HumanRoutingOverrideRequest,
  type RoutingAppendResult,
  type RoutingDecisionReadDto,
  type RoutingDecisionService,
  type RoutingHumanOverrideAuthorityBinding,
  type RoutingPolicySnapshot,
  type RoutingReadService,
} from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

type PolicyReadService = {
  getPolicyVersion(
    policyId: string,
    version: number,
  ): Promise<RoutingPolicySnapshot | undefined>;
};

export interface RoutingResourceScope {
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly scopeRef: string;
  readonly environment: string;
}

export interface RoutingApiServices {
  readonly resourceScopes: {
    resolveRequestScope(
      requestId: string,
    ): Promise<RoutingResourceScope | undefined>;
  };
  readonly reads: Pick<
    RoutingReadService,
    | "getCurrentDecision"
    | "getDecisionHistory"
    | "getDecisionById"
    | "getDecisionCandidates"
  >;
  readonly decisions: Pick<
    RoutingDecisionService,
    "createDecision" | "applyHumanOverride"
  >;
  readonly policies: PolicyReadService;
}

export interface RoutingRouteOptions {
  readonly environment: Environment;
  readonly scope: string;
  readonly requestContext: Omit<ExactRequestContext, "requestId">;
  readonly resolveOverrideAuthority: (input: {
    readonly actorId: string;
    readonly identity: IdentityContext;
    readonly requestId: string;
    readonly routingPurpose: (typeof ROUTING_PURPOSES)[number];
    readonly targetDecisionId: string;
  }) =>
    | RoutingHumanOverrideAuthorityBinding
    | Promise<RoutingHumanOverrideAuthorityBinding>;
}

type ObjectValue = Readonly<Record<string, unknown>>;

function object(value: unknown): ObjectValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : undefined;
}

function exactKeys(value: ObjectValue, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function strings(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "string" && SAFE_REFERENCE.test(item),
    ) &&
    new Set(value).size === value.length
  );
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function decodeUuid(value: string | undefined, field: string): string {
  let decoded = "";
  try {
    decoded = decodeURIComponent(value ?? "");
  } catch {
    decoded = "";
  }
  if (!UUID.test(decoded)) validationError(field);
  return decoded;
}

function validationError(field: string): never {
  throw new ApiRequestError(422, {
    code: "ROUTING_REQUEST_INVALID",
    type: "VALIDATION",
    severity: "INFO",
    retryable: false,
    details: { field },
  });
}

function query(request: {
  readonly url?: string | undefined;
}): URLSearchParams {
  try {
    return new URL(request.url ?? "", "http://localhost").searchParams;
  } catch {
    validationError("query");
  }
}

function exactQuery(
  request: { readonly url?: string | undefined },
  allowed: readonly string[],
): URLSearchParams {
  const params = query(request);
  for (const key of params.keys())
    if (!allowed.includes(key)) validationError(key);
  for (const key of allowed)
    if (params.getAll(key).length !== 1) validationError(key);
  return params;
}

function routingPurpose(value: unknown) {
  if (!ROUTING_PURPOSES.includes(value as never))
    validationError("routingPurpose");
  return value as (typeof ROUTING_PURPOSES)[number];
}

function requiredHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string {
  const raw = headers[name];
  const value = Array.isArray(raw) ? undefined : raw?.trim();
  if (!value || !IDEMPOTENCY_KEY.test(value)) validationError(name);
  return value;
}

function validateApproval(
  value: unknown,
): value is ApprovalRequirementQuery | null {
  if (value === null) return true;
  const source = object(value);
  const expected = object(source?.expected);
  if (!source || !expected) return false;
  return (
    exactKeys(source, ["approvalRequestId", "expected"]) &&
    uuid(source.approvalRequestId) &&
    exactKeys(expected, [
      "targetType",
      "targetId",
      "targetVersion",
      "targetHash",
      "companyScopeRef",
      "teamScopeRef",
      "projectScopeRef",
      "systemScopeRef",
      "riskClass",
      "environment",
      "requestedOperation",
      "evidenceManifestHash",
    ]) &&
    [
      "targetType",
      "targetId",
      "targetVersion",
      "targetHash",
      "companyScopeRef",
      "projectScopeRef",
      "riskClass",
      "environment",
      "requestedOperation",
      "evidenceManifestHash",
    ].every(
      (key) => typeof expected[key] === "string" && expected[key] !== "",
    ) &&
    ["teamScopeRef", "systemScopeRef"].every(
      (key) => expected[key] === undefined || typeof expected[key] === "string",
    )
  );
}

const decisionKeys = [
  "expectedClassificationVersionId",
  "expectedCurrentDecisionId",
  "routingPurpose",
  "roleClass",
  "routingMode",
  "specializationRef",
  "approval",
  "aidosTargetRef",
  "evidenceRefs",
  "contextRefs",
  "artifactRefs",
  "priority",
  "causationRefs",
] as const;

function validDecisionBody(
  value: unknown,
  override: boolean,
): ValidationResult {
  const source = object(value);
  const allowed = override
    ? [...decisionKeys, "overrideIntent", "reasonCode", "reasonText"]
    : decisionKeys;
  if (
    !source ||
    !exactKeys(source, allowed) ||
    !uuid(source.expectedClassificationVersionId) ||
    (source.expectedCurrentDecisionId !== null &&
      !uuid(source.expectedCurrentDecisionId)) ||
    !ROUTING_PURPOSES.includes(source.routingPurpose as never) ||
    !ROUTING_ROLE_CLASSES.includes(source.roleClass as never) ||
    !ROUTING_MODES.includes(source.routingMode as never) ||
    (source.specializationRef !== null && !uuid(source.specializationRef)) ||
    !validateApproval(source.approval) ||
    (source.aidosTargetRef !== null &&
      (typeof source.aidosTargetRef !== "string" ||
        !SAFE_REFERENCE.test(source.aidosTargetRef))) ||
    !strings(source.evidenceRefs) ||
    source.evidenceRefs.length === 0 ||
    !strings(source.contextRefs) ||
    !strings(source.artifactRefs) ||
    !PRIORITIES.includes(source.priority as never) ||
    !strings(source.causationRefs)
  )
    return {
      ok: false,
      details: { contract: override ? "HUMAN_OVERRIDE" : "ROUTING_DECISION" },
    };
  if (override) {
    const intent = object(source.overrideIntent);
    const select = intent?.type === "SELECT_ELIGIBLE_CANDIDATE";
    const reevaluate = intent?.type === "REEVALUATE_CANONICAL";
    if (
      !uuid(source.expectedCurrentDecisionId) ||
      !intent ||
      (!select && !reevaluate) ||
      !exactKeys(intent, select ? ["type", "modelHostBindingId"] : ["type"]) ||
      (select && !uuid(intent.modelHostBindingId)) ||
      !HUMAN_ROUTING_OVERRIDE_REASON_CODES.includes(
        source.reasonCode as never,
      ) ||
      typeof source.reasonText !== "string" ||
      source.reasonText.trim().length < 3 ||
      source.reasonText.length > 500
    )
      return { ok: false, details: { contract: "HUMAN_OVERRIDE" } };
  }
  return { ok: true, value: source };
}

const unavailableCodes = new Set([
  "REQUIRED_CAPABILITY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "MODEL_DISABLED",
  "RUNTIME_ADAPTER_UNAVAILABLE",
  "REGISTRY_RECONCILING",
  "AIDOS_UNAVAILABLE",
  "WAITING_AIDOS_ONBOARDING",
]);
const forbiddenCodes = new Set([
  "POLICY_DENIED",
  "FALLBACK_NOT_AUTHORIZED",
  "HUMAN_APPROVAL_REQUIRED",
  "HUMAN_APPROVAL_REVOKED",
  "HUMAN_APPROVAL_INVALID",
  "HUMAN_OVERRIDE_POLICY_VIOLATION",
  "DEVELOPMENT_NATIVE_EXECUTION_PROHIBITED",
]);
const missingCodes = new Set([
  "ROUTING_REQUEST_NOT_FOUND",
  "ROUTING_POLICY_MISSING",
]);
const conflictCodes = new Set([
  "CLASSIFICATION_NOT_CURRENT",
  "CLASSIFICATION_STALE",
  "CLASSIFICATION_POLICY_UNRESOLVED",
  "ROUTING_POLICY_STALE",
  "ROUTING_POLICY_INACTIVE",
  "ROUTING_POLICY_CONFLICT",
  "ROUTING_POLICY_ACTIVATION_CONFLICT",
  "REGISTRY_STALE",
  "REGISTRY_CONFLICT",
  "NONDETERMINISTIC_CANDIDATE_TIE",
  "HUMAN_APPROVAL_STALE",
  "AIDOS_AUTHORITY_STALE",
  "AIDOS_AUTHORITY_CONFLICT",
  "ROUTING_DECISION_STALE",
  "ROUTING_STREAM_CONFLICT",
  "ROUTING_CROSS_STREAM_SUPERSESSION_DENIED",
  "ROUTING_IDEMPOTENCY_CONFLICT",
]);

export function routingFailureHttpStatus(error: RoutingContractError): number {
  if (missingCodes.has(error.code)) return 404;
  if (forbiddenCodes.has(error.code)) return 403;
  if (conflictCodes.has(error.code)) return 409;
  if (unavailableCodes.has(error.code)) return 503;
  return 422;
}

async function governed<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (error instanceof RoutingContractError) {
      const statusCode = routingFailureHttpStatus(error);
      throw new ApiRequestError(statusCode, {
        code: error.code,
        type:
          statusCode === 403
            ? "AUTHORIZATION"
            : statusCode === 404
              ? "NOT_FOUND"
              : statusCode === 422
                ? "VALIDATION"
                : "GOVERNANCE",
        severity: statusCode === 503 ? "WARNING" : "INFO",
        retryable: statusCode === 503,
        details: {},
      });
    }
    throw new ApiRequestError(500, {
      code: "ROUTING_INTERNAL_FAILURE",
      type: "INTERNAL",
      severity: "CRITICAL",
      retryable: false,
      details: {},
    });
  }
}

function access(
  options: RoutingRouteOptions,
  resource: string,
  action: string,
  risk: "R0" | "R1" | "R2",
) {
  return {
    action,
    environment: options.environment,
    resource,
    risk,
    scope: options.scope,
  } as const;
}

function safePolicy(policy: RoutingPolicySnapshot) {
  const constraints = policy.policyConstraints;
  const safeConstraints: Record<string, boolean | string | readonly string[]> =
    {};
  const enumLists = {
    allowedRoutingModes: new Set<string>(ROUTING_MODES),
    candidateTieBreakers: new Set([
      "PROVIDER_ID",
      "MODEL_ID",
      "RUNTIME_ADAPTER_ID",
      "MODEL_HOST_BINDING_ID",
      "COST_CLASS",
      "LATENCY_CLASS",
      "QUALITY_CLASS",
    ]),
    allowedExecutionModes: new Set([
      "MAOS_NATIVE",
      "DELEGATE_TO_AIDOS",
      "PROHIBITED",
    ]),
  } as const;
  for (const [key, allowed] of Object.entries(enumLists)) {
    const value = constraints[key];
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string" && allowed.has(item))
    )
      safeConstraints[key] = Object.freeze([...value]);
  }
  for (const key of [
    "allowedProviderIds",
    "allowedModelIds",
    "allowedRuntimeAdapterIds",
    "deniedProviderIds",
    "deniedModelIds",
    "deniedRuntimeAdapterIds",
  ] as const) {
    const value = constraints[key];
    if (Array.isArray(value) && value.every(uuid))
      safeConstraints[key] = Object.freeze([...value] as string[]);
  }
  for (const key of [
    "allowedCostClasses",
    "allowedLatencyClasses",
    "allowedQualityClasses",
  ] as const) {
    const value = constraints[key];
    if (
      Array.isArray(value) &&
      value.every(
        (item) => typeof item === "string" && SAFE_REFERENCE.test(item),
      )
    )
      safeConstraints[key] = Object.freeze([...value]);
  }
  if (typeof constraints.humanApprovalRequired === "boolean")
    safeConstraints.humanApprovalRequired = constraints.humanApprovalRequired;
  if (
    constraints.routingDisposition === "MAOS_NATIVE" ||
    constraints.routingDisposition === "DELEGATE_TO_AIDOS"
  )
    safeConstraints.routingDisposition = constraints.routingDisposition;
  return Object.freeze({
    routingPolicyVersionId: policy.routingPolicyVersionId,
    routingPolicyId: policy.routingPolicyId,
    version: policy.version,
    authorityIdentifier: policy.authorityIdentifier,
    lifecycleIntent: policy.lifecycleIntent,
    canonicalDomain: policy.canonicalDomain,
    routingPurpose: policy.routingPurpose,
    roleClass: policy.roleClass,
    scopeRef: policy.scopeRef,
    environment: policy.environment,
    requiredCapabilityRefs: Object.freeze([...policy.requiredCapabilityRefs]),
    preferredCapabilityRefs: Object.freeze([...policy.preferredCapabilityRefs]),
    policyConstraints: Object.freeze(safeConstraints),
    effectiveAt: policy.effectiveAt,
    expiresAt: policy.expiresAt,
    contentFingerprint: policy.contentFingerprint,
    createdAt: policy.createdAt,
  });
}

function permissionDenied(): never {
  throw new ApiRequestError(403, {
    code: "PERMISSION_DENIED",
    type: "AUTHORIZATION",
    severity: "INFO",
    retryable: false,
    details: {},
  });
}

function requireExactResourceScope(
  options: RoutingRouteOptions,
  target: RoutingResourceScope | undefined,
): void {
  if (
    !target ||
    target.organizationId !== options.requestContext.organizationId ||
    target.projectId !== options.requestContext.projectId ||
    target.scopeRef !== options.scope ||
    target.environment !== options.requestContext.environment
  )
    permissionDenied();
}

async function mutationOutput(
  services: RoutingApiServices,
  result: RoutingAppendResult,
): Promise<{
  outcome: RoutingAppendResult["outcome"];
  decision: RoutingDecisionReadDto;
}> {
  return {
    outcome: result.outcome,
    decision: await services.reads.getDecisionById({
      routingDecisionId: result.decision.routingDecisionId,
    }),
  };
}

export function createRoutingRoutes(
  services: RoutingApiServices,
  options: RoutingRouteOptions,
): ApiRoute[] {
  const stream = (
    params: Readonly<Record<string, string>>,
    request: IncomingMessage,
  ) => {
    const requestId = decodeUuid(params.requestId, "requestId");
    const values = exactQuery(request, ["routingPurpose"]);
    return {
      requestId,
      routingPurpose: routingPurpose(values.get("routingPurpose")),
    };
  };
  const decisionRead = (
    params: Readonly<Record<string, string>>,
    request: IncomingMessage,
  ) => {
    const routingDecisionId = decodeUuid(
      params.routingDecisionId,
      "routingDecisionId",
    );
    exactQuery(request, []);
    return { routingDecisionId };
  };
  const requireRequestScope = async (requestId: string) =>
    requireExactResourceScope(
      options,
      await services.resourceScopes.resolveRequestScope(requestId),
    );
  const commonMutation = (
    body: ObjectValue,
    requestId: string,
    identity: IdentityContext,
    context: { correlation_id: string; trace_id: string; span_id: string },
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ) => ({
    requestId,
    expectedClassificationVersionId:
      body.expectedClassificationVersionId as string,
    expectedCurrentDecisionId: body.expectedCurrentDecisionId as string | null,
    context: { ...options.requestContext, requestId },
    scopeRef: options.scope,
    roleClass: body.roleClass as (typeof ROUTING_ROLE_CLASSES)[number],
    routingPurpose: body.routingPurpose as (typeof ROUTING_PURPOSES)[number],
    routingMode: body.routingMode as (typeof ROUTING_MODES)[number],
    specializationRef: body.specializationRef as string | null,
    approval: body.approval as ApprovalRequirementQuery | null,
    aidosTargetRef: body.aidosTargetRef as string | null,
    idempotencyKey: requiredHeader(headers, "idempotency-key"),
    actorType: identity.actor_type,
    actorId: identity.actor_id,
    evidenceRefs: body.evidenceRefs as readonly string[],
    contextRefs: body.contextRefs as readonly string[],
    artifactRefs: body.artifactRefs as readonly string[],
    priority: body.priority as (typeof PRIORITIES)[number],
    correlationId: context.correlation_id,
    causationRefs: body.causationRefs as readonly string[],
    traceId: context.trace_id,
    spanId: context.span_id,
  });
  return [
    {
      access: access(options, "ROUTING_DECISION", "READ", "R0"),
      method: "GET",
      path: "/api/v1/routing/requests/:requestId/current",
      handle: ({ params, request }) =>
        governed(async () => {
          const input = stream(params, request);
          await requireRequestScope(input.requestId);
          return { decision: await services.reads.getCurrentDecision(input) };
        }),
    },
    {
      access: access(options, "ROUTING_DECISION", "READ", "R0"),
      method: "GET",
      path: "/api/v1/routing/requests/:requestId/history",
      handle: ({ params, request }) =>
        governed(async () => {
          const input = stream(params, request);
          await requireRequestScope(input.requestId);
          return { decisions: await services.reads.getDecisionHistory(input) };
        }),
    },
    {
      access: access(options, "ROUTING_DECISION", "READ", "R0"),
      method: "GET",
      path: "/api/v1/routing/decisions/:routingDecisionId",
      handle: ({ params, request }) =>
        governed(async () => {
          const input = decisionRead(params, request);
          const decision = await services.reads.getDecisionById(input);
          await requireRequestScope(decision.requestId);
          return { decision };
        }),
    },
    {
      access: access(options, "ROUTING_DECISION", "READ", "R0"),
      method: "GET",
      path: "/api/v1/routing/decisions/:routingDecisionId/candidates",
      handle: ({ params, request }) =>
        governed(async () => {
          const input = decisionRead(params, request);
          const decision = await services.reads.getDecisionById(input);
          await requireRequestScope(decision.requestId);
          return {
            candidates: await services.reads.getDecisionCandidates(input),
          };
        }),
    },
    {
      access: access(options, "ROUTING_DECISION", "CREATE", "R1"),
      method: "POST",
      path: "/api/v1/routing/requests/:requestId/decisions",
      validate: (input) => validDecisionBody(input, false),
      handle: ({ params, input, identity, context, request }) =>
        governed(async () => {
          if (!identity) validationError("identity");
          const body = input as ObjectValue;
          const requestId = decodeUuid(params.requestId, "requestId");
          await requireRequestScope(requestId);
          const result = await services.decisions.createDecision(
            commonMutation(body, requestId, identity, context, request.headers),
          );
          return mutationOutput(services, result);
        }),
    },
    {
      access: access(options, "ROUTING_DECISION", "OVERRIDE", "R2"),
      method: "POST",
      path: "/api/v1/routing/requests/:requestId/overrides",
      validate: (input) => validDecisionBody(input, true),
      handle: ({ params, input, identity, context, request }) =>
        governed(async () => {
          if (!identity || identity.actor_type !== "HUMAN")
            throw new ApiRequestError(403, {
              code: "PERMISSION_DENIED",
              type: "AUTHORIZATION",
              severity: "INFO",
              retryable: false,
              details: {},
            });
          const body = input as ObjectValue;
          const requestId = decodeUuid(params.requestId, "requestId");
          await requireRequestScope(requestId);
          const common = commonMutation(
            body,
            requestId,
            identity,
            context,
            request.headers,
          );
          const authority = await options.resolveOverrideAuthority({
            actorId: identity.actor_id,
            identity,
            requestId,
            routingPurpose: common.routingPurpose,
            targetDecisionId: common.expectedCurrentDecisionId!,
          });
          const result = await services.decisions.applyHumanOverride({
            ...common,
            actorType: "HUMAN",
            expectedCurrentDecisionId: common.expectedCurrentDecisionId!,
            authority,
            overrideIntent:
              body.overrideIntent as HumanRoutingOverrideRequest["overrideIntent"],
            reasonCode:
              body.reasonCode as HumanRoutingOverrideRequest["reasonCode"],
            reasonText: body.reasonText as string,
          });
          return mutationOutput(services, result);
        }),
    },
    {
      access: access(options, "ROUTING_POLICY", "READ", "R0"),
      method: "GET",
      path: "/api/v1/routing/policies/:policyId/versions/:version",
      handle: ({ params }) =>
        governed(async () => {
          const policyId = decodeUuid(params.policyId, "policyId");
          const version = Number(params.version);
          if (!Number.isSafeInteger(version) || version < 1)
            validationError("version");
          const policy = await services.policies.getPolicyVersion(
            policyId,
            version,
          );
          if (!policy) throw new RoutingContractError("ROUTING_POLICY_MISSING");
          if (policy.routingPolicyId !== policyId || policy.version !== version)
            throw new RoutingContractError("ROUTING_POLICY_CONFLICT");
          requireExactResourceScope(options, {
            organizationId: policy.organizationId,
            projectId: policy.projectId,
            scopeRef: policy.scopeRef,
            environment: policy.environment,
          });
          return { policy: safePolicy(policy) };
        }),
    },
  ];
}
