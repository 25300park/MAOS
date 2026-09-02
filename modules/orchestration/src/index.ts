import type {
  ActorType,
  GovernanceDecision,
  TaskStatus,
} from "@maos/contracts";

export type { TaskStatus } from "@maos/contracts";

export type WorkflowGate =
  | "DEPENDENCY_GATE"
  | "REVIEW_GATE"
  | "APPROVAL_GATE"
  | "SECURITY_GATE"
  | "HUMAN_INPUT_GATE";
export type WorkflowStatus =
  | "RUNNING"
  | "WAITING_DEPENDENCY"
  | "WAITING_HUMAN"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type DependencyType = "REQUIRES" | "BLOCKS" | "RELATED";
export interface ActorReference {
  id: string;
  type: ActorType;
}
export interface WorkEvent {
  actor: ActorReference;
  aggregate_id: string;
  aggregate_type: "PROJECT" | "TASK" | "WORKFLOW";
  correlation_id: string;
  name: string;
  project_id: string;
  version: number;
}
export interface WorkMutation<T> {
  entity: T;
  event: WorkEvent | null;
}
export interface Project {
  archived_at: string | null;
  department_id: string;
  id: string;
  name: string;
  organization_id: string;
  owner: ActorReference;
  version: number;
}
export interface Task {
  id: string;
  owner: ActorReference;
  parent_task_id: string | null;
  project_id: string;
  status: TaskStatus;
  task_type: string;
  title: string;
  version: number;
}
export interface WorkflowStep {
  depends_on: readonly string[];
  gate: WorkflowGate;
  key: string;
}
export interface WorkflowDefinition {
  id: string;
  name: string;
  owner: ActorReference;
  project_id: string;
  steps: readonly WorkflowStep[];
  version: number;
}
export interface WorkflowInstance {
  definition_id: string;
  definition_version: number;
  id: string;
  project_id: string;
  status: WorkflowStatus;
  version: number;
}

export class WorkError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: [
    "QUEUED",
    "WAITING_DEPENDENCY",
    "WAITING_HUMAN",
    "WAITING_APPROVAL",
    "BLOCKED",
    "CANCELLED",
  ],
  QUEUED: [
    "IN_PROGRESS",
    "WAITING_DEPENDENCY",
    "WAITING_HUMAN",
    "WAITING_APPROVAL",
    "BLOCKED",
    "CANCELLED",
  ],
  IN_PROGRESS: [
    "WAITING_DEPENDENCY",
    "WAITING_HUMAN",
    "WAITING_APPROVAL",
    "REVIEW",
    "BLOCKED",
    "FAILED",
    "CANCELLED",
  ],
  WAITING_DEPENDENCY: ["READY", "QUEUED", "BLOCKED", "CANCELLED"],
  WAITING_HUMAN: ["READY", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  WAITING_APPROVAL: ["READY", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  REVIEW: ["COMPLETED", "REVISE", "BLOCKED", "CANCELLED"],
  REVISE: ["READY", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  BLOCKED: ["READY", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["READY", "CANCELLED"],
  CANCELLED: [],
};
const WORKFLOW_TRANSITIONS: Readonly<
  Record<WorkflowStatus, readonly WorkflowStatus[]>
> = {
  RUNNING: [
    "WAITING_DEPENDENCY",
    "WAITING_HUMAN",
    "WAITING_APPROVAL",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ],
  WAITING_DEPENDENCY: ["RUNNING", "FAILED", "CANCELLED"],
  WAITING_HUMAN: ["RUNNING", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
type MutationContext = {
  actor: ActorReference;
  correlation_id: string;
  idempotency_key: string;
};

export class WorkEngine {
  private readonly projects = new Map<string, Project>();
  private readonly tasks = new Map<string, Task>();
  private readonly dependencies = new Map<string, Set<string>>();
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly instances = new Map<string, WorkflowInstance>();
  private readonly operations = new Map<string, unknown>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  private once<T>(scope: string, key: string, operation: () => T): T {
    const id = `${scope}:${key}`;
    if (this.operations.has(id)) return this.operations.get(id) as T;
    const result = operation();
    this.operations.set(id, result);
    return result;
  }
  private event(
    input: MutationContext,
    projectId: string,
    type: WorkEvent["aggregate_type"],
    id: string,
    name: string,
    version: number,
  ): WorkEvent {
    return {
      actor: input.actor,
      aggregate_id: id,
      aggregate_type: type,
      correlation_id: input.correlation_id,
      name,
      project_id: projectId,
      version,
    };
  }
  createProject(
    input: MutationContext & Omit<Project, "archived_at" | "version">,
  ): WorkMutation<Project> {
    return this.once("project:create", input.idempotency_key, () => {
      if (input.owner.type !== "HUMAN")
        throw new WorkError("PROJECT_OWNER_MUST_BE_HUMAN");
      if (this.projects.has(input.id))
        throw new WorkError("PROJECT_ALREADY_EXISTS");
      const entity: Project = {
        archived_at: null,
        department_id: input.department_id,
        id: input.id,
        name: input.name,
        organization_id: input.organization_id,
        owner: input.owner,
        version: 1,
      };
      this.projects.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.id,
          "PROJECT",
          entity.id,
          "PROJECT.CREATED",
          1,
        ),
      };
    });
  }
  archiveProject(
    input: MutationContext & { expected_version: number; project_id: string },
  ): WorkMutation<Project> {
    return this.once("project:archive", input.idempotency_key, () => {
      const project = this.getProject(input.project_id);
      this.expectVersion(project.version, input.expected_version);
      const entity = {
        ...project,
        archived_at: this.now().toISOString(),
        version: project.version + 1,
      };
      this.projects.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.id,
          "PROJECT",
          entity.id,
          "PROJECT.ARCHIVED",
          entity.version,
        ),
      };
    });
  }
  createTask(
    input: MutationContext &
      Omit<Task, "parent_task_id" | "version"> & { parent_task_id?: string },
  ): WorkMutation<Task> {
    return this.once("task:create", input.idempotency_key, () => {
      const project = this.getProject(input.project_id);
      if (project.archived_at) throw new WorkError("PROJECT_ARCHIVED");
      if (this.tasks.has(input.id)) throw new WorkError("TASK_ALREADY_EXISTS");
      if (
        input.parent_task_id &&
        this.getTask(input.parent_task_id).project_id !== input.project_id
      )
        throw new WorkError("PARENT_PROJECT_MISMATCH");
      const entity: Task = {
        id: input.id,
        owner: input.owner,
        parent_task_id: input.parent_task_id ?? null,
        project_id: input.project_id,
        status: input.status,
        task_type: input.task_type,
        title: input.title,
        version: 1,
      };
      this.tasks.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.project_id,
          "TASK",
          entity.id,
          "TASK.CREATED",
          1,
        ),
      };
    });
  }
  addDependency(input: {
    depends_on_task_id: string;
    dependency_type: DependencyType;
    idempotency_key: string;
    task_id: string;
  }): void {
    this.once("task:dependency", input.idempotency_key, () => {
      const task = this.getTask(input.task_id),
        dependency = this.getTask(input.depends_on_task_id);
      if (task.project_id !== dependency.project_id)
        throw new WorkError("DEPENDENCY_PROJECT_MISMATCH");
      if (
        task.id === dependency.id ||
        (input.dependency_type !== "RELATED" &&
          this.reaches(dependency.id, task.id))
      )
        throw new WorkError("DEPENDENCY_CYCLE");
      if (input.dependency_type !== "RELATED") {
        const set = this.dependencies.get(task.id) ?? new Set<string>();
        set.add(dependency.id);
        this.dependencies.set(task.id, set);
      }
    });
  }
  transitionTask(
    input: MutationContext & {
      approval?: GovernanceDecision;
      expected_version: number;
      task_id: string;
      to: TaskStatus;
    },
  ): WorkMutation<Task> {
    return this.once("task:transition", input.idempotency_key, () => {
      const task = this.getTask(input.task_id);
      if (task.status === input.to) return { entity: task, event: null };
      this.expectVersion(task.version, input.expected_version);
      if (!TASK_TRANSITIONS[task.status].includes(input.to))
        throw new WorkError("INVALID_TASK_TRANSITION", {
          from: task.status,
          to: input.to,
        });
      if (
        task.status === "WAITING_APPROVAL" &&
        (input.to === "READY" || input.to === "IN_PROGRESS") &&
        !input.approval?.allowed
      )
        throw new WorkError("APPROVAL_REQUIRED");
      let status = input.to;
      if (
        (status === "QUEUED" || status === "IN_PROGRESS") &&
        this.hasIncompleteDependencies(task.id)
      )
        status = "WAITING_DEPENDENCY";
      const entity = { ...task, status, version: task.version + 1 };
      this.tasks.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.project_id,
          "TASK",
          entity.id,
          `TASK.${status}`,
          entity.version,
        ),
      };
    });
  }
  createWorkflowDefinition(
    input: MutationContext & Omit<WorkflowDefinition, "version">,
  ): WorkMutation<WorkflowDefinition> {
    return this.once("workflow:create", input.idempotency_key, () => {
      this.getProject(input.project_id);
      if (this.definitions.has(input.id))
        throw new WorkError("WORKFLOW_ALREADY_EXISTS");
      this.validateSteps(input.steps);
      const entity: WorkflowDefinition = {
        id: input.id,
        name: input.name,
        owner: input.owner,
        project_id: input.project_id,
        steps: input.steps,
        version: 1,
      };
      this.definitions.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.project_id,
          "WORKFLOW",
          entity.id,
          "WORKFLOW.CREATED",
          1,
        ),
      };
    });
  }
  startWorkflow(
    input: MutationContext & { definition_id: string; id: string },
  ): WorkMutation<WorkflowInstance> {
    return this.once("workflow:start", input.idempotency_key, () => {
      const definition = this.getDefinition(input.definition_id);
      const entity: WorkflowInstance = {
        definition_id: definition.id,
        definition_version: definition.version,
        id: input.id,
        project_id: definition.project_id,
        status: "RUNNING",
        version: 1,
      };
      this.instances.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.project_id,
          "WORKFLOW",
          entity.id,
          "WORKFLOW.RUNNING",
          1,
        ),
      };
    });
  }
  transitionWorkflow(
    input: MutationContext & {
      approval?: GovernanceDecision;
      expected_version: number;
      instance_id: string;
      to: WorkflowStatus;
    },
  ): WorkMutation<WorkflowInstance> {
    return this.once("workflow:transition", input.idempotency_key, () => {
      const instance = this.getInstance(input.instance_id);
      if (instance.status === input.to)
        return { entity: instance, event: null };
      this.expectVersion(instance.version, input.expected_version);
      if (!WORKFLOW_TRANSITIONS[instance.status].includes(input.to))
        throw new WorkError("INVALID_WORKFLOW_TRANSITION", {
          from: instance.status,
          to: input.to,
        });
      if (
        instance.status === "WAITING_APPROVAL" &&
        input.to === "RUNNING" &&
        !input.approval?.allowed
      )
        throw new WorkError("APPROVAL_REQUIRED");
      const entity = {
        ...instance,
        status: input.to,
        version: instance.version + 1,
      };
      this.instances.set(entity.id, entity);
      return {
        entity,
        event: this.event(
          input,
          entity.project_id,
          "WORKFLOW",
          entity.id,
          `WORKFLOW.${input.to}`,
          entity.version,
        ),
      };
    });
  }
  private getProject(id: string): Project {
    const value = this.projects.get(id);
    if (!value) throw new WorkError("PROJECT_NOT_FOUND");
    return value;
  }
  private getTask(id: string): Task {
    const value = this.tasks.get(id);
    if (!value) throw new WorkError("TASK_NOT_FOUND");
    return value;
  }
  private getDefinition(id: string): WorkflowDefinition {
    const value = this.definitions.get(id);
    if (!value) throw new WorkError("WORKFLOW_NOT_FOUND");
    return value;
  }
  private getInstance(id: string): WorkflowInstance {
    const value = this.instances.get(id);
    if (!value) throw new WorkError("WORKFLOW_INSTANCE_NOT_FOUND");
    return value;
  }
  private expectVersion(actual: number, expected: number): void {
    if (actual !== expected)
      throw new WorkError("VERSION_CONFLICT", { actual, expected });
  }
  private hasIncompleteDependencies(id: string): boolean {
    return [...(this.dependencies.get(id) ?? [])].some(
      (dependency) => this.getTask(dependency).status !== "COMPLETED",
    );
  }
  private reaches(
    from: string,
    target: string,
    visited = new Set<string>(),
  ): boolean {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return [...(this.dependencies.get(from) ?? [])].some((next) =>
      this.reaches(next, target, visited),
    );
  }
  private validateSteps(steps: readonly WorkflowStep[]): void {
    const keys = new Set(steps.map((step) => step.key));
    if (steps.length === 0 || keys.size !== steps.length)
      throw new WorkError("INVALID_WORKFLOW_DEFINITION");
    const graph = new Map(
      steps.map((step) => [step.key, new Set(step.depends_on)]),
    );
    for (const step of steps)
      for (const dependency of step.depends_on)
        if (
          !keys.has(dependency) ||
          this.reachesGraph(graph, dependency, step.key)
        )
          throw new WorkError("WORKFLOW_DEPENDENCY_CYCLE");
  }
  private reachesGraph(
    graph: Map<string, Set<string>>,
    from: string,
    target: string,
    visited = new Set<string>(),
  ): boolean {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return [...(graph.get(from) ?? [])].some((next) =>
      this.reachesGraph(graph, next, target, visited),
    );
  }
}
