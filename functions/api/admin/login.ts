// Fail closed even if ADMIN_PASSWORD is still present in deployment secrets.
// Google OAuth is the only admin sign-in path.
export async function onRequestPost(): Promise<Response> {
  return Response.json({ error: 'Password sign-in is disabled. Sign in with Google.' }, {
    status: 403,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
