# MAOS-CR-014 — Project Portal Integration Architecture

| Item                    | Value                             |
| ----------------------- | --------------------------------- |
| Change Request          | MAOS-CR-014                       |
| Class                   | C2 Minor Architecture             |
| Target                  | Adopt MAOS-029 as a v2.1 addition |
| Status                  | APPROVED_C2                       |
| Current frozen baseline | MAOS Architecture v2.0            |
| Runtime authority       | NONE                              |
| Integration authority   | NONE                              |
| Production authority    | NONE                              |
| Human C2 decision       | GRANTED — 2026-09-16              |

## 1. Change request

Adopt `MAOS-029 — Project Portal Integration Architecture` as the candidate v2.1 addition defining registry-driven bindings between MAOS Projects and independent external Systems.

## 2. Reason

MAOS-020 defines Project Portals and registry-driven composition, but frozen v2.0 does not define the cross-system binding, modes, connector boundary, delegation, freshness, degraded-state, or Evidence/Audit correlation contract required to integrate existing Systems without absorbing them.

## 3. Additive boundary

MAOS-029:

- preserves every external System as its domain SoT;
- references existing registries instead of duplicating them;
- routes mutations through existing governed command/execution machinery;
- prefers native deep links over embedded UIs;
- limits connectors to translation/transport;
- creates no shared business database or duplicate authorization engine;
- preserves MAOS-018 through MAOS-028; and
- grants no implementation, integration activation, provider, or Production authority.

## 4. Proposed contracts

1. `ProjectPortalIntegration` versioned binding.
2. System/Project/Environment/Repository/Workroot/Deployment bindings.
3. Five composable non-authoritative integration modes.
4. Capability exposure and version discovery.
5. Native UI/deep-link and read-projection contracts.
6. Governed external command path.
7. MAOS/external dual-authorization boundary.
8. Human/service/delegated identity patterns.
9. Data-classification and secret-exclusion boundary.
10. Health/freshness/degraded-state contract.
11. Connector/adapter boundary.
12. Cross-system Evidence/Audit correlation.
13. Integration lifecycle and mobile projection.
14. Initial non-authoritative integration inventory.

## 5. C2 acceptance criteria

C2 may approve only if review confirms:

- Project Portal Integration does not absorb Systems or duplicate their SoTs;
- registry bindings are exact, versioned, environment-specific, and non-authoritative;
- read projections preserve attribution, freshness, scope, environment, and classification;
- every external mutation uses existing MAOS governance and external authorization;
- connectors own no business logic or authority;
- degraded behavior is explicit and fail-closed;
- no unrestricted embedding, direct UI mutation, credential exposure, or cross-environment leakage exists;
- all named compatibility boundaries are preserved; and
- frozen v2.0 remains unchanged.

## 6. Implementation and production gate

This Change Request authorizes no runtime implementation or live integration. Human C2 approval makes Phase 14K architecture-ready for separately authorized planning only. Repository/database moves, connector deployment, provider changes, credentials, external-System changes, Production implementation, and deployment remain separately governed and unauthorized.

## 7. Current decision

- MAOS-CR-014: `APPROVED_C2`.
- MAOS-029: `APPROVED / FROZEN` as MAOS Architecture v2.1.
- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14J: `COMPLETE`.
- Phase 14K: `READY` for separately authorized planning.
- Frozen v2.0 changed: `NO`.
- Production changes: `NO`.
