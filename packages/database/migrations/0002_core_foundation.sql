CREATE TABLE core.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);
CREATE TABLE core.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE core.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  department_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, department_id, name),
  FOREIGN KEY (organization_id, department_id)
    REFERENCES core.departments(organization_id, id),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE identity.humans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  external_subject text,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (organization_id, external_subject),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE work.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES core.projects(id),
  parent_task_id uuid,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  task_type text NOT NULL CHECK (task_type IN (
    'PLANNING', 'ANALYSIS', 'RESEARCH', 'DESIGN', 'DEVELOPMENT',
    'DATABASE', 'TEST', 'QA', 'SECURITY', 'DEPLOYMENT', 'CONTENT',
    'MARKETING', 'VERIFICATION', 'REVIEW', 'APPROVAL_PREPARATION',
    'FOLLOW_UP', 'REPORTING', 'OPERATIONS'
  )),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'READY', 'QUEUED', 'IN_PROGRESS', 'WAITING_DEPENDENCY',
    'WAITING_HUMAN', 'WAITING_APPROVAL', 'REVIEW', 'REVISE', 'BLOCKED',
    'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (project_id, id),
  FOREIGN KEY (project_id, parent_task_id)
    REFERENCES work.tasks(project_id, id),
  CHECK (parent_task_id IS NULL OR parent_task_id <> id),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE work.task_dependencies (
  task_id uuid NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES work.tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL CHECK (dependency_type IN ('REQUIRES', 'BLOCKS', 'RELATED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, depends_on_task_id, dependency_type),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE governance.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES work.tasks(id),
  reviewer_actor_type text NOT NULL CHECK (reviewer_actor_type IN ('HUMAN', 'AGENT', 'SYSTEM')),
  reviewer_actor_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'REVISE', 'BLOCK')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE governance.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES work.tasks(id),
  target_type text NOT NULL CHECK (length(trim(target_type)) > 0),
  target_id uuid NOT NULL,
  target_version text NOT NULL CHECK (length(trim(target_version)) > 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REVOKED', 'CANCELLED'
  )),
  validity text NOT NULL DEFAULT 'VALID' CHECK (validity IN (
    'VALID', 'STALE', 'TARGET_MISMATCH', 'VERSION_MISMATCH',
    'AUTHORITY_INVALID', 'POLICY_INVALID', 'CONSUMED'
  )),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  UNIQUE (target_type, target_id, target_version, id),
  CHECK (updated_at >= created_at),
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);
