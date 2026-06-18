'use server';

import db from './db';
import { recalculateAllScores, computeUserScore } from './scoring';
import { requireUser, requireAdmin, hashPassword, verifyPassword, createToken, setSessionCookie, clearSessionCookie, getSession } from './auth';
import { headers } from 'next/headers';
import { backupDatabase, exportPredictionsCsv, exportUsersCsv, listBackups, cleanupOldBackups, createSnapshot } from './backup';

async function logAudit(action: string, userId: number | null, targetType: string, targetId: string | null, details: any) {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for') || h.get('x-real-ip') || 'unknown';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (created_at, user_id, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(now, userId, action, targetType, targetId, JSON.stringify(details), ip);
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}

export async function getMatches() {
  const rawMatches = db.prepare(`
    SELECT m.*, 
           t1.name_en as home_name, t1.name_vi as home_name_vi, t1.flag_url as home_flag,
           t2.name_en as away_name, t2.name_vi as away_name_vi, t2.flag_url as away_flag,
           m.home_team_label, m.away_team_label,
           (SELECT COUNT(*) FROM predictions p WHERE p.match_id = m.id AND p.home_pred = m.home_score AND p.away_pred = m.away_score) as correctExact,
           (SELECT COUNT(*) FROM predictions p WHERE p.match_id = m.id AND (p.home_pred != m.home_score OR p.away_pred != m.away_score) AND ((p.home_pred > p.away_pred AND m.home_score > m.away_score) OR (p.home_pred < p.away_pred AND m.home_score < m.away_score) OR (p.home_pred = p.away_pred AND m.home_score = m.away_score))) as correctWinner
    FROM matches m
    LEFT JOIN teams t1 ON t1.id = m.home_team_id
    LEFT JOIN teams t2 ON t2.id = m.away_team_id
    ORDER BY m.kickoff_at
  `).all();

  const now = new Date();

  // Debug: log suspicious matches (finished but no score)
  rawMatches.forEach((m: any) => {
    if (m.status === 'finished' && (m.home_score == null || m.away_score == null)) {
      console.warn(`[DEBUG] Match ${m.id} (${m.home_team_id} vs ${m.away_team_id}) has status='finished' but no score!`);
    }
  });

  const matches = rawMatches.map((m: any) => {
    const kickoff = new Date(m.kickoff_at);
    const cutoff = new Date(kickoff.getTime() - 10 * 60 * 1000); // 10 minutes before
    const can_predict = now < cutoff && m.status === 'scheduled' && !!m.home_team_id && !!m.away_team_id;

    let predict_status = 'Mở';
    if (!can_predict) {
      if (m.status === 'finished') {
        predict_status = 'Đã kết thúc';
      } else if (now >= cutoff) {
        predict_status = 'Đã khóa';
      } else {
        predict_status = 'Chưa mở';
      }
    }

    return {
      ...m,
      can_predict,
      predict_status,
    };
  });

  return matches;
}

export async function getLeaderboard(limit = 10) {
  // Auto-populate user_stats if empty (first run or after schema change)
  const statsCount = (db.prepare('SELECT COUNT(*) as c FROM user_stats').get() as { c: number }).c;
  if (statsCount === 0) {
    recalculateAllScores();
  }

  return db.prepare(`
    SELECT u.id, u.username, COALESCE(us.total_points, 0) as total_points, COALESCE(us.current_streak, 0) as current_streak
    FROM users u
    LEFT JOIN user_stats us ON us.user_id = u.id
    WHERE u.is_active = 1
    ORDER BY COALESCE(us.total_points, 0) DESC, COALESCE(us.current_streak, 0) DESC
    LIMIT ?
  `).all(limit);
}

export async function getTopStreaks(limit = 5) {
  return db.prepare(`
    SELECT u.id, u.username, COALESCE(us.current_streak, 0) as current_streak
    FROM users u
    LEFT JOIN user_stats us ON us.user_id = u.id
    WHERE u.is_active = 1 AND COALESCE(us.current_streak, 0) > 0
    ORDER BY COALESCE(us.current_streak, 0) DESC
    LIMIT ?
  `).all(limit);
}

export async function getCurrentUserRank() {
  try {
    const user = await requireUser();
    const allUsers = db.prepare(`
      SELECT u.id, COALESCE(us.total_points, 0) as total_points
      FROM users u
      LEFT JOIN user_stats us ON us.user_id = u.id
      WHERE u.is_active = 1
      ORDER BY COALESCE(us.total_points, 0) DESC, COALESCE(us.current_streak, 0) DESC
    `).all() as { id: number; total_points: number }[];

    const rank = allUsers.findIndex(u => u.id === user.id) + 1;
    const me = allUsers.find(u => u.id === user.id);
    return {
      rank,
      totalUsers: allUsers.length,
      totalPoints: me?.total_points ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getMyPredictions() {
  try {
    const user = await requireUser();
    return db.prepare(`
      SELECT p.*, 
             m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.status, m.kickoff_at,
             t1.name_vi as home_name_vi, t1.name_en as home_name,
             t2.name_vi as away_name_vi, t2.name_en as away_name
      FROM predictions p
      JOIN matches m ON m.id = p.match_id
      LEFT JOIN teams t1 ON t1.id = m.home_team_id
      LEFT JOIN teams t2 ON t2.id = m.away_team_id
      WHERE p.user_id = ?
      ORDER BY p.submitted_at DESC
      LIMIT 30
    `).all(user.id);
  } catch {
    return []; // not logged in
  }
}

export async function submitPrediction(matchId: string, homePred: number, awayPred: number) {
  const user = await requireUser();

  // Basic validation
  if (homePred < 0 || awayPred < 0 || homePred > 20 || awayPred > 20) {
    throw new Error("Tỷ số không hợp lệ");
  }

  const match = db.prepare("SELECT status, kickoff_at, home_team_id, away_team_id FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) {
    throw new Error("Trận đấu không tồn tại");
  }

  const now = new Date();
  const kickoff = new Date(match.kickoff_at);
  const cutoff = new Date(kickoff.getTime() - 10 * 60 * 1000);

  if (now >= cutoff || match.status === 'finished' || !match.home_team_id || !match.away_team_id) {
    await logAudit('prediction_rejected_deadline', user.id, 'prediction', matchId, {
      attempted_home: homePred,
      attempted_away: awayPred,
      cutoff: cutoff.toISOString(),
      kickoff: kickoff.toISOString(),
    });
    throw new Error("Đã quá hạn dự đoán (phải dự đoán trước ít nhất 10 phút)");
  }

  // TEMPORARY: Disable prediction updates. Once submitted, predictions are locked.
  // TODO: Uncomment the block below if re-enabling prediction editing.
  /*
  // Get previous if exists (for update log + edit limit)
  const previous = db.prepare("SELECT home_pred, away_pred, edit_count FROM predictions WHERE user_id = ? AND match_id = ?").get(user.id, matchId) as any;

  const MAX_EDITS = 10;
  if (previous && previous.edit_count >= MAX_EDITS) {
    await logAudit('prediction_rejected_edit_limit', user.id, 'prediction', matchId, {
      attempted_home: homePred,
      attempted_away: awayPred,
      edit_count: previous.edit_count,
    });
    throw new Error(`Đã đạt giới hạn ${MAX_EDITS} lần sửa cho trận này`);
  }
  */

  const previous = db.prepare("SELECT home_pred, away_pred FROM predictions WHERE user_id = ? AND match_id = ?").get(user.id, matchId) as any;
  if (previous) {
    await logAudit('prediction_rejected_update_locked', user.id, 'prediction', matchId, {
      attempted_home: homePred,
      attempted_away: awayPred,
      existing: previous,
    });
    throw new Error("Dự đoán đã được xác nhận và không thể sửa");
  }

  const submittedAt = now.toISOString();

  db.prepare(`
    INSERT INTO predictions (user_id, match_id, home_pred, away_pred, submitted_at, edit_count)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(user.id, matchId, homePred, awayPred, submittedAt);

  await logAudit('prediction_submitted', user.id, 'prediction', matchId, {
    home: homePred,
    away: awayPred,
    cutoff: cutoff.toISOString(),
  });

  return { success: true };
}

export async function getRecentAuditLogs(limit = 100) {
  await requireAdmin();
  return db.prepare(`
    SELECT al.*, u.username 
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Admin action: set score for a match and optionally trigger full recalc.
 */
export async function setMatchScore(matchId: string, homeScore: number, awayScore: number, triggerFullRecalc = true) {
  const admin = await requireAdmin();
  createSnapshot(`before-set-score-${matchId}`);

  db.prepare(`
    UPDATE matches 
    SET home_score = ?, away_score = ?, status = 'finished'
    WHERE id = ?
  `).run(homeScore, awayScore, matchId);

  await logAudit('admin_set_match_score', admin.id, 'match', matchId, {
    home_score: homeScore,
    away_score: awayScore,
    trigger_recalc: triggerFullRecalc,
  });

  let recalcResult = null;
  if (triggerFullRecalc) {
    recalcResult = recalculateAllScores(admin.id, matchId);
  }

  return { success: true, recalc: recalcResult };
}

export async function triggerFullRecalc() {
  const admin = await requireAdmin();
  createSnapshot('before-full-recalc');
  await logAudit('admin_full_recalc', admin.id, 'system', null, { note: 'full points and streak recalc' });
  return recalculateAllScores(admin.id);
}

// ==================== AUTH ====================

export async function registerAction(username: string, password: string) {
  if (!username || username.length < 3) {
    throw new Error("Username phải có ít nhất 3 ký tự");
  }
  if (!username.startsWith("iris.")) {
    throw new Error("Username phải bắt đầu bằng 'iris.' (vd: iris.tuananh)");
  }
  if (!password || password.length < 4) {
    throw new Error("Mật khẩu phải có ít nhất 4 ký tự");
  }

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    throw new Error("Username đã tồn tại");
  }

  const hash = await hashPassword(password);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, is_active, role, created_at) VALUES (?, ?, 0, 'user', ?)"
  ).run(username, hash, new Date().toISOString());

  await logAudit('user_registered', info.lastInsertRowid as number, 'user', String(info.lastInsertRowid), { username });

  return { success: true, message: "Đăng ký thành công. Tài khoản đang chờ admin kích hoạt." };
}

export async function loginAction(username: string, password: string) {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!user) {
    await logAudit('login_failed', null, 'user', null, { username, reason: 'user_not_found' });
    throw new Error("Sai username hoặc mật khẩu");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await logAudit('login_failed', null, 'user', String(user.id), { username, reason: 'bad_password' });
    throw new Error("Sai username hoặc mật khẩu");
  }

  if (!user.is_active) {
    await logAudit('login_failed', null, 'user', String(user.id), { username, reason: 'not_active' });
    throw new Error("Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin.");
  }

  const token = await createToken({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  await setSessionCookie(token);

  await logAudit('login_success', user.id, 'user', String(user.id), { username });

  return { success: true, user: { id: user.id, username: user.username, role: user.role } };
}

export async function logoutAction() {
  await clearSessionCookie();
  return { success: true };
}

export async function getCurrentUserAction() {
  return getSession();
}

// ==================== ADMIN USER MANAGEMENT ====================

export async function getAllUsersAction() {
  await requireAdmin();
  return db.prepare(`
    SELECT id, username, is_active, role, created_at 
    FROM users 
    ORDER BY created_at DESC
  `).all();
}

export async function activateUserAction(userId: number) {
  const admin = await requireAdmin();
  db.prepare("UPDATE users SET is_active = 1 WHERE id = ?").run(userId);
  await logAudit('admin_activate_user', admin.id, 'user', String(userId), {});
  return { success: true };
}

export async function deleteUserAction(userId: number) {
  const admin = await requireAdmin();
  const target = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(userId) as any;
  if (!target) throw new Error("User không tồn tại");
  if (target.role === 'admin') throw new Error("Không thể xóa tài khoản admin");
  if (target.id === admin.id) throw new Error("Không thể tự xóa chính mình");
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  // Also clean related data
  db.prepare("DELETE FROM predictions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_stats WHERE user_id = ?").run(userId);
  await logAudit('admin_delete_user', admin.id, 'user', String(userId), {});
  return { success: true };
}

export async function adminResetPasswordAction(userId: number, newPassword: string) {
  const admin = await requireAdmin();
  if (!newPassword || newPassword.length < 4) {
    throw new Error("Mật khẩu mới phải có ít nhất 4 ký tự");
  }
  const target = db.prepare("SELECT id, username FROM users WHERE id = ?").get(userId) as any;
  if (!target) throw new Error("User không tồn tại");

  const hash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);

  await logAudit('admin_reset_password', admin.id, 'user', String(userId), { target_username: target.username });
  return { success: true };
}

export async function changeMyPasswordAction(currentPassword: string, newPassword: string) {
  const session = await requireUser();
  if (!newPassword || newPassword.length < 4) {
    throw new Error("Mật khẩu mới phải có ít nhất 4 ký tự");
  }
  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(session.id) as any;
  if (!user) throw new Error("User không tồn tại");

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) {
    await logAudit('change_password_failed', session.id, 'user', String(session.id), { reason: 'wrong_current' });
    throw new Error("Mật khẩu hiện tại không đúng");
  }

  const hash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, session.id);

  await logAudit('change_password', session.id, 'user', String(session.id), {});
  return { success: true };
}

export async function syncScoresFromJsonInternal(triggeredByUserId?: number) {
  createSnapshot('before-sync-json');
  const url = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không fetch được JSON: ${res.status}`);

  const data = await res.json();
  const raw = data.matches || [];
  if (!raw.length) throw new Error('JSON không có matches');

  // Build a map of JSON match id -> score
  const jsonScores = new Map<string, { hs: number; as: number }>();
  let groupId = 1;
  for (const m of raw) {
    if (!m.date || !m.time || !m.team1 || !m.team2) continue;
    const id = m.num ? String(m.num) : String(groupId);
    if (m.score?.ft && Array.isArray(m.score.ft)) {
      jsonScores.set(id, { hs: m.score.ft[0], as: m.score.ft[1] });
    }
    if (!m.num) groupId++;
  }

  let updatedCount = 0;
  let resetCount = 0;
  const updatedMatchIds: string[] = [];
  const resetMatchIds: string[] = [];
  const skippedMatchIds: string[] = [];

  const updateStmt = db.prepare(`
    UPDATE matches SET home_score = ?, away_score = ?, status = 'finished'
    WHERE id = ?
  `);
  const resetStmt = db.prepare(`
    UPDATE matches SET home_score = NULL, away_score = NULL, status = 'scheduled'
    WHERE id = ?
  `);

  const allMatches = db.prepare('SELECT id, home_score, away_score, status, kickoff_at FROM matches').all() as any[];
  const now = new Date();
  const bufferMs = 30 * 60 * 1000; // 30 minutes

  for (const cur of allMatches) {
    const id = cur.id;
    const kickoff = new Date(cur.kickoff_at);
    const hasScoreInJson = jsonScores.has(id);

    if (hasScoreInJson) {
      // SAFETY: Only sync if match has already kicked off (allow 30 min buffer)
      if (kickoff.getTime() > now.getTime() + bufferMs) {
        skippedMatchIds.push(id);
        continue;
      }
      const { hs, as } = jsonScores.get(id)!;
      if (cur.home_score !== hs || cur.away_score !== as || cur.status !== 'finished') {
        updateStmt.run(hs, as, id);
        updatedCount++;
        updatedMatchIds.push(id);
      }
    } else {
      // No score in JSON → if DB says finished, reset to scheduled
      if (cur.status === 'finished') {
        resetStmt.run(id);
        resetCount++;
        resetMatchIds.push(id);
      }
    }
  }

  if (updatedCount > 0 || resetCount > 0) {
    if (triggeredByUserId) {
      await logAudit('admin_sync_json_scores', triggeredByUserId, 'system', null, {
        updated: updatedCount,
        updated_match_ids: updatedMatchIds,
        reset: resetCount,
        reset_match_ids: resetMatchIds,
        skipped_future_matches: skippedMatchIds,
        source: url
      });
    }
    // Auto-recalculate points after sync
    recalculateAllScores(triggeredByUserId);
  }

  return { updatedCount, resetCount, updatedMatchIds, resetMatchIds, skippedMatchIds };
}

export async function syncScoresFromJson() {
  const admin = await requireAdmin();

  const insertLog = db.prepare(`
    INSERT INTO cron_logs (started_at, status, trigger_type)
    VALUES (datetime('now'), 'running', 'manual')
  `);
  const updateLog = db.prepare(`
    UPDATE cron_logs
    SET finished_at = datetime('now'), status = ?, updated_count = ?, error_message = ?
    WHERE id = ?
  `);

  const logResult = insertLog.run();
  const logId = logResult.lastInsertRowid as number;

  try {
    const result = await syncScoresFromJsonInternal(admin.id);
    const logMsg = result.skippedMatchIds?.length
      ? `Updated ${result.updatedCount}, skipped future: ${result.skippedMatchIds.join(', ')}`
      : null;
    updateLog.run('success', result.updatedCount ?? 0, logMsg, logId);
    return result;
  } catch (err: any) {
    updateLog.run('failed', 0, err.message ?? String(err), logId);
    throw err;
  }
}

export async function cleanTestData() {
  const admin = await requireAdmin();

  const testUsernames = [
    'Lê Minh Tuấn', 'Nguyễn Quỳnh Mai', 'Trần Việt Hoàng', 'Phạm Hương Giang',
    'Đỗ Anh Quân', 'Vũ Thanh Hương', 'Bùi Minh Đức', 'Hoàng Thị Lan',
    'Ngô Văn Kiên', 'Dương Thị Mai'
  ];

  const placeholders = testUsernames.map(() => '?').join(',');
  const usersToDelete = db.prepare(
    `SELECT id, username FROM users WHERE username IN (${placeholders})`
  ).all(...testUsernames) as any[];

  if (usersToDelete.length === 0) return { deletedUsers: 0, deletedUsersList: [] };

  db.transaction(() => {
    for (const u of usersToDelete) {
      db.prepare("DELETE FROM predictions WHERE user_id = ?").run(u.id);
      db.prepare("DELETE FROM user_stats WHERE user_id = ?").run(u.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(u.id);
    }
  })();

  await logAudit('admin_clean_test_data', admin.id, 'system', null, {
    deleted: usersToDelete.map(u => u.username),
    count: usersToDelete.length
  });

  return {
    deletedUsers: usersToDelete.length,
    deletedUsersList: usersToDelete.map(u => u.username)
  };
}

export async function getCronLogs(limit = 20) {
  const admin = await requireAdmin();
  return db.prepare(`
    SELECT id, started_at, finished_at, status, updated_count, error_message, trigger_type
    FROM cron_logs
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit);
}

export async function getMatchDebug(matchId: string) {
  const admin = await requireAdmin();
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  const predictions = db.prepare('SELECT COUNT(*) as c FROM predictions WHERE match_id = ?').get(matchId);
  return { match, predictions };
}

export type SuspiciousMatch = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  kickoff_at: string;
};

export type SuspiciousMatchesResult = {
  finishedMissingScore: SuspiciousMatch[];
  scheduledHasScore: SuspiciousMatch[];
  finishedBeforeKickoff: SuspiciousMatch[];
  staleScheduled: SuspiciousMatch[];
  negativeScore: SuspiciousMatch[];
};

export async function getSuspiciousMatches(): Promise<SuspiciousMatchesResult> {
  const admin = await requireAdmin();
  const allMatches = db.prepare(`
    SELECT id, home_team_id, away_team_id, home_score, away_score, status, kickoff_at
    FROM matches
  `).all() as SuspiciousMatch[];

  const now = new Date();
  const staleThresholdMs = 3 * 60 * 60 * 1000; // 3 hours

  const result: SuspiciousMatchesResult = {
    finishedMissingScore: [],
    scheduledHasScore: [],
    finishedBeforeKickoff: [],
    staleScheduled: [],
    negativeScore: []
  };

  for (const m of allMatches) {
    const kickoff = new Date(m.kickoff_at);

    if (m.status === 'finished' && (m.home_score == null || m.away_score == null)) {
      result.finishedMissingScore.push(m);
    }

    if (m.status === 'scheduled' && (m.home_score != null || m.away_score != null)) {
      result.scheduledHasScore.push(m);
    }

    if (m.status === 'finished' && kickoff.getTime() > now.getTime()) {
      result.finishedBeforeKickoff.push(m);
    }

    if (m.status === 'scheduled' && kickoff.getTime() < now.getTime() - staleThresholdMs) {
      result.staleScheduled.push(m);
    }

    if (m.home_score != null && m.away_score != null && (m.home_score < 0 || m.away_score < 0)) {
      result.negativeScore.push(m);
    }
  }

  return result;
}

export async function fixMatchStatus(matchId: string, reason = 'manual reset') {
  const admin = await requireAdmin();
  createSnapshot(`before-fix-match-${matchId}`);
  db.prepare(`
    UPDATE matches SET status = 'scheduled', home_score = NULL, away_score = NULL
    WHERE id = ?
  `).run(matchId);
  await logAudit('admin_fix_match_status', admin.id, 'match', matchId, { reason });
  return { success: true };
}

export async function debugLeaderboard() {
  const admin = await requireAdmin();
  const userStatsCount = (db.prepare('SELECT COUNT(*) as c FROM user_stats').get() as { c: number }).c;
  const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active = 1').get() as { c: number }).c;
  const finishedMatches = (db.prepare('SELECT COUNT(*) as c FROM matches WHERE status = ?').get('finished') as { c: number }).c;
  const sampleStats = db.prepare('SELECT * FROM user_stats LIMIT 3').all();
  return { userStatsCount, usersCount, finishedMatches, sampleStats };
}

// ==================== BACKUP ====================

export async function backupDatabaseAction() {
  const admin = await requireAdmin();
  const result = backupDatabase();
  await logAudit('admin_backup_database', admin.id, 'system', null, { filename: result.filename, size: result.size });
  return result;
}

export async function exportPredictionsCsvAction() {
  const admin = await requireAdmin();
  const result = exportPredictionsCsv();
  await logAudit('admin_export_predictions_csv', admin.id, 'system', null, { filename: result.filename, count: result.count, size: result.size });
  return result;
}

export async function exportUsersCsvAction() {
  const admin = await requireAdmin();
  const result = exportUsersCsv();
  await logAudit('admin_export_users_csv', admin.id, 'system', null, { filename: result.filename, count: result.count, size: result.size });
  return result;
}

export async function listBackupsAction() {
  await requireAdmin();
  return listBackups();
}

export async function cleanupOldBackupsAction(maxAgeDays = 14) {
  const admin = await requireAdmin();
  const result = cleanupOldBackups(maxAgeDays);
  await logAudit('admin_cleanup_backups', admin.id, 'system', null, { deleted: result.deleted, maxAgeDays });
  return result;
}

export async function createSnapshotAction(suffix: string) {
  await requireAdmin();
  return createSnapshot(suffix);
}
