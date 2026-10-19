import type { Database } from "sql.js";

let db: Database | null = null;

export async function initDB(): Promise<Database> {
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      typeof window === "undefined"
        ? new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).pathname
        : `/sql.js/${file}`,
  });
  db = new SQL.Database();
  createSchema(db);
  return db;
}

export function getDB(): Database {
  if (!db) throw new Error("DB not initialized");
  return db;
}

export function exportDB(): Uint8Array {
  if (!db) throw new Error("DB not initialized");
  return db.export();
}

export async function loadDB(data: Uint8Array): Promise<void> {
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      typeof window === "undefined"
        ? new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).pathname
        : `/sql.js/${file}`,
  });
  db = new SQL.Database(data);
  createSchema(db);
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
      pa_ceiling INTEGER DEFAULT 100,
      overall INTEGER DEFAULT 1,
      finishing INTEGER DEFAULT 1,
      passing INTEGER DEFAULT 1,
      dribbling INTEGER DEFAULT 1,
      heading INTEGER DEFAULT 1,
      crossing INTEGER DEFAULT 1,
      tackling INTEGER DEFAULT 1,
      technique INTEGER DEFAULT 1,
      long_shots INTEGER DEFAULT 1,
      decisions INTEGER DEFAULT 1,
      composure INTEGER DEFAULT 1,
      positioning INTEGER DEFAULT 1,
      vision INTEGER DEFAULT 1,
      anticipation INTEGER DEFAULT 1,
      off_the_ball INTEGER DEFAULT 1,
      work_rate INTEGER DEFAULT 1,
      pace INTEGER DEFAULT 1,
      strength INTEGER DEFAULT 1,
      agility INTEGER DEFAULT 1,
      jumping INTEGER DEFAULT 1,
      reflexes INTEGER DEFAULT 0,
      handling INTEGER DEFAULT 0,
      gk_positioning INTEGER DEFAULT 0,
      one_on_ones INTEGER DEFAULT 0,
      command INTEGER DEFAULT 0,
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
      wage INTEGER DEFAULT 0,
      appearance TEXT DEFAULT '{}'
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

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      reputation INTEGER DEFAULT 20,
      cash INTEGER DEFAULT 30000000,
      monthly_costs INTEGER DEFAULT 2000000,
      credit_score INTEGER DEFAULT 60,
      consecutive_missed INTEGER DEFAULT 0,
      bankrupt INTEGER DEFAULT 0,
      office_level INTEGER DEFAULT 0,
      judge_ca INTEGER DEFAULT 45,
      judge_pa INTEGER DEFAULT 45
    );

    CREATE TABLE IF NOT EXISTS owners (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      personal_cash INTEGER DEFAULT 15000000000,
      reputation INTEGER DEFAULT 50,
      credit_score INTEGER DEFAULT 75
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      country_id INTEGER,
      level INTEGER DEFAULT 1,
      reputation INTEGER DEFAULT 30,
      continent TEXT,
      format TEXT DEFAULT 'league',
      slots INTEGER DEFAULT 18,
      active_config_id INTEGER,  -- FK → competition_configs.id
      type TEXT DEFAULT 'pro'    -- 'pro' | 'tarkan'
    );

    -- One enrollment per player per season; leaving = DELETE row
    CREATE TABLE IF NOT EXISTS tarkan_enrollment (
      player_id INTEGER NOT NULL,
      league_id INTEGER NOT NULL,
      club_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      PRIMARY KEY(player_id, season)
    );

    CREATE TABLE IF NOT EXISTS league_slots (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      club_id INTEGER,
      status TEXT DEFAULT 'available',
      market_value INTEGER DEFAULT 0
    );

    -- Fixtures + results share one table.
    -- home_goals IS NULL = unplayed fixture.
    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY,
      league_id INTEGER,
      home_club INTEGER,
      away_club INTEGER,
      home_goals INTEGER,
      away_goals INTEGER,
      date INTEGER,               -- absolute in-game day
      week INTEGER DEFAULT 0,     -- matchday number within competition
      stage_id TEXT DEFAULT 'league', -- which stage this match belongs to
      group_num INTEGER DEFAULT 0,    -- 0 = no groups; 1+ = group number
      competition TEXT DEFAULT 'liga1',
      stats TEXT DEFAULT '{}',
      scorers TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS player_stats (
      id INTEGER PRIMARY KEY,
      player_id INTEGER NOT NULL,
      club_id INTEGER,
      competition_id INTEGER,     -- FK → competition_configs.id
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

    -- Card accumulation per player per competition (resets per config rules).
    CREATE TABLE IF NOT EXISTS card_accumulation (
      id INTEGER PRIMARY KEY,
      player_id INTEGER NOT NULL,
      competition_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      yellow_count INTEGER DEFAULT 0,
      red_count INTEGER DEFAULT 0,
      suspended_matches_remaining INTEGER DEFAULT 0,
      UNIQUE(player_id, competition_id, season)
    );

    -- Competition format configs. One row = one season's ruleset for a league.
    CREATE TABLE IF NOT EXISTS competition_configs (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      season_apply INTEGER NOT NULL,  -- first season this config is active
      name TEXT NOT NULL,
      stages TEXT NOT NULL,           -- JSON: StageConfig[]
      foreign_rules TEXT NOT NULL,    -- JSON: ForeignRuleSet
      card_rules TEXT NOT NULL,       -- JSON: CardRules
      awards TEXT NOT NULL,           -- JSON: AwardDefinition[]
      max_squad_size INTEGER DEFAULT 25,
      max_matchday_squad INTEGER DEFAULT 18,
      proposed_by INTEGER,
      proposer_type TEXT DEFAULT 'system',
      status TEXT DEFAULT 'active',   -- 'active'|'proposed'|'passed'|'superseded'
      created_day INTEGER DEFAULT 0,
      UNIQUE(league_id, season_apply)
    );

    -- Format change proposals submitted by club owners or federations.
    CREATE TABLE IF NOT EXISTS format_proposals (
      id INTEGER PRIMARY KEY,
      league_id INTEGER NOT NULL,
      proposed_by INTEGER NOT NULL,
      proposer_type TEXT NOT NULL,    -- 'club_owner'|'federation'
      season_apply INTEGER NOT NULL,
      proposed_stages TEXT NOT NULL,
      proposed_foreign_rules TEXT NOT NULL,
      proposed_card_rules TEXT NOT NULL,
      votes_for INTEGER DEFAULT 0,
      votes_against INTEGER DEFAULT 0,
      votes_abstain INTEGER DEFAULT 0,
      threshold REAL DEFAULT 0.51,
      status TEXT DEFAULT 'open',     -- 'open'|'passed'|'rejected'|'withdrawn'
      created_day INTEGER NOT NULL,
      deadline_day INTEGER NOT NULL
    );

    -- Individual votes on format proposals.
    CREATE TABLE IF NOT EXISTS format_votes (
      proposal_id INTEGER NOT NULL,
      voter_id INTEGER NOT NULL,
      voter_type TEXT NOT NULL,       -- 'club_owner'|'federation_member'
      vote TEXT NOT NULL,             -- 'for'|'against'|'abstain'
      voted_day INTEGER NOT NULL,
      PRIMARY KEY(proposal_id, voter_id)
    );

    CREATE TABLE IF NOT EXISTS world_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
