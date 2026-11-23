import { requireApiScope,apiData,apiError } from '../../../_lib/internal-api';
import type { AdminEnvironment } from '../../../_lib/admin';
import { notificationRecipients,sendNotification,NotificationError,notificationJson } from '../../../_lib/notifications';
type Context={request:Request;env:AdminEnvironment};
export async function onRequest({request,env}:Context) {
  const actor=await requireApiScope(request,env,'notifications:send'); if(actor instanceof Response)return actor;
  if(request.method==='GET')return apiData({recipients:await notificationRecipients(env)});
  if(request.method!=='POST')return apiError('method_not_allowed','Use GET or POST.',405);
  try {return apiData(await sendNotification(env,actor,await notificationJson(request)));}
  catch(error) {if(error instanceof NotificationError)return apiError('notification_error',error.message,error.status);throw error;}
}
