import fs from 'fs';
import path from 'path';
import db from './db';

export const DB_PATH = path.join(process.cwd(), 'data', 'wc2026.db');
export const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','));
  }
  return lines.join('\n');
}

export function createSnapshot(suffix: string): string {
  ensureBackupDir();
  const filename = `wc2026-${suffix}-${timestamp()}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  // Use SQLite's backup API for a consistent snapshot
  db.backup(dest)
    .then(() => console.log(`[backup] Snapshot created: ${dest}`))
    .catch((err) => console.error('[backup] Snapshot failed:', err));
  return filename;
}

export function backupDatabase(): { filename: string; path: string; size: number } {
  ensureBackupDir();
  const filename = `wc2026-manual-${timestamp()}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  fs.copyFileSync(DB_PATH, dest);
  const stats = fs.statSync(dest);
  return { filename, path: dest, size: stats.size };
}

export function exportPredictionsCsv(): { filename: string; path: string; size: number; count: number } {
  ensureBackupDir();
  const rows = db.prepare(`
    SELECT p.id, p.user_id, u.username, p.match_id, p.home_pred, p.away_pred, p.submitted_at, p.edit_count
    FROM predictions p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.submitted_at DESC
  `).all() as Record<string, unknown>[];

  const filename = `predictions-${timestamp()}.csv`;
  const dest = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(dest, rowsToCsv(rows), 'utf-8');
  const stats = fs.statSync(dest);
  return { filename, path: dest, size: stats.size, count: rows.length };
}

export function exportUsersCsv(): { filename: string; path: string; size: number; count: number } {
  ensureBackupDir();
  const rows = db.prepare(`
    SELECT id, username, role, is_active, created_at, last_login_at
    FROM users
    ORDER BY id
  `).all() as Record<string, unknown>[];

  const filename = `users-${timestamp()}.csv`;
  const dest = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(dest, rowsToCsv(rows), 'utf-8');
  const stats = fs.statSync(dest);
  return { filename, path: dest, size: stats.size, count: rows.length };
}

export type BackupInfo = {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
};

export function listBackups(): BackupInfo[] {
  ensureBackupDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db') || f.endsWith('.csv'))
    .map(filename => {
      const p = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(p);
      return { filename, path: p, size: stats.size, createdAt: stats.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function cleanupOldBackups(maxAgeDays = 14): { deleted: string[] } {
  ensureBackupDir();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.endsWith('.db') && !file.endsWith('.csv')) continue;
    const p = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(p);
    if (stats.mtime.getTime() < cutoff) {
      fs.unlinkSync(p);
      deleted.push(file);
    }
  }
  return { deleted };
}
