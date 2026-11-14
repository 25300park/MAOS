import type { ClassificationPortalView } from "./classification.js";
import type { RoutingPortalView } from "./routing.js";
import type { ProjectRegistryRead, SystemRegistryRead } from "./registry-reads.js";

export function renderCeoDashboard(projects: ProjectRegistryRead | undefined, systems: SystemRegistryRead | undefined, canReadSystems: boolean): string {
  const count = (view: ProjectRegistryRead | SystemRegistryRead | undefined) =>
    view?.state === "AVAILABLE" ? view.records.length : view?.state === "EMPTY" ? 0 : "NOT_AVAILABLE";
  const state = (view: ProjectRegistryRead | SystemRegistryRead | undefined) =>
    view?.state === "RESTRICTED" ? "접근 제한 · RESTRICTED" : !view || view.state === "UNAVAILABLE" ? "조회 정보 없음 · NOT_AVAILABLE" : "현재 세션의 조회 결과";
  const unknown = systems?.state === "AVAILABLE" ? systems.records.filter(s => s.health === "UNKNOWN").length : systems?.state === "EMPTY" ? 0 : "NOT_AVAILABLE";
  return `<section class="panel" aria-label="CEO 운영 현황"><div class="panel-head"><h2>회사 운영 현황</h2><span class="permission-note">Registry 기반 · 읽기 전용</span></div><div class="panel-body"><p>현재 계정에 반환된 조회 범위이며 회사 전체 건수가 아닙니다. 연결 상태나 업무 실행 성공을 추정하지 않습니다.</p><div class="card-grid"><article class="entity-card"><h3>프로젝트</h3><strong data-metric="projects">${count(projects)}</strong><p>${state(projects)}</p></article>${canReadSystems ? `<article class="entity-card"><h3>시스템</h3><strong data-metric="systems">${count(systems)}</strong><p>${state(systems)}</p></article><article class="entity-card"><h3>Health 확인 필요</h3><strong data-metric="unknown-systems">${unknown}</strong><p>UNKNOWN — 상태가 확인되지 않은 시스템 수. 다른 상태의 안전성이나 전체 장애 수를 의미하지 않습니다.</p></article>` : ""}</div><p>프로젝트 운영 상태·업무 Blocker: NOT_AVAILABLE — 기존 Registry 계약에 없는 정보입니다.</p>${canReadSystems ? '<p>AIDOS: Not connected — 실행 상태 조회 미연결. Registry 등록 여부와 별개입니다.</p>' : ''}<nav aria-label="빠른 이동"><a class="btn" href="/projects#project-registry">프로젝트 상세</a>${canReadSystems ? ' <a class="btn" href="/systems">연결 시스템</a> <a class="btn" href="/systems/routing">요청 흐름 조회</a>' : ''}</nav></div></section>`;
}

const escape = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
// Presentation only: these are existing canonical states, not a second state store.
const attentionStates = new Set([
  "BLOCKED",
  "WAITING_HUMAN",
  "WAITING_AIDOS",
  "AIDOS_UNAVAILABLE",
  "WAITING_AIDOS_ONBOARDING",
  "WAITING_AIDOS_DELEGATION_INPUT",
]);

export function renderAttention(routing?: RoutingPortalView): string {
  const rows =
    routing?.streams.flatMap((stream) => {
      const current = stream.current;
      if (!current || current.stalenessState !== "CURRENT") return [];
      return [
        ...new Set([
          current.decisionState,
          current.developmentDelegationState,
          current.humanApprovalState,
          ...current.decisionReasonCodes,
        ]),
      ]
        .filter((state) => attentionStates.has(state))
        .map(
          (state) =>
            `<li data-attention-state="${state}">${escape(routing.requestId)} · ${escape(stream.purpose)} · <strong>${state}</strong> · Source: canonical routing v${current.routingVersion}</li>`,
        );
    }) ?? [];
  const incomplete =
    !routing ||
    routing.streams.length === 0 ||
    routing.streams.some(
      (stream) =>
        !stream.current || stream.current.stalenessState !== "CURRENT",
    ) ||
    routing.observations.some(
      (observation) => observation.result === "FAILURE",
    );
  return `<section class="panel" aria-label="Attention / blockers" data-source-kind="DERIVED_CURRENT"><div class="panel-head"><h2>Attention / blockers</h2></div><div class="panel-body">${rows.length ? `<ul>${rows.join("")}</ul>` : "<p>No attention items in the available current routing records.</p>"}${incomplete ? '<p role="status">NOT_AVAILABLE — current routing coverage is absent, incomplete or STALE. This does not establish that no blockers exist.</p>' : ""}<p class="permission-note">Only the selected request is covered. Project/system blocker, owner and last-update facts are NOT_AVAILABLE unless supplied by their canonical read contract. Sample Preview and Memory are never current-state authority.</p></div></section>`;
}

export function renderRequestOverview(
  routing?: RoutingPortalView,
  classification?: ClassificationPortalView,
): string {
  const matched =
    routing && classification?.requestId === routing.requestId
      ? classification.current
      : null;
  return `<section class="panel" aria-label="Request routing overview"><div class="panel-head"><h2>요청 흐름 조회 · Routing Flow</h2></div><div class="panel-body"><form method="get" action="/systems/routing"><p>기존 요청의 상태를 조회합니다. 새 업무를 생성하거나 실행하지 않습니다.</p><p>요청 → 분류 → 대상 → 라우팅 / 위임 상태</p><label for="routing-request-id">기존 요청 ID (Existing request ID)</label><input id="routing-request-id" name="requestId" required maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" autocomplete="off"><button class="btn" type="submit">요청 흐름 조회</button></form><p>Read-only lookup; existing source permissions apply. No request is created or executed.</p><p>Request: ${escape(routing?.requestId ?? "NOT_AVAILABLE")} → Classification: ${escape(matched?.domain ?? "NOT_AVAILABLE")} → Target: ${matched?.domain === "DEVELOPMENT" ? "AIDOS (required development authority; not proof of execution)" : "NOT_AVAILABLE"}</p><p>No MAOS-native execution fallback. Domain targets are not inferred from console links or Memory.</p></div></section>${renderAttention(routing)}`;
}

export function samplePreview(content: string): string {
  return `<section data-source-kind="SAMPLE_PREVIEW"><div class="callout"><strong>Sample Preview</strong><p>Static demonstration only; not current operational evidence. Sample timestamps are not current.</p></div>${content
    .replaceAll(">LIVE</span>", ">SAMPLE</span>")
    .replaceAll("Live activity", "Sample activity")
    .replaceAll("Live operating context", "Sample operating context")
    .replace(/<button\b(?![^>]*\bdisabled)[^>]*>/gu, (match) =>
      match.replace(
        "<button",
        '<button disabled title="Sample Preview — action unavailable"',
      ),
    )}</section>`;
}
