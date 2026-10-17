import { getDB } from "./db.js";
import { calcPlayerCA, OUTFIELD_ATTRS, GK_ATTRS } from "./pa.js";
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
  return Math.max(5, Math.min(100, Math.round(base + (rng() - 0.5) * 2 * spread)));
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

// Primary (×1.4) and Secondary (×1.1) attributes per position (§ Worldgen Changes)
const POSITION_PROFILE: Record<Position, { primary: string[]; secondary: string[] }> = {
  ST: { primary: ["finishing", "off_the_ball"], secondary: ["heading", "composure", "strength"] },
  LW: { primary: ["pace", "dribbling"], secondary: ["crossing", "agility", "technique"] },
  RW: { primary: ["pace", "dribbling"], secondary: ["crossing", "agility", "technique"] },
  AM: { primary: ["vision", "passing"], secondary: ["finishing", "decisions", "technique"] },
  CM: { primary: ["passing", "decisions"], secondary: ["vision", "work_rate", "technique"] },
  DM: { primary: ["positioning", "tackling"], secondary: ["decisions", "work_rate", "strength"] },
  CB: { primary: ["heading", "positioning"], secondary: ["tackling", "strength", "anticipation"] },
  LB: { primary: ["pace", "positioning"], secondary: ["crossing", "tackling", "work_rate"] },
  RB: { primary: ["pace", "positioning"], secondary: ["crossing", "tackling", "work_rate"] },
  GK: { primary: ["reflexes", "handling"], secondary: ["gk_positioning", "one_on_ones", "command"] },
};

const GK_RELEVANT_OUTFIELD = new Set([
  "decisions",
  "composure",
  "anticipation",
  "positioning",
  "agility",
  "jumping",
  "strength",
  "passing",
]);

function genPlayer(
  id: number,
  clubId: number | null,
  leagueReputation: number,
  pos: Position,
  rng: () => number,
): Record<string, number | string | null> {
  const name = `${pick(INDO_FIRST, rng)} ${pick(INDO_LAST, rng)}`;
  const age = randInt(17, 34, rng);

  // base = (clubRep / 100) × 40 + rand(±10)
  const base = Math.max(15, (leagueReputation / 100) * 40 + randInt(-10, 10, rng));
  const spread = 8;
  const profile = POSITION_PROFILE[pos];
  const attrs: Record<string, number> = {};

  if (pos === "GK") {
    for (const k of GK_ATTRS) {
      const mult = profile.primary.includes(k) ? 1.4 : profile.secondary.includes(k) ? 1.1 : 1.0;
      attrs[k] = randStat(base * mult, spread, rng);
    }
    for (const k of OUTFIELD_ATTRS) {
      if (GK_RELEVANT_OUTFIELD.has(k)) {
        attrs[k] = randStat(base, spread, rng);
      } else if (k === "pace") {
        attrs[k] = randStat(base * 0.75, spread, rng);
      } else {
        attrs[k] = randInt(5, 20, rng);
      }
    }
  } else {
    for (const k of GK_ATTRS) {
      attrs[k] = 0;
    }
    for (const k of OUTFIELD_ATTRS) {
      const mult = profile.primary.includes(k) ? 1.4 : profile.secondary.includes(k) ? 1.1 : 1.0;
      attrs[k] = randStat(base * mult, spread, rng);
    }
  }

  const ca = calcPlayerCA(attrs, pos);
  // pa_ceiling = max PA this player can ever reach (higher for youth)
  const ceilMult = age <= 18 ? 0.8 : age <= 21 ? 0.6 : age <= 25 ? 0.4 : age <= 29 ? 0.25 : 0.12;
  const pa_ceiling = Math.min(100, Math.round(ca * (1 + ceilMult)));
  // Initial PA: somewhere between CA and ceiling based on age
  const youthBonus = age <= 20 ? 0.25 : age <= 23 ? 0.15 : 0.08;
  const pa = Math.min(pa_ceiling, Math.round(ca * (1 + youthBonus + rng() * 0.15)));

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
    pa_ceiling,
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
    wage: randInt(3_000_000, 20_000_000, rng) + ca * 200_000,
  };
}

function insertPlayerRow(db: ReturnType<typeof getDB>, p: Record<string, number | string | null>): void {
  db.run(
    `INSERT OR REPLACE INTO players
      (id,name,nationality,club,position,age,height,weight,foot,
       ca,pa,pa_ceiling,overall,
       finishing,passing,dribbling,heading,crossing,tackling,technique,long_shots,
       decisions,composure,positioning,vision,anticipation,off_the_ball,work_rate,
       pace,strength,agility,jumping,
       reflexes,handling,gk_positioning,one_on_ones,command,
       stamina,form,injury_prone,traits,trait_intensity,
       injured,injury_duration,injury_type,retired,free_agent,on_transfer_list,
       transfer_ban,in_prison,prison_duration,
       matches,goals,assists,rating,yellow_cards,red_cards,clean_sheets,
       career_matches,career_goals,career_assists,career_trophies,
       agent_id,contract_end,wage)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      p.pa_ceiling,
      p.overall,
      p.finishing,
      p.passing,
      p.dribbling,
      p.heading,
      p.crossing,
      p.tackling,
      p.technique,
      p.long_shots,
      p.decisions,
      p.composure,
      p.positioning,
      p.vision,
      p.anticipation,
      p.off_the_ball,
      p.work_rate,
      p.pace,
      p.strength,
      p.agility,
      p.jumping,
      p.reflexes,
      p.handling,
      p.gk_positioning,
      p.one_on_ones,
      p.command,
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

export function createEgoPlayer(opts: {
  name: string;
  position: Position;
  age: number;
  clubId: number;
  appearance?: string;
  seed?: number;
}): number {
  const db = getDB();
  const rng = makeLCG(opts.seed ?? 999);
  const maxRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM players`);
  const id = ((maxRes[0]?.values[0]?.[0] as number) ?? 0) + 1;

  const repRes = db.exec(`SELECT reputation FROM clubs WHERE id = ?`, [opts.clubId]);
  const clubRep = (repRes[0]?.values[0]?.[0] as number) ?? 65;

  const p = genPlayer(id, opts.clubId, clubRep, opts.position, rng);
  p.name = opts.name;
  p.age = opts.age;
  // Protagonist starts with higher ceiling than average player
  const egoCa = p.ca as number;
  p.pa_ceiling = Math.min(100, egoCa + 30);
  p.pa = Math.min(p.pa_ceiling as number, Math.max(egoCa + 10, 60));
  p.contract_end = 730; // 2-season initial contract

  insertPlayerRow(db, p);
  if (opts.appearance) {
    db.run(`UPDATE players SET appearance = ? WHERE id = ?`, [opts.appearance, id]);
  }
  return id;
}

export function generateWorld(seed = 42): void {
  const db = getDB();
  const rng = makeLCG(seed);

  db.run(
    `DELETE FROM players; DELETE FROM clubs; DELETE FROM agents; DELETE FROM owners; DELETE FROM match_results; DELETE FROM league_slots; DELETE FROM card_accumulation;`,
  );

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
      [club.id, club.id, club.reputation * 75_000_000],
    );

    // Generate squad
    for (const pos of SQUAD_POSITIONS) {
      const p = genPlayer(playerId++, club.id, club.reputation, pos, rng);
      insertPlayerRow(db, p);
    }
  }

  // Generate fixtures after all clubs inserted
  const clubIds = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(1, clubIds, 7, "liga1");

  // ~30 free agents
  for (let i = 0; i < 30; i++) {
    const pos = pick(SQUAD_POSITIONS, rng);
    const p = genPlayer(playerId++, null, 60, pos, rng);
    insertPlayerRow(db, p);
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

  let matchId = ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;
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
