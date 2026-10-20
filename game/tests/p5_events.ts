/**
 * P5 Tests — TS-05-A, TS-05-B, TS-05-C, TS-05-D
 * Events: phase gate, milestone trigger, trait gate, choice effect on form
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import { EVENTS, rollEventForPlayer, applyEventChoice } from "../src/engine/events.js";
import type { Player } from "../src/types/index.js";

// Minimal player object for rollEventForPlayer (mirrors scheduler.getPlayer shape)
function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: 1,
    name: "Test",
    nationality: 1,
    club: 1,
    position: "ST",
    secondary_position: null,
    age: 22,
    height: 175,
    weight: 70,
    foot: "R",
    ca: 60,
    pa: 70,
    pa_ceiling: 90,
    overall: 60,
    finishing: 60,
    passing: 55,
    dribbling: 58,
    heading: 50,
    crossing: 45,
    tackling: 30,
    technique: 60,
    long_shots: 50,
    decisions: 58,
    composure: 55,
    positioning: 60,
    vision: 55,
    anticipation: 58,
    off_the_ball: 62,
    work_rate: 60,
    pace: 65,
    strength: 55,
    agility: 60,
    jumping: 55,
    reflexes: 0,
    handling: 0,
    gk_positioning: 0,
    one_on_ones: 0,
    command: 0,
    stamina: 0.85,
    form: 0.65,
    injury_prone: 3,
    traits: [],
    trait_intensity: {},
    injured: false,
    injury_duration: 0,
    injury_type: null,
    retired: false,
    free_agent: false,
    on_transfer_list: false,
    transfer_ban: false,
    in_prison: false,
    prison_duration: 0,
    matches: 20,
    goals: 5,
    assists: 3,
    rating: 7.0,
    yellow_cards: 1,
    red_cards: 0,
    clean_sheets: 0,
    career_matches: 60,
    career_goals: 15,
    career_assists: 10,
    career_trophies: 0,
    agent_id: null,
    contract_end: 730,
    wage: 10_000_000,
    ...overrides,
  } as unknown as Player;
}

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-05-A: Phase gate — education_exam_conflict only in youth/pro_step ──
  console.log("TS-05-A: Phase gate check...");
  {
    const ev = EVENTS.find((e) => e.id === "education_exam_conflict");
    assert(ev, "education_exam_conflict event must exist");
    assert.deepStrictEqual(ev.condition.phase, ["youth", "pro_step"]);

    // age=17 (youth): event must be eligible
    const youthPlayer = makePlayer({ age: 17 });
    let foundInYouth = false;
    for (let i = 0; i < 500; i++) {
      const rolled = rollEventForPlayer(youthPlayer, {});
      if (rolled?.id === "education_exam_conflict") {
        foundInYouth = true;
        break;
      }
    }
    assert(foundInYouth, "education_exam_conflict should be rollable for youth player (age=17)");
    console.log("  ✓ age=17 (youth): education_exam_conflict can roll");

    // age=35 (late): event must NEVER appear
    const latePlayer = makePlayer({
      age: 35,
      career_matches: 300,
      career_goals: 50, // avoid milestone triggers
      matches: 20, // avoid bench_warmer
    });
    for (let i = 0; i < 300; i++) {
      const rolled = rollEventForPlayer(latePlayer, {});
      assert(
        rolled?.id !== "education_exam_conflict",
        "education_exam_conflict must not roll for late-phase player (age=35)",
      );
    }
    console.log("  ✓ age=35 (late): education_exam_conflict never rolled in 300 attempts");
  }

  // ── TS-05-B: Milestone — bench_warmer triggers when matches < 5 ───────────
  console.log("TS-05-B: Milestone bench_warmer trigger...");
  {
    // Actual condition: matches <= 1 (not < 5 — verified from source)
    const benchPlayer = makePlayer({
      age: 25, // >= 20
      matches: 1, // <= 1
      injured: false,
      club: 1,
      career_matches: 60,
    });
    // rollEventForPlayer checks milestones first — fires deterministically when condition met
    let found = false;
    for (let i = 0; i < 50; i++) {
      const rolled = rollEventForPlayer(benchPlayer, {});
      if (rolled?.id === "milestone_bench_warmer") {
        found = true;
        break;
      }
    }
    assert(found, "milestone_bench_warmer should fire for player with matches=1, age=25");
    console.log("  ✓ milestone_bench_warmer triggered for player with 1 match this season");

    // max_occurrences=2: when count=2, milestone path skipped AND excluded from pool
    for (let i = 0; i < 50; i++) {
      const r = rollEventForPlayer(benchPlayer, { milestone_bench_warmer: 2 });
      assert(
        r?.id !== "milestone_bench_warmer",
        "milestone_bench_warmer must not fire when occurredCounts=2 (>= max_occurrences)",
      );
    }
    console.log("  ✓ milestone_bench_warmer blocked when occurredCounts >= max_occurrences (2)");
  }

  // ── TS-05-C: Trait gate — training_extra_finishing excluded for lazy ───────
  console.log("TS-05-C: Trait gate (excludes_trait)...");
  {
    const ev = EVENTS.find((e) => e.id === "training_extra_finishing");
    assert(ev, "training_extra_finishing must exist");
    assert(ev.condition.excludes_trait?.includes("lazy"), "Must exclude lazy trait");

    // With lazy trait: never rolls training_extra_finishing
    const lazyPlayer = makePlayer({ traits: ["lazy"] as any });
    for (let i = 0; i < 300; i++) {
      const rolled = rollEventForPlayer(lazyPlayer, {});
      assert(rolled?.id !== "training_extra_finishing", "training_extra_finishing must not roll for lazy player");
    }
    console.log("  ✓ lazy player: training_extra_finishing never rolled in 300 attempts");

    // Without lazy: can roll
    const diligentPlayer = makePlayer({ traits: [] });
    let found = false;
    for (let i = 0; i < 1000; i++) {
      const rolled = rollEventForPlayer(diligentPlayer, {});
      if (rolled?.id === "training_extra_finishing") {
        found = true;
        break;
      }
    }
    assert(found, "training_extra_finishing should be rollable for non-lazy player");
    console.log("  ✓ non-lazy player: training_extra_finishing rolled successfully");
  }

  // ── TS-05-D: Choice effect — form changes after applyEventChoice ──────────
  console.log("TS-05-D: Choice effect on player form...");
  {
    const pid = createEgoPlayer({ name: "EventTest", position: "ST", age: 17, clubId: 1 });
    const initialForm = 0.6;
    db.run(`UPDATE players SET form = ?, age = 17 WHERE id = ?`, [initialForm, pid]);

    // "focus_match" choice of education_exam_conflict has effects: { form: 0.08, trait_intensity: { ambitious: 2, professional: 1 } }
    applyEventChoice(pid, "education_exam_conflict", "focus_match");

    const newForm = db.exec(`SELECT form FROM players WHERE id = ?`, [pid])[0]?.values[0]?.[0] as number;
    assert(
      Math.abs(newForm - (initialForm + 0.08)) < 0.01,
      `Form should increase by ~0.08: expected ${(initialForm + 0.08).toFixed(2)}, got ${newForm}`,
    );
    console.log(`  ✓ focus_match: form ${initialForm} → ${newForm} (+0.08)`);

    // Apply "take_exam" choice: effects: { mental_boost: 1, form: -0.05, trait_intensity: { clean_cut: 2 } }
    db.run(`UPDATE players SET form = ? WHERE id = ?`, [0.7, pid]);
    applyEventChoice(pid, "education_exam_conflict", "take_exam");
    const formAfterExam = db.exec(`SELECT form FROM players WHERE id = ?`, [pid])[0]?.values[0]?.[0] as number;
    assert(
      Math.abs(formAfterExam - (0.7 - 0.05)) < 0.01,
      `take_exam form should drop -0.05: expected 0.65, got ${formAfterExam}`,
    );
    console.log(`  ✓ take_exam: form 0.70 → ${formAfterExam} (-0.05)`);
  }

  console.log("\n✅ All P5 Events tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
