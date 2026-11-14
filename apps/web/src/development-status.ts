import { chatIntent } from "./unified-chat.js";
import { loadProjectRegistry } from "./registry-reads.js";
import type { SessionBoundCoreRead } from "./session-bff.js";
import type { ChatAnswer } from "./unified-chat.js";

export function isDevelopmentQuestion(input: string): boolean {
  return chatIntent(input) === "DEVELOPMENT";
}
export async function readDevelopmentStatus(read:SessionBoundCoreRead):Promise<ChatAnswer> {
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
    const labels=["과거 완료 기록","저장된 진행 상태 (실행 중 보장 아님)","차단/대기 기록","근거 부족"];
    const lines=categories.map((category,i)=>`${labels[i]}: ${d.records.filter((r:{category:string})=>r.category===category).length}건 (현재 페이지)`);
    for(const r of d.records)lines.push(`${r.commandId}: ${r.state} · ${r.freshness} · 원천 갱신: ${r.updatedAt ?? "NOT_AVAILABLE"} · 사유: ${typeof r.reason==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/u.test(r.reason)?r.reason:"NOT_AVAILABLE"} · Evidence: ${Number.isSafeInteger(r.evidenceCount)&&r.evidenceCount>0?r.evidenceCount:"NOT_AVAILABLE"}`);
    return {...base,state:"AVAILABLE",source,observedAt:d.observedAt,freshness:d.records.some((r:{freshness:string})=>r.freshness==="STALE")?"STALE":"UNKNOWN",
      message:["현재 Human이 조회 가능한 등록 Command만 포함합니다. 전체 개발 진행률이 아닙니다.",...lines,`페이지 누락: ${d.partial?"YES":"NO"}; 추가 페이지: ${d.hasMore?"YES":"NO"}. 페이지 간 일관된 스냅샷을 보장하지 않습니다.`,"다음 작업: NOT_AVAILABLE. AIDOS 현재 실행: NOT_CONNECTED."].join("\n")};
  }catch{return base;}
}
