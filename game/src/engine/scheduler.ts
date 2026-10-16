import { getDB } from "./db.js";
import { fullSim } from "./match.js";
import type { Player, Club, MatchResult } from "../types/index.js";

// ─── DB helpers ───────────────────────────────────────────────────────────────

function rowToClub(row: unknown[]): Club {
  return {
    id: row[0] as number,
    name: row[1] as string,
    league_id: row[2] as number,
    reputation: row[3] as number,
    owner_id: null,
    manager_id: null,
    cash: row[4] as number,
    debt: 0,
    monthly_income: 0,
    monthly_costs: 0,
    credit_score: 70,
    consecutive_missed_payments: 0,
    bankrupt: false,
    slot_id: row[0] as number,
    club_morale: row[5] as number,
    fans: row[6] as number,
    stadium_capacity: row[7] as number,
    facilities_level: row[8] as number,
    academy_level: row[9] as number,
    wins: row[10] as number,
    draws: row[11] as number,
    losses: row[12] as number,
    goals_for: row[13] as number,
    goals_against: row[14] as number,
    points: row[15] as number,
  };
}

// Minimal player columns needed for fullSim
const SQUAD_SELECT = `
  SELECT id, position, attacking, defending, technical, mental, physical, speed, goalkeeping, form, stamina
  FROM players
  WHERE club = ? AND retired = 0 AND injured = 0
  ORDER BY overall DESC
  LIMIT 11
`;

function rowToSimPlayer(row: unknown[]): Player {
  // Fills only fields fullSim actually reads; rest are defaults
  return {
    id: row[0] as number,
    name: "",
    nationality: 1,
    club: null,
    position: row[1] as Player["position"],
    secondary_position: null,
    age: 22,
    height: 175,
    weight: 72,
    foot: "R",
    ca: 8,
    pa: 8,
    overall: 8,
    attacking: row[2] as number,
    defending: row[3] as number,
    technical: row[4] as number,
    mental: row[5] as number,
    physical: row[6] as number,
    speed: row[7] as number,
    goalkeeping: row[8] as number,
    stamina: row[9] as number,
    form: row[10] as number,
    injury_prone: 3,
    traits: [],
    trait_intensity: {},
    injured: false,
    injury_duration: 0,
    injury_type: null,
    retired: false,
    free_agent: false,
    on_transfer_list: false,
    transfer_ban: false,
    in_prison: false,
    prison_duration: 0,
    matches: 0,
    goals: 0,
    assists: 0,
    rating: 0,
    yellow_cards: 0,
    red_cards: 0,
    clean_sheets: 0,
    career_matches: 0,
    career_goals: 0,
    career_assists: 0,
    career_trophies: 0,
    agent_id: null,
    contract_end: 365,
    wage: 0,
  };
}

export function getSquad(clubId: number): Player[] {
  const db = getDB();
  const res = db.exec(SQUAD_SELECT, [clubId]);
  return (res[0]?.values ?? []).map(rowToSimPlayer);
}

export function getClub(clubId: number): Club | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id,name,league_id,reputation,cash,club_morale,fans,stadium_capacity,
            facilities_level,academy_level,wins,draws,losses,goals_for,goals_against,points
     FROM clubs WHERE id = ?`,
    [clubId],
  );
  const row = res[0]?.values[0];
  return row ? rowToClub(row) : null;
}

// ─── Schedule queries ─────────────────────────────────────────────────────────

// Next unplayed fixture date strictly after currentDay, across all competitions.
export function nextEventDay(currentDay: number): number | null {
  const db = getDB();
  const res = db.exec(`SELECT MIN(date) FROM match_results WHERE home_goals IS NULL AND date > ?`, [currentDay]);
  const val = res[0]?.values[0]?.[0];
  return val != null ? (val as number) : null;
}

// Upcoming fixtures for a specific club (unplayed, soonest first).
export interface UpcomingFixture {
  date: number;
  week: number;
  competition: string;
  home_club_id: number;
  home_club_name: string;
  away_club_id: number;
  away_club_name: string;
}

export function getUpcoming(clubId: number, fromDay: number, count = 5): UpcomingFixture[] {
  const db = getDB();
  const res = db.exec(
    `SELECT m.date, m.week, m.competition,
            m.home_club, hc.name, m.away_club, ac.name
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE (m.home_club = ? OR m.away_club = ?)
       AND m.home_goals IS NULL
       AND m.date > ?
     ORDER BY m.date ASC
     LIMIT ?`,
    [clubId, clubId, fromDay, count],
  );
  return (res[0]?.values ?? []).map((r) => ({
    date: r[0] as number,
    week: r[1] as number,
    competition: r[2] as string,
    home_club_id: r[3] as number,
    home_club_name: r[4] as string,
    away_club_id: r[5] as number,
    away_club_name: r[6] as string,
  }));
}

// ─── Match day processor ──────────────────────────────────────────────────────

function updateClubStanding(clubId: number, gf: number, ga: number): void {
  const db = getDB();
  const win = gf > ga ? 1 : 0;
  const draw = gf === ga ? 1 : 0;
  const loss = gf < ga ? 1 : 0;
  const pts = win * 3 + draw;
  db.run(
    `UPDATE clubs SET
       wins = wins + ?, draws = draws + ?, losses = losses + ?,
       goals_for = goals_for + ?, goals_against = goals_against + ?,
       points = points + ?
     WHERE id = ?`,
    [win, draw, loss, gf, ga, pts, clubId],
  );
}

// Process all unplayed fixtures on `day`. Returns results.
export function processMatchDay(day: number): MatchResult[] {
  const db = getDB();
  const fixtures = db.exec(
    `SELECT id, league_id, home_club, away_club FROM match_results
     WHERE date = ? AND home_goals IS NULL`,
    [day],
  );

  const results: MatchResult[] = [];
  for (const row of fixtures[0]?.values ?? []) {
    const [matchId, leagueId, homeId, awayId] = row as [number, number, number, number];

    const homeClub = getClub(homeId);
    const awayClub = getClub(awayId);
    const homePlayers = getSquad(homeId);
    const awayPlayers = getSquad(awayId);

    if (!homeClub || !awayClub || homePlayers.length === 0 || awayPlayers.length === 0) continue;

    const result = fullSim({
      home_club: homeClub,
      away_club: awayClub,
      home_players: homePlayers,
      away_players: awayPlayers,
      league_level: 1,
      date: day,
      league_id: leagueId as number,
      match_id: matchId as number,
    });

    // Persist result
    db.run(`UPDATE match_results SET home_goals=?, away_goals=?, stats=?, scorers=? WHERE id=?`, [
      result.home_goals,
      result.away_goals,
      JSON.stringify(result.stats),
      JSON.stringify(result.scorers),
      matchId,
    ]);

    updateClubStanding(homeId, result.home_goals, result.away_goals);
    updateClubStanding(awayId, result.away_goals, result.home_goals);

    results.push(result);
  }
  return results;
}
