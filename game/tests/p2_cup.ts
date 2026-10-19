/**
 * P2 Tests — TS-07-A
 * Piala Indonesia: 32 clubs, 5 rounds, correct match counts, trophy awarded
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld } from "../src/engine/worldgen.js";
import { checkCupProgression, CUP_LEAGUE_ID } from "../src/engine/cup.js";

function simulateRound(leagueId: number, stage: string): void {
  const db = getDB();
  const pending =
    db.exec(
      `SELECT id, home_club, away_club FROM match_results
     WHERE league_id = ? AND stage_id = ? AND home_goals IS NULL`,
      [leagueId, stage],
    )[0]?.values ?? [];

  for (const [id, home, away] of pending) {
    // Give home team 1-0 win deterministically so no random tiebreak needed
    db.run(`UPDATE match_results SET home_goals = 1, away_goals = 0 WHERE id = ?`, [id]);
  }
}

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-07-A-1: R32 generated with exactly 16 matches ─────────────────────
  console.log("TS-07-A-1: Cup R32 fixture count...");
  {
    const r32Count = db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = 'cup_r32'`, [
      CUP_LEAGUE_ID,
    ])[0]?.values[0]?.[0] as number;
    assert.strictEqual(r32Count, 16, `R32 should have 16 matches, got ${r32Count}`);

    // All 32 participating clubs are unique
    const clubs =
      db.exec(
        `SELECT home_club FROM match_results WHERE league_id = ? AND stage_id = 'cup_r32'
       UNION
       SELECT away_club FROM match_results WHERE league_id = ? AND stage_id = 'cup_r32'`,
        [CUP_LEAGUE_ID, CUP_LEAGUE_ID],
      )[0]?.values ?? [];
    assert.strictEqual(clubs.length, 32, `R32 should involve exactly 32 unique clubs, got ${clubs.length}`);
    console.log(`  ✓ R32: 16 matches, 32 unique clubs`);
  }

  // ── TS-07-A-2: Play through all 5 rounds ─────────────────────────────────
  console.log("TS-07-A-2: Full bracket progression R32 → Final...");
  {
    const rounds = [
      { stage: "cup_r32", expectedNext: 8, label: "R32 → R16" },
      { stage: "cup_r16", expectedNext: 4, label: "R16 → QF" },
      { stage: "cup_qf", expectedNext: 2, label: "QF → SF" },
      { stage: "cup_sf", expectedNext: 1, label: "SF → Final" },
      { stage: "cup_final", expectedNext: 0, label: "Final → Winner" },
    ];

    for (const { stage, expectedNext, label } of rounds) {
      // Simulate all pending matches in current stage
      simulateRound(CUP_LEAGUE_ID, stage);

      // Trigger progression
      const msg = checkCupProgression();

      if (stage !== "cup_final") {
        const nextStageMap: Record<string, string> = {
          cup_r32: "cup_r16",
          cup_r16: "cup_qf",
          cup_qf: "cup_sf",
          cup_sf: "cup_final",
        };
        const nextStage = nextStageMap[stage];
        const nextCount = db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND stage_id = ?`, [
          CUP_LEAGUE_ID,
          nextStage,
        ])[0]?.values[0]?.[0] as number;
        assert.strictEqual(
          nextCount,
          expectedNext,
          `${label}: expected ${expectedNext} matches in ${nextStage}, got ${nextCount}`,
        );
        console.log(`  ✓ ${label}: ${nextCount} matches generated`);
      } else {
        // Final played — winner should be recorded
        const winner = db.exec(`SELECT value FROM world_state WHERE key = 'cup_winner_id'`)[0]?.values[0]?.[0];
        assert(winner != null, "Cup winner should be recorded in world_state after final");
        const winnerId = Number(winner);
        assert(winnerId > 0, `Cup winner ID should be positive, got ${winnerId}`);

        // Winner's players should have +1 career_trophies
        const trophyCheck = db.exec(`SELECT COUNT(*) FROM players WHERE club = ? AND career_trophies >= 1`, [
          winnerId,
        ])[0]?.values[0]?.[0] as number;
        assert(trophyCheck > 0, `Winner club ${winnerId} players should have career_trophies >= 1`);
        console.log(`  ✓ Final: winner club ${winnerId} recorded, ${trophyCheck} players awarded trophy`);
      }
    }
  }

  // ── TS-07-A-3: Total match count = 31 (single elimination, 32 teams) ─────
  console.log("TS-07-A-3: Total cup match count = 31...");
  {
    const total = db.exec(`SELECT COUNT(*) FROM match_results WHERE league_id = ? AND home_goals IS NOT NULL`, [
      CUP_LEAGUE_ID,
    ])[0]?.values[0]?.[0] as number;
    assert.strictEqual(total, 31, `Single-elim 32 teams = 31 matches, got ${total}`);
    console.log(`  ✓ Total cup matches played: ${total}`);
  }

  // ── TS-07-A-4: No club plays twice in same round ─────────────────────────
  console.log("TS-07-A-4: No duplicate club per round...");
  {
    const stages = ["cup_r32", "cup_r16", "cup_qf", "cup_sf", "cup_final"];
    for (const stage of stages) {
      const rows =
        db.exec(`SELECT home_club, away_club FROM match_results WHERE league_id = ? AND stage_id = ?`, [
          CUP_LEAGUE_ID,
          stage,
        ])[0]?.values ?? [];
      const seen = new Set<number>();
      for (const [h, a] of rows) {
        assert(!seen.has(h as number), `Club ${h} appears twice in ${stage}`);
        assert(!seen.has(a as number), `Club ${a} appears twice in ${stage}`);
        seen.add(h as number);
        seen.add(a as number);
      }
    }
    console.log("  ✓ No club appears twice in any single round");
  }

  console.log("\n✅ All P2 Cup tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
