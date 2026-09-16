# MAOS Change Request Register

Architecture changes must follow the MAOS change-governance process. A proposed Change Request has no runtime, provider, production, or deployment authority until its applicable approval and subsequent implementation gates are separately satisfied.

| Change Request | Class                 | Subject                                        | Status                   | Production authority |
| -------------- | --------------------- | ---------------------------------------------- | ------------------------ | -------------------- |
| `MAOS-CR-001`  | C2 Minor Architecture | Connect AI pattern adoption                    | PROPOSED / USER-DIRECTED | NONE                 |
| `MAOS-CR-002`  | C2 Minor Architecture | MAOS v1.1 candidate adoption                   | APPROVED                 | NONE                 |
| `MAOS-CR-003`  | C2 Minor Architecture | REL-001 Phase 1C Staging Session ingress       | APPROVED                 | NONE                 |
| `MAOS-CR-004`  | C2 Minor Architecture | Governed Staging Core tenancy bootstrap        | APPROVED_C2              | NONE                 |
| `MAOS-CR-005`  | C2 Minor Architecture | Company, Team, and Project portal architecture | APPROVED_C2              | NONE                 |
| `MAOS-CR-006`  | C2 Minor Architecture | Human Messenger and governed Command contract  | APPROVED_C2              | NONE                 |
| `MAOS-CR-007`  | C2 Minor Architecture | Planner and Reviewer policy-evaluated routing  | APPROVED_C2              | NONE                 |
| `MAOS-CR-008`  | C2 Minor Architecture | Executor policy-evaluated routing              | APPROVED_C2              | NONE                 |
| `MAOS-CR-009`  | C2 Minor Architecture | Verification policy routing and handoff        | APPROVED_C2              | NONE                 |
| `MAOS-CR-010`  | C2 Minor Architecture | Human Approval Gate                            | APPROVED_C2              | NONE                 |
| `MAOS-CR-011`  | C2 Minor Architecture | Evidence and Audit governance                  | APPROVED_C2              | NONE                 |
| `MAOS-CR-012`  | C2 Minor Architecture | Mobile Messenger architecture                  | APPROVED_C2              | NONE                 |
| `MAOS-CR-013`  | C2 Minor Architecture | Approval UX architecture                       | APPROVED_C2              | NONE                 |
| `MAOS-CR-014`  | C2 Minor Architecture | Project Portal integration architecture        | APPROVED_C2              | NONE                 |
| `MAOS-CR-015`  | C2 Minor Architecture | Development Team Portal architecture           | APPROVED_C2              | NONE                 |

## MAOS-CR-003 gate

- Frozen architecture conflict: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`
- Staging implementation: `AUTHORIZED_FOR_IMPLEMENTATION`

## MAOS-CR-004 gate

- Frozen architecture conflict: `NO`
- Migration impact: `NO`
- Staging implementation: `AUTHORIZED_FOR_IMPLEMENTATION`
- Runtime implementation: `AUTHORIZED_FOR_IMPLEMENTATION` for Staging only
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-005 gate

- Candidate: `MAOS-020`
- Frozen baseline changed: `NO`
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Candidate corrections: `NONE`
- Phase 14A status: `COMPLETE`
- Phase 14B readiness: `READY`
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-006 gate

- Candidate: `MAOS-021`
- Frozen v1.2 changed: `NO`
- MAOS-021 status: `APPROVED / FROZEN` as MAOS Architecture v1.3
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14B status: `COMPLETE`
- Phase 14C readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-007 gate

- Candidate: `MAOS-022`
- Frozen v1.3 changed: `NO`
- MAOS-022 status: `APPROVED / FROZEN` as MAOS Architecture v1.4
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14C status: `COMPLETE`
- Phase 14D readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-008 gate

- Candidate: `MAOS-023`
- Frozen v1.4 changed: `NO`
- MAOS-023 status: `APPROVED / FROZEN` as MAOS Architecture v1.5
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14D status: `COMPLETE`
- Phase 14E readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-009 gate

- Candidate: `MAOS-024`
- Frozen v1.5 changed: `NO`
- MAOS-024 status: `APPROVED / FROZEN` as MAOS Architecture v1.6
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14E status: `COMPLETE`
- Phase 14F readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-010 gate

- Candidate: `MAOS-025`
- Frozen v1.6 changed: `NO`
- MAOS-025 status: `APPROVED / FROZEN` as MAOS Architecture v1.7
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14F status: `COMPLETE`
- Phase 14G readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-011 gate

- Candidate: `MAOS-026`
- Frozen v1.7 changed: `NO`
- MAOS-026 status: `APPROVED / FROZEN` as MAOS Architecture v1.8
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Candidate correction required: `NO`
- Phase 14G status: `COMPLETE`
- Phase 14H readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-012 gate

- Candidate: `MAOS-027`
- Frozen v1.8 changed: `NO`
- MAOS-027 status: `APPROVED / FROZEN` as MAOS Architecture v1.9
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14H status: `COMPLETE`
- Phase 14I readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-013 gate

- Candidate: `MAOS-028`
- Frozen v1.9 changed: `NO`
- MAOS-028 status: `APPROVED / FROZEN` as MAOS Architecture v2.0
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14I status: `COMPLETE`
- Phase 14J readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-014 gate

- Candidate: `MAOS-029`
- Frozen v2.0 changed: `NO`
- MAOS-029 status: `APPROVED / FROZEN` as MAOS Architecture v2.1
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Non-blocking findings: `NONE`
- Candidate correction required: `NO`
- Phase 14J status: `COMPLETE`
- Phase 14K readiness: `READY` for separately authorized planning
- Runtime implementation authorization: `NO`
- Integration activation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`

## MAOS-CR-015 gate

- Candidate: `MAOS-030`
- Frozen v2.1 changed: `NO`
- MAOS-030 status: `APPROVED / FROZEN` as MAOS Architecture v2.2
- Human C2 approval: `GRANTED`
- C2 blockers: `NONE`
- Candidate correction required: `NO`
- Phase 14K status: `COMPLETE`
- Phase 14L readiness: `BLOCKED_PENDING_RUNTIME_IMPLEMENTATION`
- Runtime implementation authorization: `NO`
- Provider/repository mutation authorization: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`
