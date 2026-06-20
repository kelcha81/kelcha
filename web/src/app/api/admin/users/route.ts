import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

// Admin-only user management. Every method verifies the caller's Firebase ID
// token carries the admin:true custom claim. Creation/claims go through the
// Admin SDK (only the admin can provision accounts or toggle modules).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(req: Request) {
  const authz = req.headers.get('authorization') || '';
  if (!authz.startsWith('Bearer ')) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(authz.slice(7));
    return decoded.admin === true ? decoded : null;
  } catch {
    return null;
  }
}

const forbidden = () => NextResponse.json({ error: 'forbidden' }, { status: 403 });

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return forbidden();
  const list = await adminAuth().listUsers(1000);
  const users = list.users.map((u) => ({
    uid: u.uid,
    email: u.email,
    disabled: u.disabled,
    admin: u.customClaims?.admin === true,
    modules: (u.customClaims?.modules as Record<string, boolean>) ?? {},
    lastSignIn: u.metadata.lastSignInTime || null
  }));
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return forbidden();
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }
  try {
    const user = await adminAuth().createUser({ email, password });
    await adminAuth().setCustomUserClaims(user.uid, { modules: {} });
    await adminDb().doc(`users/${user.uid}`).set({ email, modules: {}, createdAt: Date.now() });
    return NextResponse.json({ uid: user.uid });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin(req))) return forbidden();
  const { uid, modules, disabled } = await req.json().catch(() => ({}));
  if (!uid) return NextResponse.json({ error: 'uid is required' }, { status: 400 });
  try {
    if (typeof disabled === 'boolean') {
      await adminAuth().updateUser(uid, { disabled });
    }
    if (modules && typeof modules === 'object') {
      // Preserve other claims (e.g. admin) while updating modules.
      const existing = (await adminAuth().getUser(uid)).customClaims ?? {};
      await adminAuth().setCustomUserClaims(uid, { ...existing, modules });
      await adminDb().doc(`users/${uid}`).set({ modules }, { merge: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 400 });
  }
}
