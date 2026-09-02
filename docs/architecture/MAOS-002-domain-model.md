# MAOS-002 Domain Model

| 항목 | 값 |
|---|---|
| Document ID | MAOS-002 |
| Document Type | Domain Model |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Canonical Domains
Organization, Identity / Actor, Department, Project, System / Integration, Work, AI Workforce, Execution, Knowledge / Memory, Governance, Communication, Employee Personal Work, Notification, Audit / Observability, Quality, Delivery, Operations.

## 2. Core Entities
Organization, Department, HumanActor, Membership, Role, Permission, Delegation, Project, ProjectMember, Task, TaskDependency, TaskAssignment, WorkflowDefinition, WorkflowInstance, Agent, AgentDefinition, Model, Runner, Skill, Tool, Run, ToolCall, Artifact, Evidence, MemoryReference, MemoryCandidate, Decision, Review, Approval, ApprovalStep, Policy, AuthorityRule, Conversation, Participant, Message, ContextLink, Attachment, WorkLog, Reminder, DailyReview, PersonalJournal, MoodEntry, System, Integration, ExternalResourceReference, TestRun, TestSuiteResult, TestCaseResult, Environment, Build, Release, Deployment, DeploymentVerification, Service, Runbook, ChangeRecord, Incident, IncidentEvent, Alert, Notification, Event, AuditRecord.

## 3. Actor
Canonical Actor Type: HUMAN, AGENT, SYSTEM.

## 4. Project Roles
OWNER, LEAD, MEMBER, REVIEWER, APPROVER, OBSERVER.

## 5. System Types
DOMAIN_APPLICATION, AI_AGENT_SYSTEM, PUBLIC_PLATFORM, INTERNAL_PLATFORM, INFRASTRUCTURE, MEMORY_SYSTEM, EXTERNAL_SERVICE.

## 6. Execution Chain
`Project → Task → Assignment → Run → Artifact`

## 7. Review
PASS, REVISE, BLOCK.

## 8. Approval Lifecycle
PENDING, APPROVED, REJECTED, EXPIRED, REVOKED, CANCELLED.
Approval Validity: VALID, STALE, TARGET_MISMATCH, VERSION_MISMATCH, AUTHORITY_INVALID, POLICY_INVALID, CONSUMED.

## 9. Chat-to-Work Candidates
CREATE_TASK, UPDATE_TASK, CREATE_DECISION, REQUEST_APPROVAL, UPDATE_CRM, CREATE_REMINDER.

## 10. Version-required Entities
AgentDefinition, WorkflowDefinition, Skill, Artifact, Policy, Integration Contract, Architecture Document.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
