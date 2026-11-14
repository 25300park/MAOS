import type { DevelopmentCommandRow } from "@maos/database";
import { ApiRequestError, type ApiRoute } from "./app.js";

interface Ports {
  listDevelopmentStatus(input:{actorId:string;projectId:string;scope:string;limit:number;after?:string}):Promise<DevelopmentCommandRow[]>;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function fail(status:number,code:string):never {
  throw new ApiRequestError(status,{code,type:status===403?"AUTHORIZATION":"VALIDATION",severity:"INFO",retryable:false,details:{}});
}
export function createDevelopmentStatusRoutes(ports:Ports|undefined, binding:{projectId:string|undefined;scope:string;environment:string}):ApiRoute[] {
  return [{method:"GET",path:"/api/v1/projects/:projectId/development-status",
    access:{resource:"PROJECT",action:"READ",risk:"R0",environment:"staging",scope:binding.scope},
    handle:async ({identity,params,request})=>{
      if(!identity || identity.actor_type!=="HUMAN") fail(403,"DEVELOPMENT_STATUS_RESTRICTED");
      if(!ports || binding.environment!=="staging" || !binding.projectId || !UUID.test(binding.projectId)) fail(503,"DEVELOPMENT_STATUS_UNAVAILABLE");
      if(params.projectId!==binding.projectId) fail(403,"PROJECT_SCOPE_DENIED");
      const query=new URL(request.url ?? "","http://localhost").searchParams;
      const limit=Number(query.get("limit") ?? 10);const after=query.get("after");
      if([...query.keys()].some(k=>!["limit","after"].includes(k)) || query.getAll("limit").length>1 || query.getAll("after").length>1 || !Number.isInteger(limit)||limit<1||limit>20||(after!==null&&!UUID.test(after))) fail(422,"INVALID_PAGE");
      const rows=await ports.listDevelopmentStatus({actorId:identity.actor_id,projectId:binding.projectId,scope:binding.scope,limit,...(after?{after}:{})});
      const observedAt=new Date().toISOString();
      const records=[];
      for(const row of rows.slice(0,limit)) {
        if(row.project_id!==binding.projectId||row.human_actor_id!==identity.actor_id||row.environment!=="STAGING"||row.project_scope_ref!==binding.scope) fail(403,"PROJECT_SCOPE_DENIED");
        const updated=new Date(row.updated_at).getTime();
        const expired=row.expires_at!==null && new Date(row.expires_at).getTime()<=Date.now();
        const state=row.lifecycle_state;
        const category=state==="COMPLETED"?"COMPLETED_HISTORY":["WAITING_HUMAN","WAITING_APPROVAL","FAILED","DENIED","REJECTED","EXPIRED"].includes(state)?"BLOCKED_OR_WAITING":["RECEIVED","INTERPRETING","CLASSIFIED","PLANNING","REVIEW","READY","DISPATCHED"].includes(state)?"RECORDED_PROGRESS":"NOT_AVAILABLE";
        records.push({commandId:row.id,state,category,updatedAt:Number.isFinite(updated)?new Date(updated).toISOString():null,
          freshness:expired||row.lifecycle_state==="STALE"?"STALE":"UNKNOWN",
          task:row.task_id&&row.task_linked===true?row.task_id:"NOT_AVAILABLE",
          run:row.run_id&&row.run_linked===true?row.run_id:"NOT_AVAILABLE",
          reason:row.reason_code&&/^[A-Z][A-Z0-9_]{0,79}$/u.test(row.reason_code)?row.reason_code:"NOT_AVAILABLE",
          evidenceCount:Number.isSafeInteger(Number(row.evidence_count))&&Number(row.evidence_count)>0?Number(row.evidence_count):null,nextTask:"NOT_AVAILABLE"});
      }
      return {developmentStatus:{projectId:binding.projectId,environment:"STAGING",source:"work.command_envelopes + scoped task/run/evidence metadata",observedAt,freshness:"UNKNOWN",
        coverage:"CURRENT_HUMAN_REGISTERED_COMMANDS_ONLY",hasMore:rows.length>limit,nextCursor:rows.length>limit?records.at(-1)?.commandId:null,
        partial:!!after||rows.length>limit,records,aidos:"NOT_CONNECTED"}};
    }}];
}
