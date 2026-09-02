# MAOS-003 Database Architecture

| 항목 | 값 |
|---|---|
| Document ID | MAOS-003 |
| Document Type | Database Architecture |
| Version | 1.0 |
| Status | FROZEN BASELINE |
| Architecture Baseline | MAOS Architecture v1.0 |

## 1. Principle
MAOS Core DB는 Control Plane DB다. Domain Master Data는 각 Domain System이 Source of Truth를 유지한다.

## 2. Logical Schemas
core, identity, work, ai, execution, governance, knowledge, integration, communication, notification, audit, private, quality, delivery, operations.

## 3. Major Tables
core: organizations, departments, projects, project_members, project_system_links, project_agent_links.
identity: humans, memberships, roles, permissions, role_permissions, actor_delegations.
work: tasks, task_dependencies, task_assignments, workflow_definitions, workflow_versions, workflow_instances, workflow_step_instances.
ai: agents, agent_definitions, agent_definition_versions, providers, models, runners, skills, skill_versions, tools, tool_capabilities, tool_permissions.
execution: runs, run_contexts, run_skills, run_tools, tool_calls, run_metrics, run_errors.
governance: reviews, approvals, approval_steps, decisions, policies, authority_rules.
knowledge: artifacts, artifact_versions, evidence, memory_references, memory_candidates.
integration: systems, integrations, capabilities, external_resource_references, integration_events, sync_state.
communication: conversations, participants, messages, context_links, attachments, reads, reactions.
audit: events, audit_records, security_events.
quality: test_runs, test_suite_results, test_case_results.
delivery: environments, builds, releases, release_artifacts, release_configuration_versions, deployments, deployment_verifications.
operations: services, runbooks, change_records, incidents, incident_events, alerts.

## 4. Agent Execution Location
MAOS_HOSTED, DOMAIN_HOSTED, EXTERNAL_RUNNER.

## 5. Tool Types
FILESYSTEM, CLI, API, DATABASE, BROWSER, MCP, DEPLOYMENT, VERSION_CONTROL, COMMUNICATION, STORAGE, OBSERVABILITY.

## 6. Tool Risk
R0 READ_ONLY, R1 LOW_RISK_WRITE, R2 CONTROLLED_WRITE, R3 EXTERNAL_ACTION, R4 CRITICAL_ACTION.

## 7. Tool Permission
ALLOW, DENY, ALLOW_WITH_APPROVAL.

## 8. Persistence Rules
UTC timestamps, FK/UNIQUE/CHECK, optimistic locking, soft delete/archive, secrets as references only, no direct domain DB writes by default, idempotency, correlation IDs, atomic Task claim.

## 9. Memory
MAOS는 reference/governance metadata를 저장하고 AI Memory Gateway를 재사용한다.

## 10. Personal Work
Private Personal data는 enterprise schema와 executive query에서 격리한다.

---

## Baseline Rule

이 문서는 **MAOS Architecture v1.0** 정본의 일부다. 구현 과정에서 의미 있는 변경이 필요하면 Silent Rewrite를 하지 않고 Change Governance(C1/C2/C3/C4)를 거쳐야 한다.
