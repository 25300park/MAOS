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
}

export async function answerChat(input: string, read: typeof fetch): Promise<ChatAnswer> {
  const text = input.normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/[?.!。？！]+$/u, "").toLowerCase();
  const instruction = /만들|생성|게시|실행|전송|삭제|수정|배포|등록|create|execute|publish|delete|deploy/u.test(text);
  const report = /보고|요약|report|summari/u.test(text);
  const kind = instruction ? "INSTRUCTION" : report ? "REPORT" : "QUESTION";
  if (instruction) return {kind, state: "EXECUTION_DISABLED", message: "업무 지시는 실행하지 않습니다. Task 생성·전송·외부 실행이 이루어지지 않았습니다."};
  if (/회계|인사|급여|마케팅|개발|aidos|ai-mls|accounting|payroll|marketing|human resources/u.test(text)) {
    return {kind, state: "NOT_CONNECTED", message: "해당 부서의 검증된 조회 도구가 연결되지 않았습니다."};
  }
  // Whole-input allowlist: extra filters, URLs, tool names and compound requests
  // cannot silently become the unfiltered public aggregate.
  const supported = /^(?:rbs|rbs-homes) 공개 임대 검색 결과(?:는 몇 건인가요| 건수(?:를 알려 ?줘| 알려 ?주세요| 보고해 ?줘| 요약해 ?줘)?)$/u.test(text) ||
    /^(?:how many rbs public rental search matches|rbs public rental search count)$/u.test(text);
  if (!supported) return {kind, state: "CLARIFICATION_REQUIRED", message: "지원 질문: ‘RBS 공개 임대 검색 결과는 몇 건인가요?’ 지역·추가 조건별 또는 전체 등록 매물 수는 조회하지 않습니다."};
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
  return `<section class="panel" aria-label="CEO 통합 채팅"><div class="panel-head"><h2>CEO 통합 채팅</h2><span>조회 전용 · 저장/실행 없음</span></div><div class="panel-body"><p>지원 질문: RBS 공개 임대 검색 결과는 몇 건인가요?</p><p>개발·회계·인사·마케팅: NOT_CONNECTED. 업무 지시는 실행하지 않습니다.</p><form id="maos-chat"><label for="maos-chat-input">질문 또는 보고 요청</label><textarea id="maos-chat-input" maxlength="1000" rows="3" required autocomplete="off" style="width:100%;box-sizing:border-box"></textarea><button type="submit" class="btn">질문 보내기</button></form><pre id="maos-chat-result" role="status" aria-live="polite" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></div></section><script>(()=>{
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
  const a=body.answer;result.textContent=[a.kind+' · '+a.state,a.message,a.access?'권한: '+a.access:'',a.source?'출처: '+a.source:'',a.observedAt?'조회 시각 (UTC): '+a.observedAt:''].filter(Boolean).join(String.fromCharCode(10));
 } catch {result.textContent='UNAVAILABLE — 응답을 확인하지 못했습니다';}
 finally {input.value='';button.disabled=false;}
});
})()</script>`;
}
