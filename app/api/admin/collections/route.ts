import { NextResponse } from 'next/server';
import { publicOrigin, requireAdminApi } from '@/lib/admin-auth';
import { createWorkCollection } from '@/lib/work-collections';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const form = await request.formData();
  const name = form.get('name');
  const slug = form.get('slug');
  try {
    const collection = await createWorkCollection({ name: typeof name === 'string' ? name : '', slug: typeof slug === 'string' ? slug : '', includePublished: form.get('includePublished') === 'on' });
    return NextResponse.redirect(new URL(`/admin/collections/${collection.id}`, publicOrigin(request)), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create this collection.';
    return NextResponse.redirect(new URL(`/admin/collections?error=${encodeURIComponent(message)}`, publicOrigin(request)), 303);
  }
}
