import assert from "node:assert/strict";
import test from "node:test";
import {chatIntent} from "../src/unified-chat.js";
import {readDevelopmentStatus,isDevelopmentQuestion} from "../src/development-status.js";
const id="00000000-0000-4000-8000-000000000001";
const row={commandId:id,state:"WAITING_APPROVAL",category:"BLOCKED_OR_WAITING",freshness:"STALE",updatedAt:"2026-01-01T00:00:00Z",reason:"APPROVAL_REQUIRED",evidenceCount:2,nextTask:"NOT_AVAILABLE"};
function reader(records:object[],status=200){return async(path:string)=>{
 if(path==="/api/v1/phase14/portal")return Response.json({ok:true,data:{project:{id,scope:"project-maos",environment:"STAGING",repository:"registry://fixture",branch:"fixture",workroot:"fixture",health:"UNKNOWN"}}});
 assert.equal(path,`/api/v1/projects/${id}/development-status`);
 return Response.json({ok:true,data:{developmentStatus:{projectId:id,environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-02T00:00:00Z",partial:true,hasMore:true,records}}},{status});
};}
for(const q of ["현재 막힌 개발 업무는?","개발팀에서 무엇을 기다리고 있어?","지금 확인해야 할 문제는?"])test(q,()=>{assert.equal(chatIntent(q),"BLOCKERS");assert.equal(isDevelopmentQuestion(q),true);});
test("next action question retains project permission",()=>{assert.equal(chatIntent("다음 개발 작업은 뭐야?"),"NEXT_ACTION");assert.equal(isDevelopmentQuestion("다음 개발 작업은 뭐야?"),true);});
test("waiting and blocked records retain explicit reasons, evidence and timestamps",async()=>{const a=await readDevelopmentStatus(reader([row,{...row,state:"FAILED",reason:"TOOL_FAILED"}]),"blockers");for(const x of ["대기 기록: 1건","차단/실패 기록: 1건","APPROVAL_REQUIRED","TOOL_FAILED","Evidence: 2","2026-01-01","2026-01-02","STALE"])assert.ok((a.message+ a.observedAt).includes(x),x);assert.equal(a.freshness,"STALE");});
test("READY and DISPATCHED are not blockers; zero applies only to returned page",async()=>{const a=await readDevelopmentStatus(reader(["READY","DISPATCHED"].map(state=>({...row,state,category:"RECORDED_PROGRESS",freshness:"UNKNOWN"}))),"blockers");assert.match(a.message,/차단\/실패 기록: 0건/);assert.match(a.message,/현재 페이지/);assert.match(a.message,/회사 전체/);assert.match(a.message,/추가 페이지: YES/);assert.doesNotMatch(a.message,/실행 중입니다/);});
test("missing reason and evidence are unavailable, not inferred",async()=>{const a=await readDevelopmentStatus(reader([{...row,reason:null,evidenceCount:null}]),"blockers");assert.match(a.message,/사유: NOT_AVAILABLE/);assert.match(a.message,/Evidence: NOT_AVAILABLE/);});
test("next task cannot be inferred from READY or Task association",async()=>{const a=await readDevelopmentStatus(reader([{...row,state:"READY",category:"RECORDED_PROGRESS",taskId:id}]),"next");assert.match(a.message,/다음 작업: NOT_AVAILABLE/);assert.match(a.message,/명시적/);});
test("unsupported next task field fails closed rather than claiming a verified link",async()=>{const a=await readDevelopmentStatus(reader([{...row,nextTask:id}]),"next");assert.equal(a.state,"NOT_AVAILABLE");});
test("empty data stays bounded; denied or invalid state cannot become zero",async()=>{const empty=await readDevelopmentStatus(reader([]),"blockers");assert.match(empty.message,/현재 페이지/);for(const status of [401,403,500])assert.notEqual((await readDevelopmentStatus(reader([],status),"blockers")).state,"AVAILABLE");const invalid=await readDevelopmentStatus(reader([{...row,state:"READY"}]),"blockers");assert.equal(invalid.state,"NOT_AVAILABLE");});
