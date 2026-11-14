import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import {createApiServer} from "../src/app.js";
import {createDevelopmentStatusRoutes} from "../src/development-status-routes.js";
const id="00000000-0000-4000-8000-000000000001";
for(const mode of ["allow","anonymous","deny","other-project","foreign-row","empty","stale","missing","paged"] as const) test(`development read ${mode}`,async t=>{
  let calls=0;
  const row={task_linked:false,run_linked:false,evidence_count:0,id,project_id:id,human_actor_id:"fixture",project_scope_ref:"project-maos",environment:"STAGING",lifecycle_state:"COMPLETED",updated_at:"2026-01-01T00:00:00Z",expires_at:mode==="stale"?"2020-01-01":null,version:1,task_id:null,run_id:null,reason_code:null};
  const server=createApiServer({service:"api",environment:"staging",authenticate:async()=>mode==="anonymous"?null:{actor_id:"fixture",actor_type:"HUMAN",roles:[{id:"r",name:"r",permissions:[{resource:"PROJECT",action:"READ",risk:"R0",scope:"project-maos",environment:"staging",effect:mode==="deny"?"DENY":"ALLOW"}]}]},routes:createDevelopmentStatusRoutes({listDevelopmentStatus:async()=>{calls++;return mode==="empty"?[]:mode==="paged"?[row,{...row,id:"00000000-0000-4000-8000-000000000002"}]:[{...row,human_actor_id:mode==="foreign-row"?"other":"fixture"}];}},{projectId:id,scope:"project-maos",environment:"staging"})});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects/${mode==="other-project"?"other":id}/development-status${mode==="paged"?"?limit=1":""}`);
  assert.equal(response.status,mode==="anonymous"?401:["deny","other-project","foreign-row"].includes(mode)?403:200);
  if(["anonymous","deny","other-project"].includes(mode))assert.equal(calls,0);
  if(response.ok){const data=(await response.json()).data.developmentStatus;assert.equal(data.freshness,"UNKNOWN");assert.equal(data.aidos,"NOT_CONNECTED");if(mode==="paged"){assert.equal(data.hasMore,true);assert.equal(data.records.length,1);assert.equal(data.nextCursor,id);}if(mode==="missing")assert.equal(data.records[0].evidenceCount,null);if(mode==="empty")assert.deepEqual(data.records,[]);else {assert.equal(data.records[0].freshness,mode==="stale"?"STALE":"UNKNOWN");assert.equal(data.records[0].nextTask,"NOT_AVAILABLE");assert.equal(data.records[0].task,"NOT_AVAILABLE");}}
});
