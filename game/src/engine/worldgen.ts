import { getDB } from "./db.js";
import { calcPlayerCA, OUTFIELD_ATTRS, GK_ATTRS } from "./pa.js";
import { generateCupR32 } from "./cup.js";
import { generateAFCGroupStage } from "./afc.js";
import {
  LIGA1_CLUBS,
  LIGA2_CLUBS,
  LIGA3_CLUBS,
  MALAYSIA_CLUBS,
  THAILAND_CLUBS,
  JAPAN_CLUBS,
  KOREA_CLUBS,
  SAUDI_CLUBS,
  SINGAPORE_CLUBS,
  ENGLAND_CLUBS,
  CHAMPIONSHIP_CLUBS,
  LEAGUE_ONE_CLUBS,
  LEAGUE_TWO_CLUBS,
  NATIONAL_LEAGUE_CLUBS,
  SPAIN_CLUBS,
  SEGUNDA_CLUBS,
  PRIMERA_FED_CLUBS,
  ITALY_CLUBS,
  SERIE_B_CLUBS,
  SERIE_C_CLUBS,
  GERMANY_CLUBS,
  ZWEITE_BUNDESLIGA_CLUBS,
  DRITTE_LIGA_CLUBS,
  LIGUE1_CLUBS,
  LIGUE2_CLUBS,
  NETHERLANDS_CLUBS,
  EERSTE_DIVISIE_CLUBS,
  PRIMEIRA_LIGA_CLUBS,
  LIGA_PORTUGAL_2_CLUBS,
  SUPER_LIG_CLUBS,
  TFF_1_LIG_CLUBS,
  VIETNAM_CLUBS,
  NATION_NAMES,
  INDO_FIRST,
  INDO_LAST,
  SQUAD_POSITIONS,
} from "../data/indonesia.js";
import type { Position, Trait } from "../types/index.js";
import { EXCLUSIVE_TRAITS } from "../types/index.js";

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
  let pool = [...ALL_TRAITS];
  const traits: Trait[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) break;
    const idx = Math.floor(rng() * pool.length);
    const picked = pool.splice(idx, 1)[0];
    traits.push(picked);
    // Remove the exclusive opposite so it can never be picked next
    const opposite = EXCLUSIVE_TRAITS.find(([a, b]) => a === picked || b === picked);
    if (opposite) {
      const opp = opposite[0] === picked ? opposite[1] : opposite[0];
      pool = pool.filter((t) => t !== opp);
    }
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
  nationality = 1,
): Record<string, number | string | null> {
  const nPool = NATION_NAMES[nationality] ?? NATION_NAMES[1];
  const name = `${pick(nPool.first, rng)} ${pick(nPool.last, rng)}`;
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
    nationality,
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

export function generateYouthRegens(season: number): number {
  const db = getDB();
  const rng = makeLCG(season * 7919 + 1337);
  let nextId = ((db.exec(`SELECT COALESCE(MAX(id), 0) FROM players`)[0]?.values[0]?.[0] as number) ?? 0) + 1;
  const clubsRes = db.exec(
    `SELECT c.id, c.reputation, c.academy_level,
            (SELECT COUNT(*) FROM players p WHERE p.club = c.id AND p.retired = 0) AS squad_count
     FROM clubs c WHERE c.bankrupt = 0`,
  );
  let totalGenerated = 0;

  for (const row of clubsRes[0]?.values ?? []) {
    const clubId = row[0] as number;
    const rep = row[1] as number;
    const acadLevel = Math.max(1, (row[2] as number) ?? 2);
    const squadCount = (row[3] as number) ?? 0;

    // Academy intake: 1-2 regens depending on academy_level, plus top-up if squad < 16
    const baseIntake = acadLevel >= 7 ? 3 : acadLevel >= 4 ? 2 : 1;
    const needed = Math.max(baseIntake, Math.max(0, 16 - squadCount));
    // Cap squad at 26 so clubs don't bloat infinitely
    const count = Math.max(0, Math.min(needed, 26 - squadCount));
    const effectiveRep = Math.min(95, Math.round(rep * 0.55 + acadLevel * 4.5));

    for (let i = 0; i < count; i++) {
      const pos = pick(SQUAD_POSITIONS, rng);
      const p = genPlayer(nextId++, clubId, effectiveRep, pos, rng);
      p.age = randInt(15, 17, rng);
      const ca = p.ca as number;
      const potBonus = 15 + acadLevel * 2 + randInt(0, 12, rng);
      p.pa_ceiling = Math.min(100, ca + potBonus);
      p.pa = Math.min(p.pa_ceiling as number, ca + Math.round(potBonus * 0.65));
      p.contract_end = season * 365 + 730;
      p.wage = Math.max(1_500_000, Math.round((p.wage as number) * 0.5));
      insertPlayerRow(db, p);
      totalGenerated++;
    }
  }
  return totalGenerated;
}

export function generateWorld(seed = 42): void {
  const db = getDB();
  const rng = makeLCG(seed);

  db.run(
    `DELETE FROM players; DELETE FROM clubs; DELETE FROM agents; DELETE FROM owners; DELETE FROM match_results; DELETE FROM league_slots; DELETE FROM card_accumulation; DELETE FROM format_proposals; DELETE FROM format_votes; DELETE FROM tarkan_enrollment;`,
  );
  db.run(`DELETE FROM world_state WHERE key IN ('cup_winner_id','afc_winner_id')`);

  // Leagues
  db.run(
    `INSERT OR IGNORE INTO leagues (id,name,country_id,level,reputation,continent,format,slots,active_config_id)
     VALUES (20,'AFC Champions League',0,0,90,'Asia','cup',8,NULL),
            (30,'Liga U-21 Indonesia',1,1,40,'Asia','league',18,NULL),
            (40,'Elite Pro Academy U-18',1,1,35,'Asia','league',18,NULL),
            (45,'Elite Pro Academy U-15',1,1,30,'Asia','league',18,NULL),
            (1,'BRI Liga 1',1,1,72,'Asia','league',18,1),
            (2,'Pegadaian Liga 2',1,2,48,'Asia','league',18,2),
            (5,'Liga 3 Indonesia',1,3,30,'Asia','league',18,NULL),
            (3,'Malaysia Super League',2,1,76,'Asia','league',8,3),
            (4,'Thai League 1',3,1,80,'Asia','league',8,4),
            (6,'J1 League',4,1,88,'Asia','league',8,NULL),
            (7,'K League 1',5,1,85,'Asia','league',8,NULL),
            (8,'Saudi Pro League',6,1,90,'Asia','league',8,NULL),
            (9,'Singapore Premier League',7,1,60,'Asia','league',8,NULL),
            (11,'Premier League',8,1,96,'Europe','league',8,NULL),
            (17,'EFL Championship',8,2,82,'Europe','league',8,NULL),
            (18,'EFL League One',8,3,74,'Europe','league',8,NULL),
            (19,'EFL League Two',8,4,66,'Europe','league',8,NULL),
            (21,'National League',8,5,56,'Europe','league',8,NULL),
            (31,'Premier League 2 (U-21)',8,1,55,'Europe','league',8,NULL),
            (41,'Premier League U-18',8,1,50,'Europe','league',8,NULL),
            (46,'Premier League U-15',8,1,45,'Europe','league',8,NULL),
            (12,'La Liga',9,1,94,'Europe','league',8,NULL),
            (22,'Segunda División',9,2,78,'Europe','league',8,NULL),
            (23,'Primera Federación',9,3,70,'Europe','league',8,NULL),
            (13,'Serie A',10,1,92,'Europe','league',8,NULL),
            (24,'Serie B',10,2,78,'Europe','league',8,NULL),
            (25,'Serie C',10,3,68,'Europe','league',8,NULL),
            (14,'Bundesliga',11,1,92,'Europe','league',8,NULL),
            (26,'2. Bundesliga',11,2,80,'Europe','league',8,NULL),
            (27,'3. Liga',11,3,69,'Europe','league',8,NULL),
            (28,'Ligue 1',14,1,90,'Europe','league',8,NULL),
            (29,'Ligue 2',14,2,77,'Europe','league',8,NULL),
            (15,'Eredivisie',12,1,86,'Europe','league',8,NULL),
            (32,'Eerste Divisie',12,2,73,'Europe','league',8,NULL),
            (33,'Primeira Liga',15,1,88,'Europe','league',8,NULL),
            (34,'Liga Portugal 2',15,2,74,'Europe','league',8,NULL),
            (35,'Süper Lig',16,1,86,'Europe','league',8,NULL),
            (36,'TFF 1. Lig',16,2,72,'Europe','league',8,NULL),
            (16,'V.League 1',13,1,65,'Asia','league',8,NULL),
            (10,'Piala Indonesia',1,0,70,'Asia','cup',32,NULL)`,
  );

  // Default competition configs
  insertLiga1Config(db);

  let playerId = 1;

  // nationality: 1=ID, 2=MY, 3=TH, 4=JP, 5=KR, 6=SA, 7=SG, 8=ENG, 9=ESP, 10=ITA, 11=GER, 12=NED, 13=VIE, 14=FRA, 15=POR, 16=TUR
  const LEAGUE_NATIONALITY: Record<number, number> = {
    1: 1,
    2: 1,
    5: 1,
    3: 2,
    4: 3,
    6: 4,
    7: 5,
    8: 6,
    9: 7,
    11: 8,
    17: 8,
    18: 8,
    19: 8,
    21: 8,
    12: 9,
    22: 9,
    23: 9,
    13: 10,
    24: 10,
    25: 10,
    14: 11,
    26: 11,
    27: 11,
    28: 14,
    29: 14,
    15: 12,
    32: 12,
    33: 15,
    34: 15,
    35: 16,
    36: 16,
    16: 13,
  };

  for (const [leagueId, clubList] of [
    [1, LIGA1_CLUBS],
    [2, LIGA2_CLUBS],
    [5, LIGA3_CLUBS],
    [3, MALAYSIA_CLUBS],
    [4, THAILAND_CLUBS],
    [6, JAPAN_CLUBS],
    [7, KOREA_CLUBS],
    [8, SAUDI_CLUBS],
    [9, SINGAPORE_CLUBS],
    [11, ENGLAND_CLUBS],
    [17, CHAMPIONSHIP_CLUBS],
    [18, LEAGUE_ONE_CLUBS],
    [19, LEAGUE_TWO_CLUBS],
    [21, NATIONAL_LEAGUE_CLUBS],
    [12, SPAIN_CLUBS],
    [22, SEGUNDA_CLUBS],
    [23, PRIMERA_FED_CLUBS],
    [13, ITALY_CLUBS],
    [24, SERIE_B_CLUBS],
    [25, SERIE_C_CLUBS],
    [14, GERMANY_CLUBS],
    [26, ZWEITE_BUNDESLIGA_CLUBS],
    [27, DRITTE_LIGA_CLUBS],
    [28, LIGUE1_CLUBS],
    [29, LIGUE2_CLUBS],
    [15, NETHERLANDS_CLUBS],
    [32, EERSTE_DIVISIE_CLUBS],
    [33, PRIMEIRA_LIGA_CLUBS],
    [34, LIGA_PORTUGAL_2_CLUBS],
    [35, SUPER_LIG_CLUBS],
    [36, TFF_1_LIG_CLUBS],
    [16, VIETNAM_CLUBS],
  ] as const) {
    for (const club of clubList) {
      db.run(
        `INSERT OR IGNORE INTO clubs
          (id,name,league_id,reputation,cash,fans,stadium_capacity,facilities_level,academy_level,
           club_morale,wins,draws,losses,goals_for,goals_against,points,credit_score,
           consecutive_missed_payments,bankrupt,slot_id,debt,monthly_income,monthly_costs)
         VALUES (?,?,?,?,?,?,?,?,?,75,0,0,0,0,0,0,70,0,0,?,0,?,?)`,
        [
          club.id,
          club.name,
          leagueId,
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
        `INSERT OR IGNORE INTO league_slots (id,league_id,club_id,status,market_value) VALUES (?,?,?,'occupied',?)`,
        [club.id, leagueId, club.id, club.reputation * 75_000_000],
      );

      // Generate squad
      const nationality = LEAGUE_NATIONALITY[leagueId] ?? 1;
      for (const pos of SQUAD_POSITIONS) {
        const p = genPlayer(playerId++, club.id, club.reputation, pos, rng, nationality);
        insertPlayerRow(db, p);
      }
    }
  }

  // Generate fixtures after all clubs inserted
  const clubIds1 = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(1, clubIds1, 7, "liga1");
  const clubIds2 = LIGA2_CLUBS.map((c) => c.id);
  generateFixtures(2, clubIds2, 7, "liga2");
  const clubIds5 = LIGA3_CLUBS.map((c) => c.id);
  generateFixtures(5, clubIds5, 7, "liga3");
  const clubIds3 = MALAYSIA_CLUBS.map((c) => c.id);
  generateFixtures(3, clubIds3, 7, "msl", 14);
  const clubIds4 = THAILAND_CLUBS.map((c) => c.id);
  generateFixtures(4, clubIds4, 7, "tl1", 14);
  const clubIds6 = JAPAN_CLUBS.map((c) => c.id);
  generateFixtures(6, clubIds6, 7, "j1", 14);
  const clubIds7 = KOREA_CLUBS.map((c) => c.id);
  generateFixtures(7, clubIds7, 7, "k1", 14);
  const clubIds8 = SAUDI_CLUBS.map((c) => c.id);
  generateFixtures(8, clubIds8, 7, "spl_saudi", 14);
  const clubIds9 = SINGAPORE_CLUBS.map((c) => c.id);
  generateFixtures(9, clubIds9, 7, "spl_sg", 14);
  const clubIds11 = ENGLAND_CLUBS.map((c) => c.id);
  generateFixtures(11, clubIds11, 7, "epl", 14);
  const clubIds17 = CHAMPIONSHIP_CLUBS.map((c) => c.id);
  generateFixtures(17, clubIds17, 7, "efl", 14);
  const clubIds18 = LEAGUE_ONE_CLUBS.map((c) => c.id);
  generateFixtures(18, clubIds18, 7, "league_one", 14);
  const clubIds19 = LEAGUE_TWO_CLUBS.map((c) => c.id);
  generateFixtures(19, clubIds19, 7, "league_two", 14);
  const clubIds21 = NATIONAL_LEAGUE_CLUBS.map((c) => c.id);
  generateFixtures(21, clubIds21, 7, "nat_league", 14);
  const clubIds12 = SPAIN_CLUBS.map((c) => c.id);
  generateFixtures(12, clubIds12, 7, "laliga", 14);
  const clubIds22 = SEGUNDA_CLUBS.map((c) => c.id);
  generateFixtures(22, clubIds22, 7, "segunda", 14);
  const clubIds23 = PRIMERA_FED_CLUBS.map((c) => c.id);
  generateFixtures(23, clubIds23, 7, "primera_fed", 14);
  const clubIds13 = ITALY_CLUBS.map((c) => c.id);
  generateFixtures(13, clubIds13, 7, "seriea", 14);
  const clubIds24 = SERIE_B_CLUBS.map((c) => c.id);
  generateFixtures(24, clubIds24, 7, "serie_b", 14);
  const clubIds25 = SERIE_C_CLUBS.map((c) => c.id);
  generateFixtures(25, clubIds25, 7, "serie_c", 14);
  const clubIds14 = GERMANY_CLUBS.map((c) => c.id);
  generateFixtures(14, clubIds14, 7, "bundesliga", 14);
  const clubIds26 = ZWEITE_BUNDESLIGA_CLUBS.map((c) => c.id);
  generateFixtures(26, clubIds26, 7, "2_bundesliga", 14);
  const clubIds27 = DRITTE_LIGA_CLUBS.map((c) => c.id);
  generateFixtures(27, clubIds27, 7, "3_liga", 14);
  const clubIds28 = LIGUE1_CLUBS.map((c) => c.id);
  generateFixtures(28, clubIds28, 7, "ligue1", 14);
  const clubIds29 = LIGUE2_CLUBS.map((c) => c.id);
  generateFixtures(29, clubIds29, 7, "ligue2", 14);
  const clubIds15 = NETHERLANDS_CLUBS.map((c) => c.id);
  generateFixtures(15, clubIds15, 7, "eredivisie", 14);
  const clubIds32 = EERSTE_DIVISIE_CLUBS.map((c) => c.id);
  generateFixtures(32, clubIds32, 7, "eerste_divisie", 14);
  const clubIds33 = PRIMEIRA_LIGA_CLUBS.map((c) => c.id);
  generateFixtures(33, clubIds33, 7, "primeira_liga", 14);
  const clubIds34 = LIGA_PORTUGAL_2_CLUBS.map((c) => c.id);
  generateFixtures(34, clubIds34, 7, "liga_portugal_2", 14);
  const clubIds35 = SUPER_LIG_CLUBS.map((c) => c.id);
  generateFixtures(35, clubIds35, 7, "super_lig", 14);
  const clubIds36 = TFF_1_LIG_CLUBS.map((c) => c.id);
  generateFixtures(36, clubIds36, 7, "tff_1_lig", 14);
  const clubIds16 = VIETNAM_CLUBS.map((c) => c.id);
  generateFixtures(16, clubIds16, 7, "vleague", 14);

  // Tarkan pyramid: 5 tiers × 24 clubs (IDs 1001–1120) + European Sunday Leagues (IDs 1201-1224)
  generateTarkanLeagues(db, rng);

  // Youth Pyramid (U-15, U-18, U-21)
  const clubIds_u21 = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(30, clubIds_u21, 11, "u21", 7);

  const clubIds_epl_u21 = ENGLAND_CLUBS.map((c) => c.id);
  generateFixtures(31, clubIds_epl_u21, 12, "epl_u21", 14);

  const clubIds_u18 = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(40, clubIds_u18, 13, "epa_u18", 7);

  const clubIds_epl_u18 = ENGLAND_CLUBS.map((c) => c.id);
  generateFixtures(41, clubIds_epl_u18, 14, "epl_u18", 14);

  const clubIds_u15 = LIGA1_CLUBS.map((c) => c.id);
  generateFixtures(45, clubIds_u15, 15, "epa_u15", 7);

  const clubIds_epl_u15 = ENGLAND_CLUBS.map((c) => c.id);
  generateFixtures(46, clubIds_epl_u15, 16, "epl_u15", 14);

  // Piala Indonesia: 32-club single-elimination cup (Liga 1 × 18 + Liga 2 top 14)
  generateCupR32(50);

  // AFC Champions League: 8 clubs (top 4 Liga 1 + top 2 MSL + top 2 Thai), group stage starts day 60
  generateAFCGroupStage();

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

  const stages2 = JSON.stringify([
    {
      id: "league",
      name: "Pegadaian Liga 2",
      format: "round_robin",
      num_groups: 1,
      legs: 2,
      num_teams: 18,
      title_from_position: 1,
      promotion_spots: 3,
      relegation_spots: 0,
      tiebreaker: ["points", "gd", "gf", "h2h_points", "h2h_gd", "h2h_gf", "lots"],
      reset_card_accumulation: false,
    },
  ]);

  const stagesAsean = (name: string) =>
    JSON.stringify([
      {
        id: "league",
        name,
        format: "round_robin",
        num_groups: 1,
        legs: 2,
        num_teams: 8,
        title_from_position: 1,
        promotion_spots: 0,
        relegation_spots: 0,
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

  const foreignRules2 = JSON.stringify({
    squad_limit: 3,
    matchday_limit: 3,
    field_limit: 3,
    starting_limit: null,
    special_slots: [],
    local_starting_min: 8,
    u23_local_min_field: 1,
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
     VALUES (1,1,1,'BRI Liga 1',?,?,?,?,25,18,NULL,'system','active',0),
            (2,2,1,'Pegadaian Liga 2',?,?,?,?,25,18,NULL,'system','active',0),
            (3,3,1,'Malaysia Super League',?,?,?,?,25,18,NULL,'system','active',0),
            (4,4,1,'Thai League 1',?,?,?,?,25,18,NULL,'system','active',0)`,
    [
      stages,
      foreignRules,
      cardRules,
      awards,
      stages2,
      foreignRules2,
      cardRules,
      awards,
      stagesAsean("Malaysia Super League"),
      foreignRules,
      cardRules,
      awards,
      stagesAsean("Thai League 1"),
      foreignRules,
      cardRules,
      awards,
    ],
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

// ─── Tarkan pyramid ───────────────────────────────────────────────────────────

const TARKAN_AREAS = [
  "Bandung",
  "Surabaya",
  "Medan",
  "Semarang",
  "Makassar",
  "Palembang",
  "Denpasar",
  "Yogyakarta",
  "Malang",
  "Bogor",
  "Bekasi",
  "Depok",
  "Tangerang",
  "Batam",
  "Pekanbaru",
  "Banjarmasin",
  "Samarinda",
  "Pontianak",
  "Manado",
  "Kupang",
  "Jayapura",
  "Mataram",
  "Ambon",
  "Ternate",
  "Tasikmalaya",
  "Cirebon",
  "Sukabumi",
  "Purwokerto",
  "Madiun",
  "Kediri",
  "Jember",
  "Probolinggo",
  "Blitar",
  "Mojokerto",
  "Tulungagung",
  "Pasuruan",
  "Banyuwangi",
  "Situbondo",
  "Lumajang",
  "Bondowoso",
  "Lamongan",
  "Tuban",
  "Bojonegoro",
  "Magetan",
  "Ngawi",
  "Ponorogo",
  "Pacitan",
  "Trenggalek",
];
const TARKAN_SUFFIX = ["Putra", "Muda", "Jaya", "United", "FC", "Bintang", "Garuda", "Sakti"];

function generateTarkanLeagues(db: ReturnType<typeof getDB>, rng: () => number): void {
  const TIERS = [
    { id: 101, name: "Tarkan Divisi 1", rep: [28, 38] },
    { id: 102, name: "Tarkan Divisi 2", rep: [20, 30] },
    { id: 103, name: "Tarkan Divisi 3", rep: [14, 24] },
    { id: 104, name: "Tarkan Divisi 4", rep: [10, 18] },
    { id: 105, name: "Tarkan Divisi 5", rep: [5, 12] },
  ];

  // Insert Tarkan leagues
  for (const t of TIERS) {
    db.run(
      `INSERT OR IGNORE INTO leagues (id,name,country_id,level,reputation,continent,format,slots,type)
       VALUES (?,?,1,?,?,  'Asia','league',24,'tarkan')`,
      [t.id, t.name, t.id - 98, Math.round((t.rep[0] + t.rep[1]) / 2)],
    );
  }

  let clubId = 1001;
  const usedNames = new Set<string>();

  for (const tier of TIERS) {
    const tierClubIds: number[] = [];

    for (let i = 0; i < 24; i++) {
      // Pick unique name
      let clubName = "";
      let attempts = 0;
      do {
        const area = TARKAN_AREAS[Math.floor(rng() * TARKAN_AREAS.length)];
        const suffix = TARKAN_SUFFIX[Math.floor(rng() * TARKAN_SUFFIX.length)];
        clubName = `${area} ${suffix}`;
        attempts++;
      } while (usedNames.has(clubName) && attempts < 50);
      usedNames.add(clubName);

      const rep = tier.rep[0] + Math.floor(rng() * (tier.rep[1] - tier.rep[0] + 1));
      db.run(
        `INSERT OR IGNORE INTO clubs
          (id,name,league_id,reputation,cash,fans,stadium_capacity,facilities_level,academy_level,
           club_morale,wins,draws,losses,goals_for,goals_against,points,credit_score,
           consecutive_missed_payments,bankrupt,slot_id,debt,monthly_income,monthly_costs)
         VALUES (?,?,?,?,500000000,500,2000,1,0,75,0,0,0,0,0,0,60,0,0,?,0,10000000,8000000)`,
        [clubId, clubName, tier.id, rep, clubId],
      );

      tierClubIds.push(clubId);
      clubId++;
    }

    // Single round-robin: 23 matchdays, every 5 days starting day 9
    generateFixtures(tier.id, tierClubIds, 9, `tarkan_${tier.id - 100}`, 5);
  }

  // European Sunday Leagues (Tier 6 grassroots amateur, IDs 1201-1224)
  const SUNDAY_TIERS = [
    {
      id: 106,
      name: "Sunday League North (Eropa)",
      clubs: [
        "Camden Town Sunday",
        "Clapham Rovers",
        "Hackney Marshes",
        "Brixton Casuals",
        "Islington Athletic",
        "Kreuzberg Kickers",
        "Altona 93 Amateure",
        "De Pijp Amsterdam",
        "Jordaan Boys Sunday",
        "Rotterdam Haven",
        "Salford Bohemians",
        "Sheffield Sunday Vets",
      ],
      startId: 1201,
      countryId: 8,
    },
    {
      id: 107,
      name: "Sunday League South (Eropa)",
      clubs: [
        "Gracia Barcelona",
        "Malasana Madrid",
        "Lavapies Athletic",
        "Trastevere Amatori",
        "San Lorenzo Calcio",
        "Navigli Milano",
        "Quartier Latin Paris",
        "Belleville Amateurs",
        "Vieux-Port Marseille",
        "Alfama Lisboa",
        "Bairro Alto Casuals",
        "Ribeira Porto Sunday",
      ],
      startId: 1213,
      countryId: 9,
    },
  ];

  for (const st of SUNDAY_TIERS) {
    db.run(
      `INSERT OR IGNORE INTO leagues (id,name,country_id,level,reputation,continent,format,slots,type)
       VALUES (?,?,? ,6,25,'Europe','league',12,'tarkan')`,
      [st.id, st.name, st.countryId],
    );

    const sundayClubIds: number[] = [];
    for (let i = 0; i < st.clubs.length; i++) {
      const cId = st.startId + i;
      const cName = st.clubs[i];
      const rep = 20 + Math.floor(rng() * 10);
      db.run(
        `INSERT OR IGNORE INTO clubs
          (id,name,league_id,reputation,cash,fans,stadium_capacity,facilities_level,academy_level,
           club_morale,wins,draws,losses,goals_for,goals_against,points,credit_score,
           consecutive_missed_payments,bankrupt,slot_id,debt,monthly_income,monthly_costs)
         VALUES (?,?,?,?,1000000000,1500,3000,1,0,75,0,0,0,0,0,0,60,0,0,?,0,20000000,15000000)`,
        [cId, cName, st.id, rep, cId],
      );
      sundayClubIds.push(cId);
    }
    // Single round-robin: 11 matchdays, every 7 days starting day 8
    generateFixtures(st.id, sundayClubIds, 8, `sunday_${st.id === 106 ? "north" : "south"}`, 7);
  }
}
