import { readRbsPublicCount } from "./rbs-public-count.js";

// Deterministic, bounded intent recognition only. Never creates a validated
// ClassificationRecord, RoutingDecision, Task or CommandEnvelope.
export interface ChatAnswer {
  kind: "QUESTION" | "REPORT" | "INSTRUCTION" | "UNKNOWN";
  state: string;
  message: string;
  domain?: "BUSINESS";
  tool?: "rbs.public-rental-search-count";
  source?: string;
  observedAt?: string;
  count?: number;
  access?: string;
  freshness?: "UNKNOWN" | "STALE";
}

// Whole-utterance grammar, not free-form AI classification. Unknown qualifiers,
// multi-tool questions and unbound follow-ups never select a reader.
export function chatIntent(input: string): "BRIEFING" | "DEVELOPMENT" | "SYSTEMS" | "RBS" | "INSTRUCTION" | "UNSUPPORTED" | "CLARIFY" {
  const text = input.normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/[?.!。？！]+$/u, "").toLowerCase();
  if (/만들|생성|게시|실행|전송|삭제|수정|배포|등록해|create|execute|publish|delete|deploy/u.test(text)) return "INSTRUCTION";
  const q = text.replace(/\s+/gu, "");
  const ask = "(?:알려줘|알려주세요|보여줘|보여주세요|말해줘|말해주세요|요약해줘|보고해줘)";
  if (/^(?:maos|마오스)운영(?:상황|현황)(?:을)?종합해(?:줘|주세요)$/u.test(q) ||
      /^(?:현재)?개발과시스템상태(?:를)?요약해(?:줘|주세요)$/u.test(q) ||
      /^(?:maos|마오스)(?:전체)?운영브리핑(?:을)?보여(?:줘|주세요)$/u.test(q)) return "BRIEFING";
  const development = [
    /^(?:maos|마오스)?개발은어디까지진행됐어$/u,
    /^현재완료된작업과남은작업알려줘$/u,
    /^개발이막힌이유가뭐야$/u,
    new RegExp("^(?:maos|마오스)?(?:개발|개발팀)(?:의)?(?:상황|현황|진행상황|진행현황)(?:을)?"+ask+"$", "u"),
    /^(?:개발팀에서|개발에|개발팀에)막힌(?:일|작업|업무)(?:이)?(?:있어|있나요)$/u,
    /^(?:현재)?완료된(?:작업|업무)(?:은|는)(?:뭐야|무엇인가요)$/u,
    new RegExp("^(?:아직)?(?:남아있는|남은)(?:작업|업무)(?:(?:을)?"+ask+"|(?:은|는)(?:뭐야|무엇인가요))$", "u"),
  ];
  if (development.some(pattern => pattern.test(q))) return "DEVELOPMENT";
  const systems = [
    /^(?:현재)?연결된시스템(?:은|알려줘|알려주세요)$/u,
    /^(?:maos)?시스템상태는$/u,
    /^(?:서버|시스템)상태(?:가)?(?:괜찮아|괜찮나요)$/u,
    /^(?:문제가있는|정상작동하지않는)시스템(?:이)?(?:있어|있나요)$/u,
    /^aidos(?:는|가)?연결(?:됐어|됐나요|되었나요)$/u,
    new RegExp("^(?:maos)?(?:시스템|서버)(?:상태|현황)(?:을)?"+ask+"$", "u"),
  ];
  if (systems.some(pattern => pattern.test(q))) return "SYSTEMS";
  if (/^(?:rbs|rbs-homes)공개임대검색결과(?:는몇건인가요|건수(?:를알려줘|알려주세요|보고해줘|요약해줘)?)$/u.test(q) ||
      /^(?:rbs|rbs-homes)공개임대검색(?:결과)?건수(?:를)?(?:알려줘|알려주세요)$/u.test(q) ||
      /^(?:현재)?임대매물(?:은|이)?몇(?:개|건)(?:있어|있나요)$/u.test(q) ||
      /^(?:현재)?검색가능한임대매물수는$/u.test(q) ||
      /^(?:how many rbs public rental search matches|rbs public rental search count)$/u.test(text)) return "RBS";
  if (/회계|인사|급여|마케팅|ai-mls|accounting|payroll|marketing|human resources/u.test(text)) return "UNSUPPORTED";
  return "CLARIFY";
}

export async function answerChat(input: string, read: typeof fetch): Promise<ChatAnswer> {
  const text = input.normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/[?.!。？！]+$/u, "").toLowerCase();
  const intent = chatIntent(input);
  const report = /보고|요약|report|summari/u.test(text);
  const kind = intent === "INSTRUCTION" ? "INSTRUCTION" : report ? "REPORT" : "QUESTION";
  if (intent === "INSTRUCTION") return {kind, state: "EXECUTION_DISABLED", message: "업무 지시는 실행하지 않습니다. Task 생성·전송·외부 실행이 이루어지지 않았습니다."};
  if (intent === "UNSUPPORTED") return {kind, state: "NOT_CONNECTED", message: "해당 부서의 검증된 조회 도구가 연결되지 않았습니다."};
  if (intent !== "RBS") return {kind, state: "CLARIFICATION_REQUIRED", message: "개발 기록, 시스템 상태, RBS 공개 임대 검색 건수 중 조회할 대상을 한 가지로 명시해주세요. 복합 질문과 ‘그건?’ 같은 문맥 의존 질문은 이전 결과를 추측해 조회하지 않습니다. 지역·기간·추가 조건이나 전체 등록 매물 수는 지원하지 않습니다."};
  const result = await readRbsPublicCount(read);
  return {
    kind, domain: "BUSINESS", tool: "rbs.public-rental-search-count",
    state: result.state, source: result.source, observedAt: result.observedAt,
    ...(result.state === "AVAILABLE" ? {count: result.total} : {}),
    access: result.state === "RESTRICTED" ? "ACCESS_DENIED" : "PUBLIC_READ_ONLY",
    message: `${result.state === "AVAILABLE" ? `공개 임대 검색 결과: ${result.total}건.` : `조회 실패: ${result.state}. 실제 건수는 확인되지 않았습니다.`} 조건: 임대, 0=Ongoing, 3=Under Negotiation. 전체 등록·검증된 매물 수 또는 BGC 한정 건수가 아닙니다.`,
  };
}

export function renderChat(): string {
  return `<section class="panel" aria-label="CEO 통합 채팅"><div class="panel-head"><h2>CEO 통합 채팅</h2><span>조회 전용 · 저장/실행 없음</span></div><div class="panel-body"><p>통합 브리핑: MAOS 운영 상황 종합해 줘. 개발·시스템의 허용된 조회 범위만 요약합니다.</p><p>지원 질문: RBS 공개 임대 검색 결과는 몇 건인가요?</p><p>시스템 현황 질문: 현재 연결된 시스템 알려줘. / MAOS 시스템 상태는? / 정상 작동하지 않는 시스템이 있어?</p><p>개발 기록 질문: MAOS 개발은 어디까지 진행됐어? / 현재 완료된 작업과 남은 작업 알려줘. / 개발이 막힌 이유가 뭐야? 회계·인사·마케팅·AIDOS 현재 실행: NOT_CONNECTED. 업무 지시는 실행하지 않습니다.</p><form id="maos-chat"><label for="maos-chat-input">질문 또는 보고 요청</label><textarea id="maos-chat-input" maxlength="1000" rows="3" required autocomplete="off" style="width:100%;box-sizing:border-box"></textarea><button type="submit" class="btn">질문 보내기</button></form><pre id="maos-chat-result" role="status" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></div></section><script>(()=>{
const form=document.getElementById('maos-chat');
const input=document.getElementById('maos-chat-input');
const result=document.getElementById('maos-chat-result');
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button');button.disabled=true;result.textContent='조회 중…';
 try {
  const entry=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-maos_csrf='));
  if(!entry)throw new Error('AUTH');
  const response=await fetch('/chat/query',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'content-type':'application/json','x-maos-csrf-token':decodeURIComponent(entry.slice('__Host-maos_csrf='.length))},body:JSON.stringify({message:input.value})});
  input.value='';const body=await response.json();
  if(!response.ok){result.textContent=response.status===401?'AUTHENTICATION_REQUIRED — 로그인 필요':response.status===403?'ACCESS_DENIED — 접근 거부':'UNAVAILABLE — 조회할 수 없습니다';return;}
  const a=body.answer;result.textContent=[a.kind+' · '+a.state,a.message,a.freshness?'Freshness: '+a.freshness:'',a.access?'권한: '+a.access:'',a.source?'출처: '+a.source:'',a.observedAt?'조회 시각 (UTC): '+a.observedAt:''].filter(Boolean).join(String.fromCharCode(10));
 } catch {result.textContent='UNAVAILABLE — 응답을 확인하지 못했습니다';}
 finally {input.value='';button.disabled=false;}
});
})()</script>`;
}
