import { sameValue, type AdminEnvironment } from '../../_lib/admin';
import { archiveWorkerStep } from '../../_lib/video-archive';

export async function onRequestPost({request,env}:{request:Request;env:AdminEnvironment}) {
  const key=env.ARCHIVE_WORKER_SECRET;
  if(!key || key.length<32 || !sameValue(request.headers.get('authorization')||'',`Bearer ${key}`))return new Response('Unauthorized',{status:401});
  return Response.json(await archiveWorkerStep(env),{headers:{'Cache-Control':'no-store'}});
}
