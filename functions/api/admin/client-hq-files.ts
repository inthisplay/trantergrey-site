import type { AdminEnvironment } from '../../_lib/admin';
import { DriveFileError, trashClientFile } from '../../_lib/client-drive-files';

export async function onRequest({request,env}:{request:Request;env:AdminEnvironment}) {
  const headers = { 'Cache-Control':'private, no-store' };
  if (request.method !== 'POST') return Response.json({error:'Use POST.'},{status:405,headers});
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'Use the Client HQ website to delete files.'},{status:403,headers});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error:'Send JSON.'},{status:415,headers});
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({error:'Request too large.'},{status:413,headers});
  try {
    const body = await request.text();
    if (body.length > 4096) return Response.json({error:'Request too large.'},{status:413,headers});
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new DriveFileError('Invalid JSON.'); }
    return Response.json(await trashClientFile(request,env,input),{headers});
  } catch (error) {
    if (error instanceof DriveFileError) return Response.json({error:error.message},{status:error.status,headers});
    // Middleware records only the operation/status; never upstream exceptions or contents.
    return Response.json({error:'Could not confirm the move to Drive trash. Check Drive, then retry this same request.'},{status:503,headers});
  }
}
