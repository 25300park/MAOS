import type { SessionBoundCoreRead } from "./session-bff.js";

export type RegistryRead<T> =
  | { state: "AVAILABLE"; records: readonly T[] }
  | { state: "EMPTY" | "RESTRICTED" | "UNAVAILABLE" };

export interface ProjectRegistryRecord {
  id: string;
  scope: string;
  environment: string;
  repository: string;
  branch: string;
  workroot: string;
  health: string;
  name?: string;
}

interface SystemRegistryRecord {
  id: string;
  name: string;
  lifecycle: string;
  health: string;
  owner: { id: string; type: string };
  source_of_truth: string;
}

export type ProjectRegistryRead = RegistryRead<ProjectRegistryRecord>;
export type SystemRegistryRead = RegistryRead<SystemRegistryRecord>;
const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 4096;
const health = (value: unknown): value is string =>
  typeof value === "string" && ["HEALTHY", "DEGRADED", "UNAVAILABLE", "MAINTENANCE", "UNKNOWN"].includes(value);
const escape = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

async function readEnvelope(read: SessionBoundCoreRead, path: string): Promise<Record<string, unknown> | "RESTRICTED"> {
  const response = await read(path);
  if (response.status === 401 || response.status === 403) return "RESTRICTED";
  if (!response.ok) throw Error("REGISTRY_READ_UNAVAILABLE");
  const envelope = object(await response.json());
  const data = object(envelope?.data);
  if (envelope?.ok !== true || !data) throw Error("REGISTRY_RESPONSE_INVALID");
  return data;
}

export async function loadProjectRegistry(read: SessionBoundCoreRead): Promise<ProjectRegistryRead> {
  try {
    const data = await readEnvelope(read, "/api/v1/phase14/portal");
    if (data === "RESTRICTED") return { state: data };
    if (data.project === null) return { state: "EMPTY" };
    const p = object(data.project);
    if (!p || ![p.id, p.scope, p.environment, p.repository, p.branch, p.workroot].every(text) || !health(p.health) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(p.id)) ||
      (p.name !== undefined && !text(p.name))) throw Error("PROJECT_RESPONSE_INVALID");
    // The Portal is one authorized project boundary, not a global inventory.
    return { state: "AVAILABLE", records: [{ id: p.id as string, scope: p.scope as string,
      environment: p.environment as string, repository: p.repository as string, branch: p.branch as string,
      workroot: p.workroot as string, health: p.health,
      ...(p.name === undefined ? {} : { name: p.name as string }) }] };
  } catch { return { state: "UNAVAILABLE" }; }
}

export async function loadSystemRegistry(read: SessionBoundCoreRead): Promise<SystemRegistryRead> {
  try {
    const data = await readEnvelope(read, "/api/v1/control-plane");
    if (data === "RESTRICTED") return { state: data };
    const rows = object(data.entity)?.systems;
    if (!Array.isArray(rows)) throw Error("SYSTEM_RESPONSE_INVALID");
    const records = rows.map((row: unknown): SystemRegistryRecord => {
      const s = object(row), owner = object(s?.owner);
      if (!s || !owner || ![s.id, s.name, owner.id, owner.type].every(text) || !health(s.health) ||
        !["DRAFT", "ACTIVE", "SUSPENDED", "DISABLED", "RETIRED"].includes(String(s.lifecycle)) ||
        !["MAOS", "DOMAIN_SYSTEM"].includes(String(s.source_of_truth))) throw Error("SYSTEM_RESPONSE_INVALID");
      return { id: s.id as string, name: s.name as string, lifecycle: s.lifecycle as string,
        health: s.health, owner: { id: owner.id as string, type: owner.type as string }, source_of_truth: s.source_of_truth as string };
    });
    return records.length ? { state: "AVAILABLE", records } : { state: "EMPTY" };
  } catch { return { state: "UNAVAILABLE" }; }
}

function unavailable(state: "EMPTY" | "RESTRICTED" | "UNAVAILABLE", kind: string): string {
  const message = state === "RESTRICTED" ? `Access to ${kind} is restricted for this session.`
    : state === "EMPTY" ? `No authorized ${kind} returned.` : `${kind} are currently unavailable. No sample data is substituted.`;
  return `<p role="status">${message}</p>`;
}

export function renderProjectRegistry(view: ProjectRegistryRead): string {
  const rows = view.state === "AVAILABLE" ? view.records.map(p => `<tr><td>${escape(p.name ?? "Name not provided")}<br><strong>${escape(p.scope)}</strong><br><small>${escape(p.id)}</small></td><td>${escape(p.environment)}</td><td>${escape(p.health)}</td><td>${escape(p.repository)}<br>${escape(p.branch)}<br>${escape(p.workroot)}</td></tr>`).join("") : "";
  return `<section class="panel" aria-label="Authorized registered projects"><div class="panel-head"><h2>Authorized registered projects</h2></div><div class="panel-body"><p>Source: authenticated project Portal. Only the returned project boundary is shown; this is not a global project inventory. Health is the bound environment status, not execution readiness.</p>${view.state === "AVAILABLE" ? `<div class="table-wrap"><table class="data-table"><caption>Registered project records (${view.records.length})</caption><thead><tr><th>Name / scope / identity</th><th>Environment</th><th>Bound environment health</th><th>Repository / branch / workroot binding</th></tr></thead><tbody>${rows}</tbody></table></div>` : unavailable(view.state, "project records")}</div></section>`;
}

export function renderSystemRegistry(view: SystemRegistryRead): string {
  const rows = view.state === "AVAILABLE" ? view.records.map(s => `<tr><td>${escape(s.name)}<br><small>${escape(s.id)}</small></td><td>${escape(s.lifecycle)}</td><td>${escape(s.health)}</td><td>${escape(s.owner.id)} · ${escape(s.owner.type)}</td><td>${escape(s.source_of_truth)}</td></tr>`).join("") : "";
  return `<section class="panel" aria-label="Authorized system records"><div class="panel-head"><h2>System records</h2><span class="permission-note">Read-only Registry view</span></div><div class="panel-body"><p>Source: authenticated Control Plane. System records are distinct from project records and their Portal bindings. No project-system relationship or live connectivity is inferred.</p>${view.state === "AVAILABLE" ? `<div class="table-wrap"><table class="data-table"><caption>Authorized systems</caption><thead><tr><th>System / identity</th><th>Lifecycle</th><th>Reported health</th><th>Owner</th><th>Source of truth</th></tr></thead><tbody>${rows}</tbody></table></div>` : unavailable(view.state, "system records")}</div></section>`;
}
