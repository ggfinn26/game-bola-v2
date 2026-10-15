import type { Player, Club, MatchResult, MatchStats, GoalEvent } from "../types/index.js";

// ─── Zone weights ─────────────────────────────────────────────────────────────

const POSITION_ZONE: Record<string, "attack" | "mid" | "defense"> = {
  ST: "attack",
  LW: "attack",
  RW: "attack",
  AM: "attack",
  CM: "mid",
  DM: "mid",
  CB: "defense",
  LB: "defense",
  RB: "defense",
  GK: "defense",
};

function zoneRating(players: Player[], zone: "attack" | "mid" | "defense"): number {
  const zp = players.filter((p) => POSITION_ZONE[p.position] === zone);
  if (zp.length === 0) return 5;

  if (zone === "attack") {
    return mean(zp, "attacking") * 0.6 + mean(zp, "technical") * 0.3 + mean(zp, "speed") * 0.1;
  }
  if (zone === "mid") {
    return mean(zp, "technical") * 0.5 + mean(zp, "mental") * 0.3 + mean(zp, "defending") * 0.2;
  }
  // defense
  const gk = zp.find((p) => p.position === "GK");
  const outfield = zp.filter((p) => p.position !== "GK");
  const gkRating = gk ? gk.goalkeeping * 0.7 + gk.physical * 0.2 + gk.mental * 0.1 : 0;
  const defRating =
    outfield.length > 0
      ? mean(outfield, "defending") * 0.6 + mean(outfield, "physical") * 0.3 + mean(outfield, "mental") * 0.1
      : 0;
  return gk ? (gkRating + defRating) / 2 : defRating;
}

function mean(players: Player[], attr: keyof Player): number {
  if (players.length === 0) return 5;
  return players.reduce((s, p) => s + (p[attr] as number), 0) / players.length;
}

// ─── xG formula ───────────────────────────────────────────────────────────────

function calcXG(
  attackRating: number,
  defenseRating: number,
  midAdvantage: number,
  formFactor: number,
  moraleFactor: number,
  staminaFactor: number,
  homeFactor: number,
  baseXG: number,
): number {
  return (
    baseXG *
    Math.pow(attackRating / Math.max(defenseRating, 1), 0.6) *
    Math.pow(midAdvantage, 0.3) *
    homeFactor *
    formFactor *
    moraleFactor *
    staminaFactor
  );
}

function poisson(lambda: number): number {
  // Knuth algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function noise(n: number): number {
  return Math.floor(Math.random() * (2 * n + 1)) - n;
}

// ─── Goal attribution ─────────────────────────────────────────────────────────

const GOAL_POSITION_WEIGHT: Record<string, number> = {
  ST: 1.0,
  LW: 0.8,
  RW: 0.8,
  AM: 0.6,
  CM: 0.3,
  DM: 0.1,
  CB: 0.1,
  LB: 0.1,
  RB: 0.1,
  GK: 0.0,
};

function attributeGoal(players: Player[], minute: number, clubId: number): GoalEvent {
  const weights = players.map((p) => p.attacking * (GOAL_POSITION_WEIGHT[p.position] ?? 0.1) * p.form);
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  let scorer = players[0];
  for (let i = 0; i < players.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      scorer = players[i];
      break;
    }
  }

  // Simple assist: pick from remaining attack/mid players
  const assistCandidates = players.filter((p) => p.id !== scorer.id && GOAL_POSITION_WEIGHT[p.position] >= 0.3);
  const assist =
    assistCandidates.length > 0 ? assistCandidates[Math.floor(Math.random() * assistCandidates.length)] : null;

  return {
    minute,
    scorer_id: scorer.id,
    assist_id: assist?.id ?? null,
    club_id: clubId,
    type: "open_play",
  };
}

// ─── Full Sim ─────────────────────────────────────────────────────────────────

export interface SimInput {
  home_club: Club;
  away_club: Club;
  home_players: Player[];
  away_players: Player[];
  league_level: number; // 1 = top, higher = lower
  date: number;
  league_id: number;
  match_id: number;
}

const BASE_XG_BY_LEVEL: Record<number, number> = { 1: 1.2, 2: 1.1, 3: 1.0, 4: 0.95 };

export function fullSim(input: SimInput): MatchResult {
  const { home_club, away_club, home_players, away_players, league_level, date, league_id, match_id } = input;
  const baseXG = BASE_XG_BY_LEVEL[league_level] ?? 0.9;

  const homeAttack = zoneRating(home_players, "attack");
  const homeMid = zoneRating(home_players, "mid");
  const homeDefense = zoneRating(home_players, "defense");

  const awayAttack = zoneRating(away_players, "attack");
  const awayMid = zoneRating(away_players, "mid");
  const awayDefense = zoneRating(away_players, "defense");

  const midAdvHome = homeMid / Math.max(homeMid + awayMid, 1);
  const midAdvAway = 1 - midAdvHome;

  const formHome = 0.85 + mean(home_players, "form") * 0.3;
  const formAway = 0.85 + mean(away_players, "form") * 0.3;

  const moraleHome = 0.9 + (home_club.club_morale / 100) * 0.2;
  const moraleAway = 0.9 + (away_club.club_morale / 100) * 0.2;

  const staminaHome = 0.8 + mean(home_players, "stamina") * 0.25;
  const staminaAway = 0.8 + mean(away_players, "stamina") * 0.25;

  const xgHome = calcXG(homeAttack, awayDefense, midAdvHome, formHome, moraleHome, staminaHome, 1.15, baseXG);
  const xgAway = calcXG(awayAttack, homeDefense, midAdvAway, formAway, moraleAway, staminaAway, 1.0, baseXG);

  const homeGoals = poisson(xgHome);
  const awayGoals = poisson(xgAway);

  const stats: MatchStats = {
    home_shots_on_target: Math.max(0, Math.round(xgHome * 3.5 + noise(1))),
    away_shots_on_target: Math.max(0, Math.round(xgAway * 3.5 + noise(1))),
    home_shots: 0,
    away_shots: 0,
    home_possession: Math.round(40 + midAdvHome * 20),
    away_possession: 0,
    home_corners: Math.max(0, Math.round(xgHome * 4.0 + noise(2))),
    away_corners: Math.max(0, Math.round(xgAway * 4.0 + noise(2))),
    home_xg: Math.round(xgHome * 100) / 100,
    away_xg: Math.round(xgAway * 100) / 100,
    home_yellow_cards: poisson(0.35),
    away_yellow_cards: poisson(0.35),
    home_red_cards: Math.random() < 0.04 ? 1 : 0,
    away_red_cards: Math.random() < 0.04 ? 1 : 0,
  };
  stats.home_shots = Math.max(stats.home_shots_on_target, Math.round(stats.home_shots_on_target * 2.8 + noise(2)));
  stats.away_shots = Math.max(stats.away_shots_on_target, Math.round(stats.away_shots_on_target * 2.8 + noise(2)));
  stats.away_possession = 100 - stats.home_possession;

  // Attribute goals to players
  const scorers: GoalEvent[] = [];
  const homeMinutes = generateMinutes(homeGoals);
  const awayMinutes = generateMinutes(awayGoals);
  for (const m of homeMinutes) scorers.push(attributeGoal(home_players, m, home_club.id));
  for (const m of awayMinutes) scorers.push(attributeGoal(away_players, m, away_club.id));
  scorers.sort((a, b) => a.minute - b.minute);

  return {
    id: match_id,
    league_id,
    home_club: home_club.id,
    away_club: away_club.id,
    home_goals: homeGoals,
    away_goals: awayGoals,
    date,
    stats,
    scorers,
  };
}

function generateMinutes(goals: number): number[] {
  return Array.from({ length: goals }, () => Math.floor(Math.random() * 90) + 1).sort((a, b) => a - b);
}
