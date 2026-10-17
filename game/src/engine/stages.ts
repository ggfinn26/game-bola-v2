import { getDB } from "./db.js";
import type { StageConfig as BaseStageConfig } from "../types/index.js";

export interface StageConfig extends Partial<BaseStageConfig> {
  id: string;
  name: string;
  type?: "league" | "knockout" | "group";
  group_count?: number;
  legs?: 1 | 2;
  advance_count?: number;
  relegate_count?: number;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;
  tiebreakers?: string[];
}

const DEFAULT_REGULAR_STAGE: StageConfig = {
  id: "regular_season",
  name: "Regular Season",
  type: "league",
  format: "round_robin",
  group_count: 1,
  num_groups: 1,
  legs: 2,
  advance_count: 0,
  relegate_count: 3,
  points_win: 3,
  points_draw: 1,
  points_loss: 0,
  tiebreakers: ["goal_diff", "goals_for", "h2h"],
};

export function getActiveStages(leagueId: number): StageConfig[] {
  const db = getDB();
  const res = db.exec(
    `SELECT stages FROM competition_configs
     WHERE league_id = ? AND status = 'active'
     ORDER BY season_apply DESC LIMIT 1`,
    [leagueId],
  );
  const raw = res[0]?.values[0]?.[0] as string | undefined;
  if (!raw) return [{ ...DEFAULT_REGULAR_STAGE }];
  try {
    const parsed = JSON.parse(raw) as StageConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to default stage
  }
  return [{ ...DEFAULT_REGULAR_STAGE }];
}

export function setChampionshipSeriesFormat(leagueId: number, enable: boolean): string {
  const db = getDB();
  const stages: StageConfig[] = enable
    ? [
        {
          id: "regular_season",
          name: "Regular Season",
          type: "league",
          format: "round_robin",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 4,
          relegate_count: 3,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for", "h2h"],
        },
        {
          id: "championship_series",
          name: "Championship Series",
          type: "knockout",
          format: "knockout",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 1,
          relegate_count: 0,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for"],
        },
      ]
    : [
        {
          id: "regular_season",
          name: "Regular Season",
          type: "league",
          format: "round_robin",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 0,
          relegate_count: 3,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for", "h2h"],
        },
      ];

  db.run(
    `UPDATE competition_configs SET stages = ? WHERE league_id = ? AND status = 'active'`,
    [JSON.stringify(stages), leagueId],
  );

  return enable
    ? "Format Championship Series (Regular Season + Knockout 4 Besar) diaktifkan."
    : "Format Liga Penuh (Regular Season tanpa Knockout) diaktifkan.";
}

export function hasChampionshipSeries(leagueId: number): boolean {
  const stages = getActiveStages(leagueId);
  return stages.some((s) => s.type === "knockout" || s.format === "knockout");
}

function roundRobin(teams: number[]): [number, number][][] {
  const ts = [...teams];
  if (ts.length % 2 !== 0) ts.push(-1);
  const n = ts.length;
  const rounds: [number, number][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = ts[i];
      const away = ts[n - 1 - i];
      if (home !== -1 && away !== -1) round.push([home, away]);
    }
    rounds.push(round);
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

export function generateMultiStageFixtures(
  leagueId: number,
  clubIds: number[],
  startDay: number,
  competition = "liga1",
  daySpacing = 7,
): void {
  const db = getDB();
  const stages = getActiveStages(leagueId);
  const firstStage = stages[0] ?? DEFAULT_REGULAR_STAGE;
  const groupCount = firstStage.group_count ?? firstStage.num_groups ?? 1;
  const legs = firstStage.legs ?? 2;
  const stageId = firstStage.id || "regular_season";

  let matchId =
    ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  const insertGroupFixtures = (groupClubs: number[], groupNum: number) => {
    const firstLeg = roundRobin(groupClubs);
    const allRounds =
      legs === 2
        ? [...firstLeg, ...firstLeg.map((round) => round.map(([h, a]) => [a, h] as [number, number]))]
        : firstLeg;

    allRounds.forEach((round, roundIdx) => {
      const matchDay = startDay + roundIdx * daySpacing;
      const weekNum = roundIdx + 1;
      round.forEach(([home, away]) => {
        db.run(
          `INSERT INTO match_results
            (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
           VALUES (?,?,?,?,NULL,NULL,?,?,?,?,?,'{}','[]')`,
          [matchId++, leagueId, home, away, matchDay, weekNum, stageId, groupNum, competition],
        );
      });
    });
  };

  if (groupCount > 1) {
    const perGroup = Math.ceil(clubIds.length / groupCount);
    for (let g = 0; g < groupCount; g++) {
      const slice = clubIds.slice(g * perGroup, (g + 1) * perGroup);
      if (slice.length >= 2) {
        insertGroupFixtures(slice, g + 1);
      }
    }
  } else {
    insertGroupFixtures(clubIds, 0);
  }
}

interface KnockoutRow {
  homeClub: number;
  awayClub: number;
  homeGoals: number | null;
  awayGoals: number | null;
  stageId: string;
}

function resolveTieWinner(matches: KnockoutRow[], leagueId: number): number | null {
  if (matches.length === 0) return null;
  const db = getDB();
  const goalsByClub = new Map<number, number>();
  for (const m of matches) {
    goalsByClub.set(m.homeClub, (goalsByClub.get(m.homeClub) ?? 0) + (m.homeGoals ?? 0));
    goalsByClub.set(m.awayClub, (goalsByClub.get(m.awayClub) ?? 0) + (m.awayGoals ?? 0));
  }
  const clubs = [...goalsByClub.keys()];
  if (clubs.length < 2) return clubs[0] ?? null;
  const [clubA, clubB] = clubs;
  const goalsA = goalsByClub.get(clubA) ?? 0;
  const goalsB = goalsByClub.get(clubB) ?? 0;
  if (goalsA > goalsB) return clubA;
  if (goalsB > goalsA) return clubB;

  // Tiebreaker: higher regular season points, then goal difference, then goals_for
  const rankRes = db.exec(
    `SELECT id FROM clubs
     WHERE league_id = ? AND id IN (?, ?)
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC LIMIT 1`,
    [leagueId, clubA, clubB],
  );
  return (rankRes[0]?.values[0]?.[0] as number) ?? clubA;
}

export function checkAndGenerateNextStage(
  leagueId: number,
  seasonStartDay: number,
  competition = "liga1",
): string | null {
  const db = getDB();
  const stages = getActiveStages(leagueId);
  const knockoutStage = stages.find((s) => s.type === "knockout" || s.format === "knockout");
  if (!knockoutStage) return null;

  const legs = knockoutStage.legs ?? 2;

  const koRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals, stage_id
     FROM match_results
     WHERE league_id = ? AND date >= ? AND stage_id IN ('championship_sf', 'championship_final')
     ORDER BY id ASC`,
    [leagueId, seasonStartDay],
  );

  const koMatches: KnockoutRow[] = (koRes[0]?.values ?? []).map((r) => ({
    homeClub: r[0] as number,
    awayClub: r[1] as number,
    homeGoals: r[2] as number | null,
    awayGoals: r[3] as number | null,
    stageId: r[4] as string,
  }));

  const sfMatches = koMatches.filter((m) => m.stageId === "championship_sf");
  const finalMatches = koMatches.filter((m) => m.stageId === "championship_final");

  const lastDateRes = db.exec(
    `SELECT COALESCE(MAX(date), ?) FROM match_results WHERE league_id = ?`,
    [seasonStartDay, leagueId],
  );
  const lastDate = (lastDateRes[0]?.values[0]?.[0] as number) ?? seasonStartDay;

  let nextMatchId =
    ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  // Case A: No championship_sf matches exist yet in this season
  if (sfMatches.length === 0) {
    const top4Res = db.exec(
      `SELECT id FROM clubs
       WHERE league_id = ?
       ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC
       LIMIT 4`,
      [leagueId],
    );
    const top4 = (top4Res[0]?.values ?? []).map((r) => r[0] as number);
    if (top4.length < 4) return null;

    const [seed1, seed2, seed3, seed4] = top4;
    const pairings: [number, number][] = [
      [seed1, seed4],
      [seed2, seed3],
    ];

    // Leg 1 (week 35, lastDate + 7)
    for (const [home, away] of pairings) {
      db.run(
        `INSERT INTO match_results
          (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
         VALUES (?,?,?,?,NULL,NULL,?,35,'championship_sf',0,?,'{}','[]')`,
        [nextMatchId++, leagueId, home, away, lastDate + 7, competition],
      );
    }

    // Leg 2 if legs === 2 (week 36, lastDate + 14)
    if (legs === 2) {
      for (const [home, away] of pairings) {
        db.run(
          `INSERT INTO match_results
            (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
           VALUES (?,?,?,?,NULL,NULL,?,36,'championship_sf',0,?,'{}','[]')`,
          [nextMatchId++, leagueId, away, home, lastDate + 14, competition],
        );
      }
    }

    return "🔥 Babak Semifinal Championship Series dimulai! (4 Klub Teratas)";
  }

  // Case B: championship_sf matches exist and are all played, and no championship_final matches exist yet
  const sfAllPlayed = sfMatches.every((m) => m.homeGoals !== null && m.awayGoals !== null);
  if (sfAllPlayed && finalMatches.length === 0) {
    // Group SF matches by unordered pair of clubs
    const pairMap = new Map<string, KnockoutRow[]>();
    for (const m of sfMatches) {
      const key = [m.homeClub, m.awayClub].sort((a, b) => a - b).join("-");
      const arr = pairMap.get(key) ?? [];
      arr.push(m);
      pairMap.set(key, arr);
    }

    const winners: number[] = [];
    for (const pairMatches of pairMap.values()) {
      const w = resolveTieWinner(pairMatches, leagueId);
      if (w !== null) winners.push(w);
    }

    if (winners.length < 2) return null;
    const [finalistA, finalistB] = winners;

    // Leg 1 (week 37, lastDate + 7)
    db.run(
      `INSERT INTO match_results
        (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
       VALUES (?,?,?,?,NULL,NULL,?,37,'championship_final',0,?,'{}','[]')`,
      [nextMatchId++, leagueId, finalistA, finalistB, lastDate + 7, competition],
    );

    // Leg 2 if legs === 2 (week 38, lastDate + 14)
    if (legs === 2) {
      db.run(
        `INSERT INTO match_results
          (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
         VALUES (?,?,?,?,NULL,NULL,?,38,'championship_final',0,?,'{}','[]')`,
        [nextMatchId++, leagueId, finalistB, finalistA, lastDate + 14, competition],
      );
    }

    return "🏆 Partai Final Championship Series dimulai!";
  }

  // Case C: championship_final matches exist and are all played (or waiting for unplayed matches)
  return null;
}

export function getSeasonChampion(
  leagueId: number,
  seasonStartDay: number,
): { club_id: number; name: string; points: number } | null {
  const db = getDB();

  const finalRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals, stage_id
     FROM match_results
     WHERE league_id = ? AND date >= ? AND stage_id = 'championship_final' AND home_goals IS NOT NULL
     ORDER BY id ASC`,
    [leagueId, seasonStartDay],
  );

  const finalMatches: KnockoutRow[] = (finalRes[0]?.values ?? []).map((r) => ({
    homeClub: r[0] as number,
    awayClub: r[1] as number,
    homeGoals: r[2] as number | null,
    awayGoals: r[3] as number | null,
    stageId: r[4] as string,
  }));

  if (finalMatches.length > 0) {
    const winnerId = resolveTieWinner(finalMatches, leagueId);
    if (winnerId !== null) {
      const clubRes = db.exec(`SELECT id, name, points FROM clubs WHERE id = ?`, [winnerId]);
      const row = clubRes[0]?.values[0];
      if (row) {
        return {
          club_id: row[0] as number,
          name: row[1] as string,
          points: row[2] as number,
        };
      }
    }
  }

  const topRes = db.exec(
    `SELECT id, name, points FROM clubs
     WHERE league_id = ?
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC
     LIMIT 1`,
    [leagueId],
  );
  const topRow = topRes[0]?.values[0];
  if (!topRow) return null;

  return {
    club_id: topRow[0] as number,
    name: topRow[1] as string,
    points: topRow[2] as number,
  };
}
