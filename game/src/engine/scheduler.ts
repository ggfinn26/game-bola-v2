import { getDB } from "./db.js";
import { fullSim, wheelSim } from "./match.js";
import { recalcPACA } from "./pa.js";
import { evaluateSeasonAwards } from "./awards.js";
import { getSeasonChampion, generateMultiStageFixtures } from "./stages.js";
import { generateYouthRegens } from "./worldgen.js";
import { convertRetiringLegendsToAIStaff } from "./retirement.js";
import type { MatchStep } from "./match.js";
import type { Player, Club, MatchResult } from "../types/index.js";

// ─── DB helpers ───────────────────────────────────────────────────────────────

function rowToClub(row: unknown[]): Club {
  return {
    id: row[0] as number,
    name: row[1] as string,
    league_id: row[2] as number,
    reputation: row[3] as number,
    owner_id: null,
    manager_id: null,
    cash: row[4] as number,
    debt: 0,
    monthly_income: 0,
    monthly_costs: 0,
    credit_score: 70,
    consecutive_missed_payments: 0,
    bankrupt: false,
    slot_id: row[0] as number,
    club_morale: row[5] as number,
    fans: row[6] as number,
    stadium_capacity: row[7] as number,
    facilities_level: row[8] as number,
    academy_level: row[9] as number,
    wins: row[10] as number,
    draws: row[11] as number,
    losses: row[12] as number,
    goals_for: row[13] as number,
    goals_against: row[14] as number,
    points: row[15] as number,
  };
}

export interface ClubStaffLevels {
  physio: number; // 1–5: boosts daily stamina recovery
  doctor: number; // 1–5: reduces injury duration
  coach: number; // 1–5: boosts match tactical rating & PA training
  assistant: number; // 1–5: boosts match tactical rating
}

export interface ClubManagerConfig {
  formation: "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1";
  mentality: "attacking" | "balanced" | "defensive";
  starter_ids: number[];
  staff: ClubStaffLevels;
  club_cash: number;
}

export interface TransferTarget {
  id: number;
  name: string;
  position: string;
  age: number;
  overall: number;
  ca: number;
  pa: number;
  wage: number;
  club_id: number;
  club_name: string;
  fee: number;
}

const ROSTER_SELECT = `
  SELECT p.id, p.name, p.position,
         p.finishing, p.passing, p.dribbling, p.heading, p.crossing, p.tackling, p.technique, p.long_shots,
         p.decisions, p.composure, p.positioning, p.vision, p.anticipation, p.off_the_ball, p.work_rate,
         p.pace, p.strength, p.agility, p.jumping,
         p.reflexes, p.handling, p.gk_positioning, p.one_on_ones, p.command,
         p.stamina, p.form, p.injury_prone, p.traits,
         p.age, p.overall, p.ca, p.pa, p.wage, p.injured, p.injury_duration, p.injury_type, p.in_prison,
         p.matches, p.goals, p.assists, p.rating,
         COALESCE(ca.suspended_matches_remaining, 0) AS suspended
  FROM players p
  LEFT JOIN card_accumulation ca
    ON ca.player_id = p.id AND ca.competition_id = ? AND ca.season = ?
  WHERE p.club = ? AND p.retired = 0
  ORDER BY p.overall DESC, p.id ASC
`;

function rowToSimPlayer(row: unknown[]): Player {
  return {
    id: row[0] as number,
    name: row[1] as string,
    nationality: 1,
    club: null,
    position: row[2] as Player["position"],
    secondary_position: null,
    age: (row[31] as number) ?? 22,
    height: 175,
    weight: 72,
    foot: "R",
    ca: (row[33] as number) ?? 50,
    pa: (row[34] as number) ?? 50,
    pa_ceiling: 100,
    overall: (row[32] as number) ?? 50,
    finishing: row[3] as number,
    passing: row[4] as number,
    dribbling: row[5] as number,
    heading: row[6] as number,
    crossing: row[7] as number,
    tackling: row[8] as number,
    technique: row[9] as number,
    long_shots: row[10] as number,
    decisions: row[11] as number,
    composure: row[12] as number,
    positioning: row[13] as number,
    vision: row[14] as number,
    anticipation: row[15] as number,
    off_the_ball: row[16] as number,
    work_rate: row[17] as number,
    pace: row[18] as number,
    strength: row[19] as number,
    agility: row[20] as number,
    jumping: row[21] as number,
    reflexes: row[22] as number,
    handling: row[23] as number,
    gk_positioning: row[24] as number,
    one_on_ones: row[25] as number,
    command: row[26] as number,
    stamina: row[27] as number,
    form: row[28] as number,
    injury_prone: (row[29] as number) ?? 3,
    traits: JSON.parse((row[30] as string) || "[]"),
    trait_intensity: {},
    injured: Boolean(row[36]),
    injury_duration: (row[37] as number) ?? 0,
    injury_type: (row[38] as string | null) ?? null,
    retired: false,
    free_agent: false,
    on_transfer_list: false,
    transfer_ban: false,
    in_prison: Boolean(row[39]),
    prison_duration: 0,
    matches: (row[40] as number) ?? 0,
    goals: (row[41] as number) ?? 0,
    assists: (row[42] as number) ?? 0,
    rating: (row[43] as number) ?? 0,
    yellow_cards: 0,
    red_cards: 0,
    clean_sheets: 0,
    career_matches: 0,
    career_goals: 0,
    career_assists: 0,
    career_trophies: 0,
    agent_id: null,
    contract_end: 365,
    wage: (row[35] as number) ?? 0,
  };
}

export function saveClubConfig(clubId: number, cfg: Omit<ClubManagerConfig, "club_cash">): void {
  const db = getDB();
  db.run(
    `INSERT INTO world_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [`club_tactics_${clubId}`, JSON.stringify(cfg)],
  );
}

export function getClubManagerConfig(clubId: number): ClubManagerConfig {
  const db = getDB();
  const cashRes = db.exec(`SELECT cash FROM clubs WHERE id = ?`, [clubId]);
  const clubCash = (cashRes[0]?.values[0]?.[0] as number) ?? 0;

  const raw = db.exec(`SELECT value FROM world_state WHERE key = ?`, [`club_tactics_${clubId}`])[0]?.values[0]?.[0] as
    | string
    | undefined;

  let parsed: Omit<ClubManagerConfig, "club_cash"> = {
    formation: "4-3-3",
    mentality: "balanced",
    starter_ids: [],
    staff: { physio: 1, doctor: 1, coach: 1, assistant: 1 },
  };
  if (raw) {
    try {
      const p = JSON.parse(raw);
      parsed = {
        formation: p.formation ?? "4-3-3",
        mentality: p.mentality ?? "balanced",
        starter_ids: Array.isArray(p.starter_ids) ? p.starter_ids : [],
        staff: {
          physio: p.staff?.physio ?? 1,
          doctor: p.staff?.doctor ?? 1,
          coach: p.staff?.coach ?? 1,
          assistant: p.staff?.assistant ?? 1,
        },
      };
    } catch {
      // ignore invalid json
    }
  }

  // Filter starter_ids to players still in the club, and auto-fill up to 11 if empty
  const validRows =
    (db.exec(
      `SELECT id FROM players WHERE club = ? AND retired = 0 AND injured = 0 AND in_prison = 0 ORDER BY overall DESC`,
      [clubId],
    )[0]?.values as [number][] | undefined) ?? [];
  const clubIdsAll = new Set(
    ((db.exec(`SELECT id FROM players WHERE club = ? AND retired = 0`, [clubId])[0]?.values as [number][]) ?? []).map(
      (r) => r[0],
    ),
  );
  parsed.starter_ids = parsed.starter_ids.filter((id) => clubIdsAll.has(id));
  if (parsed.starter_ids.length === 0 && validRows.length > 0) {
    parsed.starter_ids = validRows.slice(0, 11).map((r) => r[0]);
    saveClubConfig(clubId, parsed);
  }

  return { ...parsed, club_cash: clubCash };
}

export function setClubTactics(
  clubId: number,
  formation: ClubManagerConfig["formation"],
  mentality: ClubManagerConfig["mentality"],
): { summary: string; config: ClubManagerConfig } {
  const cur = getClubManagerConfig(clubId);
  saveClubConfig(clubId, {
    formation,
    mentality,
    starter_ids: cur.starter_ids,
    staff: cur.staff,
  });
  const labelMap = { attacking: "Menyerang", balanced: "Seimbang", defensive: "Bertahan" };
  return {
    summary: `📋 Taktik diubah: Formasi ${formation} · Gaya ${labelMap[mentality]}.`,
    config: getClubManagerConfig(clubId),
  };
}

export function toggleClubStarter(clubId: number, playerId: number): { summary: string; config: ClubManagerConfig } {
  const cur = getClubManagerConfig(clubId);
  const idx = cur.starter_ids.indexOf(playerId);
  let nextIds = [...cur.starter_ids];
  let summary = "";
  if (idx >= 0) {
    nextIds.splice(idx, 1);
    summary = "🔄 Pemain dipindahkan ke Bangku Cadangan.";
  } else {
    if (nextIds.length >= 11) {
      return {
        summary: "⚠️ Starting XI sudah penuh (11 pemain). Cadangkan 1 pemain terlebih dahulu.",
        config: cur,
      };
    }
    nextIds.push(playerId);
    summary = "✅ Pemain dimasukkan ke Starting XI.";
  }
  saveClubConfig(clubId, {
    formation: cur.formation,
    mentality: cur.mentality,
    starter_ids: nextIds,
    staff: cur.staff,
  });
  return { summary, config: getClubManagerConfig(clubId) };
}

export function upgradeClubStaff(
  clubId: number,
  role: keyof ClubStaffLevels,
): { summary: string; config: ClubManagerConfig } {
  const db = getDB();
  const cur = getClubManagerConfig(clubId);
  const level = cur.staff[role];
  if (level >= 5) {
    return { summary: "⚠️ Staf ini sudah berada di Level Maksimal (Lv.5).", config: cur };
  }
  const cost = level * 25_000_000;
  if (cur.club_cash < cost) {
    return {
      summary: `⚠️ Kas klub tidak cukup (butuh Rp ${(cost / 1_000_000).toFixed(0)}M).`,
      config: cur,
    };
  }
  db.run(`UPDATE clubs SET cash = cash - ? WHERE id = ?`, [cost, clubId]);
  const nextStaff = { ...cur.staff, [role]: level + 1 };
  saveClubConfig(clubId, {
    formation: cur.formation,
    mentality: cur.mentality,
    starter_ids: cur.starter_ids,
    staff: nextStaff,
  });
  const roleLabel: Record<keyof ClubStaffLevels, string> = {
    physio: "Fisioterapis",
    doctor: "Dokter Klub",
    coach: "Pelatih Kepala",
    assistant: "Asisten Manajer",
  };
  return {
    summary: `🎓 ${roleLabel[role]} ditingkatkan ke Lv.${level + 1} (-Rp ${(cost / 1_000_000).toFixed(0)}M).`,
    config: getClubManagerConfig(clubId),
  };
}

export function getClubRoster(clubId: number, competitionId = 1, season = 1): Player[] {
  const db = getDB();
  const cfg = getClubManagerConfig(clubId);
  const starterSet = new Set(cfg.starter_ids);
  const res = db.exec(ROSTER_SELECT, [competitionId, season, clubId]);
  const players = (res[0]?.values ?? []).map(rowToSimPlayer);
  return players.sort((a, b) => {
    const aStart = starterSet.has(a.id) ? 1 : 0;
    const bStart = starterSet.has(b.id) ? 1 : 0;
    if (aStart !== bStart) return bStart - aStart;
    return b.overall - a.overall;
  });
}

export function getSquad(clubId: number, egoId = 0, competitionId = 1, season = 1): Player[] {
  const db = getDB();
  const cfg = getClubManagerConfig(clubId);
  const starterSet = new Set(cfg.starter_ids);
  const res = db.exec(ROSTER_SELECT, [competitionId, season, clubId]);
  const rows = res[0]?.values ?? [];
  const available = rows
    .filter((r) => {
      const injured = Boolean(r[36]);
      const inPrison = Boolean(r[39]);
      const suspended = (r[44] as number) > 0;
      return !injured && !inPrison && !suspended;
    })
    .map(rowToSimPlayer);

  available.sort((a, b) => {
    const aEgo = a.id === egoId ? 1 : 0;
    const bEgo = b.id === egoId ? 1 : 0;
    if (aEgo !== bEgo) return bEgo - aEgo;
    const aStart = starterSet.has(a.id) ? 1 : 0;
    const bStart = starterSet.has(b.id) ? 1 : 0;
    if (aStart !== bStart) return bStart - aStart;
    return b.overall - a.overall;
  });

  return available.slice(0, 11);
}

export function getU21Squad(clubId: number, egoId = 0, maxAge = 21): Player[] {
  const db = getDB();
  const res = db.exec(
    `SELECT p.id, p.name, p.position,
            p.finishing, p.passing, p.dribbling, p.heading, p.crossing, p.tackling, p.technique, p.long_shots,
            p.decisions, p.composure, p.positioning, p.vision, p.anticipation, p.off_the_ball, p.work_rate,
            p.pace, p.strength, p.agility, p.jumping,
            p.reflexes, p.handling, p.gk_positioning, p.one_on_ones, p.command,
            p.stamina, p.form, p.injury_prone, p.traits,
            p.age, p.overall, p.ca, p.pa, p.wage, p.injured, p.injury_duration, p.injury_type, p.in_prison,
            p.matches, p.goals, p.assists, p.rating, 0 AS suspended
     FROM players p
     WHERE p.club = ? AND p.retired = 0
       AND p.injured = 0 AND p.in_prison = 0
     ORDER BY CASE WHEN p.id = ? AND p.age <= ? THEN 0 ELSE 1 END,
              CASE WHEN p.age <= ? THEN 0 ELSE 1 END,
              p.age ASC,
              p.overall DESC
     LIMIT 11`,
    [clubId, egoId, maxAge, maxAge],
  );
  return (res[0]?.values ?? []).map(rowToSimPlayer);
}

export interface U21StandingRow {
  club_id: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export function getAgeStandings(leagueId: number, maxAge = 21): U21StandingRow[] {
  const db = getDB();
  const matches = db.exec(
    `SELECT m.home_club, hc.name, m.away_club, ac.name, m.home_goals, m.away_goals
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE m.league_id = ? AND m.home_goals IS NOT NULL`,
    [leagueId],
  )[0]?.values as [number, string, number, string, number, number][] | undefined;

  const map = new Map<number, U21StandingRow>();
  const ensure = (id: number, name: string) => {
    if (!map.has(id))
      map.set(id, {
        club_id: id,
        name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      });
    return map.get(id)!;
  };

  for (const [hId, hName, aId, aName, hg, ag] of matches ?? []) {
    const h = ensure(hId, hName);
    const a = ensure(aId, aName);
    h.played++;
    a.played++;
    h.goals_for += hg;
    h.goals_against += ag;
    a.goals_for += ag;
    a.goals_against += hg;
    if (hg > ag) {
      h.wins++;
      h.points += 3;
      a.losses++;
    } else if (hg < ag) {
      a.wins++;
      a.points += 3;
      h.losses++;
    } else {
      h.draws++;
      a.draws++;
      h.points++;
      a.points++;
    }
  }

  return [...map.values()].sort(
    (a, b) => b.points - a.points || b.goals_for - b.goals_against - (a.goals_for - a.goals_against),
  );
}

export function getU21Standings(): U21StandingRow[] {
  return getAgeStandings(30, 21);
}

export function getEPLU21Standings(): U21StandingRow[] {
  return getAgeStandings(31, 21);
}

export function getU18Standings(): U21StandingRow[] {
  return getAgeStandings(40, 18);
}

export function getEPLU18Standings(): U21StandingRow[] {
  return getAgeStandings(41, 18);
}

export function getU15Standings(): U21StandingRow[] {
  return getAgeStandings(45, 15);
}

export function getEPLU15Standings(): U21StandingRow[] {
  return getAgeStandings(46, 15);
}

export function getTransferTargets(excludeClubId: number): TransferTarget[] {
  const db = getDB();
  const res = db.exec(
    `SELECT p.id, p.name, p.position, p.age, p.overall, p.ca, p.pa, p.wage, p.club, c.name
     FROM players p
     JOIN clubs c ON c.id = p.club
     WHERE p.free_agent = 0 AND p.retired = 0 AND p.in_prison = 0 AND p.club != ?
     ORDER BY p.overall DESC LIMIT 60`,
    [excludeClubId],
  );
  return (res[0]?.values ?? []).map((r) => {
    const ovr = r[4] as number;
    const age = r[3] as number;
    const ageMod = age <= 23 ? 1.25 : age >= 30 ? 0.7 : 1.0;
    const fee = Math.max(5_000_000, Math.round((ovr * ovr * 12_000 * ageMod) / 1_000_000) * 1_000_000);
    return {
      id: r[0] as number,
      name: r[1] as string,
      position: r[2] as string,
      age,
      overall: ovr,
      ca: r[5] as number,
      pa: r[6] as number,
      wage: r[7] as number,
      club_id: r[8] as number,
      club_name: r[9] as string,
      fee,
    };
  });
}

export function buyTransferTarget(
  buyerClubId: number,
  playerId: number,
  currentDay: number,
): { ok: boolean; summary: string } {
  const db = getDB();
  const pRow = db.exec(
    `SELECT p.name, p.overall, p.age, p.club, c.name
     FROM players p JOIN clubs c ON c.id = p.club
     WHERE p.id = ? AND p.free_agent = 0 AND p.retired = 0`,
    [playerId],
  )[0]?.values[0];
  if (!pRow) return { ok: false, summary: "⚠️ Pemain tidak tersedia untuk dibeli." };

  const [pName, ovr, age, sellerClubId, sellerName] = pRow as [string, number, number, number, string];
  const ageMod = age <= 23 ? 1.25 : age >= 30 ? 0.7 : 1.0;
  const fee = Math.max(5_000_000, Math.round((ovr * ovr * 12_000 * ageMod) / 1_000_000) * 1_000_000);

  const buyerCash = (db.exec(`SELECT cash FROM clubs WHERE id = ?`, [buyerClubId])[0]?.values[0]?.[0] as number) ?? 0;
  if (buyerCash < fee) {
    return {
      ok: false,
      summary: `⚠️ Kas klub tidak cukup untuk menebus ${pName} (butuh Rp ${(fee / 1_000_000).toFixed(1)}M).`,
    };
  }

  db.run(`UPDATE clubs SET cash = cash - ? WHERE id = ?`, [fee, buyerClubId]);
  db.run(`UPDATE clubs SET cash = cash + ? WHERE id = ?`, [fee, sellerClubId]);
  db.run(`UPDATE players SET club = ?, free_agent = 0, contract_end = ? WHERE id = ?`, [
    buyerClubId,
    currentDay + 730,
    playerId,
  ]);
  return {
    ok: true,
    summary: `💰 Transfer selesai! ${pName} ditebus dari ${sellerName} seharga Rp ${(fee / 1_000_000).toFixed(1)}M.`,
  };
}

export function getPlayerSuspension(playerId: number, competitionId = 1, season = 1): number {
  const db = getDB();
  const res = db.exec(
    `SELECT suspended_matches_remaining FROM card_accumulation
     WHERE player_id = ? AND competition_id = ? AND season = ?`,
    [playerId, competitionId, season],
  );
  return (res[0]?.values[0]?.[0] as number) ?? 0;
}

export function healInjuries(days: number): void {
  if (days <= 0) return;
  const db = getDB();
  db.run(
    `UPDATE players
     SET injury_duration = MAX(0, injury_duration - ?),
         injured = CASE WHEN injury_duration - ? <= 0 THEN 0 ELSE 1 END,
         injury_type = CASE WHEN injury_duration - ? <= 0 THEN NULL ELSE injury_type END
     WHERE injured = 1`,
    [days, days, days],
  );
  db.run(
    `UPDATE players
     SET prison_duration = MAX(0, prison_duration - ?),
         in_prison = CASE WHEN prison_duration - ? <= 0 THEN 0 ELSE 1 END
     WHERE in_prison = 1`,
    [days, days],
  );
  // Daily stamina recovery per GAME-ENGINE.md §4.2: 0.05 + (physio_level / 10 * 0.05) per day
  db.run(
    `UPDATE players
     SET stamina = MIN(1.0, ROUND(stamina + ? * (0.05 + COALESCE((SELECT facilities_level FROM clubs WHERE id = players.club), 2) * 0.005), 2))
     WHERE retired = 0 AND in_prison = 0 AND stamina < 1.0`,
    [days],
  );
}

export function getPlayer(playerId: number): Player | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id,name,nationality,club,position,secondary_position,age,height,weight,foot,
            ca,pa,overall,
            finishing,passing,dribbling,heading,crossing,tackling,technique,long_shots,
            decisions,composure,positioning,vision,anticipation,off_the_ball,work_rate,
            pace,strength,agility,jumping,
            reflexes,handling,gk_positioning,one_on_ones,command,
            stamina,form,injury_prone,traits,trait_intensity,
            injured,injury_duration,injury_type,retired,free_agent,on_transfer_list,
            transfer_ban,in_prison,prison_duration,
            matches,goals,assists,rating,yellow_cards,red_cards,clean_sheets,
            career_matches,career_goals,career_assists,career_trophies,
            agent_id,contract_end,wage,pa_ceiling
     FROM players WHERE id = ?`,
    [playerId],
  );
  const r = res[0]?.values[0];
  if (!r) return null;
  return {
    id: r[0] as number,
    name: r[1] as string,
    nationality: r[2] as number,
    club: (r[3] as number | null) ?? null,
    position: r[4] as Player["position"],
    secondary_position: (r[5] as Player["position"] | null) ?? null,
    age: r[6] as number,
    height: r[7] as number,
    weight: r[8] as number,
    foot: r[9] as Player["foot"],
    ca: r[10] as number,
    pa: r[11] as number,
    overall: r[12] as number,
    finishing: r[13] as number,
    passing: r[14] as number,
    dribbling: r[15] as number,
    heading: r[16] as number,
    crossing: r[17] as number,
    tackling: r[18] as number,
    technique: r[19] as number,
    long_shots: r[20] as number,
    decisions: r[21] as number,
    composure: r[22] as number,
    positioning: r[23] as number,
    vision: r[24] as number,
    anticipation: r[25] as number,
    off_the_ball: r[26] as number,
    work_rate: r[27] as number,
    pace: r[28] as number,
    strength: r[29] as number,
    agility: r[30] as number,
    jumping: r[31] as number,
    reflexes: r[32] as number,
    handling: r[33] as number,
    gk_positioning: r[34] as number,
    one_on_ones: r[35] as number,
    command: r[36] as number,
    stamina: r[37] as number,
    form: r[38] as number,
    injury_prone: r[39] as number,
    traits: JSON.parse((r[40] as string) || "[]"),
    trait_intensity: JSON.parse((r[41] as string) || "{}"),
    injured: Boolean(r[42]),
    injury_duration: r[43] as number,
    injury_type: (r[44] as string | null) ?? null,
    retired: Boolean(r[45]),
    free_agent: Boolean(r[46]),
    on_transfer_list: Boolean(r[47]),
    transfer_ban: Boolean(r[48]),
    in_prison: Boolean(r[49]),
    prison_duration: r[50] as number,
    matches: r[51] as number,
    goals: r[52] as number,
    assists: r[53] as number,
    rating: r[54] as number,
    yellow_cards: r[55] as number,
    red_cards: r[56] as number,
    clean_sheets: r[57] as number,
    career_matches: r[58] as number,
    career_goals: r[59] as number,
    career_assists: r[60] as number,
    career_trophies: r[61] as number,
    agent_id: (r[62] as number | null) ?? null,
    contract_end: r[63] as number,
    wage: r[64] as number,
    pa_ceiling: (r[65] as number) ?? 100,
  };
}

export function getClub(clubId: number): Club | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id,name,league_id,reputation,cash,club_morale,fans,stadium_capacity,
            facilities_level,academy_level,wins,draws,losses,goals_for,goals_against,points
     FROM clubs WHERE id = ?`,
    [clubId],
  );
  const row = res[0]?.values[0];
  return row ? rowToClub(row) : null;
}

// ─── Schedule queries ─────────────────────────────────────────────────────────

// Next unplayed fixture date strictly after currentDay, across all competitions.
export function nextEventDay(currentDay: number): number | null {
  const db = getDB();
  const res = db.exec(`SELECT MIN(date) FROM match_results WHERE home_goals IS NULL AND date > ?`, [currentDay]);
  const val = res[0]?.values[0]?.[0];
  return val != null ? (val as number) : null;
}

// Upcoming fixtures for a specific club (unplayed, soonest first).
export interface UpcomingFixture {
  date: number;
  week: number;
  competition: string;
  stage_id: string;
  home_club_id: number;
  home_club_name: string;
  away_club_id: number;
  away_club_name: string;
}

export interface StandingRow {
  club_id: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export function getLeagueIdForClub(clubId: number): number | null {
  const db = getDB();
  const res = db.exec(`SELECT league_id FROM clubs WHERE id = ?`, [clubId]);
  const val = res[0]?.values[0]?.[0];
  return val != null ? (val as number) : null;
}

export function getStandings(leagueId: number): StandingRow[] {
  const db = getDB();
  const res = db.exec(
    `SELECT id, name, wins+draws+losses, wins, draws, losses, goals_for, goals_against, points
     FROM clubs WHERE league_id = ?
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC`,
    [leagueId],
  );
  return (res[0]?.values ?? []).map((r) => ({
    club_id: r[0] as number,
    name: r[1] as string,
    played: r[2] as number,
    wins: r[3] as number,
    draws: r[4] as number,
    losses: r[5] as number,
    goals_for: r[6] as number,
    goals_against: r[7] as number,
    points: r[8] as number,
  }));
}

export function getUpcoming(clubId: number, fromDay: number, count = 5): UpcomingFixture[] {
  const db = getDB();
  const res = db.exec(
    `SELECT m.date, m.week, m.competition, m.stage_id,
            m.home_club, hc.name, m.away_club, ac.name
     FROM match_results m
     JOIN clubs hc ON hc.id = m.home_club
     JOIN clubs ac ON ac.id = m.away_club
     WHERE (m.home_club = ? OR m.away_club = ?)
       AND m.home_goals IS NULL
       AND m.date > ?
     ORDER BY m.date ASC
     LIMIT ?`,
    [clubId, clubId, fromDay, count],
  );
  return (res[0]?.values ?? []).map((r) => ({
    date: r[0] as number,
    week: r[1] as number,
    competition: r[2] as string,
    stage_id: (r[3] as string) ?? "league",
    home_club_id: r[4] as number,
    home_club_name: r[5] as string,
    away_club_id: r[6] as number,
    away_club_name: r[7] as string,
  }));
}

// ─── Match day processor ──────────────────────────────────────────────────────

function updateClubStanding(clubId: number, gf: number, ga: number): void {
  const db = getDB();
  const win = gf > ga ? 1 : 0;
  const draw = gf === ga ? 1 : 0;
  const loss = gf < ga ? 1 : 0;
  const pts = win * 3 + draw;
  db.run(
    `UPDATE clubs SET
       wins = wins + ?, draws = draws + ?, losses = losses + ?,
       goals_for = goals_for + ?, goals_against = goals_against + ?,
       points = points + ?
     WHERE id = ?`,
    [win, draw, loss, gf, ga, pts, clubId],
  );
}

// 5-tier injury table per AGENTS.md
const INJURY_TIERS: { chance: number; minDays: number; maxDays: number; types: string[] }[] = [
  { chance: 0.45, minDays: 1, maxDays: 3, types: ["muscle_fatigue", "blister", "mild_sprain"] },
  { chance: 0.3, minDays: 7, maxDays: 21, types: ["calf_strain", "hamstring_strain", "ankle_sprain"] },
  { chance: 0.15, minDays: 30, maxDays: 60, types: ["partial_tear", "mcl_strain"] },
  { chance: 0.08, minDays: 60, maxDays: 180, types: ["meniscus_tear", "fracture", "dislocation"] },
  { chance: 0.02, minDays: 180, maxDays: 365, types: ["acl_rupture"] },
];

function rollMatchInjury(p: Player, doctorLevel = 1): { days: number; type: string } | null {
  let prob = 0.006 + p.injury_prone * 0.0022;
  if (p.traits.includes("injury_magnet")) prob *= 1.6;
  if (p.traits.includes("natural_fitness")) prob *= 0.6;
  if (Math.random() >= prob) return null;

  const docDiscount = Math.max(0.6, 1 - (doctorLevel - 1) * 0.08);
  let r = Math.random();
  for (const tier of INJURY_TIERS) {
    r -= tier.chance;
    if (r <= 0) {
      const rawDays = tier.minDays + Math.floor(Math.random() * (tier.maxDays - tier.minDays + 1));
      const days = Math.max(1, Math.round(rawDays * docDiscount));
      const type = tier.types[Math.floor(Math.random() * tier.types.length)];
      return { days, type };
    }
  }
  return { days: 2, type: "muscle_fatigue" };
}

function getCardRules(leagueId: number): { yellow_suspend_at: number; red_ban_matches: number } {
  const db = getDB();
  const res = db.exec(
    `SELECT cc.card_rules FROM leagues l
     JOIN competition_configs cc ON cc.id = l.active_config_id
     WHERE l.id = ?`,
    [leagueId],
  );
  const raw = res[0]?.values[0]?.[0] as string | undefined;
  if (!raw) return { yellow_suspend_at: 5, red_ban_matches: 1 };
  try {
    const parsed = JSON.parse(raw);
    return {
      yellow_suspend_at: parsed.yellow_suspend_at ?? 5,
      red_ban_matches: parsed.red_ban_matches ?? 1,
    };
  } catch {
    return { yellow_suspend_at: 5, red_ban_matches: 1 };
  }
}

function pickCardRecipient(players: Player[]): Player {
  const weights = players.map((p) => {
    let w =
      p.position === "CB" || p.position === "DM"
        ? 1.6
        : p.position === "LB" || p.position === "RB" || p.position === "CM"
          ? 1.3
          : p.position === "GK"
            ? 0.2
            : 0.9;
    if (p.traits.includes("hot_headed")) w *= 1.8;
    if (p.traits.includes("clean_cut") || p.traits.includes("composed")) w *= 0.6;
    return w;
  });
  const total = weights.reduce((s, x) => s + x, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[0];
}

function applyLeadershipMorale(clubId: number, players: Player[], won: boolean): void {
  let delta = 0;
  for (const p of players) {
    if (p.traits.includes("leader") && won) delta += 1;
    if (p.traits.includes("disruptive") && Math.random() < 0.4) delta -= 1;
  }
  if (delta !== 0) {
    getDB().run(`UPDATE clubs SET club_morale = MIN(100, MAX(0, club_morale + ?)) WHERE id = ?`, [delta, clubId]);
  }
}

function updateSquadStats(
  players: Player[],
  gf: number,
  ga: number,
  scorers: MatchResult["scorers"],
  teamYellows: number,
  teamReds: number,
  competitionId: number,
  season: number,
  cardRules: { yellow_suspend_at: number; red_ban_matches: number },
  doctorLevel = 1,
): void {
  const db = getDB();
  const teamDelta = gf > ga ? 0.4 : gf < ga ? -0.3 : 0;

  // Attribute team cards to individual players
  const yellowsByPlayer = new Map<number, number>();
  const redsByPlayer = new Map<number, number>();
  for (let i = 0; i < teamYellows; i++) {
    const p = pickCardRecipient(players);
    yellowsByPlayer.set(p.id, (yellowsByPlayer.get(p.id) ?? 0) + 1);
  }
  for (let i = 0; i < teamReds; i++) {
    const p = pickCardRecipient(players);
    redsByPlayer.set(p.id, 1);
  }

  for (const p of players) {
    let g = 0;
    let a = 0;
    for (const s of scorers) {
      if (s.scorer_id === p.id) g++;
      if (s.assist_id === p.id) a++;
    }
    const yc = yellowsByPlayer.get(p.id) ?? 0;
    const rc = redsByPlayer.get(p.id) ?? 0;
    const cs = p.position === "GK" && ga === 0 ? 1 : 0;
    const matchRating = Math.min(10, Math.max(4, 6.5 + teamDelta + g * 1.0 + a * 0.5 + cs * 0.5 - yc * 0.2 - rc * 1.5));
    let formDelta = (matchRating - 6.5) * 0.03;
    if (p.traits.includes("temperamental")) formDelta *= 1.5;
    else if (formDelta < 0 && p.traits.includes("fragile_mentally")) formDelta *= 1.5;
    const staminaCost = p.traits.includes("natural_fitness") ? 0.22 : 0.3;
    const inj = rollMatchInjury(p, doctorLevel);

    db.run(
      `UPDATE players SET
         matches = matches + 1,
         career_matches = career_matches + 1,
         goals = goals + ?,
         career_goals = career_goals + ?,
         assists = assists + ?,
         career_assists = career_assists + ?,
         clean_sheets = clean_sheets + ?,
         yellow_cards = yellow_cards + ?,
         red_cards = red_cards + ?,
         rating = ROUND((rating * matches + ?) / (matches + 1), 2),
         form = MIN(1.0, MAX(0.1, ROUND(form + ?, 2))),
         stamina = MAX(0.05, ROUND(stamina - ?, 2)),
         injured = CASE WHEN ? > 0 THEN 1 ELSE injured END,
         injury_duration = CASE WHEN ? > 0 THEN ? ELSE injury_duration END,
         injury_type = CASE WHEN ? IS NOT NULL THEN ? ELSE injury_type END
       WHERE id = ?`,
      [
        g,
        g,
        a,
        a,
        cs,
        yc,
        rc,
        matchRating,
        formDelta,
        staminaCost,
        inj ? 1 : 0,
        inj ? 1 : 0,
        inj?.days ?? 0,
        inj?.type ?? null,
        inj?.type ?? null,
        p.id,
      ],
    );

    if (yc > 0 || rc > 0) {
      const cur = db.exec(
        `SELECT yellow_count, red_count, suspended_matches_remaining FROM card_accumulation
         WHERE player_id = ? AND competition_id = ? AND season = ?`,
        [p.id, competitionId, season],
      )[0]?.values[0];
      const oldY = (cur?.[0] as number) ?? 0;
      const oldR = (cur?.[1] as number) ?? 0;
      const oldSus = (cur?.[2] as number) ?? 0;
      const newY = oldY + yc;
      const newR = oldR + rc;
      const yellowBan =
        Math.floor(newY / cardRules.yellow_suspend_at) > Math.floor(oldY / cardRules.yellow_suspend_at) ? 1 : 0;
      const redBan = rc > 0 ? cardRules.red_ban_matches : 0;
      const newSus = oldSus + yellowBan + redBan;

      db.run(
        `INSERT INTO card_accumulation (player_id, competition_id, season, yellow_count, red_count, suspended_matches_remaining)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, competition_id, season) DO UPDATE SET
           yellow_count = excluded.yellow_count,
           red_count = excluded.red_count,
           suspended_matches_remaining = excluded.suspended_matches_remaining`,
        [p.id, competitionId, season, newY, newR, newSus],
      );
    }
  }
}

export interface MatchDayOutput {
  results: MatchResult[];
  watchedSteps: MatchStep[] | null;
  watchedHomeName: string;
  watchedAwayName: string;
}

// Process all unplayed fixtures on `day`. Uses wheelSim for watchClubId's match if provided.
export function processMatchDay(day: number, egoId = 0, watchClubId = 0, season = 1): MatchDayOutput {
  const db = getDB();
  const fixtures = db.exec(
    `SELECT id, league_id, home_club, away_club, stage_id FROM match_results
     WHERE date = ? AND home_goals IS NULL AND league_id < 100`,
    [day],
  );

  const results: MatchResult[] = [];
  let watchedSteps: MatchStep[] | null = null;
  let watchedHomeName = "";
  let watchedAwayName = "";

  for (const row of fixtures[0]?.values ?? []) {
    const [matchId, leagueId, homeId, awayId, stageId] = row as [number, number, number, number, string];
    const competitionId = leagueId as number;

    const homeClub = getClub(homeId);
    const awayClub = getClub(awayId);
    const YOUTH_MAX_AGE: Record<number, number> = {
      30: 21,
      31: 21,
      40: 18,
      41: 18,
      45: 15,
      46: 15,
    };
    const youthAge = YOUTH_MAX_AGE[leagueId];
    const isYouth = youthAge !== undefined;
    const homePlayers = isYouth ? getU21Squad(homeId, egoId, youthAge) : getSquad(homeId, egoId, competitionId, season);
    const awayPlayers = isYouth ? getU21Squad(awayId, egoId, youthAge) : getSquad(awayId, egoId, competitionId, season);

    if (!homeClub || !awayClub || homePlayers.length === 0 || awayPlayers.length === 0) continue;

    // Players currently suspended at these two clubs serve 1 match ban
    db.run(
      `UPDATE card_accumulation
       SET suspended_matches_remaining = suspended_matches_remaining - 1
       WHERE competition_id = ? AND season = ? AND suspended_matches_remaining > 0
         AND player_id IN (SELECT id FROM players WHERE club IN (?, ?))`,
      [competitionId, season, homeId, awayId],
    );

    const homeCfg = getClubManagerConfig(homeId);
    const awayCfg = getClubManagerConfig(awayId);
    const homeStaffBonus = 1 + (homeCfg.staff.coach - 1 + (homeCfg.staff.assistant - 1)) * 0.02;
    const awayStaffBonus = 1 + (awayCfg.staff.coach - 1 + (awayCfg.staff.assistant - 1)) * 0.02;

    const simInput = {
      home_club: homeClub,
      away_club: awayClub,
      home_players: homePlayers,
      away_players: awayPlayers,
      league_level: competitionId === 2 || competitionId === 17 ? 2 : 1,
      date: day,
      league_id: competitionId,
      match_id: matchId as number,
      home_mentality: homeCfg.mentality,
      away_mentality: awayCfg.mentality,
      home_staff_bonus: homeStaffBonus,
      away_staff_bonus: awayStaffBonus,
    };

    let result: MatchResult;
    if (watchClubId > 0 && (homeId === watchClubId || awayId === watchClubId)) {
      const w = wheelSim(simInput);
      result = w.result;
      watchedSteps = w.steps;
      watchedHomeName = homeClub.name;
      watchedAwayName = awayClub.name;
    } else {
      result = fullSim(simInput);
    }

    // Persist result
    db.run(`UPDATE match_results SET home_goals=?, away_goals=?, stats=?, scorers=? WHERE id=?`, [
      result.home_goals,
      result.away_goals,
      JSON.stringify(result.stats),
      JSON.stringify(result.scorers),
      matchId,
    ]);

    const cardRules = getCardRules(competitionId);
    if (stageId !== "championship_sf" && stageId !== "championship_final") {
      updateClubStanding(homeId, result.home_goals, result.away_goals);
      updateClubStanding(awayId, result.away_goals, result.home_goals);
    }
    updateSquadStats(
      homePlayers,
      result.home_goals,
      result.away_goals,
      result.scorers,
      result.stats.home_yellow_cards,
      result.stats.home_red_cards,
      competitionId,
      season,
      cardRules,
      homeCfg.staff.doctor,
    );
    updateSquadStats(
      awayPlayers,
      result.away_goals,
      result.home_goals,
      result.scorers,
      result.stats.away_yellow_cards,
      result.stats.away_red_cards,
      competitionId,
      season,
      cardRules,
      awayCfg.staff.doctor,
    );
    applyLeadershipMorale(homeId, homePlayers, result.home_goals > result.away_goals);
    applyLeadershipMorale(awayId, awayPlayers, result.away_goals > result.home_goals);

    results.push(result);
  }
  return { results, watchedSteps, watchedHomeName, watchedAwayName };
}

export function applyMidMatchScoreUpdate(matchId: number, newHomeGoals: number, newAwayGoals: number): void {
  const db = getDB();
  const row = db.exec(`SELECT home_club, away_club, home_goals, away_goals, stage_id FROM match_results WHERE id = ?`, [
    matchId,
  ])[0]?.values[0];
  if (!row) return;
  const [homeId, awayId, oldHG, oldAG, stageId] = row as [number, number, number, number, string];
  if (oldHG === newHomeGoals && oldAG === newAwayGoals) return;

  db.run(`UPDATE match_results SET home_goals = ?, away_goals = ? WHERE id = ?`, [newHomeGoals, newAwayGoals, matchId]);

  if (stageId !== "championship_sf" && stageId !== "championship_final") {
    const revertStanding = (cid: number, gf: number, ga: number) => {
      const w = gf > ga ? 1 : 0;
      const d = gf === ga ? 1 : 0;
      const l = gf < ga ? 1 : 0;
      const pts = w * 3 + d;
      db.run(
        `UPDATE clubs SET wins = wins - ?, draws = draws - ?, losses = losses - ?,
         goals_for = goals_for - ?, goals_against = goals_against - ?, points = points - ?
         WHERE id = ?`,
        [w, d, l, gf, ga, pts, cid],
      );
    };
    revertStanding(homeId, oldHG, oldAG);
    revertStanding(awayId, oldAG, oldHG);
    updateClubStanding(homeId, newHomeGoals, newAwayGoals);
    updateClubStanding(awayId, newAwayGoals, newHomeGoals);
  }
}

// ─── Season Rollover ──────────────────────────────────────────────────────────

export function rolloverSeason(currentSeason: number, egoId: number): { summary: string; egoAwardsCount: number } {
  const db = getDB();
  const seasonStartDay = (currentSeason - 1) * 365;
  const champ1 = getSeasonChampion(1, seasonStartDay);
  const champ2 = getSeasonChampion(2, seasonStartDay);
  const champ3 = getSeasonChampion(3, seasonStartDay);
  const champ4 = getSeasonChampion(4, seasonStartDay);
  const champ5 = getSeasonChampion(5, seasonStartDay);
  const champ6 = getSeasonChampion(6, seasonStartDay);
  const champ7 = getSeasonChampion(7, seasonStartDay);
  const champ8 = getSeasonChampion(8, seasonStartDay);
  const champ9 = getSeasonChampion(9, seasonStartDay);
  const champ11 = getSeasonChampion(11, seasonStartDay);
  const champ17 = getSeasonChampion(17, seasonStartDay);
  const champ18 = getSeasonChampion(18, seasonStartDay);
  const champ19 = getSeasonChampion(19, seasonStartDay);
  const champ21 = getSeasonChampion(21, seasonStartDay);
  const champ12 = getSeasonChampion(12, seasonStartDay);
  const champ22 = getSeasonChampion(22, seasonStartDay);
  const champ23 = getSeasonChampion(23, seasonStartDay);
  const champ13 = getSeasonChampion(13, seasonStartDay);
  const champ24 = getSeasonChampion(24, seasonStartDay);
  const champ25 = getSeasonChampion(25, seasonStartDay);
  const champ14 = getSeasonChampion(14, seasonStartDay);
  const champ26 = getSeasonChampion(26, seasonStartDay);
  const champ27 = getSeasonChampion(27, seasonStartDay);
  const champ28 = getSeasonChampion(28, seasonStartDay);
  const champ29 = getSeasonChampion(29, seasonStartDay);
  const champ15 = getSeasonChampion(15, seasonStartDay);
  const champ32 = getSeasonChampion(32, seasonStartDay);
  const champ33 = getSeasonChampion(33, seasonStartDay);
  const champ34 = getSeasonChampion(34, seasonStartDay);
  const champ35 = getSeasonChampion(35, seasonStartDay);
  const champ36 = getSeasonChampion(36, seasonStartDay);
  const champ16 = getSeasonChampion(16, seasonStartDay);
  const egoLeagueId =
    (db.exec(`SELECT c.league_id FROM players p JOIN clubs c ON c.id = p.club WHERE p.id = ?`, [egoId])[0]
      ?.values[0]?.[0] as number | undefined) ?? 1;
  const awards = evaluateSeasonAwards(egoLeagueId, egoId);

  // Snapshot standings before promotion/relegation DB updates
  const sMap: Record<number, StandingRow[]> = {
    1: getStandings(1),
    2: getStandings(2),
    5: getStandings(5),
    11: getStandings(11),
    17: getStandings(17),
    18: getStandings(18),
    19: getStandings(19),
    21: getStandings(21),
    12: getStandings(12),
    22: getStandings(22),
    23: getStandings(23),
    13: getStandings(13),
    24: getStandings(24),
    25: getStandings(25),
    14: getStandings(14),
    26: getStandings(26),
    27: getStandings(27),
    28: getStandings(28),
    29: getStandings(29),
    15: getStandings(15),
    32: getStandings(32),
    33: getStandings(33),
    34: getStandings(34),
    35: getStandings(35),
    36: getStandings(36),
  };
  let egoSummary = "";
  let promoRelegSummary = "";

  db.run("BEGIN TRANSACTION");
  try {
    // 1. Award trophy to league champion squads
    for (const ch of [
      champ1, champ2, champ3, champ4, champ5, champ6, champ7, champ8, champ9,
      champ11, champ17, champ18, champ19, champ21,
      champ12, champ22, champ23,
      champ13, champ24, champ25,
      champ14, champ26, champ27,
      champ28, champ29,
      champ15, champ32,
      champ33, champ34,
      champ35, champ36,
      champ16,
    ]) {
      if (ch) {
        db.run(`UPDATE players SET career_trophies = career_trophies + 1 WHERE club = ? AND retired = 0`, [ch.club_id]);
      }
    }

    // 2. Archive season stats into player_stats
    db.run(
      `INSERT INTO player_stats (player_id, club_id, competition_id, season, matches, goals, assists, rating, yellow_cards, red_cards, clean_sheets, league_id)
       SELECT p.id, p.club, COALESCE(c.league_id, 1), ?, p.matches, p.goals, p.assists, p.rating, p.yellow_cards, p.red_cards, p.clean_sheets, COALESCE(c.league_id, 1)
       FROM players p LEFT JOIN clubs c ON c.id = p.club
       WHERE p.retired = 0 AND p.matches > 0`,
      [currentSeason],
    );

    // 3. Recalculate PA/CA for active club players + ego player
    const activeIds =
      (db.exec(
        `SELECT p.id, COALESCE(c.facilities_level, 2) FROM players p LEFT JOIN clubs c ON c.id = p.club WHERE p.retired = 0 AND (p.club IS NOT NULL OR p.id = ?)`,
        [egoId],
      )[0]?.values as [number, number][] | undefined) ?? [];

    for (const [pid, facLevel] of activeIds) {
      const p = getPlayer(pid);
      if (!p) continue;
      // facilities_level (1-5) maps to trainingQuality (50-95); trait modifies effort
      let trainingQuality = 40 + facLevel * 11;
      if (p.traits.includes("professional")) trainingQuality = Math.min(95, trainingQuality + 15);
      else if (p.traits.includes("lazy")) trainingQuality = Math.max(25, trainingQuality - 15);
      const { new_pa, new_ca } = recalcPACA(p, 34, trainingQuality);
      const attrDelta = new_ca - p.ca;

      if (pid === egoId) {
        const caDiff = new_ca - p.ca;
        const paDiff = new_pa - p.pa;
        const caStr = caDiff >= 0 ? `+${caDiff}` : `${caDiff}`;
        const paStr = paDiff >= 0 ? `+${paDiff}` : `${paDiff}`;
        egoSummary = `OVR ${p.ca}→${new_ca} (${caStr}), PA ${p.pa}→${new_pa} (${paStr})`;
      }

      if (attrDelta !== 0 || new_pa !== p.pa) {
        const d = attrDelta;
        db.run(
          `UPDATE players SET
             ca = ?, pa = ?, overall = ?,
             finishing = MIN(100, MAX(1, finishing + ?)),
             passing = MIN(100, MAX(1, passing + ?)),
             dribbling = MIN(100, MAX(1, dribbling + ?)),
             heading = MIN(100, MAX(1, heading + ?)),
             crossing = MIN(100, MAX(1, crossing + ?)),
             tackling = MIN(100, MAX(1, tackling + ?)),
             technique = MIN(100, MAX(1, technique + ?)),
             long_shots = MIN(100, MAX(1, long_shots + ?)),
             decisions = MIN(100, MAX(1, decisions + ?)),
             composure = MIN(100, MAX(1, composure + ?)),
             positioning = MIN(100, MAX(1, positioning + ?)),
             vision = MIN(100, MAX(1, vision + ?)),
             anticipation = MIN(100, MAX(1, anticipation + ?)),
             off_the_ball = MIN(100, MAX(1, off_the_ball + ?)),
             work_rate = MIN(100, MAX(1, work_rate + ?)),
             pace = MIN(100, MAX(1, pace + ?)),
             strength = MIN(100, MAX(1, strength + ?)),
             agility = MIN(100, MAX(1, agility + ?)),
             jumping = MIN(100, MAX(1, jumping + ?)),
             reflexes = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, reflexes + ?)) ELSE reflexes END,
             handling = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, handling + ?)) ELSE handling END,
             gk_positioning = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, gk_positioning + ?)) ELSE gk_positioning END,
             one_on_ones = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, one_on_ones + ?)) ELSE one_on_ones END,
             command = CASE WHEN position = 'GK' THEN MIN(100, MAX(1, command + ?)) ELSE command END
           WHERE id = ?`,
          [new_ca, new_pa, new_ca, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, d, pid],
        );
      }
    }

    // 4. Age +1, retire veterans (non-ego >= 36), auto-renew expiring club contracts, and reset season counters
    const nextSeasonStartDay = currentSeason * 365;
    db.run(`UPDATE players SET age = age + 1 WHERE retired = 0`);
    db.run(`UPDATE players SET retired = 1, club = NULL, free_agent = 0 WHERE age >= 36 AND id != ?`, [egoId]);
    const veteranStaffRes = convertRetiringLegendsToAIStaff(currentSeason);
    db.run(`UPDATE players SET contract_end = contract_end + 365 WHERE club IS NOT NULL AND contract_end <= ?`, [
      nextSeasonStartDay + 30,
    ]);
    db.run(
      `UPDATE players SET
         matches = 0, goals = 0, assists = 0, rating = 0.0,
         yellow_cards = 0, red_cards = 0, clean_sheets = 0,
         stamina = 1.0, injured = 0, injury_duration = 0, injury_type = NULL`,
    );

    // 4b. Automatic Promotion & Relegation
    const promoRelTiers = [
      // Indonesia (3 clubs)
      { upperId: 1, lowerId: 2, upperName: "Liga 1", lowerName: "Liga 2", count: 3, cashBonus: 3_000_000_000, repUp: 5, repDown: 4 },
      { upperId: 2, lowerId: 5, upperName: "Liga 2", lowerName: "Liga 3", count: 3, cashBonus: 1_000_000_000, repUp: 4, repDown: 3 },
      // England Pyramid (2 clubs per boundary)
      { upperId: 11, lowerId: 17, upperName: "Premier League", lowerName: "Championship", count: 2, cashBonus: 50_000_000_000, repUp: 5, repDown: 4 },
      { upperId: 17, lowerId: 18, upperName: "Championship", lowerName: "League One", count: 2, cashBonus: 15_000_000_000, repUp: 4, repDown: 3 },
      { upperId: 18, lowerId: 19, upperName: "League One", lowerName: "League Two", count: 2, cashBonus: 8_000_000_000, repUp: 3, repDown: 3 },
      { upperId: 19, lowerId: 21, upperName: "League Two", lowerName: "National League", count: 2, cashBonus: 4_000_000_000, repUp: 3, repDown: 2 },
      // Spain (2 clubs)
      { upperId: 12, lowerId: 22, upperName: "La Liga", lowerName: "Segunda", count: 2, cashBonus: 35_000_000_000, repUp: 4, repDown: 4 },
      { upperId: 22, lowerId: 23, upperName: "Segunda", lowerName: "Primera Fed", count: 2, cashBonus: 10_000_000_000, repUp: 3, repDown: 3 },
      // Italy (2 clubs)
      { upperId: 13, lowerId: 24, upperName: "Serie A", lowerName: "Serie B", count: 2, cashBonus: 30_000_000_000, repUp: 4, repDown: 4 },
      { upperId: 24, lowerId: 25, upperName: "Serie B", lowerName: "Serie C", count: 2, cashBonus: 8_000_000_000, repUp: 3, repDown: 3 },
      // Germany (2 clubs)
      { upperId: 14, lowerId: 26, upperName: "Bundesliga", lowerName: "2. Bundesliga", count: 2, cashBonus: 35_000_000_000, repUp: 4, repDown: 4 },
      { upperId: 26, lowerId: 27, upperName: "2. Bundesliga", lowerName: "3. Liga", count: 2, cashBonus: 10_000_000_000, repUp: 3, repDown: 3 },
      // France (2 clubs)
      { upperId: 28, lowerId: 29, upperName: "Ligue 1", lowerName: "Ligue 2", count: 2, cashBonus: 25_000_000_000, repUp: 4, repDown: 4 },
      // Netherlands (2 clubs)
      { upperId: 15, lowerId: 32, upperName: "Eredivisie", lowerName: "Eerste Divisie", count: 2, cashBonus: 15_000_000_000, repUp: 4, repDown: 3 },
      // Portugal (2 clubs)
      { upperId: 33, lowerId: 34, upperName: "Primeira Liga", lowerName: "Liga Portugal 2", count: 2, cashBonus: 18_000_000_000, repUp: 4, repDown: 3 },
      // Turkey (2 clubs)
      { upperId: 35, lowerId: 36, upperName: "Süper Lig", lowerName: "TFF 1. Lig", count: 2, cashBonus: 18_000_000_000, repUp: 4, repDown: 3 },
    ];

    const promoRelParts: string[] = [];
    for (const tier of promoRelTiers) {
      const uStandings = sMap[tier.upperId] ?? [];
      const lStandings = sMap[tier.lowerId] ?? [];
      if (uStandings.length >= tier.count && lStandings.length >= tier.count) {
        const relegated = uStandings.slice(-tier.count);
        const promoted = lStandings.slice(0, tier.count);
        for (const r of relegated) {
          db.run(`UPDATE clubs SET league_id = ?, reputation = MAX(15, reputation - ?) WHERE id = ?`, [
            tier.lowerId,
            tier.repDown,
            r.club_id,
          ]);
          db.run(`UPDATE league_slots SET league_id = ? WHERE club_id = ?`, [tier.lowerId, r.club_id]);
        }
        for (const p of promoted) {
          db.run(
            `UPDATE clubs SET league_id = ?, reputation = MIN(95, reputation + ?), cash = cash + ? WHERE id = ?`,
            [tier.upperId, tier.repUp, tier.cashBonus, p.club_id],
          );
          db.run(`UPDATE league_slots SET league_id = ? WHERE club_id = ?`, [tier.upperId, p.club_id]);
        }
        promoRelParts.push(
          `⬆️ Promosi ${tier.upperName}: ${promoted.map((c) => c.name).join(", ")} · ⬇️ Degradasi ${tier.lowerName}: ${relegated.map((c) => c.name).join(", ")}`,
        );
      }
    }
    promoRelegSummary = promoRelParts.join(" | ");

    // 5. Reset club standings and promote youth academy graduates
    db.run(`UPDATE clubs SET wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, points = 0`);
    const youthPromoted = generateYouthRegens(currentSeason);

    // 6. Generate next season fixtures for all active leagues
    for (const [lid, compKey, dayOffset, spacing] of [
      [1, "liga1", 7, 7],
      [2, "liga2", 7, 7],
      [5, "liga3", 7, 7],
      [3, "msl", 7, 14],
      [4, "tl1", 7, 14],
      [6, "j1", 7, 14],
      [7, "k1", 7, 14],
      [8, "spl_saudi", 7, 14],
      [9, "spl_sg", 7, 14],
      [11, "epl", 7, 14],
      [17, "efl", 7, 14],
      [18, "league_one", 7, 14],
      [19, "league_two", 7, 14],
      [21, "nat_league", 7, 14],
      [12, "laliga", 7, 14],
      [22, "segunda", 7, 14],
      [23, "primera_fed", 7, 14],
      [13, "seriea", 7, 14],
      [24, "serie_b", 7, 14],
      [25, "serie_c", 7, 14],
      [14, "bundesliga", 7, 14],
      [26, "2_bundesliga", 7, 14],
      [27, "3_liga", 7, 14],
      [28, "ligue1", 7, 14],
      [29, "ligue2", 7, 14],
      [15, "eredivisie", 7, 14],
      [32, "eerste_divisie", 7, 14],
      [33, "primeira_liga", 7, 14],
      [34, "liga_portugal_2", 7, 14],
      [35, "super_lig", 7, 14],
      [36, "tff_1_lig", 7, 14],
      [16, "vleague", 7, 14],
    ] as const) {
      const cRows = db.exec(`SELECT id FROM clubs WHERE league_id = ? ORDER BY id`, [lid])[0]?.values ?? [];
      const cIds = cRows.map((r) => r[0] as number);
      if (cIds.length >= 2) {
        generateMultiStageFixtures(lid, cIds, nextSeasonStartDay + dayOffset, compKey, spacing);
      }
    }

    // Youth/Reserve Leagues (U-15, U-18, U-21)
    for (const [youthLid, parentLid, offset, compKey, spacing] of [
      [30, 1, 11, "u21", 7],
      [31, 11, 12, "epl_u21", 14],
      [40, 1, 13, "epa_u18", 7],
      [41, 11, 14, "epl_u18", 14],
      [45, 1, 15, "epa_u15", 7],
      [46, 11, 16, "epl_u15", 14],
    ] as const) {
      const rows = db.exec(`SELECT id FROM clubs WHERE league_id = ? ORDER BY id`, [parentLid])[0]?.values ?? [];
      const cIds = rows.map((r) => r[0] as number);
      if (cIds.length >= 2) {
        generateMultiStageFixtures(youthLid, cIds, nextSeasonStartDay + offset, compKey, spacing);
      }
    }

    db.run("COMMIT");
    const parts = [
      `🏆 Juara Liga 1: ${champ1?.name ?? "-"} (${champ1?.points ?? 0} poin)`,
      champ2 ? `🥇 Juara Liga 2: ${champ2.name} (${champ2.points} poin)` : "",
      champ5 ? `🎖️ Juara Liga 3: ${champ5.name}` : "",
      champ3 ? `🇲🇾 Juara Malaysia: ${champ3.name}` : "",
      champ4 ? `🇹🇭 Juara Thailand: ${champ4.name}` : "",
      champ6 ? `🇯🇵 Juara J-League: ${champ6.name}` : "",
      champ7 ? `🇰🇷 Juara K-League: ${champ7.name}` : "",
      champ8 ? `🇸🇦 Juara Saudi Pro: ${champ8.name}` : "",
      champ9 ? `🇸🇬 Juara Singapura: ${champ9.name}` : "",
      champ11 ? `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Juara Premier League: ${champ11.name}` : "",
      champ17 ? `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Juara Championship: ${champ17.name}` : "",
      champ18 ? `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Juara League One: ${champ18.name}` : "",
      champ19 ? `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Juara League Two: ${champ19.name}` : "",
      champ21 ? `🏴󠁧󠁢󠁥󠁮󠁧󠁿 Juara National League: ${champ21.name}` : "",
      champ12 ? `🇪🇸 Juara La Liga: ${champ12.name}` : "",
      champ22 ? `🇪🇸 Juara Segunda: ${champ22.name}` : "",
      champ23 ? `🇪🇸 Juara Primera Fed: ${champ23.name}` : "",
      champ13 ? `🇮🇹 Juara Serie A: ${champ13.name}` : "",
      champ24 ? `🇮🇹 Juara Serie B: ${champ24.name}` : "",
      champ25 ? `🇮🇹 Juara Serie C: ${champ25.name}` : "",
      champ14 ? `🇩🇪 Juara Bundesliga: ${champ14.name}` : "",
      champ26 ? `🇩🇪 Juara 2. Bundesliga: ${champ26.name}` : "",
      champ27 ? `🇩🇪 Juara 3. Liga: ${champ27.name}` : "",
      champ28 ? `🇫🇷 Juara Ligue 1: ${champ28.name}` : "",
      champ29 ? `🇫🇷 Juara Ligue 2: ${champ29.name}` : "",
      champ15 ? `🇳🇱 Juara Eredivisie: ${champ15.name}` : "",
      champ32 ? `🇳🇱 Juara Eerste Divisie: ${champ32.name}` : "",
      champ33 ? `🇵🇹 Juara Primeira Liga: ${champ33.name}` : "",
      champ34 ? `🇵🇹 Juara Liga Portugal 2: ${champ34.name}` : "",
      champ35 ? `🇹🇷 Juara Süper Lig: ${champ35.name}` : "",
      champ36 ? `🇹🇷 Juara TFF 1. Lig: ${champ36.name}` : "",
      champ16 ? `🇻🇳 Juara V.League: ${champ16.name}` : "",
      promoRelegSummary,
      awards.summary,
      egoSummary ? `Evaluasi Musim: ${egoSummary}` : "",
      youthPromoted > 0 ? `🌱 ${youthPromoted} lulusan akademi muda promosi ke skuad utama` : "",
      veteranStaffRes.summaries.length > 0 ? veteranStaffRes.summaries.join(" · ") : "",
    ].filter(Boolean);

    return { summary: parts.join(" · "), egoAwardsCount: awards.egoAwards.length };
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}
