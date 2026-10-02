ALTER TABLE identity.assignment_permissions
  DROP CONSTRAINT assignment_permissions_risk_check;

ALTER TABLE identity.assignment_permissions
  ADD CONSTRAINT assignment_permissions_risk_check
  CHECK (risk IN ('R1', 'R2'));

ALTER TABLE governance.routing_policy_versions
  ADD COLUMN approval_requirement text NOT NULL DEFAULT 'REQUIRED',
  ADD CONSTRAINT routing_policy_versions_approval_requirement_check
    CHECK (
      approval_requirement IN ('REQUIRED', 'NOT_REQUIRED')
      AND (approval_requirement = 'REQUIRED' OR max_risk_class = 'R0')
    );
