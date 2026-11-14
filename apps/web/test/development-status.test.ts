import assert from "node:assert/strict";
import test from "node:test";
import {isDevelopmentQuestion,readDevelopmentStatus} from "../src/development-status.js";
const id="00000000-0000-4000-8000-000000000001";
test("only exact three development questions are supported",()=>{
 for(const q of ["MAOS 개발은 어디까지 진행됐어?","현재 완료된 작업과 남은 작업 알려줘.","개발이 막힌 이유가 뭐야?"])assert.equal(isDevelopmentQuestion(q),true);
 for(const q of ["개발 실행해줘","다른 프로젝트 개발 상태","https://example.com"])assert.equal(isDevelopmentQuestion(q),false);
});
test("project-bound read preserves stale, provenance and partial coverage without AIDOS calls",async()=>{
 const calls:string[]=[];
 const answer=await readDevelopmentStatus(async path=>{
  calls.push(path);
  if(path==="/api/v1/phase14/portal")return Response.json({ok:true,data:{project:{id,scope:"project-maos",environment:"STAGING",repository:"registry://fixture",branch:"fixture",workroot:"fixture",health:"HEALTHY"}}});
  assert.equal(path,`/api/v1/projects/${id}/development-status`);
  return Response.json({ok:true,data:{developmentStatus:{projectId:id,environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-02T00:00:00Z",partial:true,hasMore:true,records:[{commandId:id,state:"WAITING_HUMAN",category:"BLOCKED_OR_WAITING",freshness:"STALE",updatedAt:"2025-01-01T00:00:00Z",nextTask:"NOT_AVAILABLE"}]}}});
 });
 assert.equal(calls.length,2);assert.equal(answer.freshness,"STALE");assert.match(answer.message,/현재 페이지/);assert.match(answer.message,/NOT_CONNECTED/);assert.equal(answer.observedAt,"2026-01-02T00:00:00Z");
});
test("denied, unavailable and malformed source never become progress",async()=>{
 for(const status of [401,403,500]) {
  const answer=await readDevelopmentStatus(async()=>new Response(null,{status}));
  assert.notEqual(answer.state,"AVAILABLE");assert.equal(answer.freshness,"UNKNOWN");
 }
});
