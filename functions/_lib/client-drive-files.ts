import { adminSession, type AdminEnvironment } from './admin';
import { driveFile, driveId, driveRequest, driveToken, folderType, requireWithin, withDriveLock } from './client-drive';

export class DriveFileError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type TrashInput = { clientId: string; rootId: string; fileId: string; expectedVersion: string; requestId: string };
type TrashRequest = TrashInput & { file_name: string; activity_id: string; state: string; client_id: string; root_id: string; file_id: string; expected_version: string };

/** Session-only shared command: scoped integrations do not have Drive trash authority. */
export async function trashClientFile(request: Request, env: AdminEnvironment, value: unknown) {
  const actor = await adminSession(request, env);
  if (!actor?.email) throw new DriveFileError('Sign in to manage Client HQ files.', 401);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DriveFileError('Provide a file and client.');
  const input = value as TrashInput;
  for (const key of ['clientId','rootId','fileId','expectedVersion','requestId'] as const) {
    if (typeof input[key] !== 'string' || !/^[\w-]{1,200}$/.test(input[key])) throw new DriveFileError('Invalid file request. Refresh the file preview.');
  }
  const actorId = actor.email.toLowerCase();
  // Serialize against app folder relinking and other trash requests for this file.
  return withDriveLock(env, 'folder-setup', () => withDriveLock(env, `trash:${input.fileId}`, async () => {
    const client = await env.TG_DATA.prepare('SELECT drive_folder_id FROM client_directory WHERE id=?').bind(input.clientId).first<{drive_folder_id: string | null}>();
    if (!client?.drive_folder_id) throw new DriveFileError('Choose a linked client folder first.');
    if (input.rootId !== client.drive_folder_id && !await env.TG_DATA.prepare('SELECT folder_id FROM client_drive_extra_folders WHERE client_id=? AND folder_id=?').bind(input.clientId,input.rootId).first()) throw new DriveFileError('This folder is not linked to this client.',403);
    const previous = await env.TG_DATA.prepare('SELECT * FROM client_drive_trash_requests WHERE actor_id=? AND request_id=?').bind(actorId,input.requestId).first<TrashRequest>();
    if (previous && (previous.client_id !== input.clientId || previous.root_id !== input.rootId || previous.file_id !== input.fileId || previous.expected_version !== input.expectedVersion)) throw new DriveFileError('This request ID was already used for a different file.',409);
    if (previous?.state === 'completed') return { ok: true, replayed: true };
    const token = await driveToken(env);
    await requireWithin(token,input.rootId,driveId(env));
    const file = await driveFile(token,input.fileId);
    if (file.mimeType === folderType || file.mimeType === 'application/vnd.google-apps.shortcut' || file.id === input.rootId) throw new DriveFileError('Only individual documents and files can be trashed here. Folders and shortcuts are protected.');
    // A pending request can reconcile a successful Drive write after a lost response.
    if (file.trashed) {
      if (!previous) throw new DriveFileError('This file is already in Drive trash. Refresh the file list.',409);
      if (!file.parents?.[0]) throw new DriveFileError('Cannot verify this file’s folder.',409);
      await requireWithin(token,file.parents[0],input.rootId);
    } else {
      await requireWithin(token,file.id,input.rootId);
      if (file.version !== input.expectedVersion) throw new DriveFileError('This file changed since the preview was opened. Close and reopen its preview before deleting.',409);
      if (file.capabilities?.canTrash !== true) throw new DriveFileError('The connected Google Drive account cannot move this file to trash.',403);
    }
    const now = new Date().toISOString();
    const activityId = previous?.activity_id || `client:${crypto.randomUUID()}`;
    if (!previous) {
      await env.TG_DATA.batch([
        env.TG_DATA.prepare("INSERT INTO client_drive_trash_requests(actor_id,request_id,client_id,root_id,file_id,expected_version,file_name,activity_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?)").bind(actorId,input.requestId,input.clientId,input.rootId,input.fileId,input.expectedVersion,file.name,activityId,now),
        env.TG_DATA.prepare('INSERT INTO client_activity(id,client_id,occurred_at,actor,action,category,summary) VALUES(?,?,?,?,?,?,?)').bind(activityId,input.clientId,now,actor.name,'drive_trash_requested','updates',`Requested move to Drive trash: ${file.name}`.slice(0,500)),
      ]);
    }
    if (!file.trashed) {
      const result = await driveRequest<{trashed?:boolean}>(token,`files/${input.fileId}?supportsAllDrives=true&fields=id,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true}),signal:AbortSignal.timeout(20000)});
      if (!result.trashed) throw new Error('Drive did not confirm trashing.');
    }
    await env.TG_DATA.batch([
      env.TG_DATA.prepare("UPDATE client_drive_trash_requests SET state='completed',completed_at=? WHERE actor_id=? AND request_id=?").bind(now,actorId,input.requestId),
      env.TG_DATA.prepare("UPDATE client_activity SET action='drive_trashed',summary=? WHERE id=?").bind(`Moved to Drive trash: ${previous?.file_name || file.name}`.slice(0,500),activityId),
    ]);
    return { ok: true, replayed: Boolean(previous) };
  }));
}
