/**
 * P3 Tests — TS-12-B (exportDB/loadDB roundtrip)
 * TS-12-A (slot key isolation) is browser-only (IndexedDB) — verified by code inspection.
 * slotKey(n) = "slot0"|"slot1"|"slot2" — distinct keys by construction.
 */
import assert from "node:assert";
import { initDB, getDB, exportDB, loadDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-12-B-1: exportDB produces non-empty Uint8Array ────────────────────
  console.log("TS-12-B-1: exportDB produces valid bytes...");
  {
    const bytes = exportDB();
    assert(bytes instanceof Uint8Array, "exportDB should return Uint8Array");
    assert(bytes.length > 1000, `Export too small: ${bytes.length} bytes (expected >1000)`);
    // SQLite magic header: first 16 bytes = "SQLite format 3\0"
    const header = String.fromCharCode(...bytes.slice(0, 15));
    assert(header === "SQLite format 3", `Invalid SQLite header: "${header}"`);
    console.log(`  ✓ Valid SQLite export, ${(bytes.length / 1024).toFixed(0)} KB`);
  }

  // ── TS-12-B-2: Known mutation persists after export → loadDB ─────────────
  console.log("TS-12-B-2: Export → loadDB roundtrip preserves state...");
  {
    // Mutate: create a uniquely named ego player
    const pid = createEgoPlayer({ name: "SAVE_TEST_PLAYER", position: "CM", age: 21, clubId: 1 });
    db.run(`UPDATE players SET career_goals = 999 WHERE id = ?`, [pid]);

    // Confirm it exists in current DB
    const before = db.exec(`SELECT name, career_goals FROM players WHERE id = ?`, [pid])[0]?.values[0];
    assert.deepStrictEqual(before, ["SAVE_TEST_PLAYER", 999], "Player should exist before export");

    // Export and reload
    const snapshot = exportDB();
    await loadDB(snapshot);
    const db2 = getDB();

    // State must survive
    const after = db2.exec(`SELECT name, career_goals FROM players WHERE id = ?`, [pid])[0]?.values[0];
    assert.deepStrictEqual(
      after,
      ["SAVE_TEST_PLAYER", 999],
      `Player not found after loadDB — got: ${JSON.stringify(after)}`,
    );

    // Club count must match
    const clubsBefore = db.exec(`SELECT COUNT(*) FROM clubs`)[0]?.values[0]?.[0] as number;
    const clubsAfter = db2.exec(`SELECT COUNT(*) FROM clubs`)[0]?.values[0]?.[0] as number;
    assert.strictEqual(clubsAfter, clubsBefore, `Club count changed: ${clubsBefore} → ${clubsAfter}`);
    console.log(`  ✓ Player + ${clubsAfter} clubs preserved after export/load`);
  }

  // ── TS-12-B-3: Two independent exports have different bytes ──────────────
  // (basis for slot isolation — different DB states → different snapshots)
  // (basis for slot isolation — different seeds → different loadDB state)
  console.log("TS-12-B-3: Two seeds produce independently restorable states...");
  {
    await initDB();
    generateWorld(1);
    const snap1 = exportDB();
    const firstSeed1 = getDB().exec(`SELECT name, ca FROM players ORDER BY id LIMIT 1`)[0]?.values[0] as [
      string,
      number,
    ];

    await initDB();
    generateWorld(999);
    const snap999 = exportDB();
    const firstSeed999 = getDB().exec(`SELECT name, ca FROM players ORDER BY id LIMIT 1`)[0]?.values[0] as [
      string,
      number,
    ];

    assert(
      firstSeed1[0] !== firstSeed999[0] || firstSeed1[1] !== firstSeed999[1],
      `Seeds 1 and 999 produced identical first player: ${JSON.stringify(firstSeed1)}`,
    );

    // Load snap1 and verify it restores seed-1 data (not seed-999)
    await loadDB(snap1);
    const restored = getDB().exec(`SELECT name, ca FROM players ORDER BY id LIMIT 1`)[0]?.values[0] as [string, number];
    assert.deepStrictEqual(restored, firstSeed1, `loadDB(snap1) should restore seed-1 first player`);
    console.log(
      `  ✓ Seed 1: ${firstSeed1[0]} ca=${firstSeed1[1]} | Seed 999: ${firstSeed999[0]} ca=${firstSeed999[1]}`,
    );
    console.log("  ✓ loadDB(snap1) correctly restores seed-1 state independently");
  }

  // ── TS-12-B-4: Schema intact after loadDB (all tables exist) ─────────────
  console.log("TS-12-B-4: Schema completeness after loadDB...");
  {
    await initDB();
    generateWorld(42);
    const snap = exportDB();
    await loadDB(snap);
    const db3 = getDB();

    const REQUIRED_TABLES = [
      "players",
      "clubs",
      "agents",
      "owners",
      "leagues",
      "match_results",
      "world_state",
      "competition_configs",
      "card_accumulation",
      "player_stats",
    ];
    const existing = new Set(
      (db3.exec(`SELECT name FROM sqlite_master WHERE type='table'`)[0]?.values ?? []).map((r) => r[0] as string),
    );
    for (const t of REQUIRED_TABLES) {
      assert(existing.has(t), `Table '${t}' missing after loadDB`);
    }
    console.log(`  ✓ All ${REQUIRED_TABLES.length} required tables present after loadDB`);
  }

  console.log("\n✅ All P3 Save tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
