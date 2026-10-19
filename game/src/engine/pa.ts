import type { Player, Position, Trait } from "../types/index.js";

// ─── CA v3 Calculation (§ PA/CA Engine v3) ────────────────────────────────────

export const OUTFIELD_ATTRS = [
  "finishing",
  "passing",
  "dribbling",
  "heading",
  "crossing",
  "tackling",
  "technique",
  "long_shots",
  "decisions",
  "composure",
  "positioning",
  "vision",
  "anticipation",
  "off_the_ball",
  "work_rate",
  "pace",
  "strength",
  "agility",
  "jumping",
] as const;

export const GK_ATTRS = ["reflexes", "handling", "gk_positioning", "one_on_ones", "command"] as const;

const GK_SHARED_OUTFIELD = [
  "decisions",
  "composure",
  "anticipation",
  "positioning",
  "agility",
  "jumping",
  "strength",
] as const;

const POSITION_SCALE: Record<Position, number> = {
  GK: 1.12,
  CB: 1.16,
  LB: 1.14,
  RB: 1.14,
  DM: 1.15,
  CM: 1.12,
  AM: 1.14,
  LW: 1.15,
  RW: 1.15,
  ST: 1.16,
};

export function calcPlayerCA(attrs: Record<string, number>, pos: Position): number {
  const scale = POSITION_SCALE[pos] ?? 1.14;
  if (pos === "GK") {
    const keys = [...GK_ATTRS, ...GK_SHARED_OUTFIELD];
    const sum = keys.reduce((s, k) => s + (attrs[k] ?? 1), 0);
    return clamp(Math.round((sum / keys.length) * scale), 1, 100);
  }
  const sum = OUTFIELD_ATTRS.reduce((s, k) => s + (attrs[k] ?? 1), 0);
  return clamp(Math.round((sum / OUTFIELD_ATTRS.length) * scale), 1, 100);
}

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
    { key: "positioning", weight: 0.4 },
    { key: "tackling", weight: 0.3 },
    { key: "heading", weight: 0.3 },
  ],
  LB: [
    { key: "positioning", weight: 0.35 },
    { key: "pace", weight: 0.35 },
    { key: "assists", weight: 0.3 },
  ],
  RB: [
    { key: "positioning", weight: 0.35 },
    { key: "pace", weight: 0.35 },
    { key: "assists", weight: 0.3 },
  ],
  DM: [
    { key: "positioning", weight: 0.4 },
    { key: "tackling", weight: 0.35 },
    { key: "decisions", weight: 0.25 },
  ],
  CM: [
    { key: "passing", weight: 0.4 },
    { key: "vision", weight: 0.3 },
    { key: "assists", weight: 0.3 },
  ],
  AM: [
    { key: "vision", weight: 0.35 },
    { key: "passing", weight: 0.35 },
    { key: "assists", weight: 0.3 },
  ],
  LW: [
    { key: "dribbling", weight: 0.4 },
    { key: "pace", weight: 0.35 },
    { key: "goals", weight: 0.25 },
  ],
  RW: [
    { key: "dribbling", weight: 0.4 },
    { key: "pace", weight: 0.35 },
    { key: "goals", weight: 0.25 },
  ],
  ST: [
    { key: "finishing", weight: 0.55 },
    { key: "goals", weight: 0.3 },
    { key: "off_the_ball", weight: 0.15 },
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

function normalise(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function calcPerformanceScore(player: Player, totalMatches: number): number {
  const proxies = PROXY_STATS[player.position] ?? PROXY_STATS["CM"];
  const gamesRatio = Math.min(1, player.matches / Math.max(1, totalMatches));

  let proxyScore = 0;
  for (const { key, weight } of proxies) {
    const raw = player[key] as number;
    const norm =
      key === "rating"
        ? normalise(raw, 0, 10)
        : key === "clean_sheets"
          ? normalise(raw, 0, 15)
          : key === "goals" || key === "assists"
            ? normalise(raw, 0, 30)
            : normalise(raw, 5, 100); // 0–100 attribute
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
  const has = (t: Trait) => player.traits.includes(t);
  const maxGrowthAge = has("late_bloomer") ? 29 : 26;

  const perfScore = calcPerformanceScore(player, totalMatchesThisSeason);
  const expectedPerf = player.ca / Math.max(player.pa, 1);

  let pa_delta = 0;
  if (perfScore > expectedPerf + 0.1) {
    pa_delta = randInt(5, 15);
  } else if (perfScore < expectedPerf - 0.15) {
    pa_delta = -randInt(5, 10);
  }

  // Age multiplier applies only to performance delta (not decay)
  const ageMult = has("late_bloomer") && player.age <= 29 ? Math.max(1.0, ageMultiplier(player.age)) : ageMultiplier(player.age);
  pa_delta = Math.round(pa_delta * ageMult);

  if (player.age > maxGrowthAge && pa_delta > 0) {
    pa_delta = 0;
  }

  // ambitious: +1 extra pa_delta when season rating >= 7.0
  if (has("ambitious") && player.rating >= 7.0) {
    pa_delta += 1;
  }

  // content: caps pa_delta at +1 max
  if (has("content")) {
    pa_delta = Math.min(1, pa_delta);
  }

  // fragile_mentally: doubles negative pa_delta when rating < 6.3
  if (has("fragile_mentally") && player.rating < 6.3 && pa_delta < 0) {
    pa_delta *= 2;
  }

  // Inactivity decay — independent of age mult and performance delta
  if (player.matches < 5) {
    pa_delta -= randInt(10, 25);
  }

  // determination: prevents negative pa_delta when injured or low matches
  if (has("determination") && (player.injured || player.matches < 10)) {
    pa_delta = Math.max(0, pa_delta);
  }

  // Prison decay — independent, applied last
  if (player.in_prison) {
    pa_delta -= randInt(15, 40);
  }

  let ceiling = player.pa_ceiling ?? 100;
  if (has("wonderkid") && player.age <= 21) ceiling = Math.min(100, ceiling + 10);
  const newPA = clamp(player.pa + pa_delta, player.ca, ceiling);

  // CA update: grows from match time + training, decays with age
  let effectiveTraining = trainingQuality;
  if (has("professional")) effectiveTraining = Math.min(100, effectiveTraining + 12);
  if (has("lazy")) effectiveTraining = Math.max(0, effectiveTraining - 15);

  let ca_gain = 0;
  const gamesRatio = player.matches / Math.max(1, totalMatchesThisSeason);
  if (player.age <= maxGrowthAge && gamesRatio > 0.6 && effectiveTraining > 60) {
    ca_gain = randInt(0, 10);
  }
  if (has("professional") && player.age < 27) {
    ca_gain = Math.max(0.5, ca_gain);
  }

  if (ca_gain > 0) {
    if (has("quick_learner")) ca_gain *= 1.25;
    if (has("wonderkid") && player.age <= 20) ca_gain *= 1.3;
    if (has("lazy")) ca_gain *= 0.7;
    if (has("content")) ca_gain *= 0.85;
  }

  let caDelta = Math.round(ca_gain);
  if (player.age > 30) {
    caDelta -= randInt(0, 5);
  }

  const newCA = clamp(player.ca + caDelta, 1, newPA);
  const actualPaDelta = newPA - player.pa;

  return { pa_delta: actualPaDelta, ca_delta: caDelta, new_pa: newPA, new_ca: newCA };
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
