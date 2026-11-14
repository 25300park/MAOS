import {runInNewContext} from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import {chatIntent,renderChat} from "../src/unified-chat.js";
import {readCeoReport,readTaskDraft} from "../src/report-draft.js";
const id="b613e899-ba5e-4e9f-8c23-66ade19d2116";
function reader(calls:string[],repository="registry://25300park/MAOS") {return async(path:string)=>{calls.push(path);if(path.endsWith("portal"))return Response.json({ok:true,data:{project:{id,scope:"project-maos",environment:"STAGING",repository,branch:"fixture",workroot:"fixture",health:"UNKNOWN"}}});if(path.endsWith("development-status"))return Response.json({ok:true,data:{developmentStatus:{projectId:id,environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-01T00:00:00Z",partial:false,hasMore:false,records:[]}}});assert.equal(path,"/api/v1/systems");return Response.json({ok:true,data:{entity:{systems:[]}}});};}
for(const q of ["MAOS 운영 현황 보고서 작성해 줘.","개발팀 주간 보고서 만들어 줘.","현재 문제와 시스템 상태를 보고서로 정리해 줘."])test(q,()=>assert.equal(chatIntent(q),"CEO_REPORT"));
for(const q of ["개발팀에 로그인 오류 수정 지시해.","MAOS 시스템 장애 점검 업무 만들어 줘.","개발팀에 미완료 작업 확인 요청해."])test(q,()=>assert.equal(chatIntent(q),"TASK_DRAFT"));
test("weekly report is scoped records, never weekly performance",async()=>{const calls:string[]=[];const a=await readCeoReport("개발팀 주간 보고서 만들어 줘.",["PROJECT:READ","SYSTEM:READ"],reader(calls));assert.match(a.message,/주간 실적이 아닙니다/);assert.match(a.message,/작성 시각/);assert.match(a.message,/UNKNOWN/);assert.match(a.message,/조회 시각/);assert.equal(a.state,"PARTIAL");assert.equal(calls.length,3);});
test("denied report performs zero data reads",async()=>{const calls:string[]=[];const a=await readCeoReport("MAOS 운영 현황 보고서 작성해 줘.",[],reader(calls));assert.match(a.message,/ACCESS_DENIED/);assert.equal(calls.length,0);});
test("draft binds only explicit registry identity, no execution",async()=>{const calls:string[]=[];const a=await readTaskDraft("개발팀에 로그인 오류 수정 지시해.",["PROJECT:READ"],reader(calls));assert.equal(a.state,"DRAFT_ONLY");assert.match(a.message,new RegExp(id));assert.match(a.message,/NOT_ASSIGNED/);assert.match(a.message,/NOT_AVAILABLE/);assert.match(a.message,/AIDOS.*NOT_CONNECTED/);assert.equal(calls.length,1);});
test("similar project name is not canonical mapping",async()=>{const a=await readTaskDraft("개발팀에 미완료 작업 확인 요청해.",["PROJECT:READ"],reader([],"registry://another/repo"));assert.match(a.message,/CLARIFICATION_REQUIRED/);assert.doesNotMatch(a.message,new RegExp(id));});
test("draft without permission reads nothing",async()=>{const calls:string[]=[];const a=await readTaskDraft("MAOS 시스템 장애 점검 업무 만들어 줘.",[],reader(calls));assert.match(a.message,/ACCESS_DENIED/);assert.equal(calls.length,0);});
test("unsupported mixed instruction never becomes a report or bound draft",()=>{for(const q of ["MAOS 운영 현황 보고서 작성해 줘 그리고 배포해","개발팀에 로그인 오류 수정 지시해 https://evil.invalid"])assert.ok(!["CEO_REPORT","TASK_DRAFT"].includes(chatIntent(q)));});
test("copy uses displayed text, never HTML or persistent storage",()=>{const html=renderChat();assert.match(html,/maos-chat-copy/);assert.match(html,/clipboard.writeText/);assert.match(html,/result.textContent/);assert.doesNotMatch(html,/localStorage|innerHTML|download=/);});

test("copy click copies exact visible text and reports clipboard failure",async()=>{
 const handlers:Record<string,()=>Promise<void>>={};
 const result={textContent:"DRAFT_ONLY <script>not executable</script>"};
 const status={textContent:""};let copied="";let fail=false;
 const elements:Record<string,unknown>={"maos-chat":{addEventListener(){}},"maos-chat-input":{},"maos-chat-result":result,"maos-chat-copy-status":status,"maos-chat-copy":{addEventListener(name:string,fn:()=>Promise<void>){handlers[name]=fn;}}};
 const script=renderChat().split("<script>")[1]!.split("</script>")[0]!;
 runInNewContext(script,{document:{getElementById:(id:string)=>elements[id]},navigator:{clipboard:{async writeText(text:string){if(fail)throw Error("denied");copied=text;}}}});
 await handlers.click!();assert.equal(copied,result.textContent);assert.equal(status.textContent,"복사 완료");
 fail=true;await handlers.click!();assert.match(status.textContent,/직접 선택/);
});
test("report preserves stale source and excludes denied systems",async()=>{
 const read=reader([]);const a=await readCeoReport("MAOS 운영 현황 보고서 작성해 줘.",["PROJECT:READ"],async path=>{
  if(!path.endsWith("development-status"))return read(path);
  return Response.json({ok:true,data:{developmentStatus:{projectId:id,environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-01T00:00:00Z",partial:false,hasMore:false,records:[{commandId:id,category:"COMPLETED_HISTORY",state:"COMPLETED",freshness:"STALE",updatedAt:"2025-01-01T00:00:00Z",nextTask:"NOT_AVAILABLE",evidenceCount:1}]}}});
 });assert.equal(a.freshness,"STALE");assert.match(a.message,/ACCESS_DENIED/);assert.match(a.message,/STALE/);
});
