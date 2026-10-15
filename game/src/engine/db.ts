import initSqlJs, { type Database } from "sql.js";

let db: Database | null = null;

export async function initDB(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => `/sql.js/${file}`,
  });
  db = new SQL.Database();
  createSchema(db);
  return db;
}

export function getDB(): Database {
  if (!db) throw new Error("DB not initialized");
  return db;
}

function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      nationality INTEGER,
      club INTEGER,
      position TEXT NOT NULL,
      secondary_position TEXT,
      age INTEGER NOT NULL,
      height INTEGER,
      weight INTEGER,
      foot TEXT,
      ca INTEGER DEFAULT 1,
      pa INTEGER DEFAULT 1,
      overall INTEGER DEFAULT 1,
      attacking INTEGER DEFAULT 1,
      defending INTEGER DEFAULT 1,
      technical INTEGER DEFAULT 1,
      mental INTEGER DEFAULT 1,
      physical INTEGER DEFAULT 1,
      speed INTEGER DEFAULT 1,
      goalkeeping INTEGER DEFAULT 0,
      stamina REAL DEFAULT 1.0,
      form REAL DEFAULT 0.5,
      injury_prone INTEGER DEFAULT 3,
      traits TEXT DEFAULT '[]',
      trait_intensity TEXT DEFAULT '{}',
      injured INTEGER DEFAULT 0,
      injury_duration INTEGER DEFAULT 0,
      injury_type TEXT,
      retired INTEGER DEFAULT 0,
      free_agent INTEGER DEFAULT 1,
      on_transfer_list INTEGER DEFAULT 0,
      transfer_ban INTEGER DEFAULT 0,
      in_prison INTEGER DEFAULT 0,
      prison_duration INTEGER DEFAULT 0,
      matches INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      rating REAL DEFAULT 0.0,
      yellow_cards INTEGER DEFAULT 0,
      red_cards INTEGER DEFAULT 0,
      clean_sheets INTEGER DEFAULT 0,
      career_matches INTEGER DEFAULT 0,
      career_goals INTEGER DEFAULT 0,
      career_assists INTEGER DEFAULT 0,
      career_trophies INTEGER DEFAULT 0,
      agent_id INTEGER,
      contract_end INTEGER,
      wage INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      league_id INTEGER NOT NULL,
      reputation INTEGER DEFAULT 30,
      owner_id INTEGER,
      manager_id INTEGER,
      cash INTEGER DEFAULT 0,
      debt INTEGER DEFAULT 0,
      monthly_income INTEGER DEFAULT 0,
      monthly_costs INTEGER DEFAULT 0,
      credit_score INTEGER DEFAULT 60,
      consecutive_missed_payments INTEGER DEFAULT 0,
      bankrupt INTEGER DEFAULT 0,
      slot_id INTEGER,
      club_morale INTEGER DEFAULT 75,
      fans INTEGER DEFAULT 1000,
      stadium_capacity INTEGER DEFAULT 5000,
      facilities_level INTEGER DEFAULT 1,
      academy_level INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      goals_for INTEGER DEFAULT 0,
      goals_against INTEGER DEFAULT 0,
      points INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      country_id INTEGER,
      level INTEGER DEFAULT 1,
      reputation INTEGER DEFAULT 30,
      continent TEXT,
      format TEXT DEFAULT 'league',
      slots INTEGER DEFAULT 18
    );

    CREATE TABLE IF NOT EXISTS league_slots (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      club_id INTEGER,
      status TEXT DEFAULT 'available',
      market_value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY,
      league_id INTEGER,
      home_club INTEGER,
      away_club INTEGER,
      home_goals INTEGER,
      away_goals INTEGER,
      date INTEGER,
      stats TEXT DEFAULT '{}',
      scorers TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      id INTEGER PRIMARY KEY,
      player_id INTEGER NOT NULL,
      club_id INTEGER,
      season INTEGER NOT NULL,
      matches INTEGER DEFAULT 0,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      rating REAL DEFAULT 0.0,
      yellow_cards INTEGER DEFAULT 0,
      red_cards INTEGER DEFAULT 0,
      clean_sheets INTEGER DEFAULT 0,
      league_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS world_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
