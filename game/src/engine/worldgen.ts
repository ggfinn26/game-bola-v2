import { getDB } from "./db.js";
import { LIGA1_CLUBS, INDO_FIRST, INDO_LAST, SQUAD_POSITIONS } from "../data/indonesia.js";
import type { Position, Trait } from "../types/index.js";

// ponytail: seeded lcg so world is reproducible per seed
function makeLCG(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randStat(base: number, spread: number, rng: () => number): number {
  return Math.max(1, Math.min(20, Math.round(base + (rng() - 0.5) * 2 * spread)));
}

const ALL_TRAITS: Trait[] = [
  "professional",
  "lazy",
  "hot_headed",
  "composed",
  "ambitious",
  "content",
  "media_friendly",
  "controversial",
  "loyal",
  "mercenary",
  "determination",
  "fragile_mentally",
  "leader",
  "quick_learner",
  "late_bloomer",
  "natural_fitness",
  "injury_magnet",
  "risk_taker",
  "clean_cut",
];

function genTraits(rng: () => number): Trait[] {
  const count = rng() < 0.3 ? 0 : rng() < 0.6 ? 1 : rng() < 0.85 ? 2 : 3;
  const pool = [...ALL_TRAITS];
  const traits: Trait[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    traits.push(pool.splice(idx, 1)[0]);
  }
  return traits;
}

// Attribute base by position
function positionBases(pos: Position): Record<string, number> {
  const bases: Record<Position, Record<string, number>> = {
    GK: { attacking: 4, defending: 8, technical: 8, mental: 10, physical: 9, speed: 7, goalkeeping: 12 },
    CB: { attacking: 5, defending: 12, technical: 7, mental: 10, physical: 11, speed: 8, goalkeeping: 1 },
    LB: { attacking: 8, defending: 10, technical: 8, mental: 9, physical: 10, speed: 10, goalkeeping: 1 },
    RB: { attacking: 8, defending: 10, technical: 8, mental: 9, physical: 10, speed: 10, goalkeeping: 1 },
    DM: { attacking: 6, defending: 11, technical: 9, mental: 11, physical: 10, speed: 8, goalkeeping: 1 },
    CM: { attacking: 9, defending: 9, technical: 10, mental: 10, physical: 9, speed: 9, goalkeeping: 1 },
    AM: { attacking: 11, defending: 6, technical: 11, mental: 10, physical: 8, speed: 9, goalkeeping: 1 },
    LW: { attacking: 11, defending: 5, technical: 10, mental: 9, physical: 9, speed: 12, goalkeeping: 1 },
    RW: { attacking: 11, defending: 5, technical: 10, mental: 9, physical: 9, speed: 12, goalkeeping: 1 },
    ST: { attacking: 13, defending: 4, technical: 9, mental: 10, physical: 10, speed: 11, goalkeeping: 1 },
  };
  return bases[pos];
}

function calcCA(attrs: Record<string, number>, pos: Position): number {
  const weights: Record<Position, Record<string, number>> = {
    GK: { goalkeeping: 0.5, physical: 0.2, mental: 0.2, technical: 0.1 },
    CB: { defending: 0.4, physical: 0.3, mental: 0.2, technical: 0.1 },
    LB: { defending: 0.3, speed: 0.25, physical: 0.2, attacking: 0.15, technical: 0.1 },
    RB: { defending: 0.3, speed: 0.25, physical: 0.2, attacking: 0.15, technical: 0.1 },
    DM: { defending: 0.35, mental: 0.3, technical: 0.2, physical: 0.15 },
    CM: { technical: 0.3, mental: 0.3, attacking: 0.2, defending: 0.2 },
    AM: { attacking: 0.35, technical: 0.35, mental: 0.2, speed: 0.1 },
    LW: { speed: 0.3, attacking: 0.3, technical: 0.3, mental: 0.1 },
    RW: { speed: 0.3, attacking: 0.3, technical: 0.3, mental: 0.1 },
    ST: { attacking: 0.45, technical: 0.25, physical: 0.2, mental: 0.1 },
  };
  const w = weights[pos];
  return Math.round(Object.entries(w).reduce((sum, [k, wt]) => sum + (attrs[k] ?? 5) * wt, 0));
}

function genPlayer(
  id: number,
  clubId: number | null,
  leagueReputation: number,
  pos: Position,
  rng: () => number,
): object {
  const name = `${pick(INDO_FIRST, rng)} ${pick(INDO_LAST, rng)}`;
  const age = randInt(17, 34, rng);

  // Club quality scale: reputation 50–80 → stat base 7–13
  const qualBase = 7 + ((leagueReputation - 50) / 30) * 6;
  const spread = 3;
  const bases = positionBases(pos);
  const attrs: Record<string, number> = {};
  for (const [k, b] of Object.entries(bases)) {
    attrs[k] = randStat(b * (qualBase / 10), spread, rng);
  }

  const ca = calcCA(attrs, pos);
  // PA: 10–30% above CA, higher for younger players
  const youthBonus = age <= 20 ? 0.25 : age <= 23 ? 0.15 : 0.08;
  const pa = Math.min(20, Math.round(ca * (1 + youthBonus + rng() * 0.15)));

  const traits = genTraits(rng);
  const foot = rng() < 0.75 ? "R" : rng() < 0.5 ? "L" : "both";

  return {
    id,
    name,
    nationality: 1, // Indonesia = 1
    club: clubId,
    position: pos,
    age,
    height: randInt(165, 192, rng),
    weight: randInt(60, 88, rng),
    foot,
    ca,
    pa,
    overall: ca,
    ...attrs,
    stamina: 1.0,
    form: 0.4 + rng() * 0.3,
    injury_prone: randInt(1, 8, rng),
    traits: JSON.stringify(traits),
    trait_intensity: JSON.stringify({}),
    injured: 0,
    injury_duration: 0,
    injury_type: null,
    retired: 0,
    free_agent: clubId === null ? 1 : 0,
    on_transfer_list: 0,
    transfer_ban: 0,
    in_prison: 0,
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
    contract_end: 365 + randInt(0, 730, rng),
    wage: randInt(5_000_000, 50_000_000, rng) * Math.ceil(ca / 5),
  };
}

export function generateWorld(seed = 42): void {
  const db = getDB();
  const rng = makeLCG(seed);

  // League
  db.run(
    `INSERT OR IGNORE INTO leagues (id,name,country_id,level,reputation,continent,format,slots,active_config_id)
     VALUES (1,'BRI Liga 1',1,1,72,'Asia','league',18,1)`,
  );

  // Default Liga 1 competition config
  insertLiga1Config(db);

  let playerId = 1;

  for (const club of LIGA1_CLUBS) {
    // Insert club
    db.run(
      `INSERT OR IGNORE INTO clubs
        (id,name,league_id,reputation,cash,fans,stadium_capacity,facilities_level,academy_level,
         club_morale,wins,draws,losses,goals_for,goals_against,points,credit_score,
         consecutive_missed_payments,bankrupt,slot_id,debt,monthly_income,monthly_costs)
       VALUES (?,?,1,?,?,?,?,?,?,75,0,0,0,0,0,0,70,0,0,?,0,?,?)`,
      [
        club.id,
        club.name,
        club.reputation,
        club.cash,
        club.fans,
        club.stadium_capacity,
        club.facilities_level,
        club.academy_level,
        club.id, // slot_id = club.id for now
        Math.round(club.cash * 0.08), // monthly_income ~8% cash
        Math.round(club.cash * 0.06), // monthly_costs ~6% cash
      ],
    );

    // Insert league slot
    db.run(
      `INSERT OR IGNORE INTO league_slots (id,league_id,club_id,status,market_value) VALUES (?,1,?,'occupied',?)`,
      [club.id, club.id, club.reputation * 100_000_000],
    );

    // Generate squad
    for (const pos of SQUAD_POSITIONS) {
      const p = genPlayer(playerId++, club.id, club.reputation, pos, rng) as Record<string, unknown>;
      db.run(
        `INSERT OR IGNORE INTO players
          (id,name,nationality,club,position,age,height,weight,foot,
           ca,pa,overall,attacking,defending,technical,mental,physical,speed,goalkeeping,
           stamina,form,injury_prone,traits,trait_intensity,
           injured,injury_duration,injury_type,retired,free_agent,on_transfer_list,
           transfer_ban,in_prison,prison_duration,
           matches,goals,assists,rating,yellow_cards,red_cards,clean_sheets,
           career_matches,career_goals,career_assists,career_trophies,
           agent_id,contract_end,wage)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id,
          p.name,
          p.nationality,
          p.club,
          p.position,
          p.age,
          p.height,
          p.weight,
          p.foot,
          p.ca,
          p.pa,
          p.overall,
          p.attacking,
          p.defending,
          p.technical,
          p.mental,
          p.physical,
          p.speed,
          p.goalkeeping,
          p.stamina,
          p.form,
          p.injury_prone,
          p.traits,
          p.trait_intensity,
          p.injured,
          p.injury_duration,
          p.injury_type,
          p.retired,
          p.free_agent,
          p.on_transfer_list,
          p.transfer_ban,
          p.in_prison,
          p.prison_duration,
          p.matches,
          p.goals,
          p.assists,
          p.rating,
          p.yellow_cards,
          p.red_cards,
          p.clean_sheets,
          p.career_matches,
          p.career_goals,
          p.career_assists,
          p.career_trophies,
          p.agent_id,
          p.contract_end,
          p.wage,
        ],
      );
    }
  }

  // Generate fixtures after all clubs inserted
  const clubIds = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(1, clubIds, 7, "liga1");

  // ~30 free agents
  for (let i = 0; i < 30; i++) {
    const pos = pick(SQUAD_POSITIONS, rng);
    const p = genPlayer(playerId++, null, 60, pos, rng) as Record<string, unknown>;
    db.run(
      `INSERT OR IGNORE INTO players
        (id,name,nationality,club,position,age,height,weight,foot,
         ca,pa,overall,attacking,defending,technical,mental,physical,speed,goalkeeping,
         stamina,form,injury_prone,traits,trait_intensity,
         injured,injury_duration,injury_type,retired,free_agent,on_transfer_list,
         transfer_ban,in_prison,prison_duration,
         matches,goals,assists,rating,yellow_cards,red_cards,clean_sheets,
         career_matches,career_goals,career_assists,career_trophies,
         agent_id,contract_end,wage)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.id,
        p.name,
        p.nationality,
        p.club,
        p.position,
        p.age,
        p.height,
        p.weight,
        p.foot,
        p.ca,
        p.pa,
        p.overall,
        p.attacking,
        p.defending,
        p.technical,
        p.mental,
        p.physical,
        p.speed,
        p.goalkeeping,
        p.stamina,
        p.form,
        p.injury_prone,
        p.traits,
        p.trait_intensity,
        p.injured,
        p.injury_duration,
        p.injury_type,
        p.retired,
        p.free_agent,
        p.on_transfer_list,
        p.transfer_ban,
        p.in_prison,
        p.prison_duration,
        p.matches,
        p.goals,
        p.assists,
        p.rating,
        p.yellow_cards,
        p.red_cards,
        p.clean_sheets,
        p.career_matches,
        p.career_goals,
        p.career_assists,
        p.career_trophies,
        p.agent_id,
        p.contract_end,
        p.wage,
      ],
    );
  }
}

function insertLiga1Config(db: ReturnType<typeof getDB>): void {
  const stages = JSON.stringify([
    {
      id: "league",
      name: "BRI Liga 1",
      format: "round_robin",
      num_groups: 1,
      legs: 2,
      num_teams: 18,
      title_from_position: 1,
      promotion_spots: 0,
      relegation_spots: 3,
      tiebreaker: ["points", "gd", "gf", "h2h_points", "h2h_gd", "h2h_gf", "lots"],
      reset_card_accumulation: false,
    },
  ]);

  const foreignRules = JSON.stringify({
    squad_limit: 8,
    matchday_limit: 5,
    field_limit: 5,
    starting_limit: null,
    special_slots: [{ name: "AFC", extra_count: 1, criteria: { confederation: "AFC" } }],
    local_starting_min: 0,
    u23_local_min_field: 0,
    naturalized_counts_as: "domestic",
    exempt_confederations: [],
    exempt_regions: [],
  });

  const cardRules = JSON.stringify({
    yellow_suspend_at: 5,
    red_ban_matches: 1,
    violent_conduct_ban: 3,
    accumulation_reset_stages: [],
  });

  const awards = JSON.stringify([
    { id: "top_scorer", name: "Pencetak Gol Terbanyak", criteria: "most_goals" },
    { id: "top_assist", name: "Assist Terbanyak", criteria: "most_assists" },
    { id: "best_player", name: "Pemain Terbaik", criteria: "best_avg_rating" },
    { id: "best_gk", name: "Kiper Terbaik", criteria: "best_gk_rating", position_filter: ["GK"] },
    {
      id: "best_young",
      name: "Pemain Muda Terbaik",
      criteria: "best_young_player",
      age_limit: 23,
    },
    { id: "manager", name: "Pelatih Terbaik", criteria: "manager_of_season" },
  ]);

  db.run(
    `INSERT OR IGNORE INTO competition_configs
      (id,league_id,season_apply,name,stages,foreign_rules,card_rules,awards,
       max_squad_size,max_matchday_squad,proposed_by,proposer_type,status,created_day)
     VALUES (1,1,1,'BRI Liga 1',?,?,?,?,25,18,NULL,'system','active',0)`,
    [stages, foreignRules, cardRules, awards],
  );
}

// Circle method round-robin.
// Returns array of rounds, each round is array of [homeId, awayId] pairs.
function roundRobin(teams: number[]): [number, number][][] {
  const ts = [...teams];
  if (ts.length % 2 !== 0) ts.push(-1); // phantom bye team
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
    // Rotate ts[1..n-1], keep ts[0] fixed
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

// Generate double round-robin fixtures for a league.
// startDay: first match on this in-game day.
// daySpacing: days between consecutive matchdays.
export function generateFixtures(
  leagueId: number,
  clubIds: number[],
  startDay: number,
  competition = "liga1",
  daySpacing = 7,
): void {
  const db = getDB();
  const firstLeg = roundRobin(clubIds);
  // Second leg: swap home/away
  const secondLeg = firstLeg.map((round) => round.map(([h, a]) => [a, h] as [number, number]));
  const allRounds = [...firstLeg, ...secondLeg];

  let matchId = 1;
  allRounds.forEach((round, roundIdx) => {
    const matchDay = startDay + roundIdx * daySpacing;
    const weekNum = roundIdx + 1;
    round.forEach(([home, away]) => {
      db.run(
        `INSERT INTO match_results (id,league_id,home_club,away_club,home_goals,away_goals,date,week,competition,stats,scorers)
         VALUES (?,?,?,?,NULL,NULL,?,?,'${competition}','{}','[]')`,
        [matchId++, leagueId, home, away, matchDay, weekNum],
      );
    });
  });
}
