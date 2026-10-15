// ─── Enums ────────────────────────────────────────────────────────────────────

export type Position = "GK" | "CB" | "LB" | "RB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export const POSITION_CODE: Record<Position, number> = {
  GK: 1,
  CB: 2,
  LB: 3,
  RB: 4,
  DM: 5,
  CM: 6,
  AM: 7,
  LW: 8,
  RW: 9,
  ST: 10,
};

export type CareerPhase = "youth" | "pro_step" | "rise" | "prime" | "late";
export type GameMode = "player" | "manager" | "agent" | "owner";
export type Foot = "L" | "R" | "both";

export type Trait =
  | "professional"
  | "lazy"
  | "hot_headed"
  | "composed"
  | "temperamental"
  | "ambitious"
  | "content"
  | "extrovert"
  | "introvert"
  | "media_friendly"
  | "controversial"
  | "greedy"
  | "generous"
  | "loyal"
  | "mercenary"
  | "determination"
  | "fragile_mentally"
  | "leader"
  | "disruptive"
  | "quick_learner"
  | "late_bloomer"
  | "wonderkid"
  | "natural_fitness"
  | "injury_magnet"
  | "risk_taker"
  | "clean_cut";

export type InjurySeverity = "minor" | "mild" | "moderate" | "serious" | "career_threatening";

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Player {
  id: number;
  name: string;
  nationality: number; // FK → nations
  club: number | null; // FK → clubs, null = free agent
  position: Position;
  secondary_position: Position | null;
  age: number;
  height: number; // cm
  weight: number; // kg
  foot: Foot;

  // Aggregate ratings (1–20)
  ca: number;
  pa: number;
  overall: number;
  attacking: number;
  defending: number;
  technical: number;
  mental: number;
  physical: number;
  speed: number;
  goalkeeping: number; // GK only, 0 for outfield

  // Dynamic state
  stamina: number; // 0.0–1.0
  form: number; // 0.0–1.0
  injury_prone: number; // 1–10

  traits: Trait[]; // max 5
  trait_intensity: Partial<Record<Trait, number>>; // hidden 1–10 per trait

  // Status flags
  injured: boolean;
  injury_duration: number; // days remaining
  injury_type: string | null;
  retired: boolean;
  free_agent: boolean;
  on_transfer_list: boolean;
  transfer_ban: boolean;
  in_prison: boolean;
  prison_duration: number; // days remaining

  // Season stats (reset per season)
  matches: number;
  goals: number;
  assists: number;
  rating: number; // avg match rating
  yellow_cards: number;
  red_cards: number;
  clean_sheets: number; // GK

  // Career stats (cumulative)
  career_matches: number;
  career_goals: number;
  career_assists: number;
  career_trophies: number;

  // Relations
  agent_id: number | null;
  contract_end: number; // in-game day
  wage: number;
}

export interface Club {
  id: number;
  name: string;
  league_id: number;
  reputation: number; // 0–100
  owner_id: number | null;
  manager_id: number | null;

  // Finance
  cash: number;
  debt: number;
  monthly_income: number;
  monthly_costs: number;
  credit_score: number; // 0–100
  consecutive_missed_payments: number;
  bankrupt: boolean;
  slot_id: number;

  // State
  club_morale: number; // 0–100
  fans: number;
  stadium_capacity: number;
  facilities_level: number; // 1–10
  academy_level: number; // 0–10

  // Season stats
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export interface League {
  id: number;
  name: string;
  country_id: number;
  level: number; // 1 = top
  reputation: number;
  continent: string;
  format: "league" | "cup" | "group_knockout";
  slots: number; // number of clubs
}

export interface LeagueSlot {
  id: number;
  league_id: number;
  club_id: number | null;
  status: "occupied" | "available" | "suspended";
  market_value: number;
}

export interface Agent {
  id: number;
  name: string;
  reputation: number;
  cash: number;
  monthly_costs: number;
  credit_score: number;
  consecutive_missed: number;
  bankrupt: boolean;
  office_level: number; // 0 = no office; determines max_clients
  clients: number[]; // player IDs
}

export interface Owner {
  id: number;
  name: string;
  net_worth: number;
  reputation: number;
  credit_score: number;
  clubs: number[]; // club IDs (can own multiple)
}

// ─── Match ────────────────────────────────────────────────────────────────────

export interface MatchResult {
  id: number;
  league_id: number;
  home_club: number;
  away_club: number;
  home_goals: number;
  away_goals: number;
  date: number; // in-game day
  stats: MatchStats;
  scorers: GoalEvent[];
}

export interface MatchStats {
  home_shots: number;
  away_shots: number;
  home_shots_on_target: number;
  away_shots_on_target: number;
  home_possession: number; // 0–100
  away_possession: number;
  home_corners: number;
  away_corners: number;
  home_xg: number;
  away_xg: number;
  home_yellow_cards: number;
  away_yellow_cards: number;
  home_red_cards: number;
  away_red_cards: number;
}

export interface GoalEvent {
  minute: number;
  scorer_id: number;
  assist_id: number | null;
  club_id: number;
  type: "open_play" | "penalty" | "freekick" | "own_goal";
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventTone = "positive" | "critical" | "neutral" | "humor";
export type EventRole = "fan" | "critic" | "media" | "neutral" | "rival";

export interface GameEvent {
  id: string;
  category: string;
  condition: {
    phase?: CareerPhase[];
    requires_trait?: Trait[];
    excludes_trait?: Trait[];
    mode?: GameMode[];
  };
  tone: EventTone;
  priority: number; // 1–5
  max_occurrences: number | null;
  choices: EventChoice[];
}

export interface EventChoice {
  id: string;
  text: string;
  effects: EventEffects;
}

export interface EventEffects {
  money?: number;
  reputation?: number;
  trait_intensity?: Partial<Record<Trait, number>>;
  mental?: number;
  legal_case?: string;
  media_exposure?: number;
}

// ─── World ────────────────────────────────────────────────────────────────────

export interface EgoState {
  mode: GameMode;
  character_id: number;
  age: number;
  alive: boolean;
  legacy_score: number;
  children: number[]; // player IDs
}

export interface WorldState {
  current_day: number; // days since season 1 start
  season: number;
  ego: EgoState;
}
