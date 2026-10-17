import { getDB } from "./db.js";
import { fullSim, wheelSim } from "./match.js";
import { recalcPACA } from "./pa.js";
import { evaluateSeasonAwards } from "./awards.js";
import { getSeasonChampion, generateMultiStageFixtures } from "./stages.js";
import type { MatchStep } from "./match.js";
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

// Minimal player columns needed for fullSim / wheelSim + cards/injuries
const SQUAD_SELECT = `
  SELECT p.id, p.name, p.position,
         p.finishing, p.passing, p.dribbling, p.heading, p.crossing, p.tackling, p.technique, p.long_shots,
         p.decisions, p.composure, p.positioning, p.vision, p.anticipation, p.off_the_ball, p.work_rate,
         p.pace, p.strength, p.agility, p.jumping,
         p.reflexes, p.handling, p.gk_positioning, p.one_on_ones, p.command,
         p.stamina, p.form, p.injury_prone, p.traits
  FROM players p
  LEFT JOIN card_accumulation ca
    ON ca.player_id = p.id AND ca.competition_id = ? AND ca.season = ?
  WHERE p.club = ? AND p.retired = 0 AND p.injured = 0
    AND COALESCE(ca.suspended_matches_remaining, 0) = 0
  ORDER BY (p.id = ?) DESC, p.overall DESC
  LIMIT 11
`;

function rowToSimPlayer(row: unknown[]): Player {
  return {
    id: row[0] as number,
    name: row[1] as string,
    nationality: 1,
    club: null,
    position: row[2] as Player["position"],
    secondary_position: null,
    age: 22,
    height: 175,
    weight: 72,
    foot: "R",
    ca: 50,
    pa: 50,
    pa_ceiling: 100,
    overall: 50,
    finishing: row[3] as number,
    passing: row[4] as number,
    dribbling: row[5] as number,
    heading: row[6] as number,
    crossing: row[7] as number,
    tackling: row[8] as number,
    technique: row[9] as number,
    long_shots: row[10] as number,
    decisions: row[11] as number,
    composure: row[12] as number,
    positioning: row[13] as number,
    vision: row[14] as number,
    anticipation: row[15] as number,
    off_the_ball: row[16] as number,
    work_rate: row[17] as number,
    pace: row[18] as number,
    strength: row[19] as number,
    agility: row[20] as number,
    jumping: row[21] as number,
    reflexes: row[22] as number,
    handling: row[23] as number,
    gk_positioning: row[24] as number,
    one_on_ones: row[25] as number,
    command: row[26] as number,
    stamina: row[27] as number,
    form: row[28] as number,
    injury_prone: (row[29] as number) ?? 3,
    traits: JSON.parse((row[30] as string) || "[]"),
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

export function getSquad(clubId: number, egoId = 0, competitionId = 1, season = 1): Player[] {
  const db = getDB();
  const res = db.exec(SQUAD_SELECT, [competitionId, season, clubId, egoId]);
  return (res[0]?.values ?? []).map(rowToSimPlayer);
}

export function getPlayerSuspension(playerId: number, competitionId = 1, season = 1): number {
  const db = getDB();
  const res = db.exec(
    `SELECT suspended_matches_remaining FROM card_accumulation
     WHERE player_id = ? AND competition_id = ? AND season = ?`,
    [playerId, competitionId, season],
  );
  return (res[0]?.values[0]?.[0] as number) ?? 0;
}

export function healInjuries(days: number): void {
  if (days <= 0) return;
  const db = getDB();
  db.run(
    `UPDATE players
     SET injury_duration = MAX(0, injury_duration - ?),
         injured = CASE WHEN injury_duration - ? <= 0 THEN 0 ELSE 1 END,
         injury_type = CASE WHEN injury_duration - ? <= 0 THEN NULL ELSE injury_type END
     WHERE injured = 1`,
    [days, days, days],
  );
}

export function getPlayer(playerId: number): Player | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id,name,nationality,club,position,secondary_position,age,height,weight,foot,
            ca,pa,overall,
            finishing,passing,dribbling,heading,crossing,tackling,technique,long_shots,
            decisions,composure,positioning,vision,anticipation,off_the_ball,work_rate,
            pace,strength,agility,jumping,
            reflexes,handling,gk_positioning,one_on_ones,command,
            stamina,form,injury_prone,traits,trait_intensity,
            injured,injury_duration,injury_type,retired,free_agent,on_transfer_list,
            transfer_ban,in_prison,prison_duration,
            matches,goals,assists,rating,yellow_cards,red_cards,clean_sheets,
            career_matches,career_goals,career_assists,career_trophies,
            agent_id,contract_end,wage,pa_ceiling
     FROM players WHERE id = ?`,
    [playerId],
  );
  const r = res[0]?.values[0];
  if (!r) return null;
  return {
    id: r[0] as number,
    name: r[1] as string,
    nationality: r[2] as number,
    club: (r[3] as number | null) ?? null,
    position: r[4] as Player["position"],
    secondary_position: (r[5] as Player["position"] | null) ?? null,
    age: r[6] as number,
    height: r[7] as number,
    weight: r[8] as number,
    foot: r[9] as Player["foot"],
    ca: r[10] as number,
    pa: r[11] as number,
    overall: r[12] as number,
    finishing: r[13] as number,
    passing: r[14] as number,
    dribbling: r[15] as number,
    heading: r[16] as number,
    crossing: r[17] as number,
    tackling: r[18] as number,
    technique: r[19] as number,
    long_shots: r[20] as number,
    decisions: r[21] as number,
    composure: r[22] as number,
    positioning: r[23] as number,
    vision: r[24] as number,
    anticipation: r[25] as number,
    off_the_ball: r[26] as number,
    work_rate: r[27] as number,
    pace: r[28] as number,
    strength: r[29] as number,
    agility: r[30] as number,
    jumping: r[31] as number,
    reflexes: r[32] as number,
    handling: r[33] as number,
    gk_positioning: r[34] as number,
    one_on_ones: r[35] as number,
    command: r[36] as number,
    stamina: r[37] as number,
    form: r[38] as number,
    injury_prone: r[39] as number,
    traits: JSON.parse((r[40] as string) || "[]"),
    trait_intensity: JSON.parse((r[41] as string) || "{}"),
    injured: Boolean(r[42]),
    injury_duration: r[43] as number,
    injury_type: (r[44] as string | null) ?? null,
    retired: Boolean(r[45]),
    free_agent: Boolean(r[46]),
    on_transfer_list: Boolean(r[47]),
    transfer_ban: Boolean(r[48]),
    in_prison: Boolean(r[49]),
    prison_duration: r[50] as number,
    matches: r[51] as number,
    goals: r[52] as number,
    assists: r[53] as number,
    rating: r[54] as number,
    yellow_cards: r[55] as number,
    red_cards: r[56] as number,
    clean_sheets: r[57] as number,
    career_matches: r[58] as number,
    career_goals: r[59] as number,
    career_assists: r[60] as number,
    career_trophies: r[61] as number,
    agent_id: (r[62] as number | null) ?? null,
    contract_end: r[63] as number,
    wage: r[64] as number,
    pa_ceiling: (r[65] as number) ?? 100,
  };
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
  stage_id: string;
  home_club_id: number;
  home_club_name: string;
  away_club_id: number;
  away_club_name: string;
}

export interface StandingRow {
  club_id: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export function getLeagueIdForClub(clubId: number): number | null {
  const db = getDB();
  const res = db.exec(`SELECT league_id FROM clubs WHERE id = ?`, [clubId]);
  const val = res[0]?.values[0]?.[0];
  return val != null ? (val as number) : null;
}

export function getStandings(leagueId: number): StandingRow[] {
  const db = getDB();
  const res = db.exec(
    `SELECT id, name, wins+draws+losses, wins, draws, losses, goals_for, goals_against, points
     FROM clubs WHERE league_id = ?
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC`,
    [leagueId],
  );
  return (res[0]?.values ?? []).map((r) => ({
    club_id: r[0] as number,
    name: r[1] as string,
    played: r[2] as number,
    wins: r[3] as number,
    draws: r[4] as number,
    losses: r[5] as number,
    goals_for: r[6] as number,
    goals_against: r[7] as number,
    points: r[8] as number,
  }));
}

export function getUpcoming(clubId: number, fromDay: number, count = 5): UpcomingFixture[] {
  const db = getDB();
  const res = db.exec(
    `SELECT m.date, m.week, m.competition, m.stage_id,
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
    stage_id: (r[3] as string) ?? "league",
    home_club_id: r[4] as number,
    home_club_name: r[5] as string,
    away_club_id: r[6] as number,
    away_club_name: r[7] as string,
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

// 5-tier injury table per AGENTS.md
const INJURY_TIERS: { chance: number; minDays: number; maxDays: number; types: string[] }[] = [
  { chance: 0.45, minDays: 1, maxDays: 3, types: ["muscle_fatigue", "blister", "mild_sprain"] },
  { chance: 0.3, minDays: 7, maxDays: 21, types: ["calf_strain", "hamstring_strain", "ankle_sprain"] },
  { chance: 0.15, minDays: 30, maxDays: 60, types: ["partial_tear", "mcl_strain"] },
  { chance: 0.08, minDays: 60, maxDays: 180, types: ["meniscus_tear", "fracture", "dislocation"] },
  { chance: 0.02, minDays: 180, maxDays: 365, types: ["acl_rupture"] },
];

function rollMatchInjury(p: Player): { days: number; type: string } | null {
  let prob = 0.006 + p.injury_prone * 0.0022;
  if (p.traits.includes("injury_magnet")) prob *= 1.6;
  if (p.traits.includes("natural_fitness")) prob *= 0.6;
  if (Math.random() >= prob) return null;

  let r = Math.random();
  for (const tier of INJURY_TIERS) {
    r -= tier.chance;
    if (r <= 0) {
      const days = tier.minDays + Math.floor(Math.random() * (tier.maxDays - tier.minDays + 1));
      const type = tier.types[Math.floor(Math.random() * tier.types.length)];
      return { days, type };
    }
  }
  return { days: 2, type: "muscle_fatigue" };
}

function getCardRules(leagueId: number): { yellow_suspend_at: number; red_ban_matches: number } {
  const db = getDB();
  const res = db.exec(
    `SELECT cc.card_rules FROM leagues l
     JOIN competition_configs cc ON cc.id = l.active_config_id
     WHERE l.id = ?`,
    [leagueId],
  );
  const raw = res[0]?.values[0]?.[0] as string | undefined;
  if (!raw) return { yellow_suspend_at: 5, red_ban_matches: 1 };
  try {
    const parsed = JSON.parse(raw);
    return {
      yellow_suspend_at: parsed.yellow_suspend_at ?? 5,
      red_ban_matches: parsed.red_ban_matches ?? 1,
    };
  } catch {
    return { yellow_suspend_at: 5, red_ban_matches: 1 };
  }
}

function pickCardRecipient(players: Player[]): Player {
  const weights = players.map((p) => {
    let w =
      p.position === "CB" || p.position === "DM"
        ? 1.6
        : p.position === "LB" || p.position === "RB" || p.position === "CM"
          ? 1.3
          : p.position === "GK"
            ? 0.2
            : 0.9;
    if (p.traits.includes("hot_headed")) w *= 1.8;
    if (p.traits.includes("clean_cut") || p.traits.includes("composed")) w *= 0.6;
    return w;
  });
  const total = weights.reduce((s, x) => s + x, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[0];
}

function updateSquadStats(
  players: Player[],
  gf: number,
  ga: number,
  scorers: MatchResult["scorers"],
  teamYellows: number,
  teamReds: number,
  competitionId: number,
  season: number,
  cardRules: { yellow_suspend_at: number; red_ban_matches: number },
): void {
  const db = getDB();
  const teamDelta = gf > ga ? 0.4 : gf < ga ? -0.3 : 0;

  // Attribute team cards to individual players
  const yellowsByPlayer = new Map<number, number>();
  const redsByPlayer = new Map<number, number>();
  for (let i = 0; i < teamYellows; i++) {
    const p = pickCardRecipient(players);
    yellowsByPlayer.set(p.id, (yellowsByPlayer.get(p.id) ?? 0) + 1);
  }
  for (let i = 0; i < teamReds; i++) {
    const p = pickCardRecipient(players);
    redsByPlayer.set(p.id, 1);
  }

  for (const p of players) {
    let g = 0;
    let a = 0;
    for (const s of scorers) {
      if (s.scorer_id === p.id) g++;
      if (s.assist_id === p.id) a++;
    }
    const yc = yellowsByPlayer.get(p.id) ?? 0;
    const rc = redsByPlayer.get(p.id) ?? 0;
    const cs = p.position === "GK" && ga === 0 ? 1 : 0;
    const matchRating = Math.min(10, Math.max(4, 6.5 + teamDelta + g * 1.0 + a * 0.5 + cs * 0.5 - yc * 0.2 - rc * 1.5));
    const formDelta = (matchRating - 6.5) * 0.03;
    const inj = rollMatchInjury(p);

    db.run(
      `UPDATE players SET
         matches = matches + 1,
         career_matches = career_matches + 1,
         goals = goals + ?,
         career_goals = career_goals + ?,
         assists = assists + ?,
         career_assists = career_assists + ?,
         clean_sheets = clean_sheets + ?,
         yellow_cards = yellow_cards + ?,
         red_cards = red_cards + ?,
         rating = ROUND((rating * matches + ?) / (matches + 1), 2),
         form = MIN(1.0, MAX(0.1, ROUND(form + ?, 2))),
         injured = CASE WHEN ? > 0 THEN 1 ELSE injured END,
         injury_duration = CASE WHEN ? > 0 THEN ? ELSE injury_duration END,
         injury_type = CASE WHEN ? IS NOT NULL THEN ? ELSE injury_type END
       WHERE id = ?`,
      [
        g,
        g,
        a,
        a,
        cs,
        yc,
        rc,
        matchRating,
        formDelta,
        inj ? 1 : 0,
        inj ? 1 : 0,
        inj?.days ?? 0,
        inj?.type ?? null,
        inj?.type ?? null,
        p.id,
      ],
    );

    if (yc > 0 || rc > 0) {
      const cur = db.exec(
        `SELECT yellow_count, red_count, suspended_matches_remaining FROM card_accumulation
         WHERE player_id = ? AND competition_id = ? AND season = ?`,
        [p.id, competitionId, season],
      )[0]?.values[0];
      const oldY = (cur?.[0] as number) ?? 0;
      const oldR = (cur?.[1] as number) ?? 0;
      const oldSus = (cur?.[2] as number) ?? 0;
      const newY = oldY + yc;
      const newR = oldR + rc;
      const yellowBan =
        Math.floor(newY / cardRules.yellow_suspend_at) > Math.floor(oldY / cardRules.yellow_suspend_at) ? 1 : 0;
      const redBan = rc > 0 ? cardRules.red_ban_matches : 0;
      const newSus = oldSus + yellowBan + redBan;

      db.run(
        `INSERT INTO card_accumulation (player_id, competition_id, season, yellow_count, red_count, suspended_matches_remaining)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, competition_id, season) DO UPDATE SET
           yellow_count = excluded.yellow_count,
           red_count = excluded.red_count,
           suspended_matches_remaining = excluded.suspended_matches_remaining`,
        [p.id, competitionId, season, newY, newR, newSus],
      );
    }
  }
}

export interface MatchDayOutput {
  results: MatchResult[];
  watchedSteps: MatchStep[] | null;
  watchedHomeName: string;
  watchedAwayName: string;
}

// Process all unplayed fixtures on `day`. Uses wheelSim for watchClubId's match if provided.
export function processMatchDay(day: number, egoId = 0, watchClubId = 0, season = 1): MatchDayOutput {
  const db = getDB();
  const fixtures = db.exec(
    `SELECT id, league_id, home_club, away_club, stage_id FROM match_results
     WHERE date = ? AND home_goals IS NULL`,
    [day],
  );

  const results: MatchResult[] = [];
  let watchedSteps: MatchStep[] | null = null;
  let watchedHomeName = "";
  let watchedAwayName = "";

  for (const row of fixtures[0]?.values ?? []) {
    const [matchId, leagueId, homeId, awayId, stageId] = row as [number, number, number, number, string];
    const competitionId = leagueId as number;

    const homeClub = getClub(homeId);
    const awayClub = getClub(awayId);
    const homePlayers = getSquad(homeId, egoId, competitionId, season);
    const awayPlayers = getSquad(awayId, egoId, competitionId, season);

    if (!homeClub || !awayClub || homePlayers.length === 0 || awayPlayers.length === 0) continue;

    // Players currently suspended at these two clubs serve 1 match ban
    db.run(
      `UPDATE card_accumulation
       SET suspended_matches_remaining = suspended_matches_remaining - 1
       WHERE competition_id = ? AND season = ? AND suspended_matches_remaining > 0
         AND player_id IN (SELECT id FROM players WHERE club IN (?, ?))`,
      [competitionId, season, homeId, awayId],
    );

    const simInput = {
      home_club: homeClub,
      away_club: awayClub,
      home_players: homePlayers,
      away_players: awayPlayers,
      league_level: 1,
      date: day,
      league_id: competitionId,
      match_id: matchId as number,
    };

    let result: MatchResult;
    if (watchClubId > 0 && (homeId === watchClubId || awayId === watchClubId)) {
      const w = wheelSim(simInput);
      result = w.result;
      watchedSteps = w.steps;
      watchedHomeName = homeClub.name;
      watchedAwayName = awayClub.name;
    } else {
      result = fullSim(simInput);
    }

    // Persist result
    db.run(`UPDATE match_results SET home_goals=?, away_goals=?, stats=?, scorers=? WHERE id=?`, [
      result.home_goals,
      result.away_goals,
      JSON.stringify(result.stats),
      JSON.stringify(result.scorers),
      matchId,
    ]);

    const cardRules = getCardRules(competitionId);
    if (stageId !== "championship_sf" && stageId !== "championship_final") {
      updateClubStanding(homeId, result.home_goals, result.away_goals);
      updateClubStanding(awayId, result.away_goals, result.home_goals);
    }
    updateSquadStats(
      homePlayers,
      result.home_goals,
      result.away_goals,
      result.scorers,
      result.stats.home_yellow_cards,
      result.stats.home_red_cards,
      competitionId,
      season,
      cardRules,
    );
    updateSquadStats(
      awayPlayers,
      result.away_goals,
      result.home_goals,
      result.scorers,
      result.stats.away_yellow_cards,
      result.stats.away_red_cards,
      competitionId,
      season,
      cardRules,
    );

    results.push(result);
  }
  return { results, watchedSteps, watchedHomeName, watchedAwayName };
}

// ─── Season Rollover ──────────────────────────────────────────────────────────

export function rolloverSeason(currentSeason: number, egoId: number): { summary: string; egoAwardsCount: number } {
  const db = getDB();
  const seasonStartDay = (currentSeason - 1) * 365;
  const champ = getSeasonChampion(1, seasonStartDay);
  const awards = evaluateSeasonAwards(1, egoId);
  let egoSummary = "";

  db.run("BEGIN TRANSACTION");
  try {
    // 1. Award trophy to champion squad
    if (champ) {
      db.run(`UPDATE players SET career_trophies = career_trophies + 1 WHERE club = ? AND retired = 0`, [
        champ.club_id,
      ]);
    }

    // 2. Archive season stats into player_stats
    db.run(
      `INSERT INTO player_stats (player_id, club_id, competition_id, season, matches, goals, assists, rating, yellow_cards, red_cards, clean_sheets, league_id)
       SELECT id, club, 1, ?, matches, goals, assists, rating, yellow_cards, red_cards, clean_sheets, 1
       FROM players WHERE retired = 0 AND matches > 0`,
      [currentSeason],
    );

    // 3. Recalculate PA/CA for active club players + ego player
    const activeIds =
      (db.exec(
        `SELECT p.id, COALESCE(c.facilities_level, 2) FROM players p LEFT JOIN clubs c ON c.id = p.club WHERE p.retired = 0 AND (p.club IS NOT NULL OR p.id = ?)`,
        [egoId],
      )[0]?.values as [number, number][] | undefined) ?? [];

    for (const [pid, facLevel] of activeIds) {
      const p = getPlayer(pid);
      if (!p) continue;
      // facilities_level (1-5) maps to trainingQuality (50-95)
      const trainingQuality = 40 + facLevel * 11;
      const { new_pa, new_ca } = recalcPACA(p, 34, trainingQuality);
      const attrDelta = new_ca - p.ca;

      if (pid === egoId) {
        const caDiff = new_ca - p.ca;
        const paDiff = new_pa - p.pa;
        const caStr = caDiff >= 0 ? `+${caDiff}` : `${caDiff}`;
        const paStr = paDiff >= 0 ? `+${paDiff}` : `${paDiff}`;
        egoSummary = `OVR ${p.ca}→${new_ca} (${caStr}), PA ${p.pa}→${new_pa} (${paStr})`;
      }

      if (attrDelta !== 0 || new_pa !== p.pa) {
        const d = attrDelta;
        db.run(
          `UPDATE players SET
             ca = ?, pa = ?, overall = ?,
             finishing = MIN(100, MAX(1, finishing + ?)),
             passing = MIN(100, MAX(1, passing + ?)),
             dribbling = MIN(100, MAX(1, dribbling + ?)),
             heading = MIN(100, MAX(1, heading + ?)),
             crossing = MIN(100, MAX(1, crossing + ?)),
             tackling = MIN(100, MAX(1, tackling + ?)),
             technique = MIN(100, MAX(1, technique + ?)),
             long_shots = MIN(100, MAX(1, long_shots + ?)),
             decisions = MIN(100, MAX(1, decisions + ?)),
             composure = MIN(100, MAX(1, composure + ?)),
             positioning = MIN(100, MAX(1, positioning + ?)),
             vision = MIN(100, MAX(1, vision + ?)),
             anticipation = MIN(100, MAX(1, anticipation + ?)),
             off_the_ball = MIN(100, MAX(1, off_the_ball + ?)),
             work_rate = MIN(100, MAX(1, work_rate + ?)),
             pace = MIN(100, MAX(1, pace + ?)),
             strength = MIN(100, MAX(1, strength + ?)),
             agility = MIN(100, MAX(1, agility + ?)),
             jumping = MIN(100, MAX(1, jumping + ?)),
             reflexes = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, reflexes + ?)) ELSE reflexes END,
             handling = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, handling + ?)) ELSE handling END,
             gk_positioning = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, gk_positioning + ?)) ELSE gk_positioning END,
             one_on_ones = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, one_on_ones + ?)) ELSE one_on_ones END,
             command = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, command + ?)) ELSE command END
           WHERE id = ?`,
          [
            new_ca, new_pa, new_ca,
            d, d, d, d, d, d, d, d,
            d, d, d, d, d, d, d,
            d, d, d, d,
            d, d, d, d, d,
            pid,
          ],
        );
      }
    }

    // 4. Age +1, retire veterans (non-ego >= 36), auto-renew expiring club contracts, and reset season counters
    const nextSeasonStartDay = currentSeason * 365;
    db.run(`UPDATE players SET age = age + 1 WHERE retired = 0`);
    db.run(`UPDATE players SET retired = 1, club = NULL, free_agent = 0 WHERE age >= 36 AND id != ?`, [egoId]);
    db.run(`UPDATE players SET contract_end = contract_end + 365 WHERE club IS NOT NULL AND contract_end <= ?`, [
      nextSeasonStartDay + 30,
    ]);
    db.run(
      `UPDATE players SET
         matches = 0, goals = 0, assists = 0, rating = 0.0,
         yellow_cards = 0, red_cards = 0, clean_sheets = 0,
         stamina = 1.0, injured = 0, injury_duration = 0, injury_type = NULL`,
    );

    // 5. Reset club standings
    db.run(`UPDATE clubs SET wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, points = 0`);

    // 6. Generate next season Liga 1 fixtures using multi-stage generator
    const clubRows = db.exec(`SELECT id FROM clubs WHERE league_id = 1 ORDER BY id`)[0]?.values ?? [];
    const clubIds = clubRows.map((r) => r[0] as number);
    generateMultiStageFixtures(1, clubIds, nextSeasonStartDay + 7, "liga1");

    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }

  const parts = [
    `🏆 Juara Musim ${currentSeason}: ${champ?.name ?? "-"} (${champ?.points ?? 0} poin)`,
    awards.summary,
    egoSummary ? `Evaluasi Musim: ${egoSummary}` : "",
  ].filter(Boolean);

  return { summary: parts.join(" · "), egoAwardsCount: awards.egoAwards.length };
}
