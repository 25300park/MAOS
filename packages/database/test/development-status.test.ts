import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PostgresCommandEnvelopeRepository } from "../src/command-envelope-repository.js";

test("bounded command read enforces owner, organization, assignment and staging with keyset pagination", async t => {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE SCHEMA identity; CREATE SCHEMA core; CREATE SCHEMA work; CREATE SCHEMA governance; CREATE SCHEMA execution;
  CREATE TABLE work.tasks(id text,project_id text); CREATE TABLE execution.runs(id text,task_id text);
  CREATE TABLE governance.routing_envelopes(project_id text,command_envelope_id text,task_id text);
  CREATE TABLE governance.governed_artifact_refs(id text,project_id text,command_envelope_id text);
  CREATE TABLE core.organizations(id text, archived_at timestamptz);
  CREATE TABLE core.projects(id text, organization_id text, archived_at timestamptz);
  CREATE TABLE identity.humans(id text,organization_id text,archived_at timestamptz);
  CREATE TABLE identity.human_project_assignments(id text,human_id text,organization_id text,project_id text,scope text,revoked_at timestamptz);
  CREATE TABLE identity.assignment_permissions(assignment_id text,resource text,action text,risk text,environment text,effect text);
  CREATE TABLE work.command_envelopes(id text,project_id text,human_actor_id text,project_scope_ref text,environment text,lifecycle_state text,updated_at timestamptz,expires_at timestamptz,version int,task_id text,run_id text,reason_code text);
  INSERT INTO core.organizations VALUES('org',NULL),('other',NULL);
  INSERT INTO core.projects VALUES('project','org',NULL),('foreign','other',NULL);
  INSERT INTO identity.humans VALUES('human','org',NULL),('outsider','other',NULL);
  INSERT INTO identity.human_project_assignments VALUES('a','human','org','project','project-maos',NULL);
  INSERT INTO identity.assignment_permissions VALUES('a','PROJECT','READ','R0','staging','ALLOW');
  INSERT INTO work.command_envelopes VALUES
  ('1','project','human','project-maos','STAGING','COMPLETED',now(),NULL,1,NULL,NULL,NULL),
  ('2','project','human','project-maos','STAGING','WAITING_HUMAN',now(),NULL,1,NULL,NULL,NULL),
  ('3','project','outsider','project-maos','STAGING','READY',now(),NULL,1,NULL,NULL,NULL),
  ('4','project','human','project-maos','PRODUCTION','READY',now(),NULL,1,NULL,NULL,NULL);`);
  await db.exec(`INSERT INTO work.tasks VALUES('task','project'),('foreign-task','foreign'); INSERT INTO execution.runs VALUES('run','task'),('foreign-run','foreign-task');
  INSERT INTO governance.routing_envelopes VALUES('project','1','task'),('foreign','2','task');
  INSERT INTO governance.governed_artifact_refs VALUES('e','project','1'),('bad','foreign','1');
  UPDATE work.command_envelopes SET task_id='task',run_id='run' WHERE id='1';
  UPDATE work.command_envelopes SET task_id='missing',run_id='foreign-run' WHERE id='2';`);
  const repo=new PostgresCommandEnvelopeRepository({query: async (sql,params) => {
    assert.doesNotMatch(sql,/SELECT\s+(?:\w+\.)?\*|human_approval|tool_calls|tool_call_events|command_envelope_versions|verification_handoffs|normalized_intent|evidence_refs|\bartifact_ref\b|source_message/iu);
    return db.query(sql,params);
  }});
  const input={actorId:'human',projectId:'project',scope:'project-maos',limit:1};
  const first=await repo.listDevelopmentStatus(input);assert.deepEqual(first.map(r=>r.id),['1','2']);
  assert.equal(first[0].task_linked,true); assert.equal(first[0].run_linked,true); assert.equal(Number(first[0].evidence_count),1);
  assert.equal(first[1].task_linked,false); assert.equal(first[1].run_linked,false); assert.equal(Number(first[1].evidence_count),0);
  assert.deepEqual((await repo.listDevelopmentStatus({...input,after:'1'})).map(r=>r.id),['2']);
  assert.deepEqual(await repo.listDevelopmentStatus({...input,actorId:'outsider'}),[]);
  assert.deepEqual(await repo.listDevelopmentStatus({...input,projectId:'foreign'}),[]);
  await db.exec("UPDATE work.command_envelopes SET task_id='foreign-task',run_id='foreign-run' WHERE id='1'; INSERT INTO governance.routing_envelopes VALUES('project','1','foreign-task')");
  const crossed=await repo.listDevelopmentStatus(input);assert.equal(crossed[0].task_linked,false);assert.equal(crossed[0].run_linked,false);
  await db.exec("INSERT INTO identity.assignment_permissions VALUES('a','PROJECT','READ','R0','staging','DENY')");
  assert.deepEqual(await repo.listDevelopmentStatus(input),[]);
});
