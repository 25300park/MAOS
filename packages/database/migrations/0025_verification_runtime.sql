ALTER TABLE governance.routing_policy_versions
  DROP CONSTRAINT routing_policy_versions_routing_kind_check;

ALTER TABLE governance.routing_policy_versions
  ADD CONSTRAINT routing_policy_versions_routing_kind_check
  CHECK (routing_kind IN ('PLANNER', 'REVIEWER', 'EXECUTOR', 'VERIFIER'));

ALTER TABLE governance.governed_artifact_refs
  ADD COLUMN verification_handoff_id uuid REFERENCES governance.verification_handoffs(id),
  ADD COLUMN verification_outcome text CHECK (verification_outcome IN (
    'PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE', 'CONFLICTED', 'ERROR', 'CANCELLED', 'EXPIRED'
  )),
  ADD COLUMN verification_resolution text CHECK (verification_resolution IN (
    'CLOSURE', 'REWORK', 'WAITING_HUMAN'
  )),
  ADD COLUMN rework_handoff_ref text CHECK (
    rework_handoff_ref IS NULL OR length(trim(rework_handoff_ref)) > 0
  ),
  ADD CONSTRAINT governed_artifact_refs_verification_required_fields_check CHECK (
    (artifact_kind = 'VERIFICATION'
      AND verification_handoff_id IS NOT NULL
      AND verification_outcome IS NOT NULL
      AND verification_resolution IS NOT NULL)
    OR
    (artifact_kind <> 'VERIFICATION'
      AND verification_handoff_id IS NULL
      AND verification_outcome IS NULL
      AND verification_resolution IS NULL
      AND rework_handoff_ref IS NULL)
  ),
  ADD CONSTRAINT governed_artifact_refs_verification_resolution_consistency_check CHECK (
    (verification_resolution = 'CLOSURE' AND verification_outcome = 'PASS'
      AND rework_handoff_ref IS NULL)
    OR (verification_resolution = 'REWORK' AND verification_outcome <> 'PASS'
      AND rework_handoff_ref IS NOT NULL)
    OR (verification_resolution = 'WAITING_HUMAN' AND verification_outcome <> 'PASS'
      AND rework_handoff_ref IS NULL)
    OR artifact_kind <> 'VERIFICATION'
  );

CREATE INDEX governed_artifact_refs_verification_outcome_idx
  ON governance.governed_artifact_refs (
    verification_handoff_id, verification_outcome, created_at
  )
  WHERE artifact_kind = 'VERIFICATION';
