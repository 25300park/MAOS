export type RoutingApiRead = (path: string) => Promise<Response>;

const PURPOSES = [
  "PRIMARY_EXECUTION",
  "INDEPENDENT_REVIEW",
  "ADVERSARIAL_REVIEW",
] as const;
type RoutingPurpose = (typeof PURPOSES)[number];

export interface RoutingPortalDecision {
  readonly routingDecisionId: string;
  readonly routingVersion: number;
  readonly routingPurpose: RoutingPurpose;
  readonly routingMode: string;
  readonly roleClass: string;
  readonly decisionState: string;
  readonly stalenessState: string;
  readonly policySnapshotRef: string;
  readonly registrySnapshotRef: string;
  readonly humanApprovalState: string;
  readonly developmentDelegationState: string;
  readonly aidosProjectRef: string | null;
  readonly decisionReasonCodes: readonly string[];
  readonly createdAt: string;
}

export interface RoutingPortalStream {
  readonly purpose: RoutingPurpose;
  readonly current: RoutingPortalDecision | null;
  readonly history: readonly RoutingPortalDecision[];
}

export interface RoutingPortalCandidate {
  readonly candidateSnapshotId: string;
  readonly routingDecisionId: string;
  readonly deterministicRank: number;
  readonly eligibilityState: string;
  readonly reasonCodes: readonly string[];
  readonly matchedRequiredCapabilityRefs: readonly string[];
  readonly matchedPreferredCapabilityRefs: readonly string[];
  readonly roleClass: string;
  readonly routingMode: string;
  readonly registrySnapshotRef: string;
  readonly registrySnapshotRevision: string;
}

export interface RoutingObservation {
  readonly operation: "CURRENT" | "HISTORY" | "CANDIDATES";
  readonly result: "SUCCESS" | "FAILURE";
  readonly failureCode: "ROUTING_API_FAILURE" | null;
  readonly latencyMs: number;
  readonly correlationId: string | null;
}

export interface RoutingPortalView {
  readonly requestId: string;
  readonly streams: readonly RoutingPortalStream[];
  readonly candidates: readonly RoutingPortalCandidate[];
  readonly observations: readonly RoutingObservation[];
  readonly readOnly: true;
}

type SafeInput = Record<string, unknown>;
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const asObject = (value: unknown): SafeInput =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as SafeInput)
    : {};
const text = (value: unknown, fallback = "UNKNOWN") =>
  typeof value === "string" && SAFE_TEXT.test(value) ? value : fallback;
const integer = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
const safeList = (value: unknown): readonly string[] =>
  Object.freeze(
    Array.isArray(value)
      ? value.filter(
          (entry): entry is string =>
            typeof entry === "string" && SAFE_TEXT.test(entry),
        )
      : [],
  );
const purpose = (value: unknown, fallback: RoutingPurpose): RoutingPurpose =>
  typeof value === "string" && PURPOSES.includes(value as RoutingPurpose)
    ? (value as RoutingPurpose)
    : fallback;

function projectDecision(
  value: unknown,
  expectedPurpose: RoutingPurpose,
): RoutingPortalDecision {
  const item = asObject(value);
  return Object.freeze({
    routingDecisionId: text(item.routingDecisionId),
    routingVersion: integer(item.routingVersion),
    routingPurpose: purpose(item.routingPurpose, expectedPurpose),
    routingMode: text(item.routingMode),
    roleClass: text(item.roleClass),
    decisionState: text(item.decisionState),
    stalenessState: text(item.stalenessState),
    policySnapshotRef: text(item.policySnapshotRef),
    registrySnapshotRef: text(item.registrySnapshotRef),
    humanApprovalState: text(item.humanApprovalState),
    developmentDelegationState: text(item.developmentDelegationState),
    aidosProjectRef:
      typeof item.aidosProjectRef === "string" &&
      SAFE_TEXT.test(item.aidosProjectRef)
        ? item.aidosProjectRef
        : null,
    decisionReasonCodes: safeList(item.decisionReasonCodes),
    createdAt: text(item.createdAt),
  });
}

function projectCandidate(value: unknown): RoutingPortalCandidate {
  const item = asObject(value);
  return Object.freeze({
    candidateSnapshotId: text(item.candidateSnapshotId),
    routingDecisionId: text(item.routingDecisionId),
    deterministicRank: integer(item.deterministicRank),
    eligibilityState: text(item.eligibilityState),
    reasonCodes: safeList(item.reasonCodes),
    matchedRequiredCapabilityRefs: safeList(item.matchedRequiredCapabilityRefs),
    matchedPreferredCapabilityRefs: safeList(
      item.matchedPreferredCapabilityRefs,
    ),
    roleClass: text(item.roleClass),
    routingMode: text(item.routingMode),
    registrySnapshotRef: text(item.registrySnapshotRef),
    registrySnapshotRevision: text(item.registrySnapshotRevision),
  });
}

export function buildRoutingPortalView(input: {
  requestId: string;
  streams: readonly {
    purpose: string;
    current?: unknown;
    history?: readonly unknown[];
  }[];
  candidates?: readonly unknown[];
  observations?: readonly RoutingObservation[];
}): RoutingPortalView {
  const streams = PURPOSES.map((expectedPurpose) => {
    const source = input.streams.find(
      (stream) => stream.purpose === expectedPurpose,
    );
    return Object.freeze({
      purpose: expectedPurpose,
      current: source?.current
        ? projectDecision(source.current, expectedPurpose)
        : null,
      history: Object.freeze(
        (source?.history ?? []).map((item) =>
          projectDecision(item, expectedPurpose),
        ),
      ),
    });
  });
  return Object.freeze({
    requestId: text(input.requestId),
    streams: Object.freeze(streams),
    candidates: Object.freeze((input.candidates ?? []).map(projectCandidate)),
    observations: Object.freeze([...(input.observations ?? [])]),
    readOnly: true as const,
  });
}

interface LoadOptions {
  readonly now?: () => number;
  readonly observe?: (observation: RoutingObservation) => void;
}

interface RuntimeLoadOptions {
  readonly now: () => number;
  readonly observe: ((observation: RoutingObservation) => void) | undefined;
}

async function readData(
  read: RoutingApiRead,
  path: string,
  operation: RoutingObservation["operation"],
  options: RuntimeLoadOptions,
  observations: RoutingObservation[],
): Promise<SafeInput> {
  const startedAt = options.now();
  let response: Response;
  try {
    response = await read(path);
  } catch {
    const observation = Object.freeze({
      operation,
      result: "FAILURE" as const,
      failureCode: "ROUTING_API_FAILURE" as const,
      latencyMs: Math.max(0, options.now() - startedAt),
      correlationId: null,
    });
    observations.push(observation);
    options.observe?.(observation);
    throw new Error("ROUTING_API_FAILURE");
  }
  const correlation = response.headers.get("x-correlation-id");
  const correlationId =
    correlation && SAFE_TEXT.test(correlation) ? correlation : null;
  if (!response.ok) {
    const observation = Object.freeze({
      operation,
      result: "FAILURE" as const,
      failureCode: "ROUTING_API_FAILURE" as const,
      latencyMs: Math.max(0, options.now() - startedAt),
      correlationId,
    });
    observations.push(observation);
    options.observe?.(observation);
    throw new Error("ROUTING_API_FAILURE");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const observation = Object.freeze({
      operation,
      result: "FAILURE" as const,
      failureCode: "ROUTING_API_FAILURE" as const,
      latencyMs: Math.max(0, options.now() - startedAt),
      correlationId,
    });
    observations.push(observation);
    options.observe?.(observation);
    throw new Error("ROUTING_API_FAILURE");
  }
  const envelope = asObject(payload);
  const data = asObject(envelope.data);
  if (envelope.ok !== true || Object.keys(data).length === 0) {
    const observation = Object.freeze({
      operation,
      result: "FAILURE" as const,
      failureCode: "ROUTING_API_FAILURE" as const,
      latencyMs: Math.max(0, options.now() - startedAt),
      correlationId,
    });
    observations.push(observation);
    options.observe?.(observation);
    throw new Error("ROUTING_API_FAILURE");
  }
  const observation = Object.freeze({
    operation,
    result: "SUCCESS" as const,
    failureCode: null,
    latencyMs: Math.max(0, options.now() - startedAt),
    correlationId,
  });
  observations.push(observation);
  options.observe?.(observation);
  return data;
}

export async function loadRoutingPortal(
  read: RoutingApiRead,
  requestId: string,
  options: LoadOptions = {},
): Promise<RoutingPortalView> {
  const observations: RoutingObservation[] = [];
  const streams: {
    purpose: RoutingPurpose;
    current: unknown;
    history: readonly unknown[];
  }[] = [];
  const candidates: unknown[] = [];
  const runtimeOptions = {
    now: options.now ?? Date.now,
    observe: options.observe,
  };
  const encodedRequestId = encodeURIComponent(requestId);
  for (const routingPurpose of PURPOSES) {
    const encodedPurpose = encodeURIComponent(routingPurpose);
    const current = await readData(
      read,
      `/api/v1/routing/requests/${encodedRequestId}/current?routingPurpose=${encodedPurpose}`,
      "CURRENT",
      runtimeOptions,
      observations,
    );
    const history = await readData(
      read,
      `/api/v1/routing/requests/${encodedRequestId}/history?routingPurpose=${encodedPurpose}`,
      "HISTORY",
      runtimeOptions,
      observations,
    );
    const currentDecision = current.decision;
    const currentDecisionId = text(asObject(currentDecision).routingDecisionId);
    const candidateData = await readData(
      read,
      `/api/v1/routing/decisions/${encodeURIComponent(currentDecisionId)}/candidates`,
      "CANDIDATES",
      runtimeOptions,
      observations,
    );
    streams.push({
      purpose: routingPurpose,
      current: currentDecision,
      history: Array.isArray(history.decisions) ? history.decisions : [],
    });
    if (Array.isArray(candidateData.candidates))
      candidates.push(...candidateData.candidates);
  }
  return buildRoutingPortalView({
    requestId,
    streams,
    candidates,
    observations,
  });
}

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const label = (value: string) => escapeHtml(value.replaceAll("_", " "));

export function renderRoutingPortal(view: RoutingPortalView): string {
  const streams = view.streams
    .map((stream) => {
      const current = stream.current
        ? `<tr><td>${stream.current.routingVersion}</td><td>${label(stream.current.roleClass)}</td><td>${label(stream.current.routingMode)}</td><td>${label(stream.current.decisionState)}</td><td>${label(stream.current.stalenessState)}</td><td>${escapeHtml(stream.current.policySnapshotRef)}</td><td>${escapeHtml(stream.current.registrySnapshotRef)}</td><td>${label(stream.current.humanApprovalState)}</td><td>${label(stream.current.developmentDelegationState)}</td><td>${stream.current.decisionReasonCodes.map(label).join(", ") || "NONE"}</td></tr>`
        : '<tr><td colspan="10">NO CURRENT DECISION</td></tr>';
      const history = stream.history
        .map(
          (item) =>
            `<li>v${item.routingVersion} · ${label(item.routingMode)} · ${label(item.decisionState)} · ${label(item.humanApprovalState)} · ${escapeHtml(item.policySnapshotRef)} · ${escapeHtml(item.registrySnapshotRef)} · ${label(item.createdAt)}</li>`,
        )
        .join("");
      return `<section class="panel" data-routing-purpose="${stream.purpose}"><div class="panel-head"><h2>${label(stream.purpose)}</h2><span class="permission-note">read-only stream</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Version</th><th>Role</th><th>Mode</th><th>Decision</th><th>Freshness</th><th>Policy snapshot</th><th>Registry snapshot</th><th>Approval / override</th><th>Development delegation</th><th>Reason</th></tr></thead><tbody>${current}</tbody></table></div><div class="panel-body"><h3>Immutable history</h3><ul>${history || "<li>NO HISTORY</li>"}</ul></div></section>`;
    })
    .join("");
  const candidates = view.candidates
    .map(
      (item) =>
        `<tr><td>${item.deterministicRank}</td><td>${label(item.roleClass)}</td><td>${label(item.routingMode)}</td><td>${label(item.eligibilityState)}</td><td>${item.reasonCodes.map(label).join(", ") || "NONE"}</td><td>${item.matchedRequiredCapabilityRefs.length}</td><td>${item.matchedPreferredCapabilityRefs.length}</td></tr>`,
    )
    .join("");
  const observations = view.observations
    .map(
      (item) =>
        `<tr><td>${label(item.operation)}</td><td>${label(item.result)}</td><td>${item.latencyMs}</td><td>${item.failureCode ? label(item.failureCode) : "NONE"}</td><td>${item.correlationId ? escapeHtml(item.correlationId) : "NONE"}</td></tr>`,
    )
    .join("");
  return `<section data-routing-portal><div class="page-heading"><div><div class="eyebrow">Governance diagnostics</div><h1>Routing diagnostics</h1><p>Read-only canonical routing projections. Fallback is not review. Review is not Approval or QA PASS.</p></div></div><div class="callout"><strong>Authority boundary</strong><p>Routing is not execution. Development execution remains delegated to AIDOS; this portal cannot select models, invoke AIDOS, or mutate authority.</p></div>${streams}<section class="panel"><div class="panel-head"><h2>Candidate explanation</h2><span class="permission-note">bounded evidence only</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Rank</th><th>Role</th><th>Mode</th><th>Eligibility</th><th>Reason</th><th>Required matches</th><th>Preferred matches</th></tr></thead><tbody>${candidates || '<tr><td colspan="7">NO CANDIDATE EVIDENCE</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Bounded observability</h2><span class="permission-note">no raw payloads</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Operation</th><th>Result</th><th>Latency ms</th><th>Failure code</th><th>Correlation</th></tr></thead><tbody>${observations || '<tr><td colspan="5">NO OBSERVATIONS</td></tr>'}</tbody></table></div></section></section>`;
}
