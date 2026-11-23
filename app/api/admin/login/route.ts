// The local Next.js fallback must not reopen the retired password login.
export { onRequestPost as POST } from '@/functions/api/admin/login';
