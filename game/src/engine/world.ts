import type { WorldState, EgoState, GameMode } from "../types/index.js";

export const DAYS_PER_SEASON = 365;

export function dayToSeason(day: number): number {
  return Math.floor(day / DAYS_PER_SEASON) + 1;
}

export function careerPhase(age: number): import("../types/index.js").CareerPhase {
  if (age <= 18) return "youth";
  if (age <= 23) return "pro_step";
  if (age <= 27) return "rise";
  if (age <= 32) return "prime";
  return "late";
}

export function createWorld(mode: GameMode, characterId: number, startAge: number): WorldState {
  return {
    current_day: 0,
    season: 1,
    ego: {
      mode,
      character_id: characterId,
      age: startAge,
      alive: true,
      legacy_score: 0,
      children: [],
    },
  };
}

export function advanceDay(state: WorldState): WorldState {
  const next_day = state.current_day + 1;
  return {
    ...state,
    current_day: next_day,
    season: dayToSeason(next_day),
  };
}

export function calcLegacyScore(
  ego: EgoState,
  stats: {
    career_matches: number;
    career_goals: number;
    career_trophies: number;
    career_awards: number;
    net_worth_peak: number;
    prison_days: number;
    scandal_hits: number;
  },
): number {
  return Math.round(
    stats.career_matches * 0.1 +
      stats.career_goals * 2 +
      stats.career_trophies * 50 +
      stats.career_awards * 30 +
      stats.net_worth_peak / 1_000_000 -
      stats.prison_days * 0.5 -
      stats.scandal_hits * 10,
  );
}

export function childStartingBonus(legacyScore: number): number {
  return Math.min(10, Math.floor(legacyScore / 100));
}
