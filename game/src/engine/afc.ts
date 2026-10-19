import { getDB } from "./db.js";

// ─── AFC Champions League (Asia) ──────────────────────────────────────────────
// League ID 20, competition "afc_cl"
// 8 clubs: top 4 Liga 1 + top 2 Malaysia + top 2 Thailand (seeded by rep)
// Format: 2 groups × 4, single RR group stage → QF → SF → Final

export const AFC_LEAGUE_ID = 20;
export const AFC_COMPETITION = "afc_cl";

const AFC_STAGES = ["afc_group", "afc_qf", "afc_sf", "afc_final"] as const;
type AFCStage = (typeof AFC_STAGES)[number];

export const AFC_STAGE_LABEL: Record<AFCStage, string> = {
  afc_group: "Fase Grup",
  afc_qf: "Perempat Final",
  afc_sf: "Semifinal",
  afc_final: "GRAND FINAL",
};

const GROUP_STAGE_DAY = 60;
const GROUP_ROUND_GAP = 14; // 3 rounds per group × 14 days = 42 days (day 60–102)
const KO_START_DAY = 116; // QF

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AFCGroupStanding {
  clubId: number;
  clubName: string;
  group: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

export interface AFCRound {
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
    group: number;
  }[];
}

// ─── Generation ──────────────────────────────────────────────────────────────

export function generateAFCGroupStage(): void {
  const db = getDB();

  // Pick participants: top 4 Liga 1, top 2 MSL, top 2 Thai League
  const pick = (leagueId: number, limit: number) =>
    (
      db.exec(`SELECT id FROM clubs WHERE league_id = ? ORDER BY reputation DESC LIMIT ?`, [leagueId, limit])[0]
        ?.values ?? []
    ).map((r) => r[0] as number);

  const clubs = [...pick(1, 4), ...pick(3, 2), ...pick(4, 2)];
  if (clubs.length < 8) return;

  // Group A: clubs[0], clubs[2], clubs[5], clubs[7]
  // Group B: clubs[1], clubs[3], clubs[4], clubs[6]
  const groupA = [clubs[0], clubs[2], clubs[5], clubs[7]];
  const groupB = [clubs[1], clubs[3], clubs[4], clubs[6]];

  let matchId = ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  const insertGroupRR = (group: number[], groupNum: number) => {
    // Single round-robin: C(4,2)=6 matches, spread over 3 days (2 per day)
    const pairs: [number, number][] = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push([group[i], group[j]]);
      }
    }
    // 3 rounds of 2 matches each
    const rounds: [number, number][][] = [
      [pairs[0], pairs[5]],
      [pairs[1], pairs[4]],
      [pairs[2], pairs[3]],
    ];
    rounds.forEach((round, ri) => {
      const day = GROUP_STAGE_DAY + ri * GROUP_ROUND_GAP;
      round.forEach(([home, away]) => {
        db.run(
          `INSERT INTO match_results
            (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
           VALUES (?,?,?,?,NULL,NULL,?,?,'afc_group',?,?,'{}','[]')`,
          [matchId++, AFC_LEAGUE_ID, home, away, day, ri + 1, groupNum, AFC_COMPETITION],
        );
      });
    });
  };

  insertGroupRR(groupA, 1);
  insertGroupRR(groupB, 2);
}

// ─── Group standings (computed from match_results, not clubs table) ──────────

export function getAFCGroupStandings(): AFCGroupStanding[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT m.home_club, m.away_club, m.home_goals, m.away_goals, m.group_num,
            hc.name, ac.name
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE m.league_id = ? AND m.stage_id = 'afc_group' AND m.home_goals IS NOT NULL`,
    [AFC_LEAGUE_ID],
  )[0]?.values as [number, number, number, number, number, string, string][] | undefined;

  const map = new Map<number, AFCGroupStanding>();

  const ensure = (id: number, name: string, group: number) => {
    if (!map.has(id))
      map.set(id, { clubId: id, clubName: name, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    return map.get(id)!;
  };

  for (const [homeId, awayId, hg, ag, groupNum, homeName, awayName] of rows ?? []) {
    const h = ensure(homeId, homeName, groupNum);
    const a = ensure(awayId, awayName, groupNum);
    h.played++;
    a.played++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (hg < ag) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }

  return [...map.values()].sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
}

// ─── KO progression ──────────────────────────────────────────────────────────

export function checkAFCProgression(): string | null {
  const db = getDB();

  // Check if group stage is done
  const groupRes = db.exec(
    `SELECT COUNT(*) as total, SUM(CASE WHEN home_goals IS NOT NULL THEN 1 ELSE 0 END) as played
     FROM match_results WHERE league_id = ? AND stage_id = 'afc_group'`,
    [AFC_LEAGUE_ID],
  )[0]?.values[0] as [number, number] | undefined;

  if (!groupRes || groupRes[1] < groupRes[0] || groupRes[0] === 0) return null;

  // Check if QF already generated
  const qfExists =
    ((db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = 'afc_qf'`, [AFC_LEAGUE_ID])[0]
      ?.values[0]?.[0] as number) ?? 0) > 0;

  if (!qfExists) return generateAFCKnockout("afc_group", "afc_qf", KO_START_DAY);

  // Check QF done → SF
  const sfExists =
    ((db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = 'afc_sf'`, [AFC_LEAGUE_ID])[0]
      ?.values[0]?.[0] as number) ?? 0) > 0;

  if (!sfExists) {
    const qfDone = checkStageDone("afc_qf");
    if (qfDone) return generateAFCKnockout("afc_qf", "afc_sf", KO_START_DAY + 14);
    return null;
  }

  // Check SF done → Final
  const finalExists =
    ((db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = 'afc_final'`, [AFC_LEAGUE_ID])[0]
      ?.values[0]?.[0] as number) ?? 0) > 0;

  if (!finalExists) {
    const sfDone = checkStageDone("afc_sf");
    if (sfDone) return generateAFCKnockout("afc_sf", "afc_final", KO_START_DAY + 28);
    return null;
  }

  // Final done — record winner
  return checkAndRecordAFCWinner();
}

function checkStageDone(stageId: string): boolean {
  const db = getDB();
  const res = db.exec(
    `SELECT COUNT(*) as total, SUM(CASE WHEN home_goals IS NOT NULL THEN 1 ELSE 0 END) as played
     FROM match_results WHERE league_id = ? AND stage_id = ?`,
    [AFC_LEAGUE_ID, stageId],
  )[0]?.values[0] as [number, number] | undefined;
  return !!res && res[0] > 0 && res[1] >= res[0];
}

function generateAFCKnockout(fromStage: string, toStage: string, day: number): string | null {
  const db = getDB();
  let winners: number[] = [];

  if (fromStage === "afc_group") {
    // Top 2 from each group advance
    const standings = getAFCGroupStandings();
    const g1 = standings.filter((s) => s.group === 1).slice(0, 2);
    const g2 = standings.filter((s) => s.group === 2).slice(0, 2);
    if (g1.length < 2 || g2.length < 2) return null;
    // QF: G1 1st vs G2 2nd, G2 1st vs G1 2nd
    winners = [g1[0].clubId, g2[1].clubId, g2[0].clubId, g1[1].clubId];
  } else {
    // Get winners from previous KO stage
    const matches = db.exec(
      `SELECT home_club, away_club, home_goals, away_goals
       FROM match_results WHERE league_id = ? AND stage_id = ?`,
      [AFC_LEAGUE_ID, fromStage],
    )[0]?.values as [number, number, number, number][] | undefined;

    for (const [h, a, hg, ag] of matches ?? []) {
      winners.push(hg >= ag ? h : a);
    }
  }

  if (winners.length < 2) return null;

  let matchId = ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  for (let i = 0; i < winners.length - 1; i += 2) {
    db.run(
      `INSERT INTO match_results
        (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
       VALUES (?,?,?,?,NULL,NULL,?,1,'${toStage}',0,'afc_cl','{}','[]')`,
      [matchId++, AFC_LEAGUE_ID, winners[i], winners[i + 1], day],
    );
  }

  return `🌏 AFC Champions League: ${AFC_STAGE_LABEL[toStage as AFCStage] ?? toStage} siap dimulai!`;
}

function checkAndRecordAFCWinner(): string | null {
  const db = getDB();
  const finalRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals FROM match_results
     WHERE league_id = ? AND stage_id = 'afc_final' AND home_goals IS NOT NULL`,
    [AFC_LEAGUE_ID],
  )[0]?.values[0] as [number, number, number, number] | undefined;

  if (!finalRes) return null;

  const alreadyRecorded = db.exec(`SELECT value FROM world_state WHERE key = 'afc_winner_id'`)[0]?.values[0]?.[0];
  if (alreadyRecorded) return null;

  const [home, away, hg, ag] = finalRes;
  const winnerId = hg >= ag ? home : away;

  db.run(
    `INSERT INTO world_state (key, value) VALUES ('afc_winner_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(winnerId)],
  );
  db.run(`UPDATE players SET career_trophies = career_trophies + 1 WHERE club = ?`, [winnerId]);

  // Credit prize money (Rp 200M) to winning club's cash
  db.run(`UPDATE clubs SET cash = cash + 200000000000 WHERE id = ?`, [winnerId]);

  const winnerName = (db.exec(`SELECT name FROM clubs WHERE id = ?`, [winnerId])[0]?.values[0]?.[0] as string) ?? "?";
  return `🌏🏆 ${winnerName} JUARA AFC CHAMPIONS LEAGUE!`;
}

// ─── Bracket data for UI ──────────────────────────────────────────────────────

export function getAFCBracket(): AFCRound[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT m.id, m.stage_id, m.home_club, hc.name, m.away_club, ac.name,
            m.home_goals, m.away_goals, m.date, m.group_num
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE m.league_id = ?
     ORDER BY m.date ASC, m.id ASC`,
    [AFC_LEAGUE_ID],
  )[0]?.values as
    | [number, string, number, string, number, string, number | null, number | null, number, number][]
    | undefined;

  const byStage = new Map<string, AFCRound>();
  for (const [matchId, stageId, homeId, homeName, awayId, awayName, homeGoals, awayGoals, date, group] of rows ?? []) {
    if (!byStage.has(stageId)) {
      byStage.set(stageId, {
        stageId,
        label: AFC_STAGE_LABEL[stageId as AFCStage] ?? stageId,
        matches: [],
      });
    }
    byStage.get(stageId)!.matches.push({
      matchId,
      homeId,
      homeName,
      awayId,
      awayName,
      homeGoals: homeGoals ?? null,
      awayGoals: awayGoals ?? null,
      date,
      group,
    });
  }

  return AFC_STAGES.filter((s) => byStage.has(s)).map((s) => byStage.get(s)!);
}
