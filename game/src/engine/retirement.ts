import { getDB } from "./db.js";
import { getLeagueIdForClub, getClubManagerConfig, saveClubConfig, type ClubStaffLevels } from "./scheduler.js";
import { transitionToChild } from "./world_ai.js";
import type { EgoState, WorldState, Position } from "../types/index.js";

export interface ManagerClubOffer {
  clubId: number;
  clubName: string;
  leagueId: number;
  leagueName: string;
  reputation: number;
  wageOffer: number;
}

export interface AgentPathInfo {
  startingCash: number;
  startingReputation: number;
  judgeCa: number;
  judgePa: number;
  defaultAgencyName: string;
}

export interface ClubStaffOffer {
  clubId: number;
  clubName: string;
  leagueName: string;
  role: keyof ClubStaffLevels;
  roleName: string;
  monthlySalary: number;
  effectDesc: string;
}

export interface PunditActionLog {
  day: number;
  actionId: string;
  title: string;
  summary: string;
}

export interface PunditState {
  playerId: number;
  name: string;
  fame: number; // 1-100
  credibility: number; // 1-100
  controversy_level: number; // 1-100
  total_earnings: number;
  monthly_royalty: number;
  active_shows: string[];
  last_action_day?: number;
  last_summary?: string;
  history?: PunditActionLog[];
}

export interface PunditReactionOption {
  id: "criticize_manager" | "praise_wonderkid" | "leak_dressing_room" | "neutral_analysis";
  title: string;
  desc: string;
  fameDelta: number;
  credibilityDelta: number;
  controversyDelta: number;
}

export interface RetirementOptions {
  playerId: number;
  playerName: string;
  age: number;
  overall: number;
  careerMatches: number;
  careerGoals: number;
  careerTrophies: number;
  savings: number;
  isEligible: boolean;
  managerOffers: ManagerClubOffer[];
  agentInfo: AgentPathInfo;
  staffOffers: ClubStaffOffer[];
  punditInit: PunditState;
  punditOptions: PunditReactionOption[];
  canChildTransition: boolean;
}

const LEAGUE_NAMES: Record<number, string> = {
  1: "BRI Liga 1",
  2: "Pegadaian Liga 2",
  3: "Malaysia Super League",
  4: "Thai League 1",
  5: "Liga 3 Indonesia",
  6: "Singapore Premier League",
  7: "V.League 1 Vietnam",
  8: "A-League Australia",
  9: "Saudi Pro League",
  11: "Premier League Inggris",
  17: "EFL Championship",
  12: "La Liga Spanyol",
  13: "Serie A Italia",
  14: "Bundesliga Jerman",
  15: "Ligue 1 Prancis",
  16: "Eredivisie Belanda",
};

export const PUNDIT_REACTION_OPTIONS: PunditReactionOption[] = [
  {
    id: "criticize_manager",
    title: "💥 Kritik Tajam Taktik Manajer",
    desc: "Sorot kelemahan taktik & rotasi pelatih. Menarik perhatian publik namun menurunkan moral klub sasaran.",
    fameDelta: 4,
    credibilityDelta: 1,
    controversyDelta: 6,
  },
  {
    id: "praise_wonderkid",
    title: "⭐ Puji Wonderkid & Analisis Taktik",
    desc: "Bedah teknis performa talenta muda. Meningkatkan kredibilitas analisis Anda dan mendongkrak moral pemain.",
    fameDelta: 2,
    credibilityDelta: 5,
    controversyDelta: -2,
  },
  {
    id: "leak_dressing_room",
    title: "💣 Bocorkan Isu Ruang Ganti",
    desc: "Bongkar ketegangan internal tim dan rumor transfer panas. Ledakan ketenaran viral namun risiko kontroversi tinggi.",
    fameDelta: 7,
    credibilityDelta: -3,
    controversyDelta: 10,
  },
  {
    id: "neutral_analysis",
    title: "⚖️ Analisis Netral Kinerja Wasit & VAR",
    desc: "Evaluasi objektif keputusan kontroversial di atas lapangan. Memperkuat reputasi sebagai analis berbobot.",
    fameDelta: 1,
    credibilityDelta: 4,
    controversyDelta: -4,
  },
];

// ─── 1. Get Retirement Options ───────────────────────────────────────────────

export function getRetirementOptions(egoPlayerId: number): RetirementOptions {
  const db = getDB();

  const res = db.exec(
    `SELECT id, name, age, overall, decisions, vision, technique,
            career_matches, career_goals, career_trophies, wage, traits,
            injured, injury_type, injury_duration, retired, club
     FROM players WHERE id = ?`,
    [egoPlayerId],
  );

  const row = res[0]?.values[0];
  if (!row) {
    throw new Error(`Player with ID ${egoPlayerId} not found`);
  }

  const [
    id, name, age, overall, decisions, vision, technique,
    careerMatches, careerGoals, careerTrophies, wage, traitsStr,
    injured, injuryType, injuryDuration, retired, clubId
  ] = row as [
    number, string, number, number, number, number, number,
    number, number, number, number, string,
    number, string | null, number, number, number | null
  ];

  let traits: string[] = [];
  try {
    traits = JSON.parse(traitsStr || "[]");
  } catch {
    traits = [];
  }

  const isOld = age >= 32;
  const isSevereInjury = Boolean(injured && (injuryType === "acl_rupture" || injuryDuration >= 90));
  const isEligible = isOld || isSevereInjury || Boolean(retired);

  // ponytail: Simple estimated lifetime career savings formula without maintaining separate transaction table
  const savings = Math.max(
    50_000_000,
    wage * 24 + careerMatches * 600_000 + careerTrophies * 80_000_000,
  );

  // 1A. Manager Offers: Pick clubs matching player stature
  const allClubsRes = db.exec(`SELECT id, name, league_id, reputation FROM clubs WHERE id <= 1000 ORDER BY reputation DESC`);
  const allClubs = (allClubsRes[0]?.values ?? []) as [number, string, number, number][];

  const managerOffers: ManagerClubOffer[] = [];
  // Prioritize player's current club if existing
  if (clubId) {
    const curClub = allClubs.find((c) => c[0] === clubId);
    if (curClub) {
      managerOffers.push({
        clubId: curClub[0],
        clubName: curClub[1],
        leagueId: curClub[2],
        leagueName: LEAGUE_NAMES[curClub[2]] ?? "Liga Profesional",
        reputation: curClub[3],
        wageOffer: Math.round(curClub[3] * 900_000 + 20_000_000),
      });
    }
  }

  // Filter available clubs based on reputation tiers
  let targetLeagues = [1, 2, 5];
  let minRep = 20;
  let maxRep = 45;

  if (overall >= 74 || careerTrophies >= 2) {
    targetLeagues = [1, 2];
    minRep = 45;
    maxRep = 75;
  } else if (overall >= 60) {
    targetLeagues = [2, 5];
    minRep = 30;
    maxRep = 55;
  }

  const pool = allClubs.filter(
    (c) => targetLeagues.includes(c[2]) && c[3] >= minRep && c[3] <= maxRep && c[0] !== clubId,
  );

  // Pick up to 3 distinct clubs
  for (let i = 0; i < pool.length && managerOffers.length < 4; i += Math.max(1, Math.floor(pool.length / 3))) {
    const c = pool[i];
    if (c && !managerOffers.some((o) => o.clubId === c[0])) {
      managerOffers.push({
        clubId: c[0],
        clubName: c[1],
        leagueId: c[2],
        leagueName: LEAGUE_NAMES[c[2]] ?? "Liga Profesional",
        reputation: c[3],
        wageOffer: Math.round(c[3] * 800_000 + 15_000_000),
      });
    }
  }

  // 1B. Agent Path Info
  const agentRep = Math.min(75, Math.max(28, Math.round(overall * 0.65 + careerTrophies * 4)));
  const judgeCa = Math.min(88, Math.max(45, Math.round(overall * 0.75 + 15)));
  const judgePa = Math.min(88, Math.max(45, Math.round(overall * 0.70 + 20)));
  const agentInfo: AgentPathInfo = {
    startingCash: savings,
    startingReputation: agentRep,
    judgeCa,
    judgePa,
    defaultAgencyName: `${name} Sports Management`,
  };

  // 1C. Club Staff Offers
  const staffTargetClub = managerOffers[0] || {
    clubId: clubId ?? 1,
    clubName: "Klub Profesional",
    leagueName: "BRI Liga 1",
    reputation: 50,
  };

  const staffOffers: ClubStaffOffer[] = [
    {
      clubId: staffTargetClub.clubId,
      clubName: staffTargetClub.clubName,
      leagueName: staffTargetClub.leagueName,
      role: "coach",
      roleName: "Pelatih Kepala Taktik & Formasi",
      monthlySalary: Math.round(staffTargetClub.reputation * 600_000 + 15_000_000),
      effectDesc: "+2 Level Coach Klub (+4% Efektivitas Taktik & Latihan PA)",
    },
    {
      clubId: staffTargetClub.clubId,
      clubName: staffTargetClub.clubName,
      leagueName: staffTargetClub.leagueName,
      role: "assistant",
      roleName: "Asisten Manajer Klub",
      monthlySalary: Math.round(staffTargetClub.reputation * 500_000 + 12_000_000),
      effectDesc: "+2 Level Assistant Klub (+4% Kohesi Skuad)",
    },
    {
      clubId: staffTargetClub.clubId,
      clubName: staffTargetClub.clubName,
      leagueName: staffTargetClub.leagueName,
      role: "physio",
      roleName: "Spesialis Kebugaran & Scouting",
      monthlySalary: Math.round(staffTargetClub.reputation * 400_000 + 10_000_000),
      effectDesc: "+2 Level Fisioterapis Klub (Pemulihan stamina harian pemain)",
    },
  ];

  // 1D. Pundit Init
  const fame = Math.min(95, Math.max(30, Math.round(overall * 0.65 + careerMatches * 0.08 + careerTrophies * 5)));
  const credibility = Math.min(95, Math.max(30, Math.round((decisions + vision + technique) / 3)));
  let controversy = 30;
  if (traits.includes("controversial") || traits.includes("hot_headed") || traits.includes("temperamental")) {
    controversy = 60;
  } else if (traits.includes("composed") || traits.includes("clean_cut") || traits.includes("professional")) {
    controversy = 15;
  }

  const punditInit: PunditState = {
    playerId: id,
    name,
    fame,
    credibility,
    controversy_level: controversy,
    total_earnings: 0,
    monthly_royalty: Math.round(fame * 450_000 + 15_000_000),
    active_shows: ["Studio Bola Prima TV", "Podcast Ruang Ganti", "Kolom Opini Harian"],
    history: [],
  };

  return {
    playerId: id,
    playerName: name,
    age,
    overall,
    careerMatches,
    careerGoals,
    careerTrophies,
    savings,
    isEligible,
    managerOffers,
    agentInfo,
    staffOffers,
    punditInit,
    punditOptions: PUNDIT_REACTION_OPTIONS,
    canChildTransition: age >= 28 || Boolean(retired),
  };
}

// ─── 2. Choose Retirement Path ───────────────────────────────────────────────

export function chooseRetirementPath(
  egoPlayerId: number,
  choice: "manager" | "agent" | "staff" | "pundit" | "child",
  extraData?: {
    clubId?: number;
    agencyName?: string;
    role?: keyof ClubStaffLevels;
    childName?: string;
    egoState?: EgoState;
    currentDay?: number;
  },
): {
  mode: "manager" | "agent" | "pundit" | "player";
  characterId: number;
  summary: string;
  punditState?: PunditState;
  newPlayerId?: number;
} {
  const db = getDB();

  // Retire current player if not already retired
  db.run(`UPDATE players SET retired = 1, club = NULL, free_agent = 0 WHERE id = ?`, [egoPlayerId]);

  const pRow = db.exec(`SELECT name, overall, wage, career_matches, career_trophies FROM players WHERE id = ?`, [egoPlayerId])[0]?.values[0];
  const playerName = (pRow?.[0] as string) ?? "Pemain";
  const overall = (pRow?.[1] as number) ?? 60;
  const careerTrophies = (pRow?.[4] as number) ?? 0;

  if (choice === "manager") {
    const clubId = extraData?.clubId ?? 1;
    db.run(`UPDATE clubs SET manager_id = ? WHERE id = ?`, [egoPlayerId, clubId]);
    const clubName = (db.exec(`SELECT name FROM clubs WHERE id = ?`, [clubId])[0]?.values[0]?.[0] as string) ?? "Klub";

    return {
      mode: "manager",
      characterId: clubId,
      summary: `👔 Era baru dimulai! ${playerName} resmi diangkat sebagai Manajer ${clubName}. Buktikan tangan dinginmu di pinggir lapangan!`,
    };
  }

  if (choice === "agent") {
    const maxRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM agents`);
    const newAgentId = ((maxRes[0]?.values[0]?.[0] as number) ?? 0) + 1;
    const agencyName = extraData?.agencyName?.trim() || `${playerName} Sports Agency`;

    const savings = Math.max(50_000_000, ((pRow?.[2] as number) ?? 10_000_000) * 24 + ((pRow?.[3] as number) ?? 0) * 600_000);
    const agentRep = Math.min(75, Math.max(28, Math.round(overall * 0.65 + careerTrophies * 4)));
    const judgeCa = Math.min(88, Math.max(45, Math.round(overall * 0.75 + 15)));
    const judgePa = Math.min(88, Math.max(45, Math.round(overall * 0.70 + 20)));

    db.run(
      `INSERT INTO agents (id, name, reputation, cash, monthly_costs, credit_score, consecutive_missed, bankrupt, office_level, judge_ca, judge_pa)
       VALUES (?, ?, ?, ?, 2000000, 70, 0, 0, 0, ?, ?)`,
      [newAgentId, agencyName, agentRep, savings, judgeCa, judgePa],
    );

    // Assign starter clients (koneksi mantan pemain profesional)
    const clientCandidates = db.exec(
      `SELECT id FROM players WHERE retired = 0 AND agent_id IS NULL AND age <= 22 ORDER BY pa DESC LIMIT 2`,
    )[0]?.values;
    if (clientCandidates && clientCandidates.length > 0) {
      for (const row of clientCandidates) {
        db.run(`UPDATE players SET agent_id = ? WHERE id = ?`, [newAgentId, row[0]]);
      }
    }

    return {
      mode: "agent",
      characterId: newAgentId,
      summary: `💼 Kantor resmi dibuka! ${playerName} mendirikan ${agencyName} dengan modal Rp ${(savings / 1_000_000).toFixed(0)}M.`,
    };
  }

  if (choice === "staff") {
    const clubId = extraData?.clubId ?? 1;
    const role: keyof ClubStaffLevels = extraData?.role ?? "coach";
    const clubName = (db.exec(`SELECT name FROM clubs WHERE id = ?`, [clubId])[0]?.values[0]?.[0] as string) ?? "Klub";

    // Boost club staff level
    const cfg = getClubManagerConfig(clubId);
    const nextStaff = { ...cfg.staff, [role]: Math.min(5, cfg.staff[role] + 2) };
    saveClubConfig(clubId, { ...cfg, staff: nextStaff });

    // Set ego to manage the club with specialized staff role
    db.run(`UPDATE clubs SET manager_id = ? WHERE id = ?`, [egoPlayerId, clubId]);

    const roleTitleMap: Record<keyof ClubStaffLevels, string> = {
      coach: "Pelatih Kepala Taktik",
      assistant: "Asisten Manajer",
      physio: "Spesialis Medis & Fisik",
      doctor: "Dokter Tim",
    };

    return {
      mode: "manager",
      characterId: clubId,
      summary: `📋 ${playerName} resmi bergabung ke ${clubName} sebagai ${roleTitleMap[role] ?? "Staf Khusus"}. Staf klub ditingkatkan!`,
    };
  }

  if (choice === "pundit") {
    const options = getRetirementOptions(egoPlayerId);
    const punditState = options.punditInit;

    db.run(
      `INSERT OR REPLACE INTO world_state (key, value) VALUES ('ego_pundit_state', ?)`,
      [JSON.stringify(punditState)],
    );

    return {
      mode: "pundit",
      characterId: egoPlayerId,
      punditState,
      summary: `🎙️ ${playerName} resmi menjadi Pundit & Komentator Olahraga! Sorot pertandingan dan pengaruhi sepak bola lewat mikrofon!`,
    };
  }

  if (choice === "child") {
    const egoState = extraData?.egoState ?? {
      mode: "player",
      character_id: egoPlayerId,
      age: 34,
      alive: true,
      legacy_score: 50,
      children: [],
    };
    const res = transitionToChild(egoPlayerId, egoState, extraData?.currentDay ?? 0, extraData?.childName);
    return {
      mode: "player",
      characterId: res.newPlayerId,
      newPlayerId: res.newPlayerId,
      summary: res.summary,
    };
  }

  throw new Error(`Invalid retirement choice: ${choice}`);
}

// ─── 3. Pundit Weekly Tick & Actions ─────────────────────────────────────────

export function getPunditState(): PunditState | null {
  const db = getDB();
  const row = db.exec(`SELECT value FROM world_state WHERE key = 'ego_pundit_state'`)[0]?.values[0]?.[0];
  if (!row) return null;
  try {
    return JSON.parse(row as string) as PunditState;
  } catch {
    return null;
  }
}

export function tickPunditWeek(
  punditState: PunditState,
  currentDay: number,
): { updatedState: PunditState; monthlyPayout: number; summary: string } {
  const db = getDB();
  let monthlyPayout = 0;
  let summary = "";

  // Monthly payout check every 30 days
  const isMonthlyPayday = currentDay > 0 && currentDay % 30 === 0;
  if (isMonthlyPayday) {
    monthlyPayout = punditState.monthly_royalty;
    punditState.total_earnings += monthlyPayout;
    summary = `💰 Royalti media bulan ini sebesar Rp ${(monthlyPayout / 1_000_000).toFixed(0)}jt telah ditransfer ke rekening Anda!`;
  }

  // Update world_state in DB
  db.run(
    `INSERT OR REPLACE INTO world_state (key, value) VALUES ('ego_pundit_state', ?)`,
    [JSON.stringify(punditState)],
  );

  return {
    updatedState: punditState,
    monthlyPayout,
    summary,
  };
}

export function executePunditAction(
  punditState: PunditState,
  actionId: PunditReactionOption["id"],
  currentDay: number,
  targetClubId?: number,
  targetPlayerId?: number,
): { updatedState: PunditState; summary: string } {
  const db = getDB();
  const option = PUNDIT_REACTION_OPTIONS.find((o) => o.id === actionId);
  if (!option) throw new Error(`Unknown pundit action: ${actionId}`);

  punditState.fame = Math.min(100, Math.max(1, punditState.fame + option.fameDelta));
  punditState.credibility = Math.min(100, Math.max(1, punditState.credibility + option.credibilityDelta));
  punditState.controversy_level = Math.min(100, Math.max(1, punditState.controversy_level + option.controversyDelta));
  punditState.last_action_day = currentDay;

  // Recalculate monthly royalty based on updated fame & controversy
  punditState.monthly_royalty = Math.round(
    punditState.fame * 450_000 + (punditState.controversy_level > 50 ? punditState.controversy_level * 100_000 : 0) + 15_000_000,
  );

  let worldEffectDesc = "";

  if (actionId === "criticize_manager") {
    const club = targetClubId ?? (db.exec(`SELECT id FROM clubs WHERE league_id = 1 ORDER BY points DESC LIMIT 1`)[0]?.values[0]?.[0] as number | undefined);
    if (club) {
      db.run(`UPDATE clubs SET club_morale = MAX(10, club_morale - 6) WHERE id = ?`, [club]);
      const clubName = db.exec(`SELECT name FROM clubs WHERE id = ?`, [club])[0]?.values[0]?.[0];
      worldEffectDesc = `Kritik pedas Anda viral di Twitter/X! Moral skuad ${clubName} anjlok 6 poin.`;
    }
  } else if (actionId === "praise_wonderkid") {
    const player = targetPlayerId ?? (db.exec(`SELECT id FROM players WHERE retired = 0 AND age <= 21 ORDER BY pa DESC LIMIT 1`)[0]?.values[0]?.[0] as number | undefined);
    if (player) {
      db.run(`UPDATE players SET form = MIN(1.0, form + 0.15) WHERE id = ?`, [player]);
      const pName = db.exec(`SELECT name FROM players WHERE id = ?`, [player])[0]?.values[0]?.[0];
      worldEffectDesc = `Pujian taktik Anda melambungkan motivasi ${pName}! Form meningkat +0.15.`;
    }
  } else if (actionId === "leak_dressing_room") {
    const club = targetClubId ?? (db.exec(`SELECT id FROM clubs WHERE league_id = 1 ORDER BY RANDOM() LIMIT 1`)[0]?.values[0]?.[0] as number | undefined);
    if (club) {
      db.run(`UPDATE clubs SET club_morale = MAX(10, club_morale - 10) WHERE id = ?`, [club]);
      const clubName = db.exec(`SELECT name FROM clubs WHERE id = ?`, [club])[0]?.values[0]?.[0];
      worldEffectDesc = `Bocoran konflik internal ${clubName} menjadi tajuk utama koran! Moral tim merosot 10 poin.`;
    }
  } else if (actionId === "neutral_analysis") {
    worldEffectDesc = `Analisis taktis objektif Anda mendapat apresiasi tinggi dari asosiasi pelatih & fans cerdas.`;
  }

  const logEntry: PunditActionLog = {
    day: currentDay,
    actionId,
    title: option.title,
    summary: `${option.title}: ${worldEffectDesc}`,
  };

  if (!punditState.history) punditState.history = [];
  punditState.history.unshift(logEntry);
  if (punditState.history.length > 20) punditState.history.pop();

  punditState.last_summary = logEntry.summary;

  db.run(
    `INSERT OR REPLACE INTO world_state (key, value) VALUES ('ego_pundit_state', ?)`,
    [JSON.stringify(punditState)],
  );

  return {
    updatedState: punditState,
    summary: logEntry.summary,
  };
}

// ─── 4. AI Veterans Transformation (World Simulation) ─────────────────────────

export function convertRetiringLegendsToAIStaff(currentSeason: number): {
  managersCreated: number;
  agentsCreated: number;
  summaries: string[];
} {
  const db = getDB();
  const summaries: string[] = [];
  let managersCreated = 0;
  let agentsCreated = 0;

  // Find retiring or recently retired veterans with high stature (overall >= 60, age >= 35)
  const legendsRes = db.exec(
    `SELECT id, name, nationality, club, overall, traits, career_matches, career_goals, decisions
     FROM players
     WHERE retired = 1 AND age >= 35 AND overall >= 58
     ORDER BY overall DESC, career_matches DESC
     LIMIT 5`,
  );

  const candidates = legendsRes[0]?.values ?? [];
  if (candidates.length === 0) {
    return { managersCreated: 0, agentsCreated: 0, summaries: [] };
  }

  for (const row of candidates) {
    const [pId, name, , lastClubId, overall, traitsStr, careerMatches, , decisions] = row as [
      number, string, number, number | null, number, string, number, number, number
    ];

    let traits: string[] = [];
    try {
      traits = JSON.parse(traitsStr || "[]");
    } catch {
      traits = [];
    }

    const hasLeadership = traits.includes("leader") || traits.includes("determination") || decisions >= 55;
    const isCommercial = traits.includes("ambitious") || traits.includes("greedy") || traits.includes("mercenary") || traits.includes("media_friendly");

    if (hasLeadership && managersCreated < 2) {
      // Find a club in Liga 2 or Liga 3 needing a manager
      const clubRes = db.exec(
        `SELECT id, name FROM clubs WHERE league_id IN (2, 5) AND manager_id IS NULL LIMIT 1`,
      );
      let targetClub = clubRes[0]?.values[0] as [number, string] | undefined;

      // Fallback: pick any Liga 2 club
      if (!targetClub) {
        const anyClubRes = db.exec(`SELECT id, name FROM clubs WHERE league_id = 2 ORDER BY reputation ASC LIMIT 1`);
        targetClub = anyClubRes[0]?.values[0] as [number, string] | undefined;
      }

      if (targetClub) {
        db.run(`UPDATE clubs SET manager_id = ? WHERE id = ?`, [pId, targetClub[0]]);
        summaries.push(`👔 Mantan bintang ${name} resmi ditunjuk menjadi Manajer baru ${targetClub[1]}!`);
        managersCreated++;
      }
    } else if (isCommercial && agentsCreated < 2) {
      // Create new AI agency
      const maxAgentRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM agents`);
      const agentId = ((maxAgentRes[0]?.values[0]?.[0] as number) ?? 0) + 1;
      const agencyName = `${name} Management`;
      const rep = Math.min(70, Math.max(30, Math.round(overall * 0.65)));

      db.run(
        `INSERT INTO agents (id, name, reputation, cash, monthly_costs, credit_score, consecutive_missed, bankrupt, office_level, judge_ca, judge_pa)
         VALUES (?, ?, ?, 40000000, 2000000, 65, 0, 0, 0, 50, 50)`,
        [agentId, agencyName, rep],
      );

      // Sign 1 unrepresented young player
      const unassignedRes = db.exec(
        `SELECT id FROM players WHERE retired = 0 AND agent_id IS NULL AND age <= 21 ORDER BY pa DESC LIMIT 1`,
      );
      const unassignedId = unassignedRes[0]?.values[0]?.[0] as number | undefined;
      if (unassignedId) {
        db.run(`UPDATE players SET agent_id = ? WHERE id = ?`, [agentId, unassignedId]);
      }

      summaries.push(`💼 Legenda ${name} mendirikan agensi baru: ${agencyName}!`);
      agentsCreated++;
    } else if (lastClubId) {
      // Join former club as coaching staff
      const cfg = getClubManagerConfig(lastClubId);
      const nextStaff = { ...cfg.staff, coach: Math.min(5, cfg.staff.coach + 1) };
      saveClubConfig(lastClubId, { ...cfg, staff: nextStaff });
      const clubName = db.exec(`SELECT name FROM clubs WHERE id = ?`, [lastClubId])[0]?.values[0]?.[0];
      summaries.push(`📋 ${name} bergabung ke jajaran staf pelatih ${clubName}.`);
    }
  }

  return {
    managersCreated,
    agentsCreated,
    summaries,
  };
}
