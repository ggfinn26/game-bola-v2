/**
 * P2 Tests — TS-01-A
 * Match engine: Poisson sanity, win-rate distribution, stat completeness
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld } from "../src/engine/worldgen.js";
import { fullSim } from "../src/engine/match.js";
import type { Player, Club } from "../src/types/index.js";

function makeClub(id: number, morale = 75): Club {
  return {
    id,
    name: `Club ${id}`,
    league_id: 1,
    reputation: 60,
    owner_id: null,
    manager_id: null,
    cash: 100_000_000,
    debt: 0,
    monthly_income: 50_000_000,
    monthly_costs: 40_000_000,
    credit_score: 75,
    consecutive_missed_payments: 0,
    bankrupt: false,
    slot_id: id,
    club_morale: morale,
    fans: 10000,
    stadium_capacity: 20000,
    points: 0,
    goals_for: 0,
    goals_against: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    academy_level: 2,
    facilities_level: 2,
    physio_level: 2,
    doctor_level: 2,
    coach_level: 2,
    scout_level: 2,
    loan_amount: 0,
    loan_rate: 0,
    loan_months_remaining: 0,
  } as unknown as Club;
}

function makePlayer(id: number, overall: number, pos: Player["position"] = "ST"): Player {
  const a = overall;
  return {
    id,
    name: `P${id}`,
    nationality: 1,
    club: 1,
    position: pos,
    secondary_position: null,
    age: 24,
    height: 178,
    weight: 74,
    foot: "R",
    ca: a,
    pa: a + 5,
    pa_ceiling: a + 20,
    overall: a,
    finishing: a,
    passing: a,
    dribbling: a,
    heading: a,
    crossing: a,
    tackling: a,
    technique: a,
    long_shots: a,
    decisions: a,
    composure: a,
    positioning: a,
    vision: a,
    anticipation: a,
    off_the_ball: a,
    work_rate: a,
    pace: a,
    strength: a,
    agility: a,
    jumping: a,
    reflexes: pos === "GK" ? a : 0,
    handling: pos === "GK" ? a : 0,
    gk_positioning: pos === "GK" ? a : 0,
    one_on_ones: pos === "GK" ? a : 0,
    command: pos === "GK" ? a : 0,
    stamina: 1.0,
    form: 0.7,
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
    matches: 20,
    goals: 0,
    assists: 0,
    rating: 7.0,
    yellow_cards: 0,
    red_cards: 0,
    clean_sheets: 0,
    career_matches: 60,
    career_goals: 0,
    career_assists: 0,
    career_trophies: 0,
    agent_id: null,
    contract_end: 730,
    wage: 10_000_000,
  } as unknown as Player;
}

function makeSquad(startId: number, overall: number): Player[] {
  const positions: Player["position"][] = ["GK", "CB", "CB", "LB", "RB", "DM", "CM", "CM", "LW", "RW", "ST"];
  return positions.map((pos, i) => makePlayer(startId + i, overall, pos));
}

async function run() {
  await initDB();
  generateWorld(42);

  const homeClub = makeClub(1);
  const awayClub = makeClub(2);

  // ── TS-01-A-1: Score bounds — no negative, no insane scores ──────────────
  console.log("TS-01-A-1: Score bounds over 500 matches...");
  {
    const home = makeSquad(100, 70);
    const away = makeSquad(200, 70);
    let maxGoals = 0;
    const RUNS = 500;
    for (let i = 0; i < RUNS; i++) {
      const r = fullSim({
        home_club: homeClub,
        away_club: awayClub,
        home_players: home,
        away_players: away,
        league_level: 1,
        date: 1,
        league_id: 1,
        match_id: i,
      });
      assert(r.home_goals >= 0 && r.away_goals >= 0, `Negative score: ${r.home_goals}-${r.away_goals}`);
      maxGoals = Math.max(maxGoals, r.home_goals + r.away_goals);
    }
    assert(maxGoals <= 15, `Max total goals ${maxGoals} exceeds sanity limit 15`);
    console.log(`  ✓ 500 matches — all scores non-negative, max total goals = ${maxGoals}`);
  }

  // ── TS-01-A-2: Favorite wins more often (favorit OVR 75 vs underdog 45) ──
  console.log("TS-01-A-2: Win-rate — favorite vs underdog...");
  {
    const favHome = makeSquad(300, 75);
    const undAway = makeSquad(400, 45);
    let favWins = 0,
      draws = 0,
      undWins = 0;
    const RUNS = 1000;
    for (let i = 0; i < RUNS; i++) {
      const r = fullSim({
        home_club: homeClub,
        away_club: awayClub,
        home_players: favHome,
        away_players: undAway,
        league_level: 1,
        date: 1,
        league_id: 1,
        match_id: i,
      });
      if (r.home_goals > r.away_goals) favWins++;
      else if (r.home_goals === r.away_goals) draws++;
      else undWins++;
    }
    const favRate = favWins / RUNS;
    assert(favRate >= 0.55 && favRate <= 0.9, `Favorite win rate ${favRate.toFixed(3)} out of [0.55–0.90]`);
    console.log(`  ✓ Favorite win rate = ${favRate.toFixed(3)} | draws=${draws} | upsets=${undWins}`);
  }

  // ── TS-01-A-3: xG in reasonable range (Poisson not exploding) ────────────
  console.log("TS-01-A-3: xG distribution sanity...");
  {
    const home = makeSquad(500, 65);
    const away = makeSquad(600, 65);
    let totalXG = 0;
    let highXGcount = 0;
    const RUNS = 500;
    for (let i = 0; i < RUNS; i++) {
      const r = fullSim({
        home_club: homeClub,
        away_club: awayClub,
        home_players: home,
        away_players: away,
        league_level: 1,
        date: 1,
        league_id: 1,
        match_id: i,
      });
      const totalMatch = r.stats.home_xg + r.stats.away_xg;
      totalXG += totalMatch;
      if (totalMatch > 6.0) highXGcount++;
    }
    const avgXG = totalXG / RUNS;
    assert(avgXG >= 1.5 && avgXG <= 5.0, `Avg total xG per match = ${avgXG.toFixed(2)}, expected [1.5–5.0]`);
    assert(highXGcount < RUNS * 0.05, `Too many high-xG matches (>6.0): ${highXGcount}/${RUNS}`);
    console.log(`  ✓ Avg total xG = ${avgXG.toFixed(2)} | high-xG outliers = ${highXGcount}/${RUNS}`);
  }

  // ── TS-01-A-4: Stats completeness — shots/corners/possession always set ───
  console.log("TS-01-A-4: Match stats completeness...");
  {
    const home = makeSquad(700, 65);
    const away = makeSquad(800, 65);
    for (let i = 0; i < 50; i++) {
      const r = fullSim({
        home_club: homeClub,
        away_club: awayClub,
        home_players: home,
        away_players: away,
        league_level: 1,
        date: 1,
        league_id: 1,
        match_id: i,
      });
      const s = r.stats;
      assert(s.home_shots >= 0 && s.away_shots >= 0, "Shots must be non-negative");
      assert(s.home_corners >= 0 && s.away_corners >= 0, "Corners must be non-negative");
      assert(
        s.home_possession + s.away_possession === 100,
        `Possession sum != 100: ${s.home_possession}+${s.away_possession}`,
      );
      // Goal attribution: all goals have valid scorer_id
      for (const g of r.scorers) {
        assert(g.scorer_id > 0, "All goals must have scorer_id > 0");
        assert(g.club_id > 0, "All goals must have club_id > 0");
        assert(g.minute >= 1 && g.minute <= 90, `Goal minute ${g.minute} out of [1–90]`);
      }
    }
    console.log("  ✓ 50 matches — all stats complete, all goals have valid scorer/club/minute");
  }

  // ── TS-01-A-5: Home advantage — home wins > away wins on equal teams ──────
  console.log("TS-01-A-5: Home advantage check...");
  {
    const squad = makeSquad(900, 65);
    let homeWins = 0,
      awayWins = 0;
    const RUNS = 1000;
    for (let i = 0; i < RUNS; i++) {
      const r = fullSim({
        home_club: homeClub,
        away_club: awayClub,
        home_players: squad,
        away_players: squad,
        league_level: 1,
        date: 1,
        league_id: 1,
        match_id: i,
      });
      if (r.home_goals > r.away_goals) homeWins++;
      else if (r.away_goals > r.home_goals) awayWins++;
    }
    assert(homeWins > awayWins, `Home should win more: home=${homeWins} away=${awayWins}`);
    console.log(`  ✓ Home wins ${homeWins} > Away wins ${awayWins} on equal squads`);
  }

  console.log("\n✅ All P2 Match Engine tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
