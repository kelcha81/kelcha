import { adminAuth } from '@/lib/firebaseAdmin';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Shared server-route auth: verify the caller's Firebase ID token from the
// Authorization header. Used by admin, Notion, and data-packaging routes.

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || 'kelvin.chau.uk@gmail.com,kelvin@kelcha.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/** Verify the caller's ID token and invite-only allowlist; return the decoded token or null. */
export async function requireUser(req: Request): Promise<DecodedIdToken | null> {
  const authz = req.headers.get('authorization') || '';
  if (!authz.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(authz.slice(7));
    const email = (decoded.email || '').trim().toLowerCase();
    if (!email || !ALLOWED_EMAILS.has(email)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Verify the caller's ID token; return their uid or null. */
export async function requireUid(req: Request): Promise<string | null> {
  return (await requireUser(req))?.uid ?? null;
}

/** Verify the caller is an admin (admin:true custom claim or allowlisted owner); else null. */
export async function requireAdmin(req: Request): Promise<DecodedIdToken | null> {
  const decoded = await requireUser(req);
  if (!decoded) return null;
  const email = (decoded.email || '').trim().toLowerCase();
  return decoded.admin === true || ALLOWED_EMAILS.has(email) ? decoded : null;
}
