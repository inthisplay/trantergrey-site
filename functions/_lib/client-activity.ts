import { adminSession, type AdminEnvironment } from './admin';
export async function clientActivity(request:Request,env:AdminEnvironment,client:string,action:string,summary:string,category='updates',actorName?:string) {
  const actor=actorName || (await adminSession(request,env))?.name || 'Admin';
  return env.TG_DATA.prepare('INSERT INTO client_activity(id,client_id,occurred_at,actor,action,category,summary) VALUES(?,?,?,?,?,?,?)')
    .bind(`client:${crypto.randomUUID()}`,client,new Date().toISOString(),actor,action,category,summary.slice(0,500));
}
