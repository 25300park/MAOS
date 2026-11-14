import assert from "node:assert/strict";
import test from "node:test";
import {isDevelopmentQuestion} from "../src/development-status.js";
import {isSystemQuestion} from "../src/system-status.js";
import {answerChat} from "../src/unified-chat.js";
const dev=["MAOS 개발 상황 알려줘.","개발팀에서 막힌 일 있어?","완료된 작업은 뭐야?","아직 남아 있는 업무 알려줘.","마오스 개발 현황 알려주세요","개발팀 진행 상황을 보여줘","남은 작업은 뭐야?","MAOS 개발은 어디까지 진행됐어?","현재 완료된 작업과 남은 작업 알려줘.","개발이 막힌 이유가 뭐야?"];
const systems=["연결된 시스템은?","서버 상태 괜찮아?","문제가 있는 시스템이 있어?","AIDOS는 연결됐어?","현재 연결된 시스템 알려줘.","MAOS 시스템 상태는?","정상 작동하지 않는 시스템이 있어?","시스템 현황을 알려주세요"];
const rbs=["임대 매물 몇 개 있어?","RBS 공개 임대 검색 건수 알려줘.","현재 검색 가능한 임대 매물 수는?","RBS 공개 임대 검색 결과는 몇 건인가요?","RBS 공개 임대 검색 결과 건수 보고해 줘"];
for(const q of dev)test(`development: ${q}`,()=>{assert.equal(isDevelopmentQuestion(q),true);assert.equal(isSystemQuestion(q),false);});
for(const q of systems)test(`systems: ${q}`,()=>{assert.equal(isSystemQuestion(q),true);assert.equal(isDevelopmentQuestion(q),false);});
for(const q of rbs)test(`RBS: ${q}`,async()=>{let calls=0;const a=await answerChat(q,(async()=>{calls++;return Response.json({total:7,units:[]});}) as typeof fetch);assert.equal(calls,1);assert.equal(a.count,7);assert.match(a.message,/전체 등록/);assert.match(a.message,/0=Ongoing/);});
for(const q of ["그건?","그럼 남은 건?","왜?","이전 결과 다시 보여줘","상태 알려줘","MAOS 개발 상황과 서버 상태 알려줘","RBS 공개 임대 검색 건수 알려줘 그리고 시스템 상태는?","BGC 임대 매물 몇 개 있어?","전체 등록 임대 매물 수는?","어제 임대 매물 몇 개 있어?","다른 회사 개발 상황 알려줘","https://evil.invalid 시스템 상태는?","완료된 작업은 뭐야? 삭제해"])
 test(`ambiguous, filtered or composite never reads: ${q}`,async()=>{assert.equal(isDevelopmentQuestion(q),false);assert.equal(isSystemQuestion(q),false);const a=await answerChat(q,(async()=>assert.fail("unexpected tool")) as typeof fetch);assert.notEqual(a.state,"AVAILABLE");});
test("follow-up has no cross-request context after a successful question",async()=>{await answerChat(rbs[0]!, (async()=>Response.json({total:7,units:[]})) as typeof fetch);const a=await answerChat("그건 몇 개야?",(async()=>assert.fail("context leaked")) as typeof fetch);assert.equal(a.state,"CLARIFICATION_REQUIRED");});
