ALTER TABLE identity.assignment_permissions
  DROP CONSTRAINT assignment_permissions_risk_check;

ALTER TABLE identity.assignment_permissions
  ADD CONSTRAINT assignment_permissions_risk_check
  CHECK (risk IN ('R0', 'R1', 'R2'));
