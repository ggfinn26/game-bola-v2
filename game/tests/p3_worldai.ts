/**
 * P3 Tests — TS-11-A, TS-11-B, TS-11-C
 * World AI: background transfers every 28 days, distress sale, cross-mode morale
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import { tickCrossModeAndAI } from "../src/engine/world_ai.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  const egoId = createEgoPlayer({ name: "Ego", position: "ST", age: 22, clubId: 1 });
  const egoClubId = 1;

  // ── TS-11-C: Club morale < 55 + agent_id → player gets on_transfer_list ──
  // (test first so later transfer logic doesn't consume this player)
  console.log("TS-11-C: Low morale club + agent → on_transfer_list...");
  {
    // Find a club that isn't the ego's club and set its morale low
    const targetClub = db.exec(`SELECT id FROM clubs WHERE id != ? AND bankrupt = 0 LIMIT 1`, [egoClubId])[0]
      ?.values[0]?.[0] as number;
    assert(targetClub, "Need a non-ego club");

    // Add a dummy agent
    const agentId = 9001;
    db.run(`INSERT OR IGNORE INTO agents (id, name, cash) VALUES (?, 'Test Agent', 50000000)`, [agentId]);

    // Place a player in that club with an agent
    const watchedPlayerId = db.exec(`SELECT id FROM players WHERE club = ? AND retired = 0 AND id != ? LIMIT 1`, [
      targetClub,
      egoId,
    ])[0]?.values[0]?.[0] as number;
    assert(watchedPlayerId, `No player in club ${targetClub}`);

    db.run(`UPDATE players SET agent_id = ? WHERE id = ?`, [agentId, watchedPlayerId]);
    db.run(`UPDATE clubs SET club_morale = 40 WHERE id = ?`, [targetClub]);

    // Confirm initial state: not on transfer list yet
    const before = db.exec(`SELECT on_transfer_list FROM players WHERE id = ?`, [watchedPlayerId])[0]
      ?.values[0]?.[0] as number;
    assert.strictEqual(before, 0, "Player should not be on transfer list initially");

    tickCrossModeAndAI(1, 1, egoId, egoClubId);

    const after = db.exec(`SELECT on_transfer_list FROM players WHERE id = ?`, [watchedPlayerId])[0]
      ?.values[0]?.[0] as number;
    assert.strictEqual(after, 1, `Player with agent in low-morale club should be on_transfer_list`);
    console.log(`  ✓ Player ${watchedPlayerId} in club ${targetClub} (morale=40) flagged on_transfer_list`);
  }

  // ── TS-11-B: Distressed club (cash < -20M) lists + offloads top player ───
  console.log("TS-11-B: Financial distress → emergency player sale...");
  {
    const distressedClubId = db.exec(`SELECT id FROM clubs WHERE id != ? AND id != ? AND bankrupt = 0 LIMIT 1`, [
      egoClubId,
      2,
    ])[0]?.values[0]?.[0] as number;
    assert(distressedClubId, "Need a distressed club");

    // Give club negative cash
    db.run(`UPDATE clubs SET cash = -50000000 WHERE id = ?`, [distressedClubId]);
    const cashBefore = db.exec(`SELECT cash FROM clubs WHERE id = ?`, [distressedClubId])[0]?.values[0]?.[0] as number;
    assert(cashBefore < -20_000_000, "Club should be in distress");

    // Find the club's best player
    const topPlayer = db.exec(
      `SELECT id, overall FROM players WHERE club = ? AND retired = 0 AND id != ? ORDER BY overall DESC LIMIT 1`,
      [distressedClubId, egoId],
    )[0]?.values[0] as [number, number] | undefined;
    assert(topPlayer, `Distressed club ${distressedClubId} should have at least one player`);
    const [topPlayerId] = topPlayer;

    tickCrossModeAndAI(1, 1, egoId, egoClubId);

    // Either the top player is on_transfer_list OR has been released (free_agent = 1)
    const pState = db.exec(`SELECT on_transfer_list, free_agent FROM players WHERE id = ?`, [topPlayerId])[0]
      ?.values[0] as [number, number] | undefined;
    assert(pState, "Player should still exist in DB");
    const [isListed, isFree] = pState;
    assert(
      isListed === 1 || isFree === 1,
      `Distressed club's top player should be listed or released (on_transfer_list=${isListed}, free_agent=${isFree})`,
    );

    const cashAfter = db.exec(`SELECT cash FROM clubs WHERE id = ?`, [distressedClubId])[0]?.values[0]?.[0] as number;
    if (isFree === 1) {
      assert(
        cashAfter > cashBefore,
        `Emergency cash infusion should happen when player released: ${cashBefore} → ${cashAfter}`,
      );
      console.log(`  ✓ Player ${topPlayerId} released, club cash ${cashBefore} → ${cashAfter}`);
    } else {
      console.log(`  ✓ Player ${topPlayerId} flagged on_transfer_list`);
    }
  }

  // ── TS-11-A: Background AI transfer fires at day % 28 === 0 ───────────────
  console.log("TS-11-A: Background AI transfer at day 28...");
  {
    // Give the top 5 non-ego clubs plenty of cash so RANDOM() LIMIT 2 always picks rich buyers
    db.run(`UPDATE clubs SET cash = 200000000 WHERE id != ? AND bankrupt = 0`, [egoClubId]);

    // Ensure at least one free agent exists (high overall so it's preferred)
    const maxIdRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM players`);
    const faId = ((maxIdRes[0]?.values[0]?.[0] as number) ?? 0) + 1;
    db.run(
      `INSERT INTO players
         (id, name, nationality, club, position, age, ca, pa, pa_ceiling, overall,
          finishing, passing, dribbling, heading, crossing, tackling, technique, long_shots,
          decisions, composure, positioning, vision, anticipation, off_the_ball, work_rate,
          pace, strength, agility, jumping, reflexes, handling, gk_positioning, one_on_ones, command,
          stamina, form, injury_prone, traits, trait_intensity,
          injured, injury_duration, retired, free_agent, on_transfer_list, transfer_ban,
          in_prison, prison_duration, matches, goals, assists, rating, yellow_cards, red_cards,
          clean_sheets, career_matches, career_goals, career_assists, career_trophies,
          contract_end, wage, appearance)
       VALUES (?, 'Free Agent Star', 1, NULL, 'ST', 26, 72, 78, 90, 72,
               72,68,70,65,60,40,70,65,68,70,72,65,68,74,66,74,68,66,62,0,0,0,0,0,
               1.0,0.75,3,'[]','{}',0,0,0,1,0,0,0,0,0,0,0,0.0,0,0,0,0,0,0,0,1000,10000000,'{}')`,
      [faId],
    );

    // Snapshot club of every on_transfer_list player + the FA before tick
    type Snap = Map<number, number | null>;
    function snapshot(): Snap {
      const rows =
        db.exec(
          `SELECT id, club FROM players WHERE (on_transfer_list = 1 OR free_agent = 1) AND retired = 0 AND id != ?`,
          [egoId],
        )[0]?.values ?? [];
      return new Map(rows.map(([id, club]) => [id as number, (club as number | null) ?? null]));
    }

    const snapBefore = snapshot();

    // Day not divisible by 28 — no AI transfer
    tickCrossModeAndAI(27, 1, egoId, egoClubId);
    const faClubDay27 = db.exec(`SELECT club FROM players WHERE id = ?`, [faId])[0]?.values[0]?.[0];
    assert(faClubDay27 === null, "Free agent should not be signed at day 27 (not day % 28 === 0)");
    console.log("  ✓ Day 27: no AI transfer (not divisible by 28)");

    // Day 28 — AI transfer fires
    tickCrossModeAndAI(28, 1, egoId, egoClubId);
    const snapAfter = snapshot();

    // Check if any player's club changed (FA signed = null→clubId, listed = oldClub→newClub)
    let transferCount = 0;
    for (const [pid, clubBefore] of snapBefore) {
      const clubNow = db.exec(`SELECT club FROM players WHERE id = ?`, [pid])[0]?.values[0]?.[0] as
        | number
        | null
        | undefined;
      if (clubNow !== clubBefore) transferCount++;
    }

    assert(
      transferCount > 0,
      `At least 1 AI transfer should happen at day 28 — 0 club changes detected among ${snapBefore.size} tracked players`,
    );
    console.log(`  ✓ Day 28: ${transferCount} AI transfer(s) detected (tracked ${snapBefore.size} listed/FA players)`);
  }

  console.log("\n✅ All P3 World AI tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
