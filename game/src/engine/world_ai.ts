import { getDB } from "./db.js";
import { OUTFIELD_ATTRS, GK_ATTRS } from "./pa.js";
import { childStartingBonus } from "./world.js";
import type { EgoState, Position } from "../types/index.js";

export type ExtendedEgoState = EgoState & {
  generation?: number;
  reputation?: number;
  personal_cash?: number;
};

// ─── 1. Cross-Mode World Interactions & Background AI (§5 & §6) ──────────────

export function tickCrossModeAndAI(
  day: number,
  _season: number,
  egoPlayerId: number,
  egoClubId: number,
): string | null {
  const db = getDB();
  const headlines: string[] = [];

  // 1a. Trait Morale & Form Effects
  // Clubs with active `leader` players get +1 morale; clubs with `disruptive` players get -1 morale.
  db.run(
    `UPDATE clubs
     SET club_morale = MIN(100, club_morale + 1)
     WHERE id IN (
       SELECT DISTINCT club FROM players
       WHERE club IS NOT NULL AND retired = 0 AND injured = 0 AND in_prison = 0
         AND traits LIKE '%"leader"%'
     )`,
  );

  db.run(
    `UPDATE clubs
     SET club_morale = MAX(0, club_morale - 1)
     WHERE id IN (
       SELECT DISTINCT club FROM players
       WHERE club IS NOT NULL AND retired = 0 AND in_prison = 0
         AND traits LIKE '%"disruptive"%'
     )`,
  );

  // Players with `temperamental` trait experience extra form swing (±0.05)
  const tempRows =
    (db.exec(
      `SELECT id, form FROM players WHERE retired = 0 AND in_prison = 0 AND traits LIKE '%"temperamental"%'`,
    )[0]?.values as [number, number][] | undefined) ?? [];

  for (const [pid, curForm] of tempRows) {
    const delta = Math.random() < 0.5 ? 0.05 : -0.05;
    const nextForm = Math.min(1.0, Math.max(0.1, Number(((curForm ?? 0.5) + delta).toFixed(2))));
    db.run(`UPDATE players SET form = ? WHERE id = ?`, [nextForm, pid]);
  }

  // 1b. Cross-Mode Interactions
  // Players represented by an agent whose club has club_morale < 55 are flagged on_transfer_list = 1
  db.run(
    `UPDATE players
     SET on_transfer_list = 1
     WHERE agent_id IS NOT NULL
       AND retired = 0
       AND club IN (SELECT id FROM clubs WHERE club_morale < 55)`,
  );

  // AI clubs in severe financial distress (cash < -20_000_000) list star player & emergency sell/release 1 high-wage player
  const distressedClubs =
    (db.exec(
      `SELECT id, name, cash FROM clubs WHERE cash < -20000000 AND id != ? ORDER BY cash ASC LIMIT 2`,
      [egoClubId],
    )[0]?.values as [number, string, number][] | undefined) ?? [];

  for (const [cid, cname] of distressedClubs) {
    const starRow = db.exec(
      `SELECT id, name FROM players
       WHERE club = ? AND retired = 0 AND id != ?
       ORDER BY overall DESC LIMIT 1`,
      [cid, egoPlayerId],
    )[0]?.values[0] as [number, string] | undefined;

    if (starRow) {
      db.run(`UPDATE players SET on_transfer_list = 1 WHERE id = ?`, [starRow[0]]);
    }

    const highWageRow = db.exec(
      `SELECT id, name, overall, wage FROM players
       WHERE club = ? AND retired = 0 AND id != ?
       ORDER BY wage DESC, overall DESC LIMIT 1`,
      [cid, egoPlayerId],
    )[0]?.values[0] as [number, string, number, number] | undefined;

    if (highWageRow) {
      const [pid, pname, ovr] = highWageRow;
      const emergencyCash = Math.max(22_000_000, ovr * 450_000);
      db.run(
        `UPDATE players SET club = NULL, free_agent = 1, on_transfer_list = 0 WHERE id = ?`,
        [pid],
      );
      db.run(`UPDATE clubs SET cash = cash + ? WHERE id = ?`, [emergencyCash, cid]);
      headlines.push(
        `📰 Krisis Finansial: ${cname} melego pemain bintang (${pname}) ke bursa transfer demi dana darurat!`,
      );
    } else if (starRow) {
      headlines.push(`📰 Krisis Finansial: ${cname} melego pemain bintang ke bursa transfer!`);
    }
  }

  // 1c. Background AI Transfers (every 28 days)
  if (day > 0 && day % 28 === 0) {
    const richBuyers =
      (db.exec(
        `SELECT id, name, cash FROM clubs
         WHERE id != ? AND cash > 40000000 AND bankrupt = 0
         ORDER BY RANDOM() LIMIT 2`,
        [egoClubId],
      )[0]?.values as [number, string, number][] | undefined) ?? [];

    for (const [buyerId, buyerName, buyerCash] of richBuyers) {
      // Try buying a transfer-listed player from another AI club first, else sign top free agent
      const listedRow = db.exec(
        `SELECT p.id, p.name, p.overall, p.club, c.name
         FROM players p
         JOIN clubs c ON c.id = p.club
         WHERE p.on_transfer_list = 1
           AND p.retired = 0
           AND p.in_prison = 0
           AND p.id != ?
           AND p.club != ?
           AND p.club != ?
         ORDER BY p.overall DESC LIMIT 1`,
        [egoPlayerId, buyerId, egoClubId],
      )[0]?.values[0] as [number, string, number, number, string] | undefined;

      if (listedRow) {
        const [pid, pname, ovr, sellerId, sellerName] = listedRow;
        const fee = Math.min(
          Math.floor(buyerCash * 0.5),
          Math.max(5_000_000, Math.round((ovr * ovr * 10_000) / 1_000_000) * 1_000_000),
        );
        if (buyerCash >= fee) {
          db.run(`UPDATE clubs SET cash = cash - ? WHERE id = ?`, [fee, buyerId]);
          db.run(`UPDATE clubs SET cash = cash + ? WHERE id = ?`, [fee, sellerId]);
          db.run(
            `UPDATE players SET club = ?, free_agent = 0, on_transfer_list = 0, contract_end = ? WHERE id = ?`,
            [buyerId, day + 730, pid],
          );
          headlines.push(
            `🔄 Bursa AI: ${buyerName} resmi menebus ${pname} (OVR ${ovr}) dari ${sellerName} seharga Rp ${(fee / 1_000_000).toFixed(1)}M.`,
          );
          continue;
        }
      }

      const faRow = db.exec(
        `SELECT id, name, overall FROM players
         WHERE free_agent = 1 AND retired = 0 AND in_prison = 0 AND id != ?
         ORDER BY overall DESC LIMIT 1`,
        [egoPlayerId],
      )[0]?.values[0] as [number, string, number] | undefined;

      if (faRow) {
        const [pid, pname, ovr] = faRow;
        const signBonus = 3_000_000;
        db.run(`UPDATE clubs SET cash = cash - ? WHERE id = ?`, [signBonus, buyerId]);
        db.run(
          `UPDATE players SET club = ?, free_agent = 0, on_transfer_list = 0, contract_end = ? WHERE id = ?`,
          [buyerId, day + 730, pid],
        );
        headlines.push(
          `✍️ Bursa AI: ${buyerName} merekrut pemain bebas transfer ${pname} (OVR ${ovr}).`,
        );
      }
    }
  }

  return headlines.length > 0 ? headlines.join(" · ") : null;
}

// ─── 2. Tarkam / Amateur Match & Fixture Clash Detection (§4.3) ──────────────

export function checkFixtureClash(clubId: number, day: number): boolean {
  if (!clubId || clubId <= 0) return false;
  const db = getDB();
  const res = db.exec(
    `SELECT COUNT(*) FROM match_results
     WHERE (home_club = ? OR away_club = ?)
       AND home_goals IS NULL
       AND date >= ? AND date <= ?`,
    [clubId, clubId, day, day + 3],
  );
  const count = (res[0]?.values[0]?.[0] as number) ?? 0;
  return count > 0;
}

export function playTarkamMatch(
  playerId: number,
  day: number,
): { ok: boolean; summary: string; clashPenalty: boolean } {
  const db = getDB();
  const row = db.exec(
    `SELECT name, club, stamina, form, injured, in_prison, retired FROM players WHERE id = ?`,
    [playerId],
  )[0]?.values[0] as [string, number | null, number, number, number, number, number] | undefined;

  if (!row) {
    return { ok: false, summary: "⚠️ Data pemain tidak ditemukan.", clashPenalty: false };
  }

  const [name, clubId, stamina, form, injured, inPrison, retired] = row;
  if (retired) {
    return { ok: false, summary: "⚠️ Pemain sudah pensiun.", clashPenalty: false };
  }
  if (inPrison) {
    return { ok: false, summary: "⚠️ Tidak bisa ikut Tarkam saat sedang menjalani hukuman.", clashPenalty: false };
  }
  if (injured) {
    return { ok: false, summary: "⚠️ Kamu sedang cedera dan tidak bisa bermain di Tarkam.", clashPenalty: false };
  }
  if (stamina < 0.3) {
    return {
      ok: false,
      summary: "⚠️ Stamina terlalu rendah (<30%) untuk bermain di Turnamen Tarkam.",
      clashPenalty: false,
    };
  }

  const clashPenalty = clubId != null ? checkFixtureClash(clubId, day) : false;

  // Pay between Rp 3.500.000 and Rp 8.000.000 (rounded to 100k)
  const fee = 3_500_000 + Math.floor(Math.random() * 46) * 100_000;
  const nextStamina = Math.max(0.05, Number((stamina - 0.28).toFixed(2)));
  let nextForm = form;

  // Small chance (~12%) of minor injury (blister or mild_sprain, 3 days)
  const gotInjured = Math.random() < 0.12;
  const injType = gotInjured ? (Math.random() < 0.5 ? "blister" : "mild_sprain") : null;
  const injDays = gotInjured ? 3 : 0;

  if (clashPenalty && clubId != null) {
    nextForm = Math.max(0.1, Number((form - 0.12).toFixed(2)));
    db.run(`UPDATE clubs SET club_morale = MAX(0, club_morale - 3) WHERE id = ?`, [clubId]);
  } else {
    nextForm = Math.min(1.0, Number((form + 0.03).toFixed(2)));
  }

  db.run(
    `UPDATE players
     SET stamina = ?,
         form = ?,
         injured = CASE WHEN ? > 0 THEN 1 ELSE injured END,
         injury_duration = CASE WHEN ? > 0 THEN ? ELSE injury_duration END,
         injury_type = CASE WHEN ? IS NOT NULL THEN ? ELSE injury_type END
     WHERE id = ?`,
    [nextStamina, nextForm, injDays, injDays, injDays, injType, injType, playerId],
  );

  // Credit personal cash in world_state
  const curCashRaw = db.exec(`SELECT value FROM world_state WHERE key = 'ego_personal_cash'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  const nextCash = (curCashRaw ? Number(curCashRaw) || 0 : 0) + fee;
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('ego_personal_cash', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(nextCash)],
  );

  // Also update world_state JSON if stored
  const wsRaw = db.exec(`SELECT value FROM world_state WHERE key = 'world_state'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  if (wsRaw) {
    try {
      const ws = JSON.parse(wsRaw);
      if (ws.ego) {
        ws.ego.personal_cash = (ws.ego.personal_cash ?? 0) + fee;
        db.run(`UPDATE world_state SET value = ? WHERE key = 'world_state'`, [JSON.stringify(ws)]);
      }
    } catch {
      // ignore invalid JSON
    }
  }

  const parts = [
    `🏟️ Laga Tarkam selesai! ${name} menerima amplop Rp ${(fee / 1_000_000).toFixed(1)}M (Stamina -28%).`,
  ];
  if (gotInjured) {
    parts.push(`🚑 Cedera ringan (${injType}, 3 hari) akibat lapangan bergelombang!`);
  }
  if (clashPenalty) {
    parts.push(
      `⚠️ Pelatih klub murka karena kamu main Tarkam H-3 jadwal resmi! (Form -12%, Morale Klub -3).`,
    );
  }

  return {
    ok: true,
    summary: parts.join(" "),
    clashPenalty,
  };
}

// ─── 3. Child / Dynasty Ego Transition (§3) ──────────────────────────────────

export function transitionToChild(
  egoPlayerId: number,
  ego: ExtendedEgoState,
  currentDay: number,
  customChildName?: string,
): { newPlayerId: number; newEgo: ExtendedEgoState; summary: string } {
  const db = getDB();

  // Compute starting bonus from `./world.js` (supports both EgoState and number signatures/returns)
  const fnBonus = childStartingBonus as (arg: unknown) => unknown;
  const firstTry = fnBonus(ego);
  const rawBonus =
    typeof firstTry === "number" && Number.isNaN(firstTry) ? fnBonus(ego.legacy_score ?? 0) : firstTry;
  const paBonus =
    typeof rawBonus === "number" && !Number.isNaN(rawBonus)
      ? rawBonus
      : typeof (rawBonus as { pa_bonus?: number })?.pa_bonus === "number"
        ? (rawBonus as { pa_bonus: number }).pa_bonus
        : Math.min(10, Math.floor((ego.legacy_score ?? 0) / 100));
  const repInherited =
    typeof (rawBonus as { reputation_inherited?: number })?.reputation_inherited === "number"
      ? (rawBonus as { reputation_inherited: number }).reputation_inherited
      : Math.min(50, Math.round((ego.legacy_score ?? 0) * 0.25));

  const parentRow = db.exec(
    `SELECT name, nationality, position, club, foot FROM players WHERE id = ?`,
    [egoPlayerId],
  )[0]?.values[0] as [string, number, Position, number | null, string] | undefined;

  const parentName = parentRow?.[0] ?? "Legenda";
  const nationality = parentRow?.[1] ?? 1;
  const position: Position = parentRow?.[2] ?? "ST";
  const clubId = parentRow?.[3] ?? 1;
  const foot = parentRow?.[4] ?? "R";

  // Retire parent player
  db.run(`UPDATE players SET retired = 1, club = NULL, free_agent = 0 WHERE id = ?`, [egoPlayerId]);

  const maxIdRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM players`);
  const newPlayerId = ((maxIdRes[0]?.values[0]?.[0] as number) ?? 0) + 1;
  const childName = customChildName?.trim() || `${parentName} Jr.`;

  const ca = Math.min(99, 45 + paBonus);
  const pa = Math.min(99, 78 + paBonus * 2);
  const paCeiling = Math.min(100, pa + 5);
  const baseAttr = Math.max(15, Math.min(90, Math.round(ca / 1.14)));

  const attrs: Record<string, number> = {};
  if (position === "GK") {
    for (const k of GK_ATTRS) attrs[k] = baseAttr;
    for (const k of OUTFIELD_ATTRS) attrs[k] = Math.max(10, Math.round(baseAttr * 0.55));
  } else {
    for (const k of GK_ATTRS) attrs[k] = 0;
    for (const k of OUTFIELD_ATTRS) attrs[k] = baseAttr;
  }

  db.run(
    `INSERT INTO players
      (id, name, nationality, club, position, age, height, weight, foot,
       ca, pa, pa_ceiling, overall,
       finishing, passing, dribbling, heading, crossing, tackling, technique, long_shots,
       decisions, composure, positioning, vision, anticipation, off_the_ball, work_rate,
       pace, strength, agility, jumping,
       reflexes, handling, gk_positioning, one_on_ones, command,
       stamina, form, injury_prone, traits, trait_intensity,
       injured, injury_duration, injury_type, retired, free_agent, on_transfer_list,
       transfer_ban, in_prison, prison_duration,
       matches, goals, assists, rating, yellow_cards, red_cards, clean_sheets,
       career_matches, career_goals, career_assists, career_trophies,
       agent_id, contract_end, wage)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      newPlayerId,
      childName,
      nationality,
      clubId,
      position,
      16,
      175,
      68,
      foot,
      ca,
      pa,
      paCeiling,
      ca,
      attrs.finishing,
      attrs.passing,
      attrs.dribbling,
      attrs.heading,
      attrs.crossing,
      attrs.tackling,
      attrs.technique,
      attrs.long_shots,
      attrs.decisions,
      attrs.composure,
      attrs.positioning,
      attrs.vision,
      attrs.anticipation,
      attrs.off_the_ball,
      attrs.work_rate,
      attrs.pace,
      attrs.strength,
      attrs.agility,
      attrs.jumping,
      attrs.reflexes,
      attrs.handling,
      attrs.gk_positioning,
      attrs.one_on_ones,
      attrs.command,
      1.0,
      0.6,
      2,
      JSON.stringify(["ambitious"]),
      JSON.stringify({}),
      0,
      0,
      null,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0.0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      null,
      currentDay + 730,
      3_500_000,
    ],
  );

  const newEgo: ExtendedEgoState = {
    ...ego,
    mode: "player",
    character_id: newPlayerId,
    age: 16,
    alive: true,
    generation: (ego.generation ?? 1) + 1,
    legacy_score: Math.round((ego.legacy_score ?? 0) * 0.5),
    reputation: Math.max(15, repInherited),
    personal_cash: Math.round((ego.personal_cash ?? 0) * 0.8),
    children: [...(ego.children ?? []), newPlayerId],
  };

  db.run(
    `INSERT INTO world_state (key, value) VALUES ('ego_player_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(newPlayerId)],
  );

  const wsRaw = db.exec(`SELECT value FROM world_state WHERE key = 'world_state'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  const updatedWs = wsRaw
    ? (() => {
        try {
          const parsed = JSON.parse(wsRaw);
          return { ...parsed, ego: newEgo };
        } catch {
          return { current_day: currentDay, ego: newEgo };
        }
      })()
    : { current_day: currentDay, ego: newEgo };

  db.run(
    `INSERT INTO world_state (key, value) VALUES ('world_state', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(updatedWs)],
  );

  return {
    newPlayerId,
    newEgo,
    summary: `🧬 Estafet Dinasti Generasi ke-${newEgo.generation}! ${parentName} resmi gantung sepatu, dan ${childName} (16 thn, ${position}, CA ${ca}/PA ${pa}) memulai debutnya.`,
  };
}
