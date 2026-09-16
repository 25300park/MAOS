# Phase 14J Traceability Register — Project Portal Integration Architecture

## Status

| Item                           | State             |
| ------------------------------ | ----------------- |
| Phase 14J                      | COMPLETE          |
| MAOS-029                       | APPROVED / FROZEN |
| MAOS-CR-014                    | APPROVED_C2       |
| Frozen v2.0 changed            | NO                |
| Runtime/integration activation | NOT AUTHORIZED    |
| Production changes             | NO                |
| Phase 14K readiness            | READY             |

## Requirement traceability

| Requirement                     | Canonical source                    | MAOS-029 section |
| ------------------------------- | ----------------------------------- | ---------------- |
| ProjectPortalIntegration schema | Phase 14J / MAOS-020                | 3                |
| Registry bindings               | MAOS-020                            | 4                |
| Environment mapping             | MAOS-020/023                        | 5                |
| Repository/Workroot mapping     | MAOS-019/020                        | 6                |
| Deployment mapping              | MAOS-020                            | 7                |
| Integration modes               | Phase 14J                           | 8                |
| Capability exposure             | MAOS-019/023                        | 9                |
| Native UI/deep link             | MAOS-020/027                        | 10               |
| Read projection                 | MAOS-020/026                        | 11               |
| Governed command                | MAOS-021 through 025                | 12               |
| Authority boundary              | MAOS-020/025                        | 13               |
| Authentication/delegation       | Existing Identity/Security          | 14               |
| Data classification             | MAOS-026                            | 15               |
| Health/freshness/degraded state | MAOS-020/026                        | 16               |
| Capability discovery            | Existing registries                 | 17               |
| Connector/adapter boundary      | Existing Tool/Integration semantics | 18               |
| Evidence/Audit correlation      | MAOS-026                            | 19               |
| Integration lifecycle           | Existing registry/change semantics  | 20               |
| Mobile projection               | MAOS-027/028                        | 21               |
| Initial integration inventory   | Phase 14J                           | 22               |
| Compatibility                   | MAOS-018 through 028                | 24               |

## Decision register

| Decision | Summary                                                                             |
| -------- | ----------------------------------------------------------------------------------- |
| D14J-001 | Use a versioned Project/System/environment registry binding.                        |
| D14J-002 | Keep external Systems authoritative for business state and native actions.          |
| D14J-003 | Define five composable non-authoritative integration modes.                         |
| D14J-004 | Route external mutations through existing governed command/execution machinery.     |
| D14J-005 | Prefer allowlisted native deep links over embedded external UIs.                    |
| D14J-006 | Limit connectors to protocol translation and transport.                             |
| D14J-007 | Fail closed on stale registry, authority, capability, health, or environment state. |

## Risk register

| Risk                                                     | Control                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| R14J-001 Projection becomes shadow SoT                   | Source attribution, freshness, bounded fields, no write-back |
| R14J-002 Registry drift targets wrong System/environment | Exact versioned refs and revalidation                        |
| R14J-003 Direct UI action bypasses governance            | Canonical CommandEnvelope and Task/Run/Tool path             |
| R14J-004 Credential/delegation leakage                   | Secret isolation and bounded delegation                      |
| R14J-005 Connector accumulates domain logic              | Schema/transport-only boundary                               |
| R14J-006 Degraded fallback broadens authority            | No broader fallback; explicit stale/degraded state           |
| R14J-007 Correlation leaks sensitive data                | Opaque refs, classification, redaction, minimization         |
| R14J-008 Inventory mode mistaken for authorization       | Candidate-intent label and activation validation             |

## Assumption register

| Assumption                                                                                    | Validation gate                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------- |
| A14J-001 Canonical registries provide stable typed refs and version/freshness metadata.       | C2 compatibility review             |
| A14J-002 External Systems expose approved routes/read interfaces/connectors as applicable.    | Future integration discovery        |
| A14J-003 Existing MAOS governance and execution contracts remain available.                   | C2 compatibility review             |
| A14J-004 System owners define classification, identity, environment, and capability policies. | Future implementation authorization |

## Frozen architecture preservation

- MAOS-018 through MAOS-028 changed: `NO`.
- Frozen MAOS v2.0 semantics changed: `NO`.
- New business SoT/shared database created: `NO`.
- New authorization/execution engine created: `NO`.
- Production authority changed: `NO`.

## C2 gate

- Human C2 approval: `GRANTED`.
- C2 blockers: `NONE`.
- Non-blocking findings: `NONE`.
- Candidate correction required: `NO`.
- Phase 14J status: `COMPLETE`.
- Phase 14K readiness: `READY` for separately authorized planning.
- Production changes: `NO`.
