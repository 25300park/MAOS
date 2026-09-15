# MAOS Change Request Register

Architecture changes must follow the MAOS change-governance process. A proposed Change Request has no runtime, provider, production, or deployment authority until its applicable approval and subsequent implementation gates are separately satisfied.

| Change Request | Class                 | Subject                                  | Status                   | Production authority |
| -------------- | --------------------- | ---------------------------------------- | ------------------------ | -------------------- |
| `MAOS-CR-001`  | C2 Minor Architecture | Connect AI pattern adoption              | PROPOSED / USER-DIRECTED | NONE                 |
| `MAOS-CR-002`  | C2 Minor Architecture | MAOS v1.1 candidate adoption             | APPROVED                 | NONE                 |
| `MAOS-CR-003`  | C2 Minor Architecture | REL-001 Phase 1C Staging Session ingress | APPROVED                 | NONE                 |
| `MAOS-CR-004`  | C2 Minor Architecture | Governed Staging Core tenancy bootstrap  | APPROVED_C2              | NONE                 |

## MAOS-CR-003 gate

- Frozen architecture conflict: `NO`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`
- Staging implementation: `AUTHORIZED_FOR_IMPLEMENTATION`

## MAOS-CR-004 gate

- Frozen architecture conflict: `NO`
- Migration impact: `NO`
- Runtime implementation: `BLOCKED_PENDING_IMPLEMENTATION_AUTHORIZATION`
- Production implementation authorization: `NO`
- Production deployment authorization: `NO`
