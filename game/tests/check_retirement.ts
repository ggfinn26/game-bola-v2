import assert from "node:assert";
import { initDB, getDB } from "../src/engine/db.js";
import { generateWorld, createEgoPlayer } from "../src/engine/worldgen.js";
import {
  getRetirementOptions,
  chooseRetirementPath,
  tickPunditWeek,
  executePunditAction,
  getPunditState,
  convertRetiringLegendsToAIStaff,
} from "../src/engine/retirement.js";
import { rolloverSeason } from "../src/engine/scheduler.js";

async function run() {
  await initDB();
  generateWorld(42);
  const db = getDB();

  console.log("--- 1. Testing Retirement Eligibility & Options ---");
  // Create an experienced veteran player
  const egoId = createEgoPlayer({ name: "Bambang Legend", position: "ST", age: 34, clubId: 1 });
  db.run(
    `UPDATE players SET
       overall = 79, wage = 45000000,
       career_matches = 280, career_goals = 142, career_trophies = 4,
       traits = '["leader", "composed", "professional"]',
       decisions = 75, vision = 70, technique = 80
     WHERE id = ?`,
    [egoId],
  );

  const options = getRetirementOptions(egoId);
  assert.strictEqual(options.isEligible, true, "Player aged 34 must be eligible for retirement");
  assert.strictEqual(options.playerName, "Bambang Legend");
  assert(options.savings >= 50_000_000, `Player savings must be accumulated, got ${options.savings}`);
  assert(options.managerOffers.length > 0, "Should have manager offers from matching clubs");
  assert(options.agentInfo.startingReputation >= 40, `Agent rep should be high for 79 OVR legend, got ${options.agentInfo.startingReputation}`);
  assert.strictEqual(options.staffOffers.length, 3, "Should have 3 specialized club staff offers (coach, assistant, physio)");
  assert(options.punditInit.fame >= 60, `Pundit fame should be high for legend with 4 trophies, got ${options.punditInit.fame}`);
  console.log("✓ Retirement options calculated correctly with valid stats and offers.");

  console.log("--- 2. Testing Player -> Manager Career Transition ---");
  const targetClubOffer = options.managerOffers[0];
  const mgrRes = chooseRetirementPath(egoId, "manager", { clubId: targetClubOffer.clubId });
  assert.strictEqual(mgrRes.mode, "manager");
  assert.strictEqual(mgrRes.characterId, targetClubOffer.clubId);

  // Check database updates
  const egoDb = db.exec(`SELECT retired, club FROM players WHERE id = ?`, [egoId])[0].values[0];
  assert.strictEqual(egoDb[0], 1, "Player should be marked as retired");
  assert.strictEqual(egoDb[1], null, "Player club should be NULL after retirement");

  const clubDb = db.exec(`SELECT manager_id FROM clubs WHERE id = ?`, [targetClubOffer.clubId])[0].values[0];
  assert.strictEqual(clubDb[0], egoId, `Club manager_id should be updated to retired ego player ID ${egoId}`);
  console.log(`✓ Player successfully transitioned to Manager of ${targetClubOffer.clubName}.`);

  console.log("--- 3. Testing Player -> Agent Career Transition ---");
  const player2Id = createEgoPlayer({ name: "Cristian Agent", position: "ST", age: 35, clubId: 2 });
  db.run(`UPDATE players SET overall = 82, wage = 60000000, career_matches = 320, career_trophies = 6 WHERE id = ?`, [player2Id]);

  const agentRes = chooseRetirementPath(player2Id, "agent", { agencyName: "Cristian Elite Agency" });
  assert.strictEqual(agentRes.mode, "agent");
  assert(agentRes.characterId > 0, "New agent ID must be positive");

  const agentDb = db.exec(`SELECT name, cash, reputation FROM agents WHERE id = ?`, [agentRes.characterId])[0]?.values[0];
  assert.strictEqual(agentDb[0], "Cristian Elite Agency");
  assert((agentDb[1] as number) >= 50_000_000, "Agency should start with player career savings");
  assert((agentDb[2] as number) >= 50, "Agency reputation should be high based on player stature");

  // Check assigned clients
  const clientsCount = db.exec(`SELECT COUNT(*) FROM players WHERE agent_id = ?`, [agentRes.characterId])[0]?.values[0]?.[0] as number;
  assert(clientsCount > 0, "Newly founded agency should receive starter young clients");
  console.log(`✓ Player successfully founded sports agency with ${clientsCount} starter client(s).`);

  console.log("--- 4. Testing Player -> Club Staff Path ---");
  const playerStaffId = createEgoPlayer({ name: "Coach Ponaryo", position: "CM", age: 36, clubId: 1 });
  const staffRes = chooseRetirementPath(playerStaffId, "staff", { clubId: 1, role: "coach" });
  assert.strictEqual(staffRes.mode, "manager");
  assert.strictEqual(staffRes.characterId, 1);
  console.log("✓ Player successfully joined club as coaching staff.");

  console.log("--- 5. Testing Player -> Pundit Career Transition & Actions ---");
  const player3Id = createEgoPlayer({ name: "Binder Bola", position: "CM", age: 33, clubId: 1 });
  db.run(
    `UPDATE players SET overall = 75, decisions = 80, vision = 85, technique = 78, traits = '["controversial"]' WHERE id = ?`,
    [player3Id],
  );

  const punditRes = chooseRetirementPath(player3Id, "pundit");
  assert.strictEqual(punditRes.mode, "pundit");
  assert.strictEqual(punditRes.characterId, player3Id);

  const pState = getPunditState();
  assert(pState !== null, "Pundit state should be saved in DB world_state");
  assert.strictEqual(pState?.name, "Binder Bola");
  assert(pState?.controversy_level >= 50, "Controversial trait player should have high controversy level");

  // Initial club morale
  const initialMorale = (db.exec(`SELECT club_morale FROM clubs WHERE id = 1`)[0]?.values[0]?.[0] as number) ?? 75;
  const prevFame = pState!.fame;
  const prevControversy = pState!.controversy_level;

  // Execute Pundit Action: criticize_manager
  const actionRes = executePunditAction(pState!, "criticize_manager", 10, 1);
  assert(actionRes.updatedState.fame > prevFame, "Fame should increase after broadcast");
  assert(actionRes.updatedState.controversy_level > prevControversy, "Controversy should increase after sharp criticism");

  const newMorale = db.exec(`SELECT club_morale FROM clubs WHERE id = 1`)[0]?.values[0]?.[0] as number;
  assert(newMorale < initialMorale, `Club morale should decrease after sharp manager criticism (was ${initialMorale}, now ${newMorale})`);

  // Test Pundit Weekly Payout
  const paydayRes = tickPunditWeek(actionRes.updatedState, 30);
  assert(paydayRes.monthlyPayout > 0, "Pundit should receive monthly media royalty on day 30");
  assert(paydayRes.updatedState.total_earnings >= paydayRes.monthlyPayout, "Total earnings should accumulate monthly payout");
  console.log(`✓ Pundit system verified: controversy=${actionRes.updatedState.controversy_level}, club morale affected, payday received.`);

  console.log("--- 6. Testing AI Veterans Transformation & Rollover Simulation ---");
  // Seed a retiring AI veteran with high stature in database
  const maxPRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM players`);
  const aiLegendId = ((maxPRes[0]?.values[0]?.[0] as number) ?? 0) + 1;
  db.run(
    `INSERT INTO players (id, name, age, overall, retired, traits, career_matches, decisions, position)
     VALUES (?, 'Boaz Legend', 36, 76, 1, '["leader", "determination"]', 310, 72, 'ST')`,
    [aiLegendId],
  );

  const staffConvert = convertRetiringLegendsToAIStaff(1);
  assert(
    staffConvert.managersCreated > 0 || staffConvert.agentsCreated > 0 || staffConvert.summaries.length > 0,
    "AI veteran legends should convert into managers, agents, or club staff",
  );
  console.log(`✓ AI legends conversion verified: ${staffConvert.summaries.join(" | ")}`);

  // Verify rolloverSeason integrates veteran conversion without errors
  const rollover = rolloverSeason(1, 1);
  assert(typeof rollover.summary === "string", "Rollover summary must be a string");
  console.log("✓ Rollover season with veteran transformation executed successfully.");

  console.log("\n🎉 ALL POST-RETIREMENT CAREER TRANSITION TESTS PASSED SUCCESSFULLY! 🎉");
}

run().catch((err) => {
  console.error("Test failed:", err?.stack || err);
  process.exit(1);
});
