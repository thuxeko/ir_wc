const https = require('https');
const db = require('better-sqlite3')('./data/wc2026.db');

// Data source: openfootball/worldcup.json (recommended - structured JSON, much better than TXT)
// https://github.com/openfootball/worldcup.json/blob/master/2026/worldcup.json
// Run: node seed-full-matches.js to (re)seed 48 teams + 104 matches.
// Clears matches + predictions (clean switch). Users + other tables preserved.

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const nameVi = {
  'Mexico': 'Mexico', 'South Africa': 'Nam Phi', 'South Korea': 'Hàn Quốc', 'Czech Republic': 'Séc',
  'Canada': 'Canada', 'Bosnia & Herzegovina': 'Bosnia & Herzegovina', 'Qatar': 'Qatar', 'Switzerland': 'Thụy Sĩ',
  'Brazil': 'Brazil', 'Morocco': 'Ma Rốc', 'Haiti': 'Haiti', 'Scotland': 'Scotland',
  'USA': 'Hoa Kỳ', 'Paraguay': 'Paraguay', 'Australia': 'Úc', 'Turkey': 'Thổ Nhĩ Kỳ',
  'Germany': 'Đức', 'Curaçao': 'Curaçao', 'Ivory Coast': 'Bờ Biển Ngà', 'Ecuador': 'Ecuador',
  'Netherlands': 'Hà Lan', 'Japan': 'Nhật Bản', 'Sweden': 'Thụy Điển', 'Tunisia': 'Tunisia',
  'Belgium': 'Bỉ', 'Egypt': 'Ai Cập', 'Iran': 'Iran', 'New Zealand': 'New Zealand',
  'Spain': 'Tây Ban Nha', 'Cape Verde': 'Cape Verde', 'Saudi Arabia': 'Ả Rập Xê Út', 'Uruguay': 'Uruguay',
  'France': 'Pháp', 'Senegal': 'Senegal', 'Iraq': 'Iraq', 'Norway': 'Na Uy',
  'Argentina': 'Argentina', 'Algeria': 'Algeria', 'Austria': 'Áo', 'Jordan': 'Jordan',
  'Portugal': 'Bồ Đào Nha', 'DR Congo': 'Congo DR', 'Uzbekistan': 'Uzbekistan', 'Colombia': 'Colombia',
  'England': 'Anh', 'Croatia': 'Croatia', 'Ghana': 'Ghana', 'Panama': 'Panama'
};

const flagCc = {
  'Mexico':'mx','South Africa':'za','South Korea':'kr','Czech Republic':'cz',
  'Canada':'ca','Bosnia & Herzegovina':'ba','Qatar':'qa','Switzerland':'ch',
  'Brazil':'br','Morocco':'ma','Haiti':'ht','Scotland':'gb',
  'USA':'us','Paraguay':'py','Australia':'au','Turkey':'tr',
  'Germany':'de','Curaçao':'cw','Ivory Coast':'ci','Ecuador':'ec',
  'Netherlands':'nl','Japan':'jp','Sweden':'se','Tunisia':'tn',
  'Belgium':'be','Egypt':'eg','Iran':'ir','New Zealand':'nz',
  'Spain':'es','Cape Verde':'cv','Saudi Arabia':'sa','Uruguay':'uy',
  'France':'fr','Senegal':'sn','Iraq':'iq','Norway':'no',
  'Argentina':'ar','Algeria':'dz','Austria':'at','Jordan':'jo',
  'Portugal':'pt','DR Congo':'cd','Uzbekistan':'uz','Colombia':'co',
  'England':'gb-eng','Croatia':'hr','Ghana':'gh','Panama':'pa'
};

function makeISO(y, m, d, hh, mm, tz) {
  // tz like "UTC-5" or "UTC+3" → offset is signed: local = UTC + offset
  // To get UTC from given local hh: utcH = hh - offset
  const offset = parseInt(tz.replace('UTC', '')) || 0;  // -5 for UTC-5, +3 for UTC+3
  let utcH = hh - offset;
  let utcD = d;
  while (utcH < 0) { utcH += 24; utcD--; }
  while (utcH >= 24) { utcH -= 24; utcD++; }
  const dt = new Date(Date.UTC(y, m-1, utcD, utcH, mm));
  return dt.toISOString();
}

function niceLabel(l) {
  if (!l) return l;
  if (/^W\d+$/.test(l)) return l.replace('W', 'W');
  if (/^L\d+$/.test(l)) return l.replace('L', 'L');
  if (/^\d[A-L]$/.test(l)) return l + ' (Bảng ' + l[1] + ')';
  return l;
}

async function seed() {
  console.log('Fetching openfootball/worldcup.json 2026 data (much better structured)...');
  const url = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
  const jsonText = await fetchText(url);
  const data = JSON.parse(jsonText);
  const rawMatches = data.matches || [];

  const teamNameToId = {};
  const teams = [];
  const seen = new Set();
  let tid = 1;

  // Teams only from group stage matches (reliable list + grp)
  rawMatches.forEach(m => {
    if (m.group && (m.team1 || m.team2)) {
      [m.team1, m.team2].forEach(t => {
        if (t && !seen.has(t)) {
          seen.add(t);
          const grp = m.group.replace(/^Group /, '');
          teamNameToId[t] = String(tid);
          teams.push({ id: String(tid), name_en: t, grp });
          tid++;
        }
      });
    }
  });
  console.log(`Parsed ${teams.length} teams.`);

  // Matches
  const matches = [];
  let groupId = 1;

  rawMatches.forEach(m => {
    if (!m.date || !m.time || !m.team1 || !m.team2) return;

    // Parse date "2026-06-11" + time "13:00 UTC-6"
    const [y, mon, d] = m.date.split('-').map(Number);
    const tmatch = m.time.match(/(\d{1,2}):(\d{2})\s+(UTC[+-]\d+)/);
    if (!tmatch) return;
    const hh = parseInt(tmatch[1]), mm = parseInt(tmatch[2]), tz = tmatch[3];

    const ko = makeISO(y, mon, d, hh, mm, tz);

    const isGroup = !!m.group;
    let stage = 'group';
    let grp = isGroup ? m.group.replace(/^Group /, '') : null;

    if (!isGroup && m.round) {
      const r = m.round.toLowerCase();
      if (r.includes('round of 32')) stage = 'r32';
      else if (r.includes('round of 16')) stage = 'r16';
      else if (r.includes('quarter')) stage = 'qf';
      else if (r.includes('semi')) stage = 'sf';
      else if (r.includes('third')) stage = 'third';
      else if (r === 'final') stage = 'final';
    }

    // id: use num for knockouts (73-104), sequential for groups (1-72)
    const id = m.num ? String(m.num) : String(groupId++);

    const home = m.team1;
    const away = m.team2;
    const home_id = teamNameToId[home] || null;
    const away_id = teamNameToId[away] || null;

    let hs = null, as = null, status = 'scheduled';
    if (m.score && m.score.ft && Array.isArray(m.score.ft)) {
      hs = m.score.ft[0];
      as = m.score.ft[1];
      status = 'finished';
    }

    const hlabel = home_id ? null : niceLabel(home);
    const alabel = away_id ? null : niceLabel(away);

    matches.push({
      id,
      home_team_id: home_id,
      away_team_id: away_id,
      home_team_label: hlabel,
      away_team_label: alabel,
      kickoff_at: ko,
      stage,
      grp,
      home_score: hs,
      away_score: as,
      status,
      match_date: m.date   // nominal date from source, e.g. "2026-06-17"
    });
  });

  console.log(`Parsed ${matches.length} matches.`);

  // Write to DB
  db.prepare('DELETE FROM matches').run();
  db.prepare('DELETE FROM predictions').run();
  db.prepare('DELETE FROM teams').run();

  // Ensure we have match_date column for accurate calendar day filtering (nominal date from data source)
  try { db.exec(`ALTER TABLE matches ADD COLUMN match_date TEXT`); } catch (e) {}

  const insertTeam = db.prepare(`INSERT INTO teams (id, name_en, name_vi, flag_url, grp) VALUES (?, ?, ?, ?, ?)`);
  teams.forEach(t => {
    const vi = nameVi[t.name_en] || t.name_en;
    const cc = flagCc[t.name_en] || 'xx';
    const flag = `https://flagcdn.com/w40/${cc}.png`;
    insertTeam.run(t.id, t.name_en, vi, flag, t.grp);
  });

  const insertMatch = db.prepare(`
    INSERT INTO matches (id, home_team_id, away_team_id, home_team_label, away_team_label, kickoff_at, stage, grp, home_score, away_score, status, match_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  matches.forEach(m => {
    insertMatch.run(m.id, m.home_team_id, m.away_team_id, m.home_team_label, m.away_team_label, m.kickoff_at, m.stage, m.grp, m.home_score, m.away_score, m.status, m.match_date || null);
  });

  console.log(`Seeded ${teams.length} teams + ${matches.length} matches from worldcup.json.`);
  console.log('Teams now:', db.prepare('SELECT COUNT(*) as c FROM teams').get().c);
  console.log('Matches now:', db.prepare('SELECT COUNT(*) as c FROM matches').get().c);
  console.log('Sample team:', db.prepare('SELECT id, name_vi, grp, flag_url FROM teams LIMIT 1').get());
  console.log('Sample group match:', db.prepare("SELECT id, home_team_id, away_team_id, kickoff_at, status FROM matches WHERE stage='group' LIMIT 1").get());
  console.log('Sample ko match:', db.prepare("SELECT id, home_team_label, away_team_label, stage FROM matches WHERE home_team_id IS NULL LIMIT 1").get());
}

seed().catch(console.error);
