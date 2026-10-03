ALTER TABLE governance.routing_policy_versions
  DROP CONSTRAINT routing_policy_versions_routing_kind_check;

ALTER TABLE governance.routing_policy_versions
  ADD CONSTRAINT routing_policy_versions_routing_kind_check
  CHECK (routing_kind IN ('PLANNER', 'REVIEWER', 'EXECUTOR')),
  ADD COLUMN requested_operations text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN required_tool_permission_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN allowed_repository_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN allowed_workroot_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN required_runner_capability_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD CONSTRAINT routing_policy_versions_executor_constraints_check CHECK (
    routing_kind <> 'EXECUTOR' OR (
      cardinality(requested_operations) > 0
      AND cardinality(required_tool_permission_refs) > 0
      AND cardinality(allowed_repository_ids) > 0
      AND cardinality(allowed_workroot_ids) > 0
      AND cardinality(required_runner_capability_refs) > 0
    )
  );
