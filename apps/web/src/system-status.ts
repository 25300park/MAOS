import { chatIntent } from "./unified-chat.js";
import { loadSystemRegistry } from "./registry-reads.js";
import type { SessionBoundCoreRead } from "./session-bff.js";
import type { ChatAnswer } from "./unified-chat.js";

export function isSystemQuestion(input: string): boolean {
  return chatIntent(input) === "SYSTEMS";
}

export async function readSystemStatus(read: SessionBoundCoreRead): Promise<ChatAnswer> {
  const base: ChatAnswer = {kind:"QUESTION",state:"NOT_AVAILABLE",access:"SYSTEM:READ",freshness:"UNKNOWN",source:"/api/v1/systems",
    message:"허용된 시스템 등록 기록을 확인할 수 없습니다. 연결 여부와 정상 작동 여부는 추정하지 않습니다."};
  const registry = await loadSystemRegistry(read);
  if (registry.state !== "AVAILABLE") return {...base,state:registry.state === "RESTRICTED" ? "RESTRICTED" : "NOT_AVAILABLE"};
  return {...base,state:"AVAILABLE",observedAt:new Date().toISOString(),message:[
    "조회 범위: 현재 세션에 허용된 프로젝트·조직·시스템 Registry 반환 범위만 표시합니다. 회사 전체 목록이나 연결 성공 목록이 아닙니다.",
    ...registry.records.map(s => `${s.name}: Registry: ${s.lifecycle} · Connectivity: UNKNOWN · Health: ${s.health}`),
    "ACTIVE는 등록 상태이며 HEALTHY를 의미하지 않습니다. Connectivity는 기존 응답에 없으므로 UNKNOWN입니다. Health는 원천 보고값이며 실시간 점검 결과가 아닙니다.",
    "UNKNOWN은 장애 없음의 증거가 아닙니다. 원천 갱신 시각: NOT_AVAILABLE. 조회 시각은 원천 갱신 시각과 다릅니다.",
    "AIDOS 실행 연동: NOT_CONNECTED (Registry 등록 상태와 별개)."
  ].join("\n")};
}
