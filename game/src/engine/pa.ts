import type { Player } from "../types/index.js";

// ─── Position proxy stat weights ─────────────────────────────────────────────

interface ProxyStat {
  key: keyof Player;
  weight: number;
}

const PROXY_STATS: Record<string, ProxyStat[]> = {
  GK: [
    { key: "clean_sheets", weight: 0.5 },
    { key: "rating", weight: 0.5 },
  ],
  CB: [
    { key: "defending", weight: 0.5 },
    { key: "physical", weight: 0.3 },
    { key: "mental", weight: 0.2 },
  ],
  LB: [
    { key: "defending", weight: 0.4 },
    { key: "speed", weight: 0.3 },
    { key: "assists", weight: 0.3 },
  ],
  RB: [
    { key: "defending", weight: 0.4 },
    { key: "speed", weight: 0.3 },
    { key: "assists", weight: 0.3 },
  ],
  DM: [
    { key: "technical", weight: 0.4 },
    { key: "defending", weight: 0.35 },
    { key: "mental", weight: 0.25 },
  ],
  CM: [
    { key: "technical", weight: 0.4 },
    { key: "mental", weight: 0.3 },
    { key: "assists", weight: 0.3 },
  ],
  AM: [
    { key: "attacking", weight: 0.4 },
    { key: "technical", weight: 0.3 },
    { key: "assists", weight: 0.3 },
  ],
  LW: [
    { key: "attacking", weight: 0.5 },
    { key: "speed", weight: 0.3 },
    { key: "goals", weight: 0.2 },
  ],
  RW: [
    { key: "attacking", weight: 0.5 },
    { key: "speed", weight: 0.3 },
    { key: "goals", weight: 0.2 },
  ],
  ST: [
    { key: "attacking", weight: 0.6 },
    { key: "goals", weight: 0.3 },
    { key: "physical", weight: 0.1 },
  ],
};

const AGE_MULTIPLIER: [number, number, number][] = [
  // [minAge, maxAge, multiplier]
  [15, 20, 1.5],
  [21, 27, 1.0],
  [28, 31, 0.5],
  [32, 99, 0.3],
];

function ageMultiplier(age: number): number {
  for (const [min, max, mult] of AGE_MULTIPLIER) {
    if (age >= min && age <= max) return mult;
  }
  return 0.3;
}

// Normalise a raw stat value to 0.0–1.0 relative to expected range
function normalise(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function calcPerformanceScore(player: Player, totalMatches: number): number {
  const proxies = PROXY_STATS[player.position] ?? PROXY_STATS["CM"];
  const gamesRatio = Math.min(1, player.matches / Math.max(1, totalMatches));

  let proxyScore = 0;
  for (const { key, weight } of proxies) {
    const raw = player[key] as number;
    // Rough normalise: ratings 1–20 → 0–1, counts per 30 matches → 0–1
    const norm =
      key === "rating"
        ? normalise(raw, 0, 10)
        : key === "clean_sheets"
          ? normalise(raw, 0, 15)
          : key === "goals" || key === "assists"
            ? normalise(raw, 0, 30)
            : normalise(raw, 1, 20); // aggregate attribute
    proxyScore += norm * weight;
  }

  return proxyScore * 0.5 + player.form * 0.3 + gamesRatio * 0.2;
}

// ─── Season recalculation ─────────────────────────────────────────────────────

export interface PAUpdateResult {
  pa_delta: number;
  ca_delta: number;
  new_pa: number;
  new_ca: number;
}

export function recalcPACA(player: Player, totalMatchesThisSeason: number, trainingQuality: number): PAUpdateResult {
  const perfScore = calcPerformanceScore(player, totalMatchesThisSeason);
  const expectedPerf = player.ca / Math.max(player.pa, 1);

  let paDelta = 0;
  if (perfScore > expectedPerf + 0.1) {
    paDelta = randInt(1, 3);
  } else if (perfScore < expectedPerf - 0.15) {
    paDelta = -randInt(1, 2);
  }

  // Inactivity decay
  if (player.matches < 5) {
    paDelta = Math.min(paDelta, 0) - randInt(2, 5);
  }

  // Prison decay
  if (player.in_prison) {
    paDelta -= randInt(3, 8);
  }

  // Age multiplier
  paDelta = Math.round(paDelta * ageMultiplier(player.age));

  // late_bloomer overrides age penalty
  if (player.traits.includes("late_bloomer") && player.age >= 28) {
    paDelta = Math.round(paDelta * 1.2);
    if (paDelta < 0) paDelta = 0;
  }

  // determination prevents PA drop during injury (simplified: once per career via event)
  if (player.injured && player.traits.includes("determination")) {
    paDelta = Math.max(0, paDelta);
  }

  // quick_learner bonus on CA growth
  const quickLearnerBonus = player.traits.includes("quick_learner") ? 0.15 : 0;

  let caDelta = 0;
  const gamesRatio = player.matches / Math.max(1, totalMatchesThisSeason);
  if (gamesRatio > 0.6 && trainingQuality > 60) {
    caDelta = randInt(0, 2) + Math.round(quickLearnerBonus * 2);
  }
  if (player.age > 30) {
    caDelta -= randInt(0, 1);
  }

  const newPA = clamp(player.pa + paDelta, player.ca, 20);
  const newCA = clamp(player.ca + caDelta, 1, newPA);

  return { pa_delta: paDelta, ca_delta: caDelta, new_pa: newPA, new_ca: newCA };
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
