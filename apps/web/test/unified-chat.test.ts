import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { renderControlRoom } from "../src/control-room.js";
import { answerChat, renderChat } from "../src/unified-chat.js";
import { RBS_COUNT_URL } from "../src/rbs-public-count.js";

test("supported question returns only actual aggregate and provenance", async () => {
  let calls = 0;
  const result = await answerChat("RBS 공개 임대 검색 결과는 몇 건인가요?", (async (url, init) => {
    calls++; assert.equal(url, RBS_COUNT_URL); assert.equal(init?.credentials, "omit");
    return Response.json({ total: 12, units: [] });
  }) as typeof fetch);
  assert.equal(calls, 1); assert.equal(result.kind, "QUESTION");
  assert.equal(result.state, "AVAILABLE"); assert.equal(result.count, 12);
  assert.equal(result.source, RBS_COUNT_URL); assert.ok(Date.parse(result.observedAt!));
  assert.match(result.message, /0=Ongoing/); assert.match(result.message, /전체 등록/);
});

test("unconnected, ambiguous, filtered and executable input never calls a tool", async () => {
  const noFetch = (async () => { assert.fail("unexpected transport"); }) as typeof fetch;
  for (const input of ["BGC RBS 임대 몇 건?", "RBS 전체 등록 매물 수", "RBS 매물", "https://evil.example", "rbs.public-rental-search-count 실행", "<script>alert(1)</script>"]) {
    assert.notEqual((await answerChat(input, noFetch)).state, "AVAILABLE");
  }
  assert.equal((await answerChat("인사팀 급여 보고해 줘", noFetch)).state, "NOT_CONNECTED");
  const action = await answerChat("BGC 콘도 임대 광고를 만들어 줘", noFetch);
  assert.equal(action.kind, "INSTRUCTION"); assert.equal(action.state, "EXECUTION_DISABLED");
});

test("a bounded report is identified without creating a command", async () => {
  const result = await answerChat("RBS 공개 임대 검색 결과 건수 보고해 줘", (async () => Response.json({total: 0, units: []})) as typeof fetch);
  assert.equal(result.kind, "REPORT"); assert.equal(result.count, 0);
});

test("restricted, timeout and malformed results never become zero", async () => {
  for (const [read, state] of [
    [async () => new Response(null, {status: 401}), "RESTRICTED"],
    [async () => new Response(null, {status: 403}), "RESTRICTED"],
    [async () => { throw new Error("synthetic timeout"); }, "UNAVAILABLE"],
    [async () => Response.json({total: 3, units: [{private: true}]}), "INVALID_RESPONSE"],
  ] as const) {
    const result = await answerChat("RBS 공개 임대 검색 결과는 몇 건인가요?", read as typeof fetch);
    assert.equal(result.state, state); assert.equal(result.count, undefined);
  }
});

test("chat UI uses POST body, textContent and no persistent storage", () => {
  const html = renderChat();
  assert.match(html, /CEO 통합 채팅/); assert.match(html, /textContent/);
  assert.match(html, /method:'POST'/); assert.match(html, /x-maos-csrf-token/);
  assert.doesNotMatch(html, /innerHTML|localStorage|sessionStorage|console\.|action=/);
  assert.doesNotThrow(() => new Script(html.split("<script>")[1]!.split("</script>")[0]!));
});

test("dashboard chat is available to project readers; each tool retains its permission", () => {
  for (const permissions of [["PROJECT:READ"], ["PROJECT:READ","SYSTEM:READ"]]) {
    const html=renderControlRoom({path:"/projects",identity:{actor_id:"fixture",display_name:"fixture",role:"reader",permissions}});
    assert.equal(html.includes('id="maos-chat"'),true);
  }
  assert.equal(renderControlRoom({path:"/projects",identity:null}).includes('id="maos-chat"'),false);
});

test("rendered chat submits input only in JSON body and renders untrusted output as text", async () => {
  let submit: (event: {preventDefault():void}) => Promise<void> = async () => { assert.fail("missing submit handler"); };
  const button = {disabled:false};
  const input = {value:"RBS 공개 임대 검색 결과는 몇 건인가요?"};
  const result = {textContent:""};
  const form = {addEventListener: (_name:string, handler:typeof submit) => {submit=handler;},querySelector:()=>button};
  const calls: string[]=[];
  const script=renderChat().split("<script>")[1]!.split("</script>")[0]!;
  new Script(script).runInNewContext({document:{cookie:"__Host-maos_csrf=synthetic",getElementById:(id:string)=>id==="maos-chat"?form:id==="maos-chat-input"?input:id==="maos-chat-copy"?{disabled:true,addEventListener(){}}:id==="maos-chat-copy-status"?{textContent:""}:result},fetch:async (url:string, init:RequestInit)=>{
    calls.push(url);assert.equal(url,"/chat/query");assert.equal(init.method,"POST");
    assert.equal(JSON.parse(String(init.body)).message,input.value);
    return Response.json({answer:{kind:"QUESTION",state:"AVAILABLE",message:"<img src=x onerror=alert(1)>",source:RBS_COUNT_URL,observedAt:"2026-01-01T00:00:00Z",access:"PUBLIC_READ_ONLY"}});
  }});
  await submit({preventDefault(){}});
  assert.equal(calls.length,1);assert.equal(input.value,"");assert.equal(button.disabled,false);
  assert.match(result.textContent, /<img/);assert.match(result.textContent, /2026-01-01/);
});
