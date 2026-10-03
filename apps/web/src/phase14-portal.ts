import type { ControlRoomIdentity } from "./control-room.js";

export interface Phase14PortalView {
  project: {
    id: string;
    scope: string;
    environment: string;
    repository: string;
    branch: string;
    workroot: string;
    health: string;
  };
  command: {
    id: string;
    lifecycle_state: string;
    clarification_state: string;
    correlation_id: string;
    risk: string;
    unresolved_fields: readonly string[];
  };
  timeline: readonly {
    kind: string;
    label: string;
    state: string;
  }[];
  approval?: {
    request_id: string;
    requested_action: string;
    target: string;
    target_version: string;
    target_hash: string;
    scope: string;
    risk: string;
    environment: string;
    plan_ref: string;
    review_ref: string;
    evidence_refs: readonly string[];
    policy_ref: string;
    policy_version: string;
    fresh_until: string;
    expires_at: string;
    status: string;
    validity: string;
  };
  execution?: {
    executor: string;
    task_id: string;
    run_id: string;
    runner: string;
    workroot: string;
    tool_status: string;
    network_policy: string;
    outcome: string;
    control_target_id?: string;
  };
  verification?: {
    routing_state: string;
    verifier: string;
    run_id: string;
    evidence_sufficiency: string;
    outcome: string;
    resolution: string;
  };
  evidence: {
    count: number;
    critical_refs: readonly string[];
    audit_events: readonly string[];
    append_only: boolean;
    hash_chain_linked: boolean;
  };
  closure: { state: string; reason?: string };
}

const SECRET =
  /(?:bearer\s+|authorization|cookie|csrf|credential|password|secret|token|api[_-]?key)/iu;

function escape(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safe(value: unknown): string {
  const text = String(value);
  return SECRET.test(text) ? "[REDACTED]" : escape(text);
}

function fact(label: string, value: unknown): string {
  return `<div class="fact"><dt>${escape(label)}</dt><dd>${safe(value)}</dd></div>`;
}

function timeline(view?: Phase14PortalView): string {
  if (!view)
    return '<p class="permission-note">Submit or open a governed command to load its canonical timeline.</p>';
  return view.timeline
    .map(
      (entry) =>
        `<article class="activity"><time>${safe(entry.kind)}</time><strong>${safe(entry.label)}</strong><p>${safe(entry.state)}</p></article>`,
    )
    .join("");
}

function approval(view?: Phase14PortalView): string {
  if (!view?.approval)
    return '<p class="permission-note">No Human Approval request is currently bound to this command.</p>';
  const item = view.approval;
  return `<dl class="fact-grid" data-approval-binding
      data-request-id="${escape(item.request_id)}"
      data-target-id="${escape(item.target)}"
      data-target-version="${escape(item.target_version)}"
      data-target-hash="${escape(item.target_hash)}">
      ${fact("Requested action", item.requested_action)}${fact("Target", item.target)}
      ${fact("Target version", item.target_version)}${fact("Target hash", item.target_hash)}
      ${fact("Scope", item.scope)}${fact("Risk / environment", `${item.risk} / ${item.environment}`)}
      ${fact("Plan", item.plan_ref)}${fact("Review", item.review_ref)}
      ${fact("Evidence", item.evidence_refs.join(", "))}${fact("Policy", `${item.policy_ref} @ ${item.policy_version}`)}
      ${fact("Fresh until", item.fresh_until)}${fact("Expires", item.expires_at)}
      ${fact("Status", item.status)}${fact("Validity", item.validity)}
    </dl>`;
}

function execution(view?: Phase14PortalView): string {
  if (!view?.execution)
    return '<p class="permission-note">No Executor Task/Run has been dispatched.</p>';
  const item = view.execution;
  return `<dl class="fact-grid">${fact("Executor", item.executor)}${fact("Task", item.task_id)}${fact("Run", item.run_id)}${fact("Runner", item.runner)}${fact("Approved workroot", item.workroot)}${fact("Tool status", item.tool_status)}${fact("Network policy", item.network_policy)}${fact("Outcome", item.outcome)}</dl><p class="permission-note">Pause is unsupported by the MAOS-019 control contract.</p>`;
}

function verification(view?: Phase14PortalView): string {
  if (!view?.verification)
    return '<p class="permission-note">No Verification routing exists yet.</p>';
  const item = view.verification;
  return `<dl class="fact-grid">${fact("Routing", item.routing_state)}${fact("Verifier", item.verifier)}${fact("Verification Run", item.run_id)}${fact("Evidence sufficiency", item.evidence_sufficiency)}${fact("Outcome", item.outcome)}${fact("Resolution", item.resolution)}</dl><p class="permission-note">Verification PASS ≠ Approval.</p>`;
}

function evidence(view?: Phase14PortalView): string {
  if (!view)
    return '<p class="permission-note">Evidence and Audit remain read-only and non-authoritative.</p>';
  return `<dl class="fact-grid">${fact("Evidence records", view.evidence.count)}${fact("Critical evidence", view.evidence.critical_refs.join(", "))}${fact("Audit events", view.evidence.audit_events.map(safe).join(", "))}${fact("Integrity", `append-only ${view.evidence.append_only ? "YES" : "NO"}; hash-linked ${view.evidence.hash_chain_linked ? "YES" : "NO"}`)}</dl>`;
}

export function renderPhase14Portal(
  identity: ControlRoomIdentity,
  view?: Phase14PortalView,
): string {
  const commandForm = identity.permissions.includes("COMMAND:CREATE")
    ? `<form class="panel" data-phase14-command-form><div class="panel-head"><h2>Governed command</h2><span class="permission-note">Message ≠ authority</span></div><div class="panel-body"><label>Intent<textarea name="intent" maxlength="512" required></textarea></label><label>Requested outcome<textarea name="requested_outcome" maxlength="512" required></textarea></label><label>Task kind<select name="development_task_kind"><option value="">Clarification required</option><option>CODE_CHANGE</option><option>TEST_ONLY</option><option>DOCUMENTATION</option></select></label><button class="btn btn-primary" type="submit">Submit governed command</button></div></form>`
    : '<section class="panel"><div class="panel-body"><p>Command creation authority is unavailable.</p></div></section>';
  const clarification = `<form class="panel" data-phase14-clarification-form${view?.command.clarification_state === "REQUIRED" ? "" : " hidden"}><div class="panel-head"><h2>Clarification required</h2><span class="status status-waiting">WAITING_HUMAN</span></div><div class="panel-body"><label>Development task kind<select name="development_task_kind" required><option>CODE_CHANGE</option><option>TEST_ONLY</option><option>DOCUMENTATION</option></select></label><button class="btn btn-primary" type="submit">Resolve clarification</button></div></form>`;
  const project = view
    ? `<dl class="fact-grid">${fact("Project", view.project.id)}${fact("Environment", view.project.environment)}${fact("Repository", view.project.repository)}${fact("Branch / worktree", view.project.branch)}${fact("Workroot", view.project.workroot)}${fact("Health", view.project.health)}${fact("Command", view.command.lifecycle_state)}${fact("Closure", `${view.closure.state}${view.closure.reason ? ` / ${view.closure.reason}` : ""}`)}</dl>`
    : '<p class="permission-note">No governed command selected.</p>';
  const canApprove = identity.permissions.includes("APPROVAL:DECIDE");
  const canControl = identity.permissions.includes("LOCAL_EXECUTION:CANCEL");
  const approvalActions = canApprove
    ? '<div class="utility-row" data-approval-actions hidden><button class="btn btn-approval" type="button" data-decision="APPROVED">Approve exact target</button><button class="btn" type="button" data-decision="REJECTED">Reject</button><button class="btn" type="button" data-decision="CLARIFICATION_REQUIRED">Request clarification</button></div>'
    : '<p class="permission-note">Approval visibility does not grant decision authority.</p>';
  const runControls = canControl
    ? '<div class="utility-row" data-run-controls hidden><button class="btn" type="button" data-control="STOP">Stop</button><button class="btn" type="button" data-control="KILL">Kill</button></div>'
    : '<p class="permission-note">Control authority is unavailable.</p>';
  return `<div data-phase14-root data-can-approve="${canApprove}" data-can-control="${canControl}"><div class="page-heading"><div><div class="eyebrow">Project / Development Team</div><h1>Phase 14 Development Portal</h1><p>One governed Human operating surface. UI state is a projection; canonical runtime remains authoritative.</p></div><div class="date-block"><strong>STAGING ONLY</strong><span>Production actions unavailable</span></div></div>
    <section class="panel"><div class="panel-head"><h2>Project boundary</h2><span class="status status-healthy" data-phase14-health>${view ? safe(view.project.health) : "AWAITING COMMAND"}</span></div><div class="panel-body" data-phase14-project>${project}</div></section>
    <div class="content-grid" style="margin-top:18px"><div class="stack">${commandForm}${clarification}<section class="panel"><div class="panel-head"><h2>Command timeline</h2><span class="status status-waiting" data-phase14-command-state>${view ? safe(view.command.lifecycle_state) : "EMPTY"}</span></div><div class="panel-body timeline" data-phase14-timeline>${timeline(view)}</div></section><section class="panel"><div class="panel-head"><h2>Execution status</h2><span class="permission-note">Task ≠ Run</span></div><div class="panel-body" data-phase14-execution>${execution(view)}</div>${runControls}</section></div><aside class="stack"><section class="panel"><div class="panel-head"><h2>Human Approval</h2><span class="permission-note">Review ≠ Approval</span></div><div class="panel-body" data-phase14-approval>${approval(view)}</div>${approvalActions}</section><section class="panel"><div class="panel-head"><h2>Verification</h2><span class="permission-note">PASS ≠ Production Approval</span></div><div class="panel-body" data-phase14-verification>${verification(view)}</div></section><section class="panel"><div class="panel-head"><h2>Evidence / Audit</h2><span class="permission-note">Read-only</span></div><div class="panel-body" data-phase14-evidence>${evidence(view)}</div></section></aside></div>
    <div role="status" aria-live="polite" data-phase14-status></div>
    <script>${PHASE14_PORTAL_SCRIPT}</script></div>`;
}

const PHASE14_PORTAL_SCRIPT = String.raw`(()=>{
  const root='/api/v1'; const status=document.querySelector('[data-phase14-status]');
  const commandId=new URL(location.href).searchParams.get('command_id');
  const show=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value};
  const lines=value=>Object.entries(value||{}).map(([name,item])=>name.replaceAll('_',' ')+': '+(Array.isArray(item)?item.join(', '):String(item??''))).join('\n');
  const csrf=()=>document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-maos_csrf='))?.split('=').slice(1).join('=');
  const request=async(path,init={})=>{const headers=new Headers(init.headers||{});if(init.body){headers.set('content-type','application/json');if(!headers.has('idempotency-key'))headers.set('idempotency-key',crypto.randomUUID());const value=csrf();if(value)headers.set('x-maos-csrf-token',value)}const response=await fetch(root+path,{...init,headers,credentials:'include'});const payload=await response.json();if(!response.ok)throw new Error(payload?.error?.code||'REQUEST_FAILED');return payload.data};
  const load=()=>commandId?request('/phase14/portal?command_id='+encodeURIComponent(commandId)):Promise.resolve(null);
  const render=current=>{if(!current)return;const portal=document.querySelector('[data-phase14-root]');show('[data-phase14-health]',current.project.health);show('[data-phase14-project]',lines({...current.project,command:current.command.lifecycle_state,closure:current.closure.state}));show('[data-phase14-command-state]',current.command.lifecycle_state);show('[data-phase14-timeline]',current.timeline.map(item=>item.kind+' — '+item.label+': '+item.state).join('\n'));show('[data-phase14-approval]',current.approval?lines(current.approval):'No Human Approval request is currently bound to this command.');show('[data-phase14-execution]',current.execution?lines(current.execution):'No Executor Task/Run has been dispatched.');show('[data-phase14-verification]',current.verification?lines(current.verification):'No Verification routing exists yet.');show('[data-phase14-evidence]',lines(current.evidence));const clarification=document.querySelector('[data-phase14-clarification-form]');if(clarification)clarification.hidden=current.command.clarification_state!=='REQUIRED';const decisions=document.querySelector('[data-approval-actions]');if(decisions)decisions.hidden=!(current.approval&&portal?.dataset.canApprove==='true');const controls=document.querySelector('[data-run-controls]');if(controls){controls.hidden=!(current.execution?.control_target_id&&['AUTHORIZED','EXECUTING'].includes(current.execution.tool_status)&&portal?.dataset.canControl==='true');controls.dataset.dispatchId=current.execution?.control_target_id||''}};
  load().then(render).catch(error=>{status.textContent=error.message});
  document.querySelector('[data-phase14-command-form]')?.addEventListener('submit',async event=>{event.preventDefault();const element=event.currentTarget;const form=new FormData(element);const intent=String(form.get('intent')||'').trim();const outcome=String(form.get('requested_outcome')||'').trim();const kind=String(form.get('development_task_kind')||'');element.dataset.idempotencyKey||=crypto.randomUUID();element.dataset.messageId||=crypto.randomUUID();element.dataset.evidenceId||=crypto.randomUUID();try{const boundary=await request('/phase14/portal');const body={company_scope_ref:'company-maos',team_scope_ref:'team-development',project_id:boundary.project.id,project_scope_ref:'project-maos',source_message_ref:'message://control-room/'+element.dataset.messageId,source_message_hash:'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(intent+'\n'+outcome)))).map(v=>v.toString(16).padStart(2,'0')).join(''),intent,requested_outcome:outcome,command_mode:'GOVERNED_ACTION',target:'DEVELOPMENT_TEAM',...(kind?{development_task_kind:kind}:{}),evidence_refs:['evidence://control-room/command/'+element.dataset.evidenceId]};const result=await request('/commands',{method:'POST',headers:{'idempotency-key':element.dataset.idempotencyKey},body:JSON.stringify(body)});location.assign('/development/phase14?command_id='+encodeURIComponent(result.command_id))}catch(error){status.textContent=error.message}});
  document.querySelector('[data-phase14-clarification-form]')?.addEventListener('submit',async event=>{event.preventDefault();const element=event.currentTarget;const kind=String(new FormData(element).get('development_task_kind'));element.dataset.idempotencyKey||=crypto.randomUUID();element.dataset.evidenceId||=crypto.randomUUID();try{await request('/commands/clarifications',{method:'POST',headers:{'idempotency-key':element.dataset.idempotencyKey},body:JSON.stringify({command_id:commandId,responses:{development_task_kind:kind},evidence_refs:['evidence://control-room/clarification/'+element.dataset.evidenceId]})});location.reload()}catch(error){status.textContent=error.message}});
  document.addEventListener('click',async event=>{const button=event.target.closest?.('[data-decision],[data-control]');if(!button)return;button.dataset.idempotencyKey||=crypto.randomUUID();button.dataset.evidenceId||=crypto.randomUUID();try{const current=await load();if(button.dataset.decision){const approval=current?.approval;if(!approval)throw new Error('STALE_APPROVAL_BINDING');await request('/phase14/approvals/decisions',{method:'POST',headers:{'idempotency-key':button.dataset.idempotencyKey},body:JSON.stringify({request_id:approval.request_id,decision:button.dataset.decision,target_id:approval.target,target_version:approval.target_version,target_hash:approval.target_hash,scope:approval.scope,risk:approval.risk,environment:approval.environment,evidence_manifest_hash:approval.evidence_manifest_hash,policy_ref:approval.policy_ref,policy_version:approval.policy_version,reason_code:button.dataset.decision+'_BY_HUMAN',evidence_refs:['evidence://control-room/approval/'+button.dataset.evidenceId]})})}else{const container=button.closest('[data-run-controls]');await request('/phase14/runs/control',{method:'POST',headers:{'idempotency-key':button.dataset.idempotencyKey},body:JSON.stringify({command_id:commandId,dispatch_id:container.dataset.dispatchId,action:button.dataset.control,reason:'Human Control Room action'})})}location.reload()}catch(error){status.textContent=error.message}});
})()`;
