import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { join } from 'path';
import { dataDirectory } from '@/lib/data-directory';

export const runtime = 'nodejs';

type SavedInquiry = {
  id: string;
  receivedAt: string;
  name: string;
  email: string;
  business: string;
  focus: string;
  timeline: string;
  message: string;
};

const inquiriesFile = join(dataDirectory, 'contact-inquiries.json');
const limited = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';

async function readInquiries() {
  try {
    const data = await readFile(inquiriesFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed as SavedInquiry[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (limited(body.website, 120)) return Response.json({ ok: true });
    const inquiry = {
      name: limited(body.name, 100),
      email: limited(body.email, 180),
      business: limited(body.business, 140),
      focus: limited(body.focus, 80),
      timeline: limited(body.timeline, 80),
      message: limited(body.message, 2000),
    };
    if (!inquiry.name || !inquiry.business || !inquiry.focus || !inquiry.timeline || !inquiry.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) {
      return Response.json({ error: 'Please complete the required fields and try again.' }, { status: 400 });
    }
    await mkdir(dataDirectory, { recursive: true });
    const inquiries = await readInquiries();
    inquiries.unshift({ id: randomUUID(), receivedAt: new Date().toISOString(), ...inquiry });
    const temporaryFile = `${inquiriesFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(inquiries, null, 2));
    await rename(temporaryFile, inquiriesFile);
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'We could not save that note. Please try again.' }, { status: 500 });
  }
}
