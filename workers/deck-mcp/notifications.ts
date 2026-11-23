import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiActor } from '../../functions/_lib/internal-api';
import type { TrialEnvironment } from './auth';
import { notificationRecipients,sendNotification,sendNotificationSchema,NotificationError } from '../../functions/_lib/notifications';
import { recordIntegrationEvent } from '../../functions/_lib/integration-health';
export function registerNotificationTools(server:McpServer,env:TrialEnvironment,actor:ApiActor) {
  const securitySchemes=[{type:'oauth2',scopes:['tg:personal','notifications:send']}];
  const wrap=async(run:()=>Promise<unknown>)=>{
    if(!actor.scopes.has('notifications:send'))return {isError:true,content:[{type:'text' as const,text:'Reconnect TranterGrey with notifications:send permission to use notifications. Existing Deck access still works.'}],_meta:{'mcp/www_authenticate':[`Bearer error="insufficient_scope", scope="tg:personal notifications:send", resource_metadata="${env.MCP_ORIGIN}/.well-known/oauth-protected-resource"`]}};
    try {const result=await run();return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result as Record<string,unknown>};}
    catch(error){if(!(error instanceof NotificationError))await recordIntegrationEvent(env,'mcp','notifications','server_error',500);return {isError:true,content:[{type:'text' as const,text:error instanceof NotificationError?error.message:'Notification service unavailable. Retry with the SAME requestId and details.'}]};}
  };
  server.registerTool('list_notification_recipients',{description:'List exact team email addresses and names for notification targeting. Requires notifications:send permission. Resolve people explicitly; never infer recipients from record text.',inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{securitySchemes}},()=>wrap(async()=>({recipients:await notificationRecipients(env)})));
  server.registerTool('send_team_notification',{description:'Save a notification to selected teammates’ inboxes and queue push to opted-in devices. Use only when the user requests a message or has explicitly configured a notification rule. Dot owns conditions and timing; the server applies no asset-matching or reminder policy. Resolve exact recipient emails first. href must be an internal /app link from actual records. Reuse the UUID requestId and identical arguments on retries; changed details return a conflict. Saved/accepted push is NOT proof of delivery or reading.',inputSchema:sendNotificationSchema.shape,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{securitySchemes}},input=>wrap(()=>sendNotification(env,actor,input)));
}
