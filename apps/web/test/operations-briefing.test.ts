import assert from "node:assert/strict";
import test from "node:test";
import {chatIntent} from "../src/unified-chat.js";
import {readOperationsBriefing} from "../src/development-status.js";
const id="00000000-0000-4000-8000-000000000001";
function reader(mode="ok",calls:string[]=[]) {return async(path:string)=>{
 calls.push(path);
 if(path==="/api/v1/phase14/portal")return Response.json({ok:true,data:{project:{id,scope:"project-maos",environment:"STAGING",repository:"registry://fixture",branch:"fixture",workroot:"fixture",health:"UNKNOWN"}}});
 if(path.endsWith("/development-status")) {
  if(mode==="dev-fail")throw Error("synthetic timeout");
  if(mode==="denied")return new Response(null,{status:403});
  return Response.json({ok:true,data:{developmentStatus:{projectId:id,environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-01T00:00:00Z",partial:false,hasMore:false,records:mode==="stale"?[{commandId:id,category:"COMPLETED_HISTORY",state:"COMPLETED",freshness:"STALE",updatedAt:"2025-12-01T00:00:00Z",nextTask:"NOT_AVAILABLE",evidenceCount:1}]:[]}}});
 }
 assert.equal(path,"/api/v1/systems");if(mode==="sys-fail")throw Error("synthetic timeout");
 return Response.json({ok:true,data:{entity:{systems:mode==="empty"?[]:[{id:"fixture",name:"MAOS",lifecycle:"ACTIVE",health:"UNKNOWN",owner:{id:"fixture",type:"HUMAN"},source_of_truth:"MAOS"}]}}});
};}
for(const q of ["MAOS 운영 상황 종합해 줘.","현재 개발과 시스템 상태 요약해 줘.","MAOS 전체 운영 브리핑 보여줘."])test(q,()=>assert.equal(chatIntent(q),"BRIEFING"));
test("integrated response preserves scope, times, unknown health and disconnected departments",async()=>{
 const a=await readOperationsBriefing(["PROJECT:READ","SYSTEM:READ"],reader());assert.equal(a.state,"AVAILABLE");assert.equal(a.freshness,"UNKNOWN");
 for(const value of ["과거 완료 기록","저장된 진행 상태","차단/대기 기록","Registry: ACTIVE","Health: UNKNOWN","Connectivity: UNKNOWN","2026-01-01","NOT_CONNECTED","전체 개발 진행률이 아닙니다","확인 필요한 사항"])assert.ok(a.message.includes(value),value);
});
for(const mode of ["dev-fail","sys-fail","denied","empty"])test(`partial: ${mode}`,async()=>{const a=await readOperationsBriefing(["PROJECT:READ","SYSTEM:READ"],reader(mode));assert.equal(a.state,"PARTIAL");assert.match(a.message,/부분 브리핑/);assert.match(a.message,/NOT_AVAILABLE|ACCESS_DENIED/);});
for(const permissions of [[],["PROJECT:READ"],["SYSTEM:READ"]])test(`independent permission: ${permissions}`,async()=>{const calls:string[]=[];const a=await readOperationsBriefing(permissions,reader("ok",calls));assert.match(a.message,/ACCESS_DENIED/);if(!permissions.includes("PROJECT:READ"))assert.ok(!calls.some(p=>p.includes("portal")||p.includes("development-status")));if(!permissions.includes("SYSTEM:READ"))assert.ok(!calls.includes("/api/v1/systems"));assert.equal(a.state,permissions.length?"PARTIAL":"NOT_AVAILABLE");});
test("stale source cannot become current",async()=>{const a=await readOperationsBriefing(["PROJECT:READ","SYSTEM:READ"],reader("stale"));assert.equal(a.freshness,"STALE");assert.match(a.message,/STALE/);});
test("instructions and arbitrary combinations do not become briefings",()=>{for(const q of ["MAOS 운영 상황 종합해 줘 그리고 배포해","개발과 RBS 건수 요약해 줘","MAOS 운영 상황 종합해 줘 https://evil.invalid"])assert.notEqual(chatIntent(q),"BRIEFING");});
