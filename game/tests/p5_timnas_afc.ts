/**
 * P5 Tests — TS-07-B (AFC group 12 matches), TS-07-C (naturalisasi), TS-07-D (timnas squad)
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import { AFC_LEAGUE_ID, getAFCGroupStandings } from "../src/engine/afc.js";
import {
  rollTimnasSquad,
  getTimnasSquad,
  canNaturalize,
  naturalize,
  CALLUP_THRESHOLD,
  SQUAD_SIZE,
} from "../src/engine/timnas.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-07-B: AFC group stage — 12 matches, 2 groups of 4 ─────────────────
  console.log("TS-07-B: AFC Champions League group stage...");
  {
    const groupMatches = db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = 'afc_group'`, [
      AFC_LEAGUE_ID,
    ])[0]?.values[0]?.[0] as number;
    // 2 groups × 4 teams × single round-robin = 6 matches per group = 12 total
    assert.strictEqual(groupMatches, 12, `AFC group stage should have 12 matches, got ${groupMatches}`);

    // Groups 1 and 2 each have 4 unique clubs
    for (const grp of [1, 2]) {
      const clubs = db.exec(
        `SELECT COUNT(DISTINCT home_club) + COUNT(DISTINCT away_club)
         FROM match_results WHERE league_id = ? AND stage_id = 'afc_group' AND group_num = ?`,
        [AFC_LEAGUE_ID, grp],
      )[0]?.values[0]?.[0] as number;
      // 4 teams appear as home and away — DISTINCT might count same team twice
      const homeClubs =
        db.exec(
          `SELECT DISTINCT home_club FROM match_results WHERE league_id = ? AND stage_id = 'afc_group' AND group_num = ?`,
          [AFC_LEAGUE_ID, grp],
        )[0]?.values ?? [];
      const awayClubs =
        db.exec(
          `SELECT DISTINCT away_club FROM match_results WHERE league_id = ? AND stage_id = 'afc_group' AND group_num = ?`,
          [AFC_LEAGUE_ID, grp],
        )[0]?.values ?? [];
      const allClubs = new Set([...homeClubs.map((r) => r[0]), ...awayClubs.map((r) => r[0])]);
      assert.strictEqual(allClubs.size, 4, `AFC group ${grp} should have exactly 4 clubs, got ${allClubs.size}`);
    }
    console.log("  ✓ AFC: 12 group matches, 2 groups × 4 clubs each");

    // Simulate all group matches, then check standings
    db.run(
      `UPDATE match_results SET home_goals = 1, away_goals = 0
       WHERE league_id = ? AND stage_id = 'afc_group' AND home_goals IS NULL`,
      [AFC_LEAGUE_ID],
    );
    const standings = getAFCGroupStandings();
    assert(standings.length > 0, "AFC group standings should be non-empty after matches played");
    // Each group has 4 clubs → 8 standing entries total
    assert.strictEqual(standings.length, 8, `Expected 8 standing entries (2 groups × 4), got ${standings.length}`);
    console.log(`  ✓ AFC standings: ${standings.length} entries (2 groups × 4 clubs)`);
  }

  // ── TS-07-D: Timnas squad — 23 WNI players, all overall ≥ threshold ───────
  console.log("TS-07-D: Timnas squad selection...");
  {
    // Ensure enough eligible WNI players exist (worldgen seeds Indonesia players)
    const eligibleCount = db.exec(
      `SELECT COUNT(*) FROM players
       WHERE nationality = 1 AND overall >= ? AND injured = 0
         AND in_prison = 0 AND retired = 0 AND club IS NOT NULL`,
      [CALLUP_THRESHOLD],
    )[0]?.values[0]?.[0] as number;

    if (eligibleCount >= SQUAD_SIZE) {
      const squad = rollTimnasSquad();
      assert.strictEqual(squad.length, SQUAD_SIZE, `Squad should have ${SQUAD_SIZE} players, got ${squad.length}`);

      // All players are WNI
      for (const pid of squad) {
        const nat = db.exec(`SELECT nationality FROM players WHERE id = ?`, [pid])[0]?.values[0]?.[0] as number;
        assert.strictEqual(nat, 1, `Squad player ${pid} should have nationality=1 (WNI)`);
      }

      // All players meet threshold
      for (const pid of squad) {
        const ovr = db.exec(`SELECT overall FROM players WHERE id = ?`, [pid])[0]?.values[0]?.[0] as number;
        assert(ovr >= CALLUP_THRESHOLD, `Squad player ${pid} overall ${ovr} should be >= ${CALLUP_THRESHOLD}`);
      }

      // No duplicates
      assert.strictEqual(new Set(squad).size, squad.length, "Squad should have no duplicate player IDs");

      // getTimnasSquad returns same data
      const stored = getTimnasSquad();
      assert.deepStrictEqual(stored, squad, "getTimnasSquad should return same as rollTimnasSquad result");

      console.log(`  ✓ Squad: ${squad.length} players, all WNI, all overall ≥ ${CALLUP_THRESHOLD}, no duplicates`);
    } else {
      console.log(
        `  ⚠ Only ${eligibleCount} eligible WNI players (< ${SQUAD_SIZE}) — squad capped at ${eligibleCount}`,
      );
      const squad = rollTimnasSquad();
      assert(squad.length <= SQUAD_SIZE, `Squad should not exceed ${SQUAD_SIZE}`);
      assert.strictEqual(squad.length, eligibleCount, "Squad size should equal eligible count when below 23");
      console.log(`  ✓ Squad: ${squad.length} players (partial squad)`);
    }
  }

  // ── TS-07-C: Naturalisasi — canNaturalize checks + naturalize works ────────
  console.log("TS-07-C: Naturalisasi...");
  {
    // Create a foreign player (nationality=2) in Liga 1 with enough contract
    const foreignId = createEgoPlayer({ name: "Asing Player", position: "ST", age: 26, clubId: 1 });
    db.run(`UPDATE players SET nationality = 2, overall = 65, contract_end = 1000 WHERE id = ?`, [foreignId]);

    const currentDay = 100;

    // Should be eligible
    const check = canNaturalize(foreignId, currentDay);
    assert(check.ok, `Foreign player in Liga 1 (nationality=2, overall=65) should be eligible: ${check.reason}`);
    console.log("  ✓ canNaturalize: foreign player in Liga 1 eligible");

    // Naturalize
    const msg = naturalize(foreignId);
    assert(msg.includes("Indonesia"), "Naturalization message should mention Indonesia");

    const natAfter = db.exec(`SELECT nationality FROM players WHERE id = ?`, [foreignId])[0]?.values[0]?.[0] as number;
    assert.strictEqual(natAfter, 1, `Nationality should be 1 (WNI) after naturalize, got ${natAfter}`);
    console.log("  ✓ naturalize: nationality changed from 2 → 1");

    // Already WNI — canNaturalize returns false
    const checkAfter = canNaturalize(foreignId, currentDay);
    assert(!checkAfter.ok, "Already-WNI player should not be re-naturalizable");
    assert(checkAfter.reason?.includes("WNI"), `Reason should mention WNI: ${checkAfter.reason}`);
    console.log("  ✓ canNaturalize: idempotent — already WNI blocks re-naturalization");

    // Below overall threshold (< 40) → not eligible
    const lowOverallId = createEgoPlayer({ name: "Low Overall", position: "CB", age: 24, clubId: 1 });
    db.run(`UPDATE players SET nationality = 3, overall = 30, contract_end = 1000 WHERE id = ?`, [lowOverallId]);
    const checkLow = canNaturalize(lowOverallId, currentDay);
    assert(!checkLow.ok, "Overall < 40 should block naturalization");
    console.log("  ✓ canNaturalize: overall < 40 blocked");

    // Contract too short (< 90 days remaining) → not eligible
    const shortContractId = createEgoPlayer({ name: "Short Contract", position: "GK", age: 28, clubId: 1 });
    db.run(
      `UPDATE players SET nationality = 2, overall = 55, contract_end = ? WHERE id = ?`,
      [currentDay + 30, shortContractId], // only 30 days left
    );
    const checkShort = canNaturalize(shortContractId, currentDay);
    assert(!checkShort.ok, "Short contract (< 90 days) should block naturalization");
    console.log("  ✓ canNaturalize: contract < 90 days blocked");
  }

  console.log("\n✅ All P5 Timnas & AFC tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
