import { readSystemStatus } from "./system-status.js";
import { chatIntent } from "./unified-chat.js";
import { loadProjectRegistry } from "./registry-reads.js";
import type { SessionBoundCoreRead } from "./session-bff.js";
import type { ChatAnswer } from "./unified-chat.js";

export function isDevelopmentQuestion(input: string): boolean {
  return ["DEVELOPMENT", "BLOCKERS", "NEXT_ACTION"].includes(chatIntent(input));
}
export async function readDevelopmentStatus(read:SessionBoundCoreRead, view: "overview" | "blockers" | "next" = "overview"):Promise<ChatAnswer> {
  const base:ChatAnswer={kind:"QUESTION",state:"NOT_AVAILABLE",message:"개발 기록을 확인할 수 없습니다. AIDOS: NOT_CONNECTED",access:"PROJECT:READ",freshness:"UNKNOWN"};
  try {
    const registry=await loadProjectRegistry(read);
    if(registry.state!=="AVAILABLE"||registry.records.length!==1)return {...base,state:registry.state==="RESTRICTED"?"RESTRICTED":"NOT_AVAILABLE"};
    const project=registry.records[0]!;
    if(project.environment!=="STAGING")return base;
    const source=`/api/v1/projects/${encodeURIComponent(project.id)}/development-status`;
    const response=await read(source);
    if(response.status===401||response.status===403)return {...base,state:"RESTRICTED",source};
    if(!response.ok)return {...base,source};
    const body=await response.json();const d=body?.ok===true?body.data?.developmentStatus:undefined;
    if(!d||d.projectId!==project.id||d.environment!=="STAGING"||d.coverage!=="CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY"||d.freshness!=="UNKNOWN"||!Number.isFinite(Date.parse(d.observedAt))||typeof d.partial!=="boolean"||typeof d.hasMore!=="boolean"||!Array.isArray(d.records)||d.records.length>20)return {...base,source};
    const categories=["COMPLETED_HISTORY","RECORDED_PROGRESS","BLOCKED_OR_WAITING","NOT_AVAILABLE"];
    for(const r of d.records)if(!r||!categories.includes(r.category)||!["UNKNOWN","STALE"].includes(r.freshness)||typeof r.commandId!=="string"||!/^[a-f0-9-]{36}$/iu.test(r.commandId)||typeof r.state!=="string"||!/^[A-Z_]+$/u.test(r.state)||r.nextTask!=="NOT_AVAILABLE"||(r.updatedAt!==null&&!Number.isFinite(Date.parse(r.updatedAt))))return {...base,source};
    if (view !== "overview") {
      const waiting = ["WAITING_HUMAN", "WAITING_APPROVAL"];
      const blocked = ["FAILED", "DENIED", "REJECTED", "EXPIRED"];
      // Reject contradictory source classification; READY/DISPATCHED never become blockers.
      if (d.records.some((r:{state:string;category:string}) =>
        (r.category === "BLOCKED_OR_WAITING") !== [...waiting,...blocked].includes(r.state))) return {...base,source};
      const rows = d.records.filter((r:{state:string}) => [...waiting,...blocked].includes(r.state));
      const lines = view === "blockers" ? [
        `대기 기록: ${rows.filter((r:{state:string})=>waiting.includes(r.state)).length}건 (현재 페이지)`,
        `차단/실패 기록: ${rows.filter((r:{state:string})=>blocked.includes(r.state)).length}건 (현재 페이지)`,
        ...rows.map((r:{commandId:string;state:string;freshness:string;updatedAt:string|null;reason:unknown;evidenceCount:unknown}) =>
          `${r.commandId}: 저장 상태 ${r.state} · ${r.freshness} · 원천 updated_at: ${r.updatedAt ?? "NOT_AVAILABLE"} · 사유: ${typeof r.reason==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/u.test(r.reason)?r.reason:"NOT_AVAILABLE"} · Evidence: ${typeof r.evidenceCount==="number"&&Number.isSafeInteger(r.evidenceCount)&&r.evidenceCount>0?r.evidenceCount:"NOT_AVAILABLE"}`),
      ] : ["다음 작업: NOT_AVAILABLE — 기존 응답에는 명시적으로 연결된 다음 작업 근거가 없습니다. Task 연결·READY·DISPATCHED로 다음 작업을 추정하지 않습니다.",
        ...d.records.map((r:{commandId:string;updatedAt:string|null;freshness:string}) => `${r.commandId}: 원천 updated_at: ${r.updatedAt ?? "NOT_AVAILABLE"} · ${r.freshness}`)];
      return {...base,state:"AVAILABLE",source,observedAt:d.observedAt,
        freshness:d.records.some((r:{freshness:string})=>r.freshness==="STALE")?"STALE":"UNKNOWN",
        message:["현재 Human·Project·STAGING의 반환된 등록 기록만 조회합니다. 저장 상태이며 현재 실행 상태가 아닙니다.",...lines,
          "0건은 조회 범위 내 현재 페이지의 기록 수입니다. 회사 전체에 문제가 없다는 뜻이 아닙니다. READY/DISPATCHED는 실제 실행 중 또는 차단으로 판단하지 않습니다.",
          `페이지 누락: ${d.partial?"YES":"NO"}; 추가 페이지: ${d.hasMore?"YES":"NO"}. 페이지 간 일관된 스냅샷을 보장하지 않습니다.`,
          "사유와 Evidence 개수는 원천 요약이며 전체 Evidence 무결성 검증이 아닙니다. 근거 없는 우선순위·일정·다음 작업은 생성하지 않습니다. AIDOS 현재 실행: NOT_CONNECTED."
        ].join("\n")};
    }
    const labels=["과거 완료 기록","저장된 진행 상태 (실행 중 보장 아님)","차단/대기 기록","근거 부족"];
    const lines=categories.map((category,i)=>`${labels[i]}: ${d.records.filter((r:{category:string})=>r.category===category).length}건 (현재 페이지)`);
    for(const r of d.records)lines.push(`${r.commandId}: ${r.state} · ${r.freshness} · 원천 갱신: ${r.updatedAt ?? "NOT_AVAILABLE"} · 사유: ${typeof r.reason==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/u.test(r.reason)?r.reason:"NOT_AVAILABLE"} · Evidence: ${Number.isSafeInteger(r.evidenceCount)&&r.evidenceCount>0?r.evidenceCount:"NOT_AVAILABLE"}`);
    return {...base,state:"AVAILABLE",source,observedAt:d.observedAt,freshness:d.records.some((r:{freshness:string})=>r.freshness==="STALE")?"STALE":"UNKNOWN",
      message:["현재 Human이 조회 가능한 등록 Command만 포함합니다. 전체 개발 진행률이 아닙니다.",...lines,`페이지 누락: ${d.partial?"YES":"NO"}; 추가 페이지: ${d.hasMore?"YES":"NO"}. 페이지 간 일관된 스냅샷을 보장하지 않습니다.`,"다음 작업: NOT_AVAILABLE. AIDOS 현재 실행: NOT_CONNECTED."].join("\n")};
  }catch{return base;}
}

// Uses the existing session-bound readers; each domain retains its own authority.
export async function readOperationsBriefing(permissions: readonly string[], read: SessionBoundCoreRead): Promise<ChatAnswer> {
  const section = async (permission: string, reader: () => Promise<ChatAnswer>): Promise<ChatAnswer> => {
    if (!permissions.includes(permission)) return {kind:"REPORT",state:"ACCESS_DENIED",message:"조회 권한이 없어 이 영역은 조회하지 않았습니다.",access:permission,freshness:"UNKNOWN"};
    try { return await reader(); }
    catch { return {kind:"REPORT",state:"NOT_AVAILABLE",message:"응답을 확인하지 못했습니다.",access:permission,freshness:"UNKNOWN"}; }
  };
  const [development, systems] = await Promise.all([
    section("PROJECT:READ", () => readDevelopmentStatus(read)),
    section("SYSTEM:READ", () => readSystemStatus(read)),
  ]);
  const state = (answer: ChatAnswer): string => answer.state === "AVAILABLE" ? "AVAILABLE" :
    ["RESTRICTED", "ACCESS_DENIED"].includes(answer.state) ? "ACCESS_DENIED" : "NOT_AVAILABLE";
  const available = [development,systems].filter(answer => state(answer) === "AVAILABLE").length;
  const detail = (label: string, answer: ChatAnswer, conciseDevelopment = false): string => {
    const message = conciseDevelopment && state(answer) === "AVAILABLE"
      ? answer.message.split("\n").filter(line => !/^[a-f0-9-]{36}:/iu.test(line)).join("\n")
      : answer.message;
    return [label+" · "+state(answer),message,
      "출처: "+(answer.source ?? "NOT_AVAILABLE"),
      "조회 시각 (UTC): "+(answer.observedAt ?? "NOT_AVAILABLE"),
      "Freshness: "+(answer.freshness ?? "UNKNOWN")+" · 권한: "+answer.access].join("\n");
  };
  return {kind:"REPORT",state:available===2?"AVAILABLE":available===1?"PARTIAL":"NOT_AVAILABLE",
    freshness:[development,systems].some(answer=>answer.freshness==="STALE")?"STALE":"UNKNOWN",
    access:"PROJECT:READ / SYSTEM:READ — 영역별 독립 검사",
    message:[
      available===2?"통합 브리핑 — 허용된 두 조회 영역의 기록입니다. 회사 전체 운영 성공을 의미하지 않습니다.":"부분 브리핑 — 확인되지 않은 영역이 있습니다. 전체 조회 성공이 아닙니다.",
      detail("개발 기록",development,true),detail("시스템 등록·상태",systems),
      "확인 필요한 사항",
      ...[["개발",development],["시스템",systems]].map(([label,answer])=>{const a=answer as ChatAnswer;return label+": "+(state(a)==="AVAILABLE"?"최신성 "+(a.freshness??"UNKNOWN")+" — 현재 정상 운영으로 추정하지 않습니다.":state(a)+" — 해당 영역을 판단할 수 없습니다.");}),
      "조회 시각은 원천 갱신 시각이 아닙니다. 두 API는 동시에 갱신된 단일 스냅샷이 아닙니다. 개별 개발 기록은 개발 현황 질문으로 확인하세요.",
      "Finance / Marketing / HR: NOT_CONNECTED. AIDOS 현재 실행: NOT_CONNECTED. 업무 생성·실행·승인·데이터 변경 없음."
    ].join("\n\n")};
}
