import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import db from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-change-in-prod-please'
);
const JWT_EXPIRES_IN = '1d'; // 24 hours for internal tool

export interface SessionUser {
  id: number;
  username: string;
  role: 'user' | 'admin';
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ 
    id: user.id, 
    username: user.username, 
    role: user.role 
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as number,
      username: payload.username as string,
      role: payload.role as 'user' | 'admin',
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set('session', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
}

// Helper for server actions
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new Error('Vui lòng đăng nhập');
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') {
    throw new Error('Chỉ admin mới thực hiện được hành động này');
  }
  return user;
}

// Auto-create admin user from environment variables on first run.
// This is useful for production deployments where no admin exists yet.
export async function ensureAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return { created: false, reason: 'ADMIN_USERNAME or ADMIN_PASSWORD not set' };
  }

  const existing = db.prepare('SELECT id, role, is_active FROM users WHERE username = ?').get(adminUsername) as
    | { id: number; role: string; is_active: number }
    | undefined;

  if (existing) {
    if (existing.role !== 'admin' || existing.is_active !== 1) {
      db.prepare("UPDATE users SET role = 'admin', is_active = 1 WHERE id = ?").run(existing.id);
      console.log(`[ensureAdminUser] Promoted ${adminUsername} to admin`);
      return { created: false, promoted: true, username: adminUsername };
    }
    return { created: false, reason: 'already exists', username: adminUsername };
  }

  const passwordHash = await hashPassword(adminPassword);
  const result = db.prepare(
    "INSERT INTO users (username, password_hash, role, is_active, created_at) VALUES (?, ?, 'admin', 1, datetime('now'))"
  ).run(adminUsername, passwordHash);

  console.log(`[ensureAdminUser] Created admin user: ${adminUsername} (id=${result.lastInsertRowid})`);
  return { created: true, username: adminUsername, id: result.lastInsertRowid };
}