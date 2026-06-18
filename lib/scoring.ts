import db from './db';

/**
 * Scoring rules:
 * - Exact score: 3 points
 * - Correct winner (but wrong score): 1 point
 * - Streak bonuses (added when milestone hit):
 *   3 in a row: +3
 *   5 in a row: +5
 *   7 in a row: +8
 * - Any wrong prediction OR no prediction on a finished match → streak resets to 0 immediately.
 *
 * "Correct" for streak = exact score only (base === 3). Correct winner (+1) does NOT extend streak.
 */

export interface MatchResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string; // for sorting
}

export interface UserPrediction {
  matchId: string;
  homePred: number;
  awayPred: number;
}

export interface ScoreBreakdown {
  base: number;        // 3 or 1 or 0
  streakBonus: number; // 0, 3, 5 or 8 (only on the match that hit the milestone)
  total: number;
  isCorrect: boolean;  // for streak continuity
}

export function calculateBasePoints(home: number, away: number, predHome: number, predAway: number): number {
  if (home === predHome && away === predAway) return 3;
  const winner = Math.sign(home - away);
  const predWinner = Math.sign(predHome - predAway);
  if (winner === predWinner) return 1;
  return 0;
}

/**
 * Compute full score + streak history for a user.
 * Returns per-match breakdown + final totals.
 */
export function computeUserScore(
  userPreds: UserPrediction[], 
  finishedMatches: MatchResult[]
): { 
  perMatch: Record<string, ScoreBreakdown>; 
  totalPoints: number; 
  currentStreak: number; 
  longestStreak: number;
} {
  // Sort finished matches chronologically
  const sortedMatches = [...finishedMatches].sort((a, b) => 
    new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  const predMap = new Map(userPreds.map(p => [p.matchId, p]));

  let currentStreak = 0;
  let longestStreak = 0;
  let totalPoints = 0;
  const perMatch: Record<string, ScoreBreakdown> = {};

  for (const match of sortedMatches) {
    const pred = predMap.get(match.matchId);

    if (!pred) {
      // No prediction on finished match → reset streak
      currentStreak = 0;
      perMatch[match.matchId] = { base: 0, streakBonus: 0, total: 0, isCorrect: false };
      continue;
    }

    const base = calculateBasePoints(
      match.homeScore, match.awayScore, 
      pred.homePred, pred.awayPred
    );

    const isCorrect = base === 3;

    if (isCorrect) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }

    let streakBonus = 0;
    if (currentStreak === 3) streakBonus = 3;
    else if (currentStreak === 5) streakBonus = 5;
    else if (currentStreak === 7) streakBonus = 8;

    const total = base + streakBonus;
    totalPoints += total;

    perMatch[match.matchId] = {
      base,
      streakBonus,
      total,
      isCorrect,
    };
  }

  return {
    perMatch,
    totalPoints,
    currentStreak,
    longestStreak,
  };
}

/**
 * Recalculate for ALL users and update user_stats table.
 * Call this after admin manually sets/changes scores.
 */
export function recalculateAllScores(triggeredByUserId?: number, forMatchId?: string) {
  const finishedMatches = db.prepare(`
    SELECT id as matchId, home_score as homeScore, away_score as awayScore, kickoff_at as kickoff
    FROM matches 
    WHERE status = 'finished' AND home_score IS NOT NULL AND away_score IS NOT NULL
    ORDER BY kickoff_at
  `).all() as MatchResult[];

  const allUsers = db.prepare('SELECT id FROM users WHERE is_active = 1').all() as { id: number }[];

  const insertOrUpdateStats = db.prepare(`
    INSERT INTO user_stats (user_id, total_points, current_streak, longest_streak, last_recalculated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      total_points = excluded.total_points,
      current_streak = excluded.current_streak,
      longest_streak = excluded.longest_streak,
      last_recalculated_at = excluded.last_recalculated_at
  `);

  let affected = 0;

  db.transaction(() => {
    for (const user of allUsers) {
      const userPreds = db.prepare(`
        SELECT match_id as matchId, home_pred as homePred, away_pred as awayPred 
        FROM predictions 
        WHERE user_id = ?
      `).all(user.id) as UserPrediction[];

      const result = computeUserScore(userPreds, finishedMatches);

      insertOrUpdateStats.run(
        user.id, 
        result.totalPoints, 
        result.currentStreak, 
        result.longestStreak
      );

      affected++;
    }

    // Log the recalc
    db.prepare(`
      INSERT INTO score_calculations (triggered_by_user_id, match_id, recalculated_at, notes)
      VALUES (?, ?, datetime('now'), ?)
    `).run(
      triggeredByUserId ?? null, 
      forMatchId ?? null, 
      forMatchId ? `Recalc for match ${forMatchId}` : 'Full recalc'
    );
  })();

  return { affectedUsers: affected };
}
