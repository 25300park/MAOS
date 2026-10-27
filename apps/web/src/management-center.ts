import type { ClassificationPortalView } from "./classification.js";
import type { RoutingPortalView } from "./routing.js";

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
  return `<section class="panel" aria-label="Request routing overview"><div class="panel-head"><h2>Routing Flow</h2></div><div class="panel-body"><form method="get" action="/systems/routing"><p>Request → classification → target → routing / delegation state</p><label for="routing-request-id">Existing request ID</label><input id="routing-request-id" name="requestId" required maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}" autocomplete="off"><button class="btn" type="submit">Read authorized routing</button></form><p>Read-only lookup; existing source permissions apply. No request is created or executed.</p><p>Request: ${escape(routing?.requestId ?? "NOT_AVAILABLE")} → Classification: ${escape(matched?.domain ?? "NOT_AVAILABLE")} → Target: ${matched?.domain === "DEVELOPMENT" ? "AIDOS (required development authority; not proof of execution)" : "NOT_AVAILABLE"}</p><p>No MAOS-native execution fallback. Domain targets are not inferred from console links or Memory.</p></div></section>${renderAttention(routing)}`;
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
