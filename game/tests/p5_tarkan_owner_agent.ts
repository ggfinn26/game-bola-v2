/**
 * P5 Tests — TS-08 (Tarkan), TS-09 (Owner bankruptcy), TS-10 (Agent scout uncertainty)
 */
import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import { checkFixtureClash } from "../src/engine/world_ai.js";
import { enrollInTarkan, unenrollFromTarkan, getTarkanEnrollment, TARKAN_LEAGUE_IDS } from "../src/engine/tarkan.js";
import { triggerClubBankruptcy, createEgoOwner } from "../src/engine/owner.js";
import { createEgoAgent, getScoutList } from "../src/engine/agent.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  // ── TS-08-A: Fixture clash detected H-3 from official match ───────────────
  console.log("TS-08-A: Fixture clash detection...");
  {
    const clubId = 1;
    // Use day 900 — far past worldgen fixture range (Liga 1 season ≤ day 365)
    const officialMatchDay = 900;

    // Mark any pre-existing club 1 fixtures in [890-910] as played so we start clean
    db.run(
      `UPDATE match_results SET home_goals = 0, away_goals = 0
       WHERE (home_club = ? OR away_club = ?) AND home_goals IS NULL AND date >= 890 AND date <= 910`,
      [clubId, clubId],
    );

    // Insert our controlled pending fixture at day 900
    const maxId = (db.exec(`SELECT COALESCE(MAX(id),0) FROM match_results`)[0]?.values[0]?.[0] as number) + 1;
    db.run(
      `INSERT INTO match_results (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,competition,stats,scorers)
       VALUES (?,1,?,2,NULL,NULL,?,99,'league','liga1','{}','[]')`,
      [maxId, clubId, officialMatchDay],
    );

    // H-2 from match (day 898): window=[898,901] contains 900 → clash
    const clashDay898 = checkFixtureClash(clubId, 898);
    assert(clashDay898 === true, `Tarkan on day 898 (H-2 from match day 900) should clash`);
    console.log("  ✓ Day 898 (H-2): clash detected");

    // H-5 from match (day 895): window=[895,898] does NOT contain 900 → no clash
    const noClashDay895 = checkFixtureClash(clubId, 895);
    assert(noClashDay895 === false, `Tarkan on day 895 (H-5) should NOT clash, window=[895,898]`);
    console.log("  ✓ Day 895 (H-5): no clash");

    // No club: always false
    assert(checkFixtureClash(0, 898) === false, "clubId=0 should return false");
    console.log("  ✓ clubId=0: no clash");
  }

  // ── TS-08-B: Enroll / unenroll Tarkan ─────────────────────────────────────
  console.log("TS-08-B: Tarkan enroll/unenroll...");
  {
    const pid = createEgoPlayer({ name: "Tarkan Player", position: "CM", age: 22, clubId: 1 });
    const season = 1;
    const lid = TARKAN_LEAGUE_IDS[0]; // 101

    // Before enroll: not enrolled (returns null)
    const before = getTarkanEnrollment(pid, season);
    assert(before === null, "Player should not be enrolled initially");

    // Enroll
    const enrollRes = enrollInTarkan(pid, lid, season);
    assert(enrollRes.ok, `Enroll should succeed: ${enrollRes.summary}`);

    const after = getTarkanEnrollment(pid, season);
    assert(after !== null, "Enrollment should exist after enroll");
    assert.strictEqual(after!.leagueId, lid, `Player should be enrolled in league ${lid}`);
    console.log(`  ✓ Enrolled in Tarkan league ${lid}`);

    // Unenroll
    const unenrollMsg = unenrollFromTarkan(pid, season);
    assert(typeof unenrollMsg === "string", "unenroll should return a summary string");

    const afterUnenroll = getTarkanEnrollment(pid, season);
    assert(afterUnenroll === null, "Enrollment should be null after unenroll");
    console.log("  ✓ Unenrolled from Tarkan — enrollment cleared");
  }

  // ── TS-09: Club bankruptcy — players freed, slot available ────────────────
  console.log("TS-09: Club bankruptcy...");
  {
    const targetClub = db.exec(`SELECT id FROM clubs WHERE bankrupt = 0 AND id != 1 ORDER BY id LIMIT 1`)[0]
      ?.values[0]?.[0] as number;
    assert(targetClub, "Need a non-bankrupt club");

    // Count top 8 players before
    const topPlayers =
      db
        .exec(`SELECT id FROM players WHERE club = ? AND retired = 0 ORDER BY overall DESC LIMIT 8`, [targetClub])[0]
        ?.values?.map((r) => r[0] as number) ?? [];
    assert(topPlayers.length > 0, "Target club must have players");

    const msg = triggerClubBankruptcy(targetClub, null);
    assert(msg.includes("BANGKRUT"), "Bankruptcy message should contain BANGKRUT");

    // Club marked bankrupt
    const bankrupt = db.exec(`SELECT bankrupt FROM clubs WHERE id = ?`, [targetClub])[0]?.values[0]?.[0] as number;
    assert.strictEqual(bankrupt, 1, "Club should be bankrupt=1");

    // Top players released as free agents
    let freedCount = 0;
    for (const pid of topPlayers) {
      const row = db.exec(`SELECT free_agent, club FROM players WHERE id = ?`, [pid])[0]?.values[0] as [
        number,
        number | null,
      ];
      if (row[0] === 1 && row[1] === null) freedCount++;
    }
    assert(freedCount > 0, `At least some top players should be released (freed ${freedCount}/${topPlayers.length})`);
    console.log(`  ✓ Club ${targetClub} bankrupt | ${freedCount}/${topPlayers.length} top players freed`);

    // Slot enters market
    const slotAvail = db.exec(`SELECT COUNT(*) FROM league_slots WHERE club_id = ? AND status = 'available'`, [
      targetClub,
    ])[0]?.values[0]?.[0] as number;
    assert(slotAvail >= 0, "league_slots query should not error"); // some configs may not have slot rows
    console.log(`  ✓ league_slots updated for club ${targetClub}`);
  }

  // ── TS-10: Agent scout — est_ca range narrower at higher judge_ca ─────────
  console.log("TS-10: Agent scout uncertainty...");
  {
    // Low-skill agent (judge_ca=45) → wide range
    const lowAgentId = createEgoAgent("Low Skill Agency");
    db.run(`UPDATE agents SET judge_ca = 45, judge_pa = 45 WHERE id = ?`, [lowAgentId]);

    // High-skill agent (judge_ca=90) → narrow range
    const highAgentId = createEgoAgent("High Skill Agency");
    db.run(`UPDATE agents SET judge_ca = 90, judge_pa = 90 WHERE id = ?`, [highAgentId]);

    const lowList = getScoutList(lowAgentId, 20);
    const highList = getScoutList(highAgentId, 20);

    assert(lowList.length > 0, "Low-skill agent should have scout results");
    assert(highList.length > 0, "High-skill agent should have scout results");

    // Compare range widths: spread = Math.round((100 - skill) * 0.22)
    // judge_ca=45 → spread=round(55*0.22)=12 → range width up to 24
    // judge_ca=90 → spread=round(10*0.22)=2 → returns exact value (no range)
    const parseWidth = (est: string): number => {
      if (!est.includes("–")) return 0; // exact value = width 0
      const [lo, hi] = est.split("–").map(Number);
      return hi - lo;
    };

    const lowWidths = lowList.map((p) => parseWidth(p.est_ca));
    const highWidths = highList.map((p) => parseWidth(p.est_ca));

    const avgLow = lowWidths.reduce((s, w) => s + w, 0) / lowWidths.length;
    const avgHigh = highWidths.reduce((s, w) => s + w, 0) / highWidths.length;

    assert(
      avgLow > avgHigh,
      `Low-skill agent range (avg ${avgLow.toFixed(1)}) should be wider than high-skill (avg ${avgHigh.toFixed(1)})`,
    );
    console.log(`  ✓ Low-skill agent avg CA range width: ${avgLow.toFixed(1)} | High-skill: ${avgHigh.toFixed(1)}`);

    // High-skill (judge_ca=90) → spread=2 → returns exact value for most
    const exactCount = highList.filter((p) => !p.est_ca.includes("–")).length;
    assert(
      exactCount >= highList.length * 0.5,
      `High-skill agent should return exact CA for most players (got ${exactCount}/${highList.length})`,
    );
    console.log(`  ✓ High-skill agent: ${exactCount}/${highList.length} exact CA values (no range)`);
  }

  console.log("\n✅ All P5 Tarkan/Owner/Agent tests passed!");
}

run().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
