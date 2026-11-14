import assert from "node:assert/strict";
import test from "node:test";
import {isSystemQuestion,readSystemStatus} from "../src/system-status.js";
import {loadSystemRegistry} from "../src/registry-reads.js";
const row={id:"fixture-system",name:"MAOS",lifecycle:"ACTIVE",health:"UNKNOWN",owner:{id:"fixture",type:"HUMAN"},source_of_truth:"MAOS"};
test("only three whole system questions are recognized",()=>{
 for(const q of ["현재 연결된 시스템 알려줘.","MAOS 시스템 상태는?","정상 작동하지 않는 시스템이 있어?"])assert.equal(isSystemQuestion(q),true);
 for(const q of ["시스템 삭제해","MAOS 시스템 상태는? 그리고 실행해","https://external.invalid","회계 알려줘"])assert.equal(isSystemQuestion(q),false);
});
for(const mode of ["available","empty","denied","malformed","timeout"] as const)test(`system status ${mode}`,async()=>{
 let calls=0;
 const read=async(path:string)=>{calls++;assert.equal(path,"/api/v1/systems");if(mode==="timeout")throw Error("timeout");return Response.json({ok:true,data:{entity:{systems:mode==="empty"?[]:[{...row,health:mode==="malformed"?"FAKE":row.health}]}}},{status:mode==="denied"?403:200});};
 const answer=await readSystemStatus(read);assert.equal(calls,1);assert.equal(answer.state,mode==="available"?"AVAILABLE":mode==="denied"?"RESTRICTED":"NOT_AVAILABLE");
 if(mode==="available"){assert.match(answer.message,/Registry: ACTIVE/);assert.match(answer.message,/Health: UNKNOWN/);assert.match(answer.message,/Connectivity: UNKNOWN/);assert.doesNotMatch(answer.message,/Health: HEALTHY/);assert.ok(Number.isFinite(Date.parse(answer.observedAt!)));assert.equal(answer.freshness,"UNKNOWN");const screen=await loadSystemRegistry(read);assert.equal(screen.state,"AVAILABLE");}
});
