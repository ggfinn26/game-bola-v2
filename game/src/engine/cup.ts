import { getDB } from "./db.js";

// ─── Piala Indonesia ──────────────────────────────────────────────────────────
// League ID 10, competition "piala_id"
// 32 clubs (Liga 1 × 18 + Liga 2 × 14), single-elimination, 5 rounds

export const CUP_LEAGUE_ID = 10;
export const CUP_COMPETITION = "piala_id";

const CUP_STAGES = ["cup_r32", "cup_r16", "cup_qf", "cup_sf", "cup_final"] as const;
type CupStage = (typeof CUP_STAGES)[number];

const STAGE_LABEL: Record<CupStage, string> = {
  cup_r32: "Babak 32 Besar",
  cup_r16: "Babak 16 Besar",
  cup_qf: "Perempat Final",
  cup_sf: "Semifinal",
  cup_final: "FINAL",
};

// Days between rounds (first round starts at day 50 set in worldgen)
const ROUND_GAP = 14;

// ─── Cup bracket generation (called at season start by worldgen) ──────────────

export function generateCupR32(startDay = 50): void {
  const db = getDB();

  // Pick 32 clubs: all Liga 1 (18) + top 14 Liga 2 by reputation
  const liga1 = (db.exec(`SELECT id FROM clubs WHERE league_id = 1 ORDER BY reputation DESC`)[0]?.values ?? []).map(
    (r) => r[0] as number,
  );

  const liga2 = (
    db.exec(`SELECT id FROM clubs WHERE league_id = 2 ORDER BY reputation DESC LIMIT 14`)[0]?.values ?? []
  ).map((r) => r[0] as number);

  const seeded = [...liga1, ...liga2]; // 32 clubs, best seeds first
  if (seeded.length < 2) return;

  // Seeded bracket: 1 vs 32, 2 vs 31, ... 16 vs 17
  const n = seeded.length;
  const pairings: [number, number][] = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    pairings.push([seeded[i], seeded[n - 1 - i]]);
  }

  let matchId = ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  for (const [home, away] of pairings) {
    db.run(
      `INSERT INTO match_results
        (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
       VALUES (?,?,?,?,NULL,NULL,?,1,'cup_r32',0,'piala_id','{}','[]')`,
      [matchId++, CUP_LEAGUE_ID, home, away, startDay],
    );
  }
}

// ─── Progressive round generation ─────────────────────────────────────────────
// Called from world tick. Returns summary string if a new round was generated.

export function checkCupProgression(): string | null {
  const db = getDB();

  // Find the current active stage (latest stage that has any matches)
  const stageRes = db.exec(
    `SELECT stage_id, COUNT(*) as total,
            SUM(CASE WHEN home_goals IS NOT NULL THEN 1 ELSE 0 END) as played
     FROM match_results
     WHERE league_id = ?
     GROUP BY stage_id
     ORDER BY MIN(date) DESC`,
    [CUP_LEAGUE_ID],
  );

  if (!stageRes[0]?.values?.length) return null;

  // Find the most recent stage (last by date)
  let currentStage: CupStage | null = null;
  let allPlayed = false;
  let lastMatchDay = 50;

  for (const row of stageRes[0].values) {
    const [stageId, total, played] = row as [string, number, number];
    if (CUP_STAGES.includes(stageId as CupStage)) {
      currentStage = stageId as CupStage;
      allPlayed = played >= total && total > 0;
      // Get last date of this stage
      const dateRes = db.exec(`SELECT MAX(date) FROM match_results WHERE league_id = ? AND stage_id = ?`, [
        CUP_LEAGUE_ID,
        stageId,
      ]);
      lastMatchDay = (dateRes[0]?.values[0]?.[0] as number) ?? lastMatchDay;
      break; // already sorted by latest date
    }
  }

  if (!currentStage || !allPlayed) return null;

  // Already at final — no next stage
  if (currentStage === "cup_final") {
    return checkAndRecordCupWinner();
  }

  const nextStageIdx = CUP_STAGES.indexOf(currentStage) + 1;
  const nextStage = CUP_STAGES[nextStageIdx];
  if (!nextStage) return null;

  // Check if next stage already generated
  const existsRes = db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = ?`, [
    CUP_LEAGUE_ID,
    nextStage,
  ]);
  if (((existsRes[0]?.values[0]?.[0] as number) ?? 0) > 0) return null;

  // Collect winners from current stage
  const matchRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals
     FROM match_results
     WHERE league_id = ? AND stage_id = ?
     ORDER BY id ASC`,
    [CUP_LEAGUE_ID, currentStage],
  );

  const winners: number[] = [];
  for (const row of matchRes[0]?.values ?? []) {
    const [home, away, hg, ag] = row as [number, number, number, number];
    if (hg > ag) winners.push(home);
    else if (ag > hg) winners.push(away);
    else winners.push(Math.random() < 0.5 ? home : away); // random tiebreak (no extra time in this engine)
  }

  if (winners.length < 2) return null;

  // Shuffle winners for draw (except SF uses winners in order for cleaner bracket)
  const drawOrder = [...winners].sort(() => Math.random() - 0.5);

  let matchId = ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  const nextDay = lastMatchDay + ROUND_GAP;
  const weekNum = CUP_STAGES.indexOf(nextStage) + 1;

  for (let i = 0; i < drawOrder.length - 1; i += 2) {
    db.run(
      `INSERT INTO match_results
        (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
       VALUES (?,?,?,?,NULL,NULL,?,?,'${nextStage}',0,'piala_id','{}','[]')`,
      [matchId++, CUP_LEAGUE_ID, drawOrder[i], drawOrder[i + 1], nextDay, weekNum],
    );
  }

  return `🏆 Piala Indonesia: ${STAGE_LABEL[nextStage]} siap dimulai! (${drawOrder.length / 2} laga)`;
}

function checkAndRecordCupWinner(): string | null {
  const db = getDB();
  const finalRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals FROM match_results
     WHERE league_id = ? AND stage_id = 'cup_final' AND home_goals IS NOT NULL`,
    [CUP_LEAGUE_ID],
  )[0]?.values[0] as [number, number, number, number] | undefined;

  if (!finalRes) return null;

  const [home, away, hg, ag] = finalRes;
  const winnerId = hg >= ag ? home : away;

  const alreadyRecorded = db.exec(`SELECT value FROM world_state WHERE key = 'cup_winner_id'`)[0]?.values[0]?.[0];
  if (alreadyRecorded) return null;

  db.run(
    `INSERT INTO world_state (key, value) VALUES ('cup_winner_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(winnerId)],
  );

  // Award trophy to all players at winning club
  db.run(`UPDATE players SET career_trophies = career_trophies + 1 WHERE club = ?`, [winnerId]);

  const winnerName = (db.exec(`SELECT name FROM clubs WHERE id = ?`, [winnerId])[0]?.values[0]?.[0] as string) ?? "?";
  return `🏆 ${winnerName} JUARA PIALA INDONESIA!`;
}

// ─── Cup standing / bracket info for UI ──────────────────────────────────────

export interface CupRound {
  stageId: string;
  label: string;
  matches: {
    matchId: number;
    homeId: number;
    homeName: string;
    awayId: number;
    awayName: string;
    homeGoals: number | null;
    awayGoals: number | null;
    date: number;
  }[];
}

export function getCupBracket(): CupRound[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT m.id, m.stage_id, m.home_club, hc.name, m.away_club, ac.name,
            m.home_goals, m.away_goals, m.date
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE m.league_id = ?
     ORDER BY m.date ASC, m.id ASC`,
    [CUP_LEAGUE_ID],
  )[0]?.values as [number, string, number, string, number, string, number | null, number | null, number][] | undefined;

  const byStage = new Map<string, CupRound>();
  for (const [matchId, stageId, homeId, homeName, awayId, awayName, homeGoals, awayGoals, date] of rows ?? []) {
    if (!byStage.has(stageId)) {
      byStage.set(stageId, {
        stageId,
        label: STAGE_LABEL[stageId as CupStage] ?? stageId,
        matches: [],
      });
    }
    byStage.get(stageId)!.matches.push({ matchId, homeId, homeName, awayId, awayName, homeGoals, awayGoals, date });
  }

  return CUP_STAGES.filter((s) => byStage.has(s)).map((s) => byStage.get(s)!);
}
