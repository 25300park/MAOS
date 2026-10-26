export type ClassificationApiRead = (path: string) => Promise<Response>;

export interface ClassificationPortalItem {
  readonly classificationId: string;
  readonly version: number;
  readonly domain: string;
  readonly subdomain: string;
  readonly state: string;
  readonly source: string;
  readonly disposition: string;
  readonly reason: string;
  readonly policyStatus: string;
  readonly policyVersion: string;
  readonly createdAt: string;
}

export interface ClassificationPortalView {
  readonly requestId: string;
  readonly current: ClassificationPortalItem | null;
  readonly history: readonly ClassificationPortalItem[];
  readonly readOnly: true;
}

type SafeInput = Record<string, unknown>;
const text = (value: unknown, fallback = "UNKNOWN") =>
  typeof value === "string" && value.length > 0 ? value : fallback;
const integer = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : 0;

function projectItem(value: unknown): ClassificationPortalItem {
  const item =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as SafeInput)
      : {};
  return {
    classificationId: text(item.classificationId),
    version: integer(item.version),
    domain: text(item.domainKey),
    subdomain: text(item.subdomainKey, "NONE"),
    state: text(item.classificationState),
    source: text(item.source),
    disposition: text(item.routingDisposition),
    reason: text(item.reasonCode),
    policyStatus: text(item.policyStatus),
    policyVersion: text(item.policyResolutionVersion),
    createdAt: text(item.createdAt),
  };
}

export function buildClassificationPortalView(input: {
  requestId: string;
  current?: unknown;
  history?: readonly unknown[];
}): ClassificationPortalView {
  return Object.freeze({
    requestId: input.requestId,
    current: input.current ? projectItem(input.current) : null,
    history: Object.freeze((input.history ?? []).map(projectItem)),
    readOnly: true as const,
  });
}

async function data(
  read: ClassificationApiRead,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await read(path);
  if (!response.ok) throw new Error("CLASSIFICATION_API_UNAVAILABLE");
  const envelope = (await response.json()) as { ok?: unknown; data?: unknown };
  if (
    envelope.ok !== true ||
    !envelope.data ||
    typeof envelope.data !== "object"
  )
    throw new Error("CLASSIFICATION_API_RESPONSE_INVALID");
  return envelope.data as Record<string, unknown>;
}

export async function loadClassificationPortal(
  read: ClassificationApiRead,
  requestId: string,
): Promise<ClassificationPortalView> {
  const encoded = encodeURIComponent(requestId);
  const [current, history] = await Promise.all([
    data(read, `/api/v1/classifications/requests/${encoded}/current`),
    data(read, `/api/v1/classifications/requests/${encoded}/history`),
  ]);
  return buildClassificationPortalView({
    requestId,
    current: current.classification,
    history: Array.isArray(history.classifications)
      ? history.classifications
      : [],
  });
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function renderClassificationPortal(
  view: ClassificationPortalView,
): string {
  const row = (item: ClassificationPortalItem) =>
    `<tr><td>${item.version}</td><td>${escapeHtml(item.domain)}</td><td>${escapeHtml(item.subdomain)}</td><td>${escapeHtml(item.state)}</td><td>${escapeHtml(item.disposition)}</td><td>${escapeHtml(item.policyStatus)}</td><td>${escapeHtml(item.policyVersion)}</td></tr>`;
  const current = view.current
    ? row(view.current)
    : '<tr><td colspan="7">NO CURRENT CLASSIFICATION</td></tr>';
  const history =
    view.history.map(row).join("") ||
    '<tr><td colspan="7">NO HISTORY</td></tr>';
  return `<section data-classification-portal><div class="page-heading"><div><div class="eyebrow">Governance diagnostics</div><h1>Request classification</h1><p>Read-only canonical classification history. DEVELOPMENT remains delegated to AIDOS.</p></div></div><section class="panel"><div class="panel-head"><h2>Current</h2><span class="permission-note">SYSTEM:READ · diagnostic only</span></div><table class="data-table"><thead><tr><th>Version</th><th>Domain</th><th>Subdomain</th><th>State</th><th>Disposition</th><th>Policy</th><th>Policy version</th></tr></thead><tbody>${current}</tbody></table></section><section class="panel"><div class="panel-head"><h2>Immutable history</h2></div><table class="data-table"><thead><tr><th>Version</th><th>Domain</th><th>Subdomain</th><th>State</th><th>Disposition</th><th>Policy</th><th>Policy version</th></tr></thead><tbody>${history}</tbody></table></section></section>`;
}
