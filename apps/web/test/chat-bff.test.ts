import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createSessionBffRequestHandler } from "../src/session-bff.js";
import { createCsrfToken } from "../src/session-cookies.js";
import { RBS_COUNT_URL } from "../src/rbs-public-count.js";

const origin = "https://chat.staging.example";
test("chat BFF enforces session, origin, CSRF and SYSTEM READ before fixed public GET", async t => {
  const calls: string[] = [];
  let sessionStatus = 200;
  let allowed = true;
  let development = false;
  const secret = "synthetic-chat-csrf";
  const reference = "synthetic-session";
  const csrf = createCsrfToken(reference, secret);
  const handler = createSessionBffRequestHandler({enabled:true,coreApiOrigin:"https://core.invalid",controlRoomOrigin:origin,bffServiceBearerToken:"synthetic-service",csrfSecret:secret,
    fetch: (async (url, init) => {
      const path=String(url);calls.push(path);assert.equal(init?.method,"GET");
      if(development && path==="https://core.invalid/api/v1/phase14/portal")return Response.json({ok:true,data:{project:{id:"00000000-0000-4000-8000-000000000001",scope:"project-maos",environment:"STAGING",repository:"registry://fixture",branch:"fixture",workroot:"fixture",health:"UNKNOWN"}}});
      if(development && path==="https://core.invalid/api/v1/projects/00000000-0000-4000-8000-000000000001/development-status")return Response.json({ok:true,data:{developmentStatus:{projectId:"00000000-0000-4000-8000-000000000001",environment:"STAGING",coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",freshness:"UNKNOWN",observedAt:"2026-01-01T00:00:00Z",partial:false,hasMore:false,records:[]}}});
      if(path==="https://core.invalid/api/v1/systems"){assert.ok(new Headers(init?.headers).has("authorization"));return Response.json({ok:true,data:{entity:{systems:[]}}});}
      if(path===RBS_COUNT_URL){assert.equal(new Headers(init?.headers).has("authorization"),false);return Response.json({total:8,units:[]});}
      assert.equal(path,"https://core.invalid/api/v1/identity/session-context");
      return Response.json({ok:true,data:{actor_id:"fixture-human",roles:[{name:"reader",permissions:allowed?[{resource:development?"PROJECT":"SYSTEM",action:"READ",effect:"ALLOW"}]:[]}]}},{status:sessionStatus});
    }) as typeof fetch}, () => {assert.fail("chat must not fall through to HTML");});
  const server=createServer(handler);
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/chat/query`;
  const headers={origin,"content-type":"application/json",cookie:`__Host-maos_session=${reference}; __Host-maos_csrf=${csrf}`,"x-maos-csrf-token":csrf};
  const send=(h:Record<string,string>, body:unknown={message:"RBS 공개 임대 검색 결과는 몇 건인가요?"})=>fetch(url,{method:"POST",headers:h,body:JSON.stringify(body)});
  assert.equal((await send({...headers,cookie:""})).status,401);
  assert.equal((await send({...headers,origin:"https://evil.invalid"})).status,403);
  assert.equal((await send({...headers,"x-maos-csrf-token":"wrong"})).status,403);
  assert.equal(calls.length,0);
  sessionStatus=401;assert.equal((await send(headers)).status,401);
  sessionStatus=200;allowed=false;assert.equal((await send(headers)).status,403);
  allowed=true;assert.equal((await send(headers,{message:"question",tool:"evil",url:"https://evil.invalid"})).status,422);
  assert.equal(calls.includes(RBS_COUNT_URL),false);
  const response=await send(headers);assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal((await response.json()).answer.count,8);
  assert.equal(calls.filter(v=>v===RBS_COUNT_URL).length,1);
  development=true;
  const dev=await send(headers,{message:"MAOS 개발은 어디까지 진행됐어?"});
  assert.equal(dev.status,200);assert.equal((await dev.json()).answer.freshness,"UNKNOWN");
  assert.equal(calls.filter(v=>v===RBS_COUNT_URL).length,1);
  allowed=false;assert.equal((await send(headers,{message:"MAOS 개발은 어디까지 진행됐어?"})).status,403);
  development=false;allowed=true;
  const systems=await send(headers,{message:"MAOS 시스템 상태는?"});assert.equal(systems.status,200);assert.equal((await systems.json()).answer.state,"NOT_AVAILABLE");
  assert.equal(calls.filter(v=>v==="https://core.invalid/api/v1/systems").length,1);
  allowed=false;assert.equal((await send(headers,{message:"현재 연결된 시스템 알려줘."})).status,403);
  assert.equal(calls.filter(v=>v==="https://core.invalid/api/v1/systems").length,1);

  // New phrasing must retain the same permission and downstream boundaries.
  for (const message of ["서버 상태 괜찮아?", "AIDOS는 연결됐어?", "임대 매물 몇 개 있어?"]) {
    const before=calls.length;
    assert.equal((await send(headers,{message})).status,403);
    assert.equal(calls.length,before+1); // Session context only; no tool read.
  }
  development=true;
  assert.equal((await send(headers,{message:"개발팀에서 막힌 일 있어?"})).status,403);
  allowed=true;
  const naturalDev=await send(headers,{message:"MAOS 개발 상황 알려줘."});
  assert.equal(naturalDev.status,200);assert.equal((await naturalDev.json()).answer.freshness,"UNKNOWN");
  development=false;
  const naturalSystem=await send(headers,{message:"문제가 있는 시스템이 있어?"});
  assert.equal(naturalSystem.status,200);assert.equal((await naturalSystem.json()).answer.state,"NOT_AVAILABLE");
  const naturalRbs=await send(headers,{message:"임대 매물 몇 개 있어?"});
  assert.equal((await naturalRbs.json()).answer.count,8);
  for (const message of ["그건 몇 개야?","개발 현황과 서버 상태 알려줘","서버 상태 확인하고 배포해"]) {
    const before=calls.length;const response=await send(headers,{message});
    assert.equal(response.status,200);
    assert.ok(["CLARIFICATION_REQUIRED","EXECUTION_DISABLED"].includes((await response.json()).answer.state));
    assert.equal(calls.length,before+1);
  }
  // A different authenticated session cannot inherit the preceding result.
  const other="synthetic-other-session";const otherCsrf=createCsrfToken(other,secret);
  const before=calls.length;
  const followup=await send({...headers,cookie:`__Host-maos_session=${other}; __Host-maos_csrf=${otherCsrf}`,"x-maos-csrf-token":otherCsrf},{message:"그건?"});
  assert.equal((await followup.json()).answer.state,"CLARIFICATION_REQUIRED");assert.equal(calls.length,before+1);

  const briefing={message:"MAOS 운영 상황 종합해 줘."};
  assert.equal((await send({...headers,cookie:""},briefing)).status,401);
  assert.equal((await send({...headers,"x-maos-csrf-token":"wrong"},briefing)).status,403);
  for (const permission of ["PROJECT", "SYSTEM", "NONE"]) {
    development=permission==="PROJECT";allowed=permission!=="NONE";
    const before=calls.length;const res=await send(headers,briefing);assert.equal(res.status,200);
    const answer=(await res.json()).answer;assert.match(answer.message,/ACCESS_DENIED/);
    const used=calls.slice(before);
    if(permission!=="PROJECT")assert.ok(!used.some(path=>path.includes("portal")||path.includes("development-status")));
    if(permission!=="SYSTEM")assert.ok(!used.some(path=>path.endsWith("/systems")));
    assert.equal(answer.state,permission==="PROJECT"?"PARTIAL":"NOT_AVAILABLE");
  }

});
