import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory } from './data-directory';

export type ContactInquiry = {
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

export async function getContactInquiries(): Promise<ContactInquiry[]> {
  try {
    const data = JSON.parse(await readFile(inquiriesFile, 'utf8'));
    return Array.isArray(data) ? data as ContactInquiry[] : [];
  } catch {
    return [];
  }
}
