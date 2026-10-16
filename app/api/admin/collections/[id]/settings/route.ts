import { NextResponse } from 'next/server';
import { publicOrigin, requireAdminApi } from '@/lib/admin-auth';
import { updateWorkCollection } from '@/lib/work-collections';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  const form = await request.formData();
  try {
    const collection = await updateWorkCollection(id, { name: typeof form.get('name') === 'string' ? String(form.get('name')) : '', slug: typeof form.get('slug') === 'string' ? String(form.get('slug')) : '', includePublished: form.get('includePublished') === 'on' });
    if (!collection) return NextResponse.redirect(new URL('/admin/collections', publicOrigin(request)), 303);
    return NextResponse.redirect(new URL(`/admin/collections/${id}`, publicOrigin(request)), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save this collection.';
    return NextResponse.redirect(new URL(`/admin/collections/${id}?error=${encodeURIComponent(message)}`, publicOrigin(request)), 303);
  }
}
