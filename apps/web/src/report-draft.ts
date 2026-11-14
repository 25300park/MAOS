import type {ChatAnswer} from "./unified-chat.js";
import type {SessionBoundCoreRead} from "./session-bff.js";
import {readOperationsBriefing} from "./development-status.js";
import {loadProjectRegistry,loadSystemRegistry} from "./registry-reads.js";

export async function readCeoReport(input:string,permissions:readonly string[],read:SessionBoundCoreRead):Promise<ChatAnswer> {
  const briefing=await readOperationsBriefing(permissions,read);
  const weekly=input.includes("주간");
  return {...briefing,kind:"REPORT",message:[
    weekly?"개발팀 보고서 — 조회 가능한 등록 기록":"MAOS 운영 현황 보고서",
    `작성 시각 (UTC): ${new Date().toISOString()}`,
    "범위: 현재 인증 사용자·Project·STAGING의 기존 API 반환 범위. 전체 회사 실적이 아닙니다.",
    "보고 기간: NOT_AVAILABLE — 기간별 이력 집계 근거가 없어 주간 실적이 아닙니다.",
    briefing.message,
  ].join("\n\n")};
}

export async function readTaskDraft(input:string,permissions:readonly string[],read:SessionBoundCoreRead):Promise<ChatAnswer> {
  const system=input.includes("시스템 장애");
  const permission=system?"SYSTEM:READ":"PROJECT:READ";
  const title=system?"MAOS 시스템 장애 점검":input.includes("로그인")?"로그인 오류 수정 검토":"미완료 개발 작업 확인";
  let target="CLARIFICATION_REQUIRED — 대상 결속을 확인하지 못했습니다.";
  if(!permissions.includes(permission))target="ACCESS_DENIED — 대상 Registry를 조회하지 않았습니다.";
  else if(system){
    const registry=await loadSystemRegistry(read);
    // System name alone cannot establish the intended target or project-system mapping.
    target=registry.state==="RESTRICTED"?"ACCESS_DENIED":
      `CLARIFICATION_REQUIRED — 시스템 ID와 의도한 대상의 명시적 결속이 필요합니다. Registry: ${registry.state}. 이름으로 지정하지 않습니다.`;
  }else{
    const registry=await loadProjectRegistry(read);
    const p=registry.state==="AVAILABLE"&&registry.records.length===1?registry.records[0]:undefined;
    if(p&&p.environment==="STAGING"&&p.scope==="project-maos"&&p.repository==="registry://25300park/MAOS")target=`프로젝트: ${p.id} · ${p.environment} · ${p.repository}`;
    else if(registry.state==="RESTRICTED")target="ACCESS_DENIED";
  }
  return {kind:"INSTRUCTION",state:"DRAFT_ONLY",access:permission+" — 조회만, 실행 권한 미확인",freshness:"UNKNOWN",observedAt:new Date().toISOString(),
    source:system?"/api/v1/systems":"/api/v1/phase14/portal",
    message:["실행 전 업무 초안 · DRAFT_ONLY",`제목: ${title}`,`내용: ${input}`,`대상: ${target}`,
      "담당자: NOT_ASSIGNED", "우선순위: NOT_AVAILABLE", "마감일: NOT_AVAILABLE",
      "개발 위임 대상: AIDOS — NOT_CONNECTED / 실제 전달 없음. MAOS 자체 실행 대체 없음.",
      "확인사항: 대상·증상·재현 조건·허용 범위·실행 권한을 별도로 확인해야 합니다. 입력 내용은 사실 확인 또는 실행 승인이 아닙니다.",
      "Task / Command / Run 생성 0건. 승인 요청·외부 전송·실행·영구 저장 없음. 이 초안은 화면 검토용입니다.",
    ].join("\n")};
}
