/**
 * P4 Tests — TS-13-A, TS-13-B
 * Dinasti: child born with parent bonus, world day not reset during transition
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import { chooseRetirementPath } from "../src/engine/retirement.js";
import { childStartingBonus } from "../src/engine/world.js";
import type { EgoState } from "../src/types/index.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-13-A-1: childStartingBonus formula ────────────────────────────────
  console.log("TS-13-A-1: childStartingBonus formula...");
  {
    // Formula: Math.min(10, Math.floor(legacyScore / 100))
    const cases: [number, number][] = [
      [0, 0],
      [50, 0],
      [99, 0],
      [100, 1],
      [250, 2],
      [500, 5],
      [999, 9],
      [1000, 10],
      [9999, 10], // capped at 10
    ];
    for (const [score, expected] of cases) {
      const result = childStartingBonus(score);
      assert.strictEqual(result, expected, `childStartingBonus(${score}) should be ${expected}, got ${result}`);
    }
    console.log("  ✓ childStartingBonus correct for 9 boundary values");
  }

  // ── TS-13-A-2: Child inherits position, nationality, and gen+1 ───────────
  console.log("TS-13-A-2: Child inheritance from parent...");
  {
    const parentId = createEgoPlayer({ name: "Legenda Tua", position: "ST", age: 34, clubId: 1 });
    db.run(`UPDATE players SET overall = 75, wage = 30000000, career_matches = 250, career_trophies = 4 WHERE id = ?`, [
      parentId,
    ]);

    const legacyScore = 500;
    const egoState: EgoState & { generation: number; personal_cash: number } = {
      mode: "player",
      character_id: parentId,
      age: 34,
      alive: true,
      legacy_score: legacyScore,
      children: [],
      generation: 1,
      personal_cash: 200_000_000,
    };

    const dayBefore = 730;
    const res = chooseRetirementPath(parentId, "child", {
      egoState,
      currentDay: dayBefore,
      childName: "Anak Legenda",
    });

    assert.strictEqual(res.mode, "player", "Transition to child should set mode=player");
    assert(res.newPlayerId && res.newPlayerId > 0, "newPlayerId should be a valid ID");

    const child = db.exec(
      `SELECT name, age, position, nationality, ca, pa, pa_ceiling, traits FROM players WHERE id = ?`,
      [res.newPlayerId],
    )[0]?.values[0] as [string, number, string, number, number, number, number, string] | undefined;
    assert(child, "Child player should exist in DB");

    const [cName, cAge, cPos, cNat, cCa, cPa, cPaCeiling, cTraits] = child;

    // Age must be 16
    assert.strictEqual(cAge, 16, `Child age should be 16, got ${cAge}`);

    // Position inherits from parent (ST)
    assert.strictEqual(cPos, "ST", `Child position should inherit ST from parent, got ${cPos}`);

    // Nationality inherits
    assert.strictEqual(cNat, 1, `Child nationality should be 1 (WNI), got ${cNat}`);

    // CA = 45 + paBonus, PA = 78 + paBonus*2 where paBonus = childStartingBonus(500) = 5
    const expectedBonus = childStartingBonus(legacyScore); // 5
    const expectedCA = Math.min(99, 45 + expectedBonus); // 50
    const expectedPA = Math.min(99, 78 + expectedBonus * 2); // 88
    assert.strictEqual(cCa, expectedCA, `Child CA should be ${expectedCA} (bonus=${expectedBonus}), got ${cCa}`);
    assert.strictEqual(cPa, expectedPA, `Child PA should be ${expectedPA}, got ${cPa}`);
    assert(cPa >= cCa, `Child PA (${cPa}) must >= CA (${cCa})`);

    // PA ceiling >= PA
    assert(cPaCeiling >= cPa, `Child pa_ceiling (${cPaCeiling}) must >= pa (${cPa})`);

    // Child starts with "ambitious" trait by default
    const traits: string[] = JSON.parse(cTraits || "[]");
    assert(traits.includes("ambitious"), `Child should start with "ambitious" trait, got ${JSON.stringify(traits)}`);

    console.log(`  ✓ Child "${cName}" age=${cAge} pos=${cPos} ca=${cCa} pa=${cPa} traits=${JSON.stringify(traits)}`);
  }

  // ── TS-13-A-3: Parent marked retired after transition ─────────────────────
  console.log("TS-13-A-3: Parent retirement after dynasty transition...");
  {
    const parent2Id = createEgoPlayer({ name: "Veteran Pensiun", position: "CM", age: 30, clubId: 2 });
    const egoState2: EgoState = {
      mode: "player",
      character_id: parent2Id,
      age: 30,
      alive: true,
      legacy_score: 200,
      children: [],
    };

    const res2 = chooseRetirementPath(parent2Id, "child", { egoState: egoState2, currentDay: 500 });

    const parentRow = db.exec(`SELECT retired, club FROM players WHERE id = ?`, [parent2Id])[0]?.values[0] as [
      number,
      number | null,
    ];
    assert.strictEqual(parentRow[0], 1, "Parent should be retired=1 after transition");
    assert.strictEqual(parentRow[1], null, "Parent should have club=NULL after retirement");

    // Child exists and is NOT retired
    const childRetired = db.exec(`SELECT retired FROM players WHERE id = ?`, [res2.newPlayerId])[0]?.values[0]?.[0];
    assert.strictEqual(childRetired, 0, "Child should not be retired");
    console.log(`  ✓ Parent ${parent2Id} retired, club=NULL | Child ${res2.newPlayerId} active`);
  }

  // ── TS-13-A-4: Generation counter increments ─────────────────────────────
  console.log("TS-13-A-4: Generation counter...");
  {
    const p3Id = createEgoPlayer({ name: "Gen 2 Player", position: "LW", age: 29, clubId: 3 });
    const egoGen2: EgoState & { generation: number } = {
      mode: "player",
      character_id: p3Id,
      age: 29,
      alive: true,
      legacy_score: 300,
      children: [],
      generation: 2,
    };

    const res3 = chooseRetirementPath(p3Id, "child", { egoState: egoGen2, currentDay: 1000 });

    // Read newEgo from world_state
    const wsRaw = db.exec(`SELECT value FROM world_state WHERE key = 'world_state'`)[0]?.values[0]?.[0] as string;
    const ws = JSON.parse(wsRaw);
    assert.strictEqual(ws.ego.generation, 3, `Generation should be 3 (parent was gen 2), got ${ws.ego.generation}`);
    assert(ws.ego.children.includes(res3.newPlayerId), "Parent's children array should include new child ID");
    console.log(`  ✓ Generation 2 → 3 | children array includes ${res3.newPlayerId}`);
  }

  // ── TS-13-B-1: World day preserved — not reset during transition ──────────
  console.log("TS-13-B-1: World day not reset during dynasty transition...");
  {
    const p4Id = createEgoPlayer({ name: "Mid-Season Parent", position: "DM", age: 28, clubId: 1 });
    const currentDay = 547; // mid-second season

    // Write world_state with known day
    db.run(`INSERT OR REPLACE INTO world_state (key, value) VALUES ('world_state', ?)`, [
      JSON.stringify({
        current_day: currentDay,
        season: 2,
        ego: { mode: "player", character_id: p4Id, age: 28, alive: true, legacy_score: 400, children: [] },
      }),
    ]);

    const egoState4: EgoState = {
      mode: "player",
      character_id: p4Id,
      age: 28,
      alive: true,
      legacy_score: 400,
      children: [],
    };

    chooseRetirementPath(p4Id, "child", { egoState: egoState4, currentDay });

    // Verify world_state.current_day is preserved
    const wsAfter = JSON.parse(
      db.exec(`SELECT value FROM world_state WHERE key = 'world_state'`)[0]?.values[0]?.[0] as string,
    );
    assert.strictEqual(
      wsAfter.current_day,
      currentDay,
      `World day should remain ${currentDay} after transition, got ${wsAfter.current_day}`,
    );
    assert.strictEqual(wsAfter.ego.mode, "player", "New ego mode should be player");
    assert(wsAfter.ego.age === 16, `New ego age should be 16, got ${wsAfter.ego.age}`);
    console.log(`  ✓ World day ${currentDay} preserved after transition | New ego age=16`);
  }

  // ── TS-13-B-2: Match fixtures still exist after transition ────────────────
  console.log("TS-13-B-2: Existing fixtures intact after transition...");
  {
    const fixturesBefore = db.exec(`SELECT COUNT(*) FROM match_results WHERE home_goals IS NULL`)[0]
      ?.values[0]?.[0] as number;

    const p5Id = createEgoPlayer({ name: "Transisi Cepat", position: "CB", age: 31, clubId: 1 });
    const egoState5: EgoState = {
      mode: "player",
      character_id: p5Id,
      age: 31,
      alive: true,
      legacy_score: 100,
      children: [],
    };
    chooseRetirementPath(p5Id, "child", { egoState: egoState5, currentDay: 100 });

    const fixturesAfter = db.exec(`SELECT COUNT(*) FROM match_results WHERE home_goals IS NULL`)[0]
      ?.values[0]?.[0] as number;
    assert(fixturesAfter > 0, "Fixtures should still exist after dynasty transition");
    assert.strictEqual(
      fixturesAfter,
      fixturesBefore,
      `Fixture count should be unchanged: ${fixturesBefore} → ${fixturesAfter}`,
    );
    console.log(`  ✓ ${fixturesAfter} unplayed fixtures intact after transition`);
  }

  console.log("\n✅ All P4 Dynasty tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
