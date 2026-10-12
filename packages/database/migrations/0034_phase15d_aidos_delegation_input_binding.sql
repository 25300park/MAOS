ALTER TABLE governance.request_routing_decision_versions
  ADD COLUMN aidos_required_capabilities text[],
  ADD COLUMN aidos_delegation_input jsonb,
  ADD COLUMN aidos_snapshot_binding jsonb;

ALTER TABLE governance.request_routing_decision_versions
  ADD CONSTRAINT request_routing_decision_versions_aidos_delegation_input_check
  CHECK (
    (canonical_domain = 'DEVELOPMENT'
      AND jsonb_typeof(aidos_delegation_input) = 'object'
      AND aidos_delegation_input ?& ARRAY[
        'developmentIntent',
        'requestedRoleClass',
        'requiredCapabilities',
        'preferredCapabilities',
        'policyConstraints',
        'contextRefs',
        'artifactRefs',
        'priority',
        'aidosProjectRef',
        'delegationRequestId'
      ]
      AND jsonb_typeof(aidos_delegation_input->'requiredCapabilities') = 'array'
      AND jsonb_array_length(aidos_delegation_input->'requiredCapabilities') > 0
      AND jsonb_typeof(aidos_delegation_input->'preferredCapabilities') = 'array'
      AND jsonb_typeof(aidos_delegation_input->'policyConstraints') = 'array'
      AND jsonb_typeof(aidos_delegation_input->'contextRefs') = 'array'
      AND jsonb_typeof(aidos_delegation_input->'artifactRefs') = 'array'
      AND jsonb_typeof(aidos_delegation_input->'priority') = 'number'
      AND (aidos_delegation_input->>'priority')::integer BETWEEN 0 AND 100
      AND aidos_delegation_input->'requiredCapabilities' =
        to_jsonb(aidos_required_capabilities)
      AND aidos_delegation_input->>'aidosProjectRef' = aidos_project_ref)
    OR
    (canonical_domain <> 'DEVELOPMENT'
      AND aidos_delegation_input IS NULL)
  );

ALTER TABLE governance.request_routing_decision_versions
  ADD CONSTRAINT request_routing_decision_versions_aidos_capabilities_check
  CHECK (
    (canonical_domain = 'DEVELOPMENT'
      AND aidos_required_capabilities IS NOT NULL
      AND cardinality(aidos_required_capabilities) > 0
      AND aidos_required_capabilities <@ ARRAY[
        'plan','execute','review','verify','release','reflect'
      ]::text[])
    OR
    (canonical_domain <> 'DEVELOPMENT'
      AND aidos_required_capabilities IS NULL)
  );

ALTER TABLE governance.request_routing_decision_versions
  ADD CONSTRAINT request_routing_decision_versions_aidos_snapshot_binding_check
  CHECK (
    (canonical_domain = 'DEVELOPMENT'
      AND (
        (development_delegation_state = 'READY_TO_DELEGATE'
          AND jsonb_typeof(aidos_snapshot_binding) = 'object'
          AND aidos_snapshot_binding ?& ARRAY[
            'snapshotId',
            'authorityEpoch',
            'requestDigest',
            'projectionBindings'
          ]
          AND (aidos_snapshot_binding->>'authorityEpoch') ~ '^sha256:[a-f0-9]{64}$'
          AND (aidos_snapshot_binding->>'requestDigest') ~ '^sha256:[a-f0-9]{64}$'
          AND jsonb_typeof(aidos_snapshot_binding->'projectionBindings') = 'array'
          AND jsonb_array_length(aidos_snapshot_binding->'projectionBindings') = 3
          AND aidos_snapshot_binding->'projectionBindings'->0->>'projectionType' =
            'AIDOS_PROJECT_REGISTRATION_PROJECTION'
          AND aidos_snapshot_binding->'projectionBindings'->1->>'projectionType' =
            'AIDOS_RUNTIME_AVAILABILITY_PROJECTION'
          AND aidos_snapshot_binding->'projectionBindings'->2->>'projectionType' =
            'AIDOS_DELEGATION_ELIGIBILITY_PROJECTION'
          AND aidos_snapshot_binding->'projectionBindings' @>
            '[{"projectionType":"AIDOS_PROJECT_REGISTRATION_PROJECTION"}]'::jsonb
          AND aidos_snapshot_binding->'projectionBindings' @>
            '[{"projectionType":"AIDOS_RUNTIME_AVAILABILITY_PROJECTION"}]'::jsonb
          AND aidos_snapshot_binding->'projectionBindings' @>
            '[{"projectionType":"AIDOS_DELEGATION_ELIGIBILITY_PROJECTION"}]'::jsonb)
        OR
        (development_delegation_state <> 'READY_TO_DELEGATE'
          AND aidos_snapshot_binding IS NULL)
      ))
    OR
    (canonical_domain <> 'DEVELOPMENT'
      AND aidos_snapshot_binding IS NULL)
  );
