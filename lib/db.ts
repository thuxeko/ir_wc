import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'wc2026.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Full schema from our plan
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_vi TEXT,
    name_fa TEXT,
    flag_url TEXT,
    fifa_code TEXT,
    grp TEXT
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    home_team_id TEXT,
    away_team_id TEXT,
    home_team_label TEXT,
    away_team_label TEXT,
    kickoff_at TEXT NOT NULL,
    match_date TEXT,                 -- nominal calendar date from data source (e.g. 2026-06-17), for accurate "ngày mai" filtering
    stage TEXT NOT NULL,
    grp TEXT,
    stadium_id TEXT,
    home_score INTEGER,
    away_score INTEGER,
    status TEXT NOT NULL DEFAULT 'scheduled'
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    home_pred INTEGER NOT NULL,
    away_pred INTEGER NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, match_id)
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY,
    total_points INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_recalculated_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS score_calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    triggered_by_user_id INTEGER,
    match_id TEXT,
    recalculated_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
  CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
  CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER,
    action TEXT NOT NULL,           -- e.g. 'prediction_submitted', 'prediction_rejected_deadline', 'login_success', 'admin_set_score'
    target_type TEXT,               -- 'prediction', 'match', 'user', 'system'
    target_id TEXT,
    details TEXT,                   -- JSON string with before/after, cutoff_time, etc.
    ip_address TEXT
  );

  CREATE TABLE IF NOT EXISTS cron_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed'
    updated_count INTEGER,
    error_message TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'auto' -- 'auto' (cron) or 'manual'
  );
`);

// Ensure name_vi column exists (for existing DBs)
try {
  db.exec(`ALTER TABLE teams ADD COLUMN name_vi TEXT`);
} catch (e) {
  // column may already exist
}

// Ensure edit_count column exists on predictions (track how many times user revised)
try {
  db.exec(`ALTER TABLE predictions ADD COLUMN edit_count INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // column may already exist
}

// Ensure recalculated_at column exists on score_calculations (for existing DBs)
try {
  db.exec(`ALTER TABLE score_calculations ADD COLUMN recalculated_at TEXT NOT NULL DEFAULT (datetime('now'))`);
} catch (e) {
  // column may already exist
}

// Full teams seed (48) from openfootball/worldcup.json (cleaner structured JSON).
// Source: https://github.com/openfootball/worldcup.json/blob/master/2026/worldcup.json
// Vietnamese names + flags. Run: node seed-full-matches.js for the full 104 matches + knockout labels.

const teamCount = (db.prepare('SELECT COUNT(*) as c FROM teams').get() as { c: number }).c;
if (teamCount < 48) {
  // Wipe to ensure clean mapping after data source switch
  db.prepare('DELETE FROM teams').run();
  const insertTeam = db.prepare(`INSERT OR IGNORE INTO teams (id, name_en, name_vi, flag_url, grp) VALUES (?, ?, ?, ?, ?)`);
  const seedTeams: Array<[string, string, string, string, string]> = [
    ['1','Mexico','Mexico','https://flagcdn.com/w40/mx.png','A'],
    ['2','South Africa','Nam Phi','https://flagcdn.com/w40/za.png','A'],
    ['3','South Korea','Hàn Quốc','https://flagcdn.com/w40/kr.png','A'],
    ['4','Czech Republic','Séc','https://flagcdn.com/w40/cz.png','A'],
    ['5','Canada','Canada','https://flagcdn.com/w40/ca.png','B'],
    ['6','Bosnia & Herzegovina','Bosnia & Herzegovina','https://flagcdn.com/w40/ba.png','B'],
    ['7','Qatar','Qatar','https://flagcdn.com/w40/qa.png','B'],
    ['8','Switzerland','Thụy Sĩ','https://flagcdn.com/w40/ch.png','B'],
    ['9','Brazil','Brazil','https://flagcdn.com/w40/br.png','C'],
    ['10','Morocco','Ma Rốc','https://flagcdn.com/w40/ma.png','C'],
    ['11','Haiti','Haiti','https://flagcdn.com/w40/ht.png','C'],
    ['12','Scotland','Scotland','https://flagcdn.com/w40/gb.png','C'],
    ['13','USA','Hoa Kỳ','https://flagcdn.com/w40/us.png','D'],
    ['14','Paraguay','Paraguay','https://flagcdn.com/w40/py.png','D'],
    ['15','Australia','Úc','https://flagcdn.com/w40/au.png','D'],
    ['16','Turkey','Thổ Nhĩ Kỳ','https://flagcdn.com/w40/tr.png','D'],
    ['17','Germany','Đức','https://flagcdn.com/w40/de.png','E'],
    ['18','Curaçao','Curaçao','https://flagcdn.com/w40/cw.png','E'],
    ['19','Ivory Coast','Bờ Biển Ngà','https://flagcdn.com/w40/ci.png','E'],
    ['20','Ecuador','Ecuador','https://flagcdn.com/w40/ec.png','E'],
    ['21','Netherlands','Hà Lan','https://flagcdn.com/w40/nl.png','F'],
    ['22','Japan','Nhật Bản','https://flagcdn.com/w40/jp.png','F'],
    ['23','Sweden','Thụy Điển','https://flagcdn.com/w40/se.png','F'],
    ['24','Tunisia','Tunisia','https://flagcdn.com/w40/tn.png','F'],
    ['25','Belgium','Bỉ','https://flagcdn.com/w40/be.png','G'],
    ['26','Egypt','Ai Cập','https://flagcdn.com/w40/eg.png','G'],
    ['27','Iran','Iran','https://flagcdn.com/w40/ir.png','G'],
    ['28','New Zealand','New Zealand','https://flagcdn.com/w40/nz.png','G'],
    ['29','Spain','Tây Ban Nha','https://flagcdn.com/w40/es.png','H'],
    ['30','Cape Verde','Cape Verde','https://flagcdn.com/w40/cv.png','H'],
    ['31','Saudi Arabia','Ả Rập Xê Út','https://flagcdn.com/w40/sa.png','H'],
    ['32','Uruguay','Uruguay','https://flagcdn.com/w40/uy.png','H'],
    ['33','France','Pháp','https://flagcdn.com/w40/fr.png','I'],
    ['34','Senegal','Senegal','https://flagcdn.com/w40/sn.png','I'],
    ['35','Iraq','Iraq','https://flagcdn.com/w40/iq.png','I'],
    ['36','Norway','Na Uy','https://flagcdn.com/w40/no.png','I'],
    ['37','Argentina','Argentina','https://flagcdn.com/w40/ar.png','J'],
    ['38','Algeria','Algeria','https://flagcdn.com/w40/dz.png','J'],
    ['39','Austria','Áo','https://flagcdn.com/w40/at.png','J'],
    ['40','Jordan','Jordan','https://flagcdn.com/w40/jo.png','J'],
    ['41','Portugal','Bồ Đào Nha','https://flagcdn.com/w40/pt.png','K'],
    ['42','DR Congo','Congo DR','https://flagcdn.com/w40/cd.png','K'],
    ['43','Uzbekistan','Uzbekistan','https://flagcdn.com/w40/uz.png','K'],
    ['44','Colombia','Colombia','https://flagcdn.com/w40/co.png','K'],
    ['45','England','Anh','https://flagcdn.com/w40/gb-eng.png','L'],
    ['46','Croatia','Croatia','https://flagcdn.com/w40/hr.png','L'],
    ['47','Ghana','Ghana','https://flagcdn.com/w40/gh.png','L'],
    ['48','Panama','Panama','https://flagcdn.com/w40/pa.png','L'],
  ];
  seedTeams.forEach(t => insertTeam.run(t[0], t[1], t[2], t[3], t[4]));
}

// Note: For full/accurate 104 matches schedule + knockout placeholders from openfootball, run:
//   node seed-full-matches.js
// (it clears matches/predictions for the data switch and inserts canonical schedule + some sample finished for demo).
// The limited inserts below are fallback demo only.
const matchCount = (db.prepare('SELECT COUNT(*) as c FROM matches').get() as { c: number }).c;
if (matchCount < 15) {
  const insertMatch = db.prepare(`INSERT OR IGNORE INTO matches (id, home_team_id, away_team_id, kickoff_at, match_date, stage, grp, home_score, away_score, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  // A few safe upcoming for demo if no full seed run
  insertMatch.run('17', '17', '18', '2026-06-16T18:00:00.000Z', '2026-06-16', 'group', 'E', null, null, 'scheduled');
  insertMatch.run('19', '37', '38', '2026-06-17T20:00:00.000Z', '2026-06-17', 'group', 'J', null, null, 'scheduled');
}

export default db;
