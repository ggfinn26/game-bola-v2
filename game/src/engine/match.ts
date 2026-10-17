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

function playerZoneScore(p: Player): number {
  switch (p.position) {
    case "ST":
      return (
        p.finishing * 0.35 +
        p.heading * 0.15 +
        p.strength * 0.10 +
        p.composure * 0.15 +
        p.off_the_ball * 0.15 +
        p.technique * 0.10
      );
    case "LW":
    case "RW":
      return (
        p.dribbling * 0.30 +
        p.pace * 0.25 +
        p.crossing * 0.20 +
        p.technique * 0.15 +
        p.agility * 0.10
      );
    case "AM":
      return (
        p.passing * 0.25 +
        p.vision * 0.25 +
        p.finishing * 0.20 +
        p.anticipation * 0.15 +
        p.decisions * 0.15
      );
    case "CM":
      return (
        p.passing * 0.25 +
        p.vision * 0.20 +
        p.decisions * 0.20 +
        p.work_rate * 0.15 +
        p.technique * 0.10 +
        p.positioning * 0.10
      );
    case "DM":
      return (
        p.positioning * 0.25 +
        p.decisions * 0.20 +
        p.tackling * 0.20 +
        p.work_rate * 0.15 +
        p.strength * 0.10 +
        p.anticipation * 0.10
      );
    case "CB":
      return (
        p.positioning * 0.25 +
        p.heading * 0.20 +
        p.tackling * 0.20 +
        p.strength * 0.15 +
        p.anticipation * 0.10 +
        p.decisions * 0.10
      );
    case "LB":
    case "RB":
      return (
        p.positioning * 0.20 +
        p.pace * 0.20 +
        p.tackling * 0.15 +
        p.crossing * 0.15 +
        p.work_rate * 0.15 +
        p.strength * 0.15
      );
    case "GK":
      return (
        p.reflexes * 0.35 +
        p.handling * 0.25 +
        p.gk_positioning * 0.20 +
        p.one_on_ones * 0.15 +
        p.command * 0.05
      );
  }
}

function zoneRating(players: Player[], zone: "attack" | "mid" | "defense"): number {
  const zp = players.filter((p) => POSITION_ZONE[p.position] === zone);
  if (zp.length === 0) return 25;

  if (zone === "attack" || zone === "mid") {
    return zp.reduce((s, p) => s + playerZoneScore(p), 0) / zp.length;
  }

  // defense: (gkRating + mean(outfieldDefRatings)) / 2
  const gk = zp.find((p) => p.position === "GK");
  const outfield = zp.filter((p) => p.position !== "GK");
  const gkRating = gk ? playerZoneScore(gk) : 0;
  const defRating =
    outfield.length > 0 ? outfield.reduce((s, p) => s + playerZoneScore(p), 0) / outfield.length : 0;
  return gk ? (gkRating + defRating) / 2 : defRating;
}

function mean(players: Player[], attr: keyof Player): number {
  if (players.length === 0) return 0.5;
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
  const weights = players.map((p) => {
    const composureMod = 0.80 + p.composure / 500;
    return p.finishing * (GOAL_POSITION_WEIGHT[p.position] ?? 0.1) * p.form * composureMod;
  });
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

// ─── Wheel / Tonton Match (§2 GAME-ENGINE.md) ─────────────────────────────────

export interface WheelSlice {
  key: string;
  label: string;
  weight: number; // percentage 0–100 (sum ~ 100)
  color: string;
}

export interface MatchStep {
  minute: number;
  attacking_club_id: number;
  attacking_club_name: string;
  team_slices: [WheelSlice, WheelSlice]; // [home, away]
  event_slices: WheelSlice[];
  chosen_index: number;
  outcome_key: string;
  outcome_label: string;
  is_goal: boolean;
  home_goals: number;
  away_goals: number;
  commentary: string;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Non-uniform minute generator: higher density in 30–45' and 75–90'
function sampleAttackMinute(): number {
  const r = Math.random();
  if (r < 0.25) return 30 + Math.floor(Math.random() * 16); // 30–45
  if (r < 0.50) return 75 + Math.floor(Math.random() * 16); // 75–90
  return 1 + Math.floor(Math.random() * 90);
}

export function wheelSim(input: SimInput): { result: MatchResult; steps: MatchStep[] } {
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

  const homeShare = xgHome / Math.max(xgHome + xgAway, 0.1);
  const homePct = Math.round(homeShare * 100);
  const teamSlices: [WheelSlice, WheelSlice] = [
    { key: "HOME", label: home_club.name, weight: homePct, color: "#2a6" },
    { key: "AWAY", label: away_club.name, weight: 100 - homePct, color: "#38c" },
  ];

  // Number of attack sequences (~22–28)
  const totalAttacks = Math.max(14, Math.min(32, poisson(22)));
  const minutes = Array.from({ length: totalAttacks }, sampleAttackMinute).sort((a, b) => a - b);

  let homeGoals = 0;
  let awayGoals = 0;
  const scorers: GoalEvent[] = [];
  const stats: MatchStats = {
    home_shots: 0,
    away_shots: 0,
    home_shots_on_target: 0,
    away_shots_on_target: 0,
    home_possession: Math.round(40 + midAdvHome * 20),
    away_possession: 100 - Math.round(40 + midAdvHome * 20),
    home_corners: 0,
    away_corners: 0,
    home_xg: Math.round(xgHome * 100) / 100,
    away_xg: Math.round(xgAway * 100) / 100,
    home_yellow_cards: 0,
    away_yellow_cards: 0,
    home_red_cards: 0,
    away_red_cards: 0,
  };

  const steps: MatchStep[] = [];

  for (const minute of minutes) {
    const isHome = Math.random() < homeShare;
    const attClub = isHome ? home_club : away_club;
    const defClub = isHome ? away_club : home_club;
    const attPlayers = isHome ? home_players : away_players;
    const defPlayers = isHome ? away_players : home_players;
    const attRating = isHome ? homeAttack : awayAttack;
    const defRating = isHome ? awayDefense : homeDefense;
    const teamXG = isHome ? xgHome : xgAway;
    const expectedTeamAttacks = Math.max(4, totalAttacks * (isHome ? homeShare : 1 - homeShare));

    // Calibrate GOAL weight so expected goals across match converges to teamXG (§ Wheel Calibration Fix)
    const nonGoalSlices = [
      { key: "SAVE", label: "🧤 Tepis Kiper", raw: 6 * (attRating / 10), color: "#39d" },
      { key: "DEFENSE", label: "🛡️ Sapuan Bek", raw: 10 * (defRating / 10), color: "#567" },
      { key: "OUT", label: "💨 Melenceng / Offside", raw: 8, color: "#666" },
      { key: "CORNER", label: "🚩 Sepak Pojok", raw: 6, color: "#a83" },
      { key: "COUNTER", label: "⚡ Serangan Balik", raw: 5, color: "#85c" },
      { key: "FOUL", label: "🟨 Pelanggaran", raw: 5, color: "#c92" },
      { key: "FREEKICK", label: "🎯 Tendangan Bebas", raw: 4, color: "#4a9" },
      { key: "WOODWORK", label: "🥅 Tiang Gawang", raw: 2, color: "#d64" },
      { key: "PENALTY", label: "🚨 Penalti", raw: 1, color: "#e34" },
    ];
    const nonGoalTotal = nonGoalSlices.reduce((s, x) => s + x.raw, 0);
    const goalConversionTarget = Math.min(0.45, Math.max(0.02, teamXG / expectedTeamAttacks));
    const goalRaw = (goalConversionTarget * nonGoalTotal) / (1 - goalConversionTarget);
    const rawSlices = [
      { key: "GOAL", label: "⚽ GOL", raw: goalRaw, color: "#2c7" },
      ...nonGoalSlices,
    ];

    const rawTotal = rawSlices.reduce((s, x) => s + x.raw, 0);
    const eventSlices: WheelSlice[] = rawSlices.map((s) => ({
      key: s.key,
      label: s.label,
      weight: Math.max(1, Math.round((s.raw / rawTotal) * 100)),
      color: s.color,
    }));

    // Spin event wheel
    const sumWeights = eventSlices.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * sumWeights;
    let chosenIdx = 0;
    for (let i = 0; i < eventSlices.length; i++) {
      r -= eventSlices[i].weight;
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    const chosen = eventSlices[chosenIdx];
    const attacker = pickRandom(attPlayers.filter((p) => p.position !== "GK")) ?? attPlayers[0];
    const defender = pickRandom(defPlayers.filter((p) => p.position !== "GK")) ?? defPlayers[0];
    const gk = defPlayers.find((p) => p.position === "GK") ?? defPlayers[0];

    let isGoal = false;
    let commentary = "";

    switch (chosen.key) {
      case "GOAL": {
        isGoal = true;
        const gEvt = attributeGoal(attPlayers, minute, attClub.id);
        scorers.push(gEvt);
        if (isHome) {
          homeGoals++;
          stats.home_shots++;
          stats.home_shots_on_target++;
        } else {
          awayGoals++;
          stats.away_shots++;
          stats.away_shots_on_target++;
        }
        const scorerName = attPlayers.find((p) => p.id === gEvt.scorer_id)?.name || attacker.name || "Pemain";
        const assistName = gEvt.assist_id ? attPlayers.find((p) => p.id === gEvt.assist_id)?.name : null;
        commentary = `GOL! ${scorerName} mencetak gol untuk ${attClub.name}${assistName ? ` (Assist: ${assistName})` : ""}! Skor ${homeGoals}–${awayGoals}.`;
        break;
      }
      case "PENALTY": {
        const penScored = Math.random() < 0.78;
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        if (penScored) {
          isGoal = true;
          const gEvt = attributeGoal(attPlayers, minute, attClub.id);
          gEvt.type = "penalty";
          scorers.push(gEvt);
          if (isHome) {
            homeGoals++;
            stats.home_shots_on_target++;
          } else {
            awayGoals++;
            stats.away_shots_on_target++;
          }
          const scorerName = attPlayers.find((p) => p.id === gEvt.scorer_id)?.name || attacker.name || "Algojo";
          commentary = `PENALTI GOL! ${scorerName} mengeksekusi penalti dengan dingin untuk ${attClub.name}! Skor ${homeGoals}–${awayGoals}.`;
        } else {
          commentary = `PENALTI GAGAL! Tendangan penalti ${attacker.name || attClub.name} berhasil ditepis ${gk.name || "kiper"}!`;
        }
        break;
      }
      case "SAVE": {
        if (isHome) {
          stats.home_shots++;
          stats.home_shots_on_target++;
        } else {
          stats.away_shots++;
          stats.away_shots_on_target++;
        }
        commentary = `Tembakan keras ${attacker.name || attClub.name} berhasil ditepis dengan gemilang oleh ${gk.name || "kiper"} (${defClub.name}).`;
        break;
      }
      case "WOODWORK": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        commentary = `TIANG GAWANG! Sepakan ${attacker.name || attClub.name} membentur mistar gawang ${defClub.name}!`;
        break;
      }
      case "CORNER": {
        if (isHome) stats.home_corners++;
        else stats.away_corners++;
        commentary = `${attClub.name} menekan dan mendapatkan sepak pojok setelah bola diblok ${defender.name || "bek"}.`;
        break;
      }
      case "FREEKICK": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        commentary = `Tendangan bebas berbahaya dari ${attacker.name || attClub.name} masih tipis di atas mistar ${defClub.name}.`;
        break;
      }
      case "FOUL": {
        const cardRoll = Math.random();
        if (cardRoll < 0.04) {
          if (isHome) stats.away_red_cards++;
          else stats.home_red_cards++;
          commentary = `KARTU MERAH! Tekel keras ${defender.name || defClub.name} terhadap ${attacker.name || attClub.name} berujung pengusiran!`;
        } else if (cardRoll < 0.38) {
          if (isHome) stats.away_yellow_cards++;
          else stats.home_yellow_cards++;
          commentary = `Kartu kuning untuk ${defender.name || defClub.name} usai melanggar ${attacker.name || attClub.name}.`;
        } else {
          commentary = `Pelanggaran oleh ${defender.name || defClub.name} saat menghentikan pergerakan ${attacker.name || attClub.name}.`;
        }
        break;
      }
      case "COUNTER": {
        commentary = `Serangan balik cepat ${defClub.name} mematahkan momentum serangan ${attClub.name}.`;
        break;
      }
      case "OUT": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        commentary =
          Math.random() < 0.5
            ? `Peluang ${attacker.name || attClub.name} masih melebar di sisi gawang ${defClub.name}.`
            : `Hakim garis mengangkat bendera — ${attacker.name || attClub.name} terjebak offside.`;
        break;
      }
      default: {
        commentary = `Pertahanan rapat! ${defender.name || defClub.name} memotong umpan terobosan ${attClub.name}.`;
        break;
      }
    }

    steps.push({
      minute,
      attacking_club_id: attClub.id,
      attacking_club_name: attClub.name,
      team_slices: teamSlices,
      event_slices: eventSlices,
      chosen_index: chosenIdx,
      outcome_key: chosen.key,
      outcome_label: chosen.label,
      is_goal: isGoal,
      home_goals: homeGoals,
      away_goals: awayGoals,
      commentary,
    });
  }

  return {
    result: {
      id: match_id,
      league_id,
      home_club: home_club.id,
      away_club: away_club.id,
      home_goals: homeGoals,
      away_goals: awayGoals,
      date,
      stats,
      scorers,
    },
    steps,
  };
}

