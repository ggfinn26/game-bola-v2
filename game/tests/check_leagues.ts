import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld } from "../src/engine/worldgen.js";
import { getStandings, rolloverSeason } from "../src/engine/scheduler.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // 1. Check total professional clubs (286 total across 32 pro leagues)
  const proClubs = db.exec("SELECT COUNT(*) FROM clubs WHERE id <= 1000")[0].values[0][0] as number;
  assert.strictEqual(proClubs, 286, `Expected 286 professional clubs, got ${proClubs}`);

  // 2. Check total amateur/tarkan/sunday league clubs (120 tarkan + 24 sunday league = 144)
  const tarkanClubs = db.exec("SELECT COUNT(*) FROM clubs WHERE id > 1000")[0].values[0][0] as number;
  assert.strictEqual(tarkanClubs, 144, `Expected 144 amateur clubs, got ${tarkanClubs}`);

  // 3. Verify all 32 pro leagues have clubs & fixtures
  const expectedProLeagues = [
    1, 2, 5, 3, 4, 6, 7, 8, 9, 11, 17, 18, 19, 21,
    12, 22, 23, 13, 24, 25, 14, 26, 27, 28, 29, 15,
    32, 33, 34, 35, 36, 16,
  ];
  for (const lid of expectedProLeagues) {
    const standings = getStandings(lid);
    assert(standings.length > 0, `League ${lid} should have standings`);
    const fixtures = db.exec("SELECT COUNT(*) FROM match_results WHERE league_id = ?", [lid])[0]?.values[0]?.[0] as number;
    assert(fixtures > 0, `League ${lid} should have fixtures generated`);
  }

  // 4. Verify all 6 youth leagues (30: Indo U21, 31: EPL U21, 40: Indo U18, 41: EPL U18, 45: Indo U15, 46: EPL U15)
  for (const lid of [30, 31, 40, 41, 45, 46]) {
    const fixtures = db.exec("SELECT COUNT(*) FROM match_results WHERE league_id = ?", [lid])[0]?.values[0]?.[0] as number;
    assert(fixtures > 0, `Youth league ${lid} should have fixtures generated`);
  }

  // 5. Verify Tarkan & European Sunday Leagues (101-105: Tarkan, 106-107: Sunday League North & South)
  for (const lid of [101, 102, 103, 104, 105, 106, 107]) {
    const fixtures = db.exec("SELECT COUNT(*) FROM match_results WHERE league_id = ?", [lid])[0]?.values[0]?.[0] as number;
    assert(fixtures > 0, `Amateur league ${lid} should have fixtures generated`);
  }

  // 6. Test Season Rollover & Multi-Tier Promotion/Relegation
  // Setup points for EPL (11) & Championship (17)
  db.run("UPDATE clubs SET points = 15 WHERE league_id = 11");
  db.run("UPDATE clubs SET points = 30 WHERE id = 103");
  db.run("UPDATE clubs SET points = 5 WHERE id = 109");
  db.run("UPDATE clubs SET points = 2 WHERE id = 110");

  db.run("UPDATE clubs SET points = 5 WHERE league_id = 17");
  db.run("UPDATE clubs SET points = 25 WHERE id = 151");
  db.run("UPDATE clubs SET points = 24 WHERE id = 152");

  // Setup points for Ligue 1 (28) & Ligue 2 (29)
  db.run("UPDATE clubs SET points = 10 WHERE league_id = 28");
  db.run("UPDATE clubs SET points = 30 WHERE id = 231"); // PSG champion
  db.run("UPDATE clubs SET points = 2 WHERE id = 237"); // relegated
  db.run("UPDATE clubs SET points = 1 WHERE id = 238"); // relegated

  db.run("UPDATE clubs SET points = 5 WHERE league_id = 29");
  db.run("UPDATE clubs SET points = 28 WHERE id = 239"); // promoted
  db.run("UPDATE clubs SET points = 27 WHERE id = 240"); // promoted

  // Setup points for Süper Lig (35) & TFF 1. Lig (36)
  db.run("UPDATE clubs SET points = 10 WHERE league_id = 35");
  db.run("UPDATE clubs SET points = 35 WHERE id = 271"); // Galatasaray champion
  db.run("UPDATE clubs SET points = 3 WHERE id = 277");
  db.run("UPDATE clubs SET points = 2 WHERE id = 278");

  db.run("UPDATE clubs SET points = 5 WHERE league_id = 36");
  db.run("UPDATE clubs SET points = 29 WHERE id = 279");
  db.run("UPDATE clubs SET points = 28 WHERE id = 280");

  const rolloverRes = rolloverSeason(1, 1);
  assert(rolloverRes.summary.includes("Promosi Premier League"), "Summary should include EPL promotion");
  assert(rolloverRes.summary.includes("Degradasi Championship"), "Summary should include Championship relegation");
  assert(rolloverRes.summary.includes("Promosi Ligue 1"), "Summary should include Ligue 1 promotion");
  assert(rolloverRes.summary.includes("Promosi Süper Lig"), "Summary should include Süper Lig promotion");

  // Verify EPL & Championship promotion/relegation
  const eplPromoted = db.exec("SELECT league_id FROM clubs WHERE id IN (151, 152) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(eplPromoted, [11, 11], "Leicester & Leeds should be promoted to EPL (11)");

  const eplRelegated = db.exec("SELECT league_id FROM clubs WHERE id IN (109, 110) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(eplRelegated, [17, 17], "Newcastle & Aston Villa should be relegated to Championship (17)");

  // Verify Ligue 1 & Ligue 2 promotion/relegation
  const l1Promoted = db.exec("SELECT league_id FROM clubs WHERE id IN (239, 240) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(l1Promoted, [28, 28], "Auxerre & Angers should be promoted to Ligue 1 (28)");

  const l1Relegated = db.exec("SELECT league_id FROM clubs WHERE id IN (237, 238) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(l1Relegated, [29, 29], "Ligue 1 bottom clubs should be relegated to Ligue 2 (29)");

  // Verify Süper Lig & TFF 1. Lig promotion/relegation
  const trPromoted = db.exec("SELECT league_id FROM clubs WHERE id IN (279, 280) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(trPromoted, [35, 35], "Eyupspor & Goztepe should be promoted to Süper Lig (35)");

  const trRelegated = db.exec("SELECT league_id FROM clubs WHERE id IN (277, 278) ORDER BY id")[0].values.map((r) => r[0]);
  assert.deepStrictEqual(trRelegated, [36, 36], "Süper Lig bottom clubs should be relegated to TFF 1. Lig (36)");

  // Verify next season fixtures generated
  for (const lid of [11, 17, 18, 19, 21, 28, 29, 35, 36, 30, 31, 40, 41, 45, 46]) {
    const nextFix = db.exec("SELECT COUNT(*) FROM match_results WHERE league_id = ? AND date > 365", [lid])[0]?.values[0]?.[0] as number;
    assert(nextFix > 0, `Next season fixtures for League ${lid} should be generated`);
  }

  console.log(`✅ All 32 professional leagues + 6 youth leagues + 7 amateur/sunday leagues + multi-tier promotion/relegation verified successfully! Total clubs: ${proClubs + tarkanClubs}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
