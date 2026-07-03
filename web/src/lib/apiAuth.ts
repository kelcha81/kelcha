import { adminAuth } from '@/lib/firebaseAdmin';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Shared server-route auth: verify the caller's Firebase ID token from the
// Authorization header. Used by admin, Notion, and data-packaging routes.

/** Verify the caller's ID token; return the decoded token or null. */
export async function requireUser(req: Request): Promise<DecodedIdToken | null> {
  const authz = req.headers.get('authorization') || '';
  if (!authz.startsWith('Bearer ')) return null;
  try {
    return await adminAuth().verifyIdToken(authz.slice(7));
  } catch {
    return null;
  }
}

/** Verify the caller's ID token; return their uid or null. */
export async function requireUid(req: Request): Promise<string | null> {
  return (await requireUser(req))?.uid ?? null;
}

/** Verify the caller is an admin (admin:true custom claim); else null. */
export async function requireAdmin(req: Request): Promise<DecodedIdToken | null> {
  const decoded = await requireUser(req);
  return decoded?.admin === true ? decoded : null;
}
