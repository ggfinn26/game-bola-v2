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
export type GameMode = "player" | "manager" | "agent" | "owner" | "pundit";
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

export const EXCLUSIVE_TRAITS: [Trait, Trait][] = [
  ["professional", "lazy"],
  ["hot_headed", "composed"],
  ["ambitious", "content"],
  ["extrovert", "introvert"],
  ["media_friendly", "controversial"],
  ["greedy", "generous"],
  ["loyal", "mercenary"],
  ["determination", "fragile_mentally"],
  ["leader", "disruptive"],
  ["natural_fitness", "injury_magnet"],
  ["risk_taker", "clean_cut"],
  ["wonderkid", "late_bloomer"],
];

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

  // Aggregate ratings (1–100)
  ca: number;
  pa: number;
  pa_ceiling: number;
  overall: number;

  // Technical (8) — 1–100
  finishing: number;
  passing: number;
  dribbling: number;
  heading: number;
  crossing: number;
  tackling: number;
  technique: number;
  long_shots: number;

  // Mental (7) — 1–100
  decisions: number;
  composure: number;
  positioning: number;
  vision: number;
  anticipation: number;
  off_the_ball: number;
  work_rate: number;

  // Physical (4 integer 1–100 + stamina 0.0–1.0 below)
  pace: number;
  strength: number;
  agility: number;
  jumping: number;

  // GK-Specific (5) — 1–100 for GK, 0 for outfield
  reflexes: number;
  handling: number;
  gk_positioning: number;
  one_on_ones: number;
  command: number;

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

export interface SocialReaction {
  role: EventRole;
  handle: string;
  text: string;
}

export interface GameEvent {
  id: string;
  category: string;
  title: string;
  description: string;
  condition: {
    phase?: CareerPhase[];
    requires_trait?: Trait[];
    excludes_trait?: Trait[];
    mode?: GameMode[];
    requires_overall_min?: number;
    requires_overall_max?: number;
  };
  tone: EventTone;
  priority: number; // 1–5
  max_occurrences: number | null;
  social_reactions?: SocialReaction[];
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
  form?: number; // delta -1.0 to +1.0
  stamina?: number; // delta -1.0 to +1.0
  // v3 attr shortcuts — each +1 unit maps to ×2 on two v3 attrs in applyEventChoice()
  mental_boost?: number; // → decisions + composure
  attack_boost?: number; // → finishing + off_the_ball
  tech_boost?: number; // → technique + passing
  phys_boost?: number; // → strength + work_rate
  trait_intensity?: Partial<Record<Trait, number>>;
  add_trait?: Trait;
  remove_trait?: Trait;
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

// ─── Competition Config ───────────────────────────────────────────────────────

export type StageFormat =
  | "round_robin" // standard league table
  | "swiss" // UCL 2024+ style pairing
  | "knockout" // single/two-leg elimination bracket
  | "group_round_robin"; // N groups each doing round-robin internally

export type TiebreakerCriteria =
  | "points"
  | "gd" // overall goal difference
  | "gf" // overall goals for
  | "h2h_points" // head-to-head points between tied teams
  | "h2h_gd"
  | "h2h_gf"
  | "h2h_away_goals" // away goals in H2H (rare post-2021)
  | "away_gd" // away GD across all games
  | "away_gf"
  | "fair_play" // lowest disciplinary points (yellow=1, red=3)
  | "ranking" // pre-tournament seeding/ranking
  | "lots"; // drawing of lots

export interface StageConfig {
  id: string; // e.g. 'group_stage', 'r16', 'final'
  name: string;

  format: StageFormat;

  // Round-robin / group
  num_groups?: number; // 1 = single table, 2+ = multi-group
  teams_per_group?: number;
  legs?: 1 | 2; // single or double round-robin within group/stage

  // Swiss
  rounds?: number; // number of pairings in swiss system

  // Advancement rules
  num_teams?: number; // total teams entering this stage
  advance_per_group?: number; // teams advancing from each group
  advance_best_runners_up?: number; // best N runners-up also advance (e.g., WC groups)
  title_from_position?: number; // which position is "champion" (usually 1)
  promotion_spots?: number; // how many promoted to division above
  relegation_spots?: number; // how many relegated

  // Knockout specifics
  away_goals?: boolean; // away goals rule (false = off, deprecated post-2021 UCL)
  neutral_venue?: boolean; // matches on neutral ground
  extra_time?: boolean; // extra time if draw
  penalties?: boolean; // penalties if still level after ET
  has_third_place?: boolean;

  // Seeding into this stage
  seeding?: "draw" | "ranked" | "pot";
  seed_from_stage?: string; // inherit seeding from prior stage id

  // Tiebreaker order (applied top to bottom)
  tiebreaker?: TiebreakerCriteria[];

  // Card accumulation reset at start of this stage
  reset_card_accumulation?: boolean;
}

// ─── Foreign Player Rules ─────────────────────────────────────────────────────

export interface SpecialForeignSlot {
  name: string; // 'AFC', 'ASEAN', 'U23_foreign', etc.
  extra_count: number;
  criteria: {
    confederation?: string; // e.g. 'AFC'
    region?: string; // e.g. 'ASEAN'
    max_age?: number; // for age-capped slot
    min_age?: number;
  };
}

export interface HomegrownDefinition {
  trained_years: number; // min consecutive/total years
  before_age: number; // must have trained before this age
  scope: "club" | "national"; // trained at this club vs anywhere in country
}

export interface ForeignRuleSet {
  no_limit?: boolean; // if true, all caps below are ignored

  // Hard caps (null = no limit on that specific dimension)
  squad_limit?: number | null;
  matchday_limit?: number | null;
  field_limit?: number | null;
  starting_limit?: number | null;

  // Additional quota slots beyond base cap
  special_slots?: SpecialForeignSlot[];

  // Local player obligations
  local_starting_min?: number; // min locals in starting XI
  u23_local_min_field?: number; // min U23 locals on field at all times

  // Homegrown
  homegrown_min_squad?: number;
  homegrown_definition?: HomegrownDefinition;

  // Naturalized players
  naturalized_counts_as?: "foreign" | "domestic" | "conditional";

  // Exemptions: these nationalities/confederations never counted as foreign
  exempt_confederations?: string[];
  exempt_regions?: string[];

  // Special systems
  permit_system?: string; // e.g. 'GBE' (UK work permit)
  salary_cap_instead?: boolean; // MLS: cap controls foreigners, not nationality
}

// ─── Card Rules ───────────────────────────────────────────────────────────────

export interface CardRules {
  yellow_suspend_at: number; // yellows accumulated before 1-match ban
  red_ban_matches: number; // automatic ban for direct red (default 1)
  violent_conduct_ban: number; // additional ban for violent conduct (default 3)
  dissent_ban?: number;
  // Rounds/stages where yellow accumulation resets
  accumulation_reset_stages?: string[]; // stage ids where count clears
}

// ─── Awards ──────────────────────────────────────────────────────────────────

export type AwardCriteria =
  | "most_goals"
  | "most_assists"
  | "most_goals_assists"
  | "best_avg_rating"
  | "most_clean_sheets"
  | "best_gk_rating"
  | "best_young_player" // under age_limit
  | "manager_of_season"
  | "best_xi_vote";

export interface AwardDefinition {
  id: string;
  name: string;
  criteria: AwardCriteria;
  age_limit?: number; // for young player award
  position_filter?: Position[]; // restrict to position(s)
  prize_money?: number;
}

// ─── Competition Config ───────────────────────────────────────────────────────

export type CompetitionStatus = "active" | "proposed" | "passed" | "superseded";
export type ProposerType = "system" | "club_owner" | "federation";

export interface CompetitionConfig {
  id: number;
  league_id: number;
  season_apply: number; // first season this config is in effect

  stages: StageConfig[];
  foreign_rules: ForeignRuleSet;
  card_rules: CardRules;
  awards: AwardDefinition[];

  max_squad_size: number;
  max_matchday_squad: number;

  proposed_by: number | null;
  proposer_type: ProposerType;
  status: CompetitionStatus;
  created_day: number;
}

// ─── Format Proposals & Voting ────────────────────────────────────────────────

export type ProposalStatus = "open" | "passed" | "rejected" | "withdrawn";
export type VoteChoice = "for" | "against" | "abstain";

export interface FormatProposal {
  id: number;
  league_id: number;
  proposed_by: number;
  proposer_type: ProposerType;
  season_apply: number;
  // Full config JSON stored as TEXT in DB
  proposed_stages: StageConfig[];
  proposed_foreign_rules: ForeignRuleSet;
  proposed_card_rules: CardRules;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  threshold: number; // e.g. 0.51 simple majority, 0.667 supermajority
  status: ProposalStatus;
  created_day: number;
  deadline_day: number;
}

export interface FormatVote {
  proposal_id: number;
  voter_id: number;
  voter_type: "club_owner" | "federation_member";
  vote: VoteChoice;
  voted_day: number;
}
