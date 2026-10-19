import { getDB } from "./db.js";

// ─── Tarkan League IDs & Prize Money ─────────────────────────────────────────
// Tiers 1-5: league_id 101-105. Tier 1 = hardest, Tier 5 = easiest.
export const TARKAN_LEAGUE_IDS = [101, 102, 103, 104, 105, 106, 107] as const;

const TIER_INFO: Record<number, { name: string; prize: number; avgCA: number }> = {
  101: { name: "Tarkan Divisi 1", prize: 50_000_000, avgCA: 32 },
  102: { name: "Tarkan Divisi 2", prize: 25_000_000, avgCA: 25 },
  103: { name: "Tarkan Divisi 3", prize: 15_000_000, avgCA: 20 },
  104: { name: "Tarkan Divisi 4", prize: 8_000_000, avgCA: 15 },
  105: { name: "Tarkan Divisi 5", prize: 4_000_000, avgCA: 10 },
  106: { name: "Sunday League North (Eropa)", prize: 100_000_000, avgCA: 28 },
  107: { name: "Sunday League South (Eropa)", prize: 100_000_000, avgCA: 28 },
};

// Per-match amplop: Rp 500k – 2M (Tarkan) / Rp 5M – 15M (European Sunday League)
const MATCH_FEE: Record<number, [number, number]> = {
  101: [1_500_000, 3_000_000],
  102: [1_000_000, 2_000_000],
  103: [700_000, 1_500_000],
  104: [500_000, 1_000_000],
  105: [300_000, 700_000],
  106: [5_000_000, 15_000_000],
  107: [5_000_000, 15_000_000],
};

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TarkanLeague {
  id: number;
  name: string;
  prize: number;
  avgCA: number;
  enrolled: boolean;
  enrolledClubId: number | null;
  enrolledClubName: string | null;
}

export interface TarkanStanding {
  clubId: number;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface TarkanFixture {
  matchId: number;
  homeClubId: number;
  homeClubName: string;
  awayClubId: number;
  awayClubName: string;
  date: number;
  week: number;
  homeGoals: number | null;
  awayGoals: number | null;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getTarkanLeagues(playerId: number, season: number): TarkanLeague[] {
  const db = getDB();
  const enrollment = db.exec(`SELECT league_id, club_id FROM tarkan_enrollment WHERE player_id = ? AND season = ?`, [
    playerId,
    season,
  ])[0]?.values[0] as [number, number] | undefined;

  return TARKAN_LEAGUE_IDS.map((id) => {
    const info = TIER_INFO[id];
    const enrolled = enrollment?.[0] === id;
    let clubName: string | null = null;
    if (enrolled && enrollment) {
      const res = db.exec(`SELECT name FROM clubs WHERE id = ?`, [enrollment[1]]);
      clubName = (res[0]?.values[0]?.[0] as string) ?? null;
    }
    return {
      id,
      name: info.name,
      prize: info.prize,
      avgCA: info.avgCA,
      enrolled,
      enrolledClubId: enrolled && enrollment ? enrollment[1] : null,
      enrolledClubName: clubName,
    };
  });
}

export function getTarkanEnrollment(playerId: number, season: number): { leagueId: number; clubId: number } | null {
  const db = getDB();
  const res = db.exec(`SELECT league_id, club_id FROM tarkan_enrollment WHERE player_id = ? AND season = ?`, [
    playerId,
    season,
  ])[0]?.values[0] as [number, number] | undefined;
  return res ? { leagueId: res[0], clubId: res[1] } : null;
}

// Enroll player in a Tarkan league. Picks club with fewest registered players.
export function enrollInTarkan(
  playerId: number,
  leagueId: number,
  season: number,
): { ok: boolean; summary: string; clubId?: number; clubName?: string } {
  const db = getDB();

  // Check not already enrolled
  const existing = getTarkanEnrollment(playerId, season);
  if (existing) {
    return { ok: false, summary: "⚠️ Sudah terdaftar di Tarkan musim ini. Keluar dulu sebelum pindah liga." };
  }

  // Pick a club in the target league (the one with fewest players)
  const clubs = db.exec(
    `SELECT c.id, c.name,
       (SELECT COUNT(*) FROM tarkan_enrollment te WHERE te.club_id = c.id AND te.season = ?) AS enrolled_count
     FROM clubs c
     WHERE c.league_id = ?
     ORDER BY enrolled_count ASC, RANDOM()
     LIMIT 1`,
    [season, leagueId],
  )[0]?.values[0] as [number, string, number] | undefined;

  if (!clubs) {
    return { ok: false, summary: "⚠️ Tidak ada klub tersedia di divisi ini." };
  }

  const [clubId, clubName] = clubs;
  db.run(`INSERT INTO tarkan_enrollment (player_id, league_id, club_id, season) VALUES (?, ?, ?, ?)`, [
    playerId,
    leagueId,
    clubId,
    season,
  ]);

  return {
    ok: true,
    summary: `✅ Berhasil bergabung dengan ${clubName} di ${TIER_INFO[leagueId].name}!`,
    clubId,
    clubName,
  };
}

export function unenrollFromTarkan(playerId: number, season: number): string {
  const db = getDB();
  db.run(`DELETE FROM tarkan_enrollment WHERE player_id = ? AND season = ?`, [playerId, season]);
  return "🚪 Keluar dari Tarkan musim ini.";
}

// ─── Standings ────────────────────────────────────────────────────────────────

export function getTarkanStandings(leagueId: number): TarkanStanding[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT c.id, c.name, c.wins, c.draws, c.losses, c.goals_for, c.goals_against, c.points
     FROM clubs c
     WHERE c.league_id = ?
     ORDER BY c.points DESC, (c.goals_for - c.goals_against) DESC, c.goals_for DESC`,
    [leagueId],
  )[0]?.values as [number, string, number, number, number, number, number, number][] | undefined;

  return (rows ?? []).map(([clubId, clubName, won, drawn, lost, gf, ga, points]) => ({
    clubId,
    clubName,
    played: won + drawn + lost,
    won,
    drawn,
    lost,
    gf,
    ga,
    points,
  }));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export function getTarkanFixtures(leagueId: number, clubId: number): TarkanFixture[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT m.id, m.home_club, ch.name, m.away_club, ca.name, m.date, m.week, m.home_goals, m.away_goals
     FROM match_results m
     JOIN clubs ch ON ch.id = m.home_club
     JOIN clubs ca ON ca.id = m.away_club
     WHERE m.league_id = ? AND (m.home_club = ? OR m.away_club = ?)
     ORDER BY m.date ASC`,
    [leagueId, clubId, clubId],
  )[0]?.values as [number, number, string, number, string, number, number, number | null, number | null][] | undefined;

  return (rows ?? []).map(
    ([matchId, homeClubId, homeClubName, awayClubId, awayClubName, date, week, homeGoals, awayGoals]) => ({
      matchId,
      homeClubId,
      homeClubName,
      awayClubId,
      awayClubName,
      date,
      week,
      homeGoals: homeGoals ?? null,
      awayGoals: awayGoals ?? null,
    }),
  );
}

// ─── Play a Tarkan match (ego's club) ─────────────────────────────────────────

export function playTarkanMatchForPlayer(
  playerId: number,
  matchId: number,
  day: number,
): { ok: boolean; summary: string } {
  const db = getDB();

  // Get player state
  const pRow = db.exec(`SELECT name, club, stamina, form, injured, in_prison, retired, ca FROM players WHERE id = ?`, [
    playerId,
  ])[0]?.values[0] as [string, number | null, number, number, number, number, number, number] | undefined;
  if (!pRow) return { ok: false, summary: "⚠️ Data pemain tidak ditemukan." };

  const [name, , stamina, form, injured, inPrison, retired, ca] = pRow;
  if (retired) return { ok: false, summary: "⚠️ Pemain sudah pensiun." };
  if (inPrison) return { ok: false, summary: "⚠️ Tidak bisa main Tarkan saat menjalani hukuman." };
  if (injured) return { ok: false, summary: "⚠️ Sedang cedera, tidak bisa main." };
  if (stamina < 0.25) return { ok: false, summary: "⚠️ Stamina terlalu rendah (<25%) untuk main Tarkan." };

  // Get match info
  const mRow = db.exec(`SELECT league_id, home_club, away_club, home_goals FROM match_results WHERE id = ?`, [
    matchId,
  ])[0]?.values[0] as [number, number, number, number | null] | undefined;
  if (!mRow || mRow[3] !== null) return { ok: false, summary: "⚠️ Pertandingan tidak ditemukan atau sudah selesai." };

  const [leagueId, homeId, awayId] = mRow;

  // Get enrollment
  const enroll = getTarkanEnrollment(playerId, Math.floor(day / 365) + 1);
  if (!enroll) return { ok: false, summary: "⚠️ Belum terdaftar di Tarkan." };

  const isHome = enroll.clubId === homeId;
  const tierInfo = TIER_INFO[leagueId] ?? TIER_INFO[105];

  // Simulate match: ego side boosted by CA, opponent random
  const egoStrength = Math.max(1, ca) / 100;
  const oppRep =
    (db.exec(`SELECT reputation FROM clubs WHERE id = ?`, [isHome ? awayId : homeId])[0]?.values[0]?.[0] as
      | number
      | undefined) ?? 15;
  const oppStrength = oppRep / 100;

  const egoXG = egoStrength * (1.8 + Math.random() * 1.4);
  const oppXG = oppStrength * (1.2 + Math.random() * 1.6);

  function sampleGoals(xg: number): number {
    let g = 0;
    let rem = xg;
    while (rem > 0) {
      if (Math.random() < Math.min(rem, 1)) g++;
      rem -= 1;
    }
    return g;
  }

  const egoGoals = sampleGoals(egoXG);
  const oppGoals = sampleGoals(oppXG);
  const homeGoals = isHome ? egoGoals : oppGoals;
  const awayGoals = isHome ? oppGoals : egoGoals;

  // Fixture clash check (using existing function)
  const proClubId = pRow[1];
  let clashPenalty = false;
  if (proClubId) {
    const upcomingPro =
      (db.exec(
        `SELECT COUNT(*) FROM match_results
       WHERE (home_club = ? OR away_club = ?)
         AND home_goals IS NULL AND date >= ? AND date <= ?`,
        [proClubId, proClubId, day, day + 3],
      )[0]?.values[0]?.[0] as number) ?? 0;
    clashPenalty = upcomingPro > 0;
  }

  // Determine amplop
  const [feeMin, feeMax] = MATCH_FEE[leagueId] ?? [300_000, 700_000];
  const fee = feeMin + Math.floor(Math.random() * ((feeMax - feeMin) / 100_000 + 1)) * 100_000;

  // Injury risk (8%)
  const gotInjured = Math.random() < 0.08;
  const injType = gotInjured ? (Math.random() < 0.5 ? "blister" : "mild_sprain") : null;

  const formDelta = clashPenalty ? -0.1 : egoGoals > oppGoals ? 0.05 : egoGoals === oppGoals ? 0.01 : -0.03;

  // Update player
  db.run(
    `UPDATE players SET
       stamina = MAX(0.05, ROUND(stamina - 0.25, 2)),
       form = MIN(1.0, MAX(0.1, ROUND(form + ?, 2))),
       career_matches = career_matches + 1,
       career_goals = career_goals + ?,
       injured = CASE WHEN ? > 0 THEN 1 ELSE injured END,
       injury_duration = CASE WHEN ? > 0 THEN 3 ELSE injury_duration END,
       injury_type = CASE WHEN ? IS NOT NULL THEN ? ELSE injury_type END
     WHERE id = ?`,
    [formDelta, egoGoals, gotInjured ? 1 : 0, gotInjured ? 1 : 0, injType, injType, playerId],
  );

  // Update match result
  db.run(`UPDATE match_results SET home_goals = ?, away_goals = ? WHERE id = ?`, [homeGoals, awayGoals, matchId]);

  // Update club standings
  updateTarkanStanding(db, homeId, homeGoals, awayGoals);
  updateTarkanStanding(db, awayId, awayGoals, homeGoals);

  // Credit cash
  const curCash = Number(
    db.exec(`SELECT value FROM world_state WHERE key = 'ego_personal_cash'`)[0]?.values[0]?.[0] ?? "0",
  );
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('ego_personal_cash', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(curCash + fee)],
  );
  // Sync world_state JSON if present
  const wsRaw = db.exec(`SELECT value FROM world_state WHERE key = 'world_state'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  if (wsRaw) {
    try {
      const ws = JSON.parse(wsRaw);
      if (ws.ego) {
        ws.ego.personal_cash = (ws.ego.personal_cash ?? 0) + fee;
        db.run(`UPDATE world_state SET value = ? WHERE key = 'world_state'`, [JSON.stringify(ws)]);
      }
    } catch {
      /* ignore */
    }
  }

  const resultStr = egoGoals > oppGoals ? "Menang" : egoGoals === oppGoals ? "Seri" : "Kalah";
  const score = isHome ? `${egoGoals}-${oppGoals}` : `${oppGoals}-${egoGoals}`;
  const parts = [`⚽ ${tierInfo.name}: ${resultStr} ${score}! Amplop Rp ${(fee / 1_000_000).toFixed(1)}M.`];
  if (egoGoals > 0) parts.push(`${name} cetak ${egoGoals} gol.`);
  if (gotInjured) parts.push(`🚑 Cedera ringan (${injType}) akibat lapangan!`);
  if (clashPenalty) parts.push(`⚠️ Pelatih pro murka — ada laga resmi dalam 3 hari! (Form -10%).`);

  return { ok: true, summary: parts.join(" ") };
}

// ─── Background sim for AI Tarkan clubs ──────────────────────────────────────

export function processTarkanDay(day: number, egoClubId: number | null): void {
  const db = getDB();
  const fixtures = db.exec(
    `SELECT id, league_id, home_club, away_club FROM match_results
     WHERE date = ? AND home_goals IS NULL AND league_id >= 101`,
    [day],
  )[0]?.values as [number, number, number, number][] | undefined;

  if (!fixtures || fixtures.length === 0) return;

  for (const [matchId, , homeId, awayId] of fixtures) {
    // Skip ego's club match — handled by playTarkanMatchForPlayer
    if (homeId === egoClubId || awayId === egoClubId) continue;

    const homeRep = (db.exec(`SELECT reputation FROM clubs WHERE id = ?`, [homeId])[0]?.values[0]?.[0] as number) ?? 15;
    const awayRep = (db.exec(`SELECT reputation FROM clubs WHERE id = ?`, [awayId])[0]?.values[0]?.[0] as number) ?? 15;

    const homeXG = (homeRep / 100) * (1.5 + Math.random() * 1.5) + 0.2; // home advantage
    const awayXG = (awayRep / 100) * (1.5 + Math.random() * 1.5);

    const hg = sampleGoals(homeXG);
    const ag = sampleGoals(awayXG);

    db.run(`UPDATE match_results SET home_goals = ?, away_goals = ? WHERE id = ?`, [hg, ag, matchId]);
    updateTarkanStanding(db, homeId, hg, ag);
    updateTarkanStanding(db, awayId, ag, hg);
  }
}

function sampleGoals(xg: number): number {
  let g = 0;
  let rem = xg;
  while (rem > 0) {
    if (Math.random() < Math.min(rem, 1)) g++;
    rem -= 1;
  }
  return g;
}

function updateTarkanStanding(db: ReturnType<typeof getDB>, clubId: number, gf: number, ga: number): void {
  const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
  const w = gf > ga ? 1 : 0;
  const d = gf === ga ? 1 : 0;
  const l = gf < ga ? 1 : 0;
  db.run(
    `UPDATE clubs SET
       wins = wins + ?, draws = draws + ?, losses = losses + ?,
       goals_for = goals_for + ?, goals_against = goals_against + ?,
       points = points + ?
     WHERE id = ?`,
    [w, d, l, gf, ga, pts, clubId],
  );
}

// ─── Season end prize ─────────────────────────────────────────────────────────

export function checkTarkanSeasonPrize(playerId: number, season: number): string | null {
  const db = getDB();
  const enroll = getTarkanEnrollment(playerId, season);
  if (!enroll) return null;

  const standings = getTarkanStandings(enroll.leagueId);
  if (standings.length === 0 || standings[0].clubId !== enroll.clubId) return null;

  const prize = TIER_INFO[enroll.leagueId]?.prize ?? 0;
  const curCash = Number(
    db.exec(`SELECT value FROM world_state WHERE key = 'ego_personal_cash'`)[0]?.values[0]?.[0] ?? "0",
  );
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('ego_personal_cash', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(curCash + prize)],
  );
  const tierName = TIER_INFO[enroll.leagueId]?.name ?? "Tarkan";
  return `🏆 JUARA ${tierName.toUpperCase()}! Hadiah Rp ${(prize / 1_000_000).toFixed(0)}M masuk kantong!`;
}
