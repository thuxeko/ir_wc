import cron from 'node-cron';
import { syncScoresFromJsonInternal } from './actions';
import { backupDatabase, exportPredictionsCsv, cleanupOldBackups } from './backup';
import db from './db';

let isRunning = false;

const insertLog = db.prepare(`
  INSERT INTO cron_logs (started_at, status, trigger_type)
  VALUES (datetime('now'), 'running', 'auto')
`);

const updateLog = db.prepare(`
  UPDATE cron_logs
  SET finished_at = datetime('now'), status = ?, updated_count = ?, error_message = ?
  WHERE id = ?
`);

export function startCronJobs() {
  // Run every hour at minute 5 (e.g., 00:05, 01:05, ...)
  cron.schedule('5 * * * *', async () => {
    if (isRunning) {
      console.log('[cron] Sync already running, skipping...');
      return;
    }
    isRunning = true;
    console.log('[cron] Starting auto sync + recalc at', new Date().toISOString());

    const logResult = insertLog.run();
    const logId = logResult.lastInsertRowid as number;

    try {
      const result = await syncScoresFromJsonInternal();
      console.log('[cron] Sync result:', result);
      const parts: string[] = [];
      if (result.updatedCount) parts.push(`Updated ${result.updatedCount}: ${result.updatedMatchIds?.join(', ')}`);
      if (result.resetCount) parts.push(`Reset ${result.resetCount}: ${result.resetMatchIds?.join(', ')}`);
      if (result.skippedMatchIds?.length) parts.push(`Skipped future: ${result.skippedMatchIds.join(', ')}`);
      const logMsg = parts.length ? parts.join(' | ') : null;
      updateLog.run('success', (result.updatedCount ?? 0) + (result.resetCount ?? 0), logMsg, logId);
    } catch (err: any) {
      console.error('[cron] Sync failed:', err.message);
      updateLog.run('failed', 0, err.message ?? String(err), logId);
    } finally {
      isRunning = false;
    }
  });

  // Daily backup at 03:00
  cron.schedule('0 3 * * *', () => {
    console.log('[cron] Starting daily backup at', new Date().toISOString());
    try {
      const dbResult = backupDatabase();
      const csvResult = exportPredictionsCsv();
      const cleanup = cleanupOldBackups(14);
      console.log('[cron] Backup completed:', dbResult.filename, csvResult.filename, 'deleted:', cleanup.deleted.length);
    } catch (err: any) {
      console.error('[cron] Backup failed:', err.message);
    }
  });

  console.log('[cron] Auto-sync scheduled every hour at :05');
  console.log('[cron] Daily backup scheduled at 03:00');
}
