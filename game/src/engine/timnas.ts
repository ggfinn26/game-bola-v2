import { getDB } from "./db.js";

// ─── Timnas Indonesia: Full International Campaign System (PRD §4.3) ─────────
// Kompetisi Penuh:
// 1. Kualifikasi Piala Asia (Fase Grup 4 Match)
// 2. Putaran Final Piala Asia (Fase Grup 3 Match -> QF -> SF -> Final)
// 3. Kualifikasi Piala Dunia Zona Asia (Putaran Ketiga 5 Match)
// 4. Putaran Final Piala Dunia FIFA (Fase Grup 3 Match -> 16 Besar -> QF -> SF -> Final)

export const SQUAD_SIZE = 23;
export const CALLUP_THRESHOLD = 55;
export const MATCH_INTERVAL = 90; // Hari 90, 180, 270, 360...

export type TimnasCompetitionType =
  | "kualifikasi_asia"
  | "piala_asia"
  | "kualifikasi_pildun"
  | "piala_dunia";

export interface TimnasCampaignState {
  competition: TimnasCompetitionType;
  competitionName: string;
  stageName: string;
  matchIndex: number;
  totalMatches: number;
  opponentName: string;
  opponentFlag: string;
  opponentStrength: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  status: string;
}

export interface TimnasSquadInfo {
  squad: { id: number; name: string; position: string; overall: number; club: string }[];
  egoInSquad: boolean;
  nextMatchDay: number | null;
  recentResults: string[];
  campaign: TimnasCampaignState;
}

// ─── Opponents by stage ───────────────────────────────────────────────────────

const QUAL_ASIA_OPPONENTS = [
  { name: "Vietnam", flag: "🇻🇳", strength: 0.58 },
  { name: "Filipina", flag: "🇵🇭", strength: 0.48 },
  { name: "India", flag: "🇮🇳", strength: 0.54 },
  { name: "Turkmenistan", flag: "🇹🇲", strength: 0.60 },
  { name: "Malaysia", flag: "🇲🇾", strength: 0.62 },
  { name: "Thailand", flag: "🇹🇭", strength: 0.68 },
];

const ASIAN_CUP_GROUP_OPPONENTS = [
  { name: "Irak", flag: "🇮🇶", strength: 0.74 },
  { name: "Uzbekistan", flag: "🇺🇿", strength: 0.73 },
  { name: "Bahrain", flag: "🇧🇭", strength: 0.69 },
  { name: "Yordania", flag: "🇯🇴", strength: 0.71 },
  { name: "China", flag: "🇨🇳", strength: 0.67 },
  { name: "Oman", flag: "🇴🇲", strength: 0.70 },
];

const WC_QUAL_OPPONENTS = [
  { name: "Arab Saudi", flag: "🇸🇦", strength: 0.82 },
  { name: "Australia", flag: "🇦🇺", strength: 0.84 },
  { name: "Bahrain", flag: "🇧🇭", strength: 0.70 },
  { name: "China", flag: "🇨🇳", strength: 0.68 },
  { name: "Jepang", flag: "🇯🇵", strength: 0.89 },
];

const WORLD_CUP_GROUP_OPPONENTS = [
  { name: "Belanda", flag: "🇳🇱", strength: 0.90 },
  { name: "Meksiko", flag: "🇲🇽", strength: 0.83 },
  { name: "Senegal", flag: "🇸🇳", strength: 0.82 },
];

// ─── Campaign State Management ────────────────────────────────────────────────

export function getTimnasCampaign(): TimnasCampaignState {
  const db = getDB();
  const raw = db.exec(`SELECT value FROM world_state WHERE key = 'timnas_campaign'`)[0]?.values[0]?.[0] as
    | string
    | undefined;

  if (raw) {
    try {
      return JSON.parse(raw) as TimnasCampaignState;
    } catch {
      // fallback
    }
  }

  // Initial state: Kualifikasi Piala Asia match 1
  const firstOpp = QUAL_ASIA_OPPONENTS[0];
  const initial: TimnasCampaignState = {
    competition: "kualifikasi_asia",
    competitionName: "Kualifikasi Piala Asia",
    stageName: "Grup Kualifikasi",
    matchIndex: 1,
    totalMatches: 4,
    opponentName: firstOpp.name,
    opponentFlag: firstOpp.flag,
    opponentStrength: firstOpp.strength,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    status: "Perjuangan merebut tiket putaran final Piala Asia.",
  };

  saveTimnasCampaign(initial);
  return initial;
}

export function saveTimnasCampaign(camp: TimnasCampaignState): void {
  const db = getDB();
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('timnas_campaign', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(camp)],
  );
}

// ─── Squad Helpers ────────────────────────────────────────────────────────────

export function rollTimnasSquad(): number[] {
  const db = getDB();
  const rows = db.exec(
    `SELECT p.id FROM players p
     WHERE p.nationality = 1 AND p.overall >= ? AND p.injured = 0
       AND p.in_prison = 0 AND p.retired = 0 AND p.club IS NOT NULL
     ORDER BY p.overall DESC LIMIT ?`,
    [CALLUP_THRESHOLD, SQUAD_SIZE],
  )[0]?.values as [number][] | undefined;

  const squad = (rows ?? []).map((r) => r[0]);
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('timnas_squad', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(squad)],
  );
  return squad;
}

export function getTimnasSquad(): number[] {
  const db = getDB();
  const raw = db.exec(`SELECT value FROM world_state WHERE key = 'timnas_squad'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function isInTimnas(playerId: number): boolean {
  return getTimnasSquad().includes(playerId);
}

// ─── Match Simulation & Campaign Progression ──────────────────────────────────

export function playTimnasMatch(playerId: number, _day: number): { ok: boolean; summary: string } {
  const db = getDB();

  if (!isInTimnas(playerId)) {
    return { ok: false, summary: "⚠️ Kamu tidak berada dalam skuad Timnas saat ini." };
  }

  const pRow = db.exec(
    `SELECT stamina, form, overall, injured, in_prison, name, position, finishing, positioning
     FROM players WHERE id = ?`,
    [playerId],
  )[0]?.values[0] as [number, number, number, number, number, string, number, number, number] | undefined;

  if (!pRow) return { ok: false, summary: "⚠️ Data pemain tidak ditemukan." };

  const [stamina, form, overall, injured, inPrison, name, pos, finishing, positioning] = pRow;
  if (injured) return { ok: false, summary: "⚠️ Kamu cedera dan tidak bisa membela Timnas." };
  if (inPrison) return { ok: false, summary: "⚠️ Tidak bisa membela Timnas saat menjalani hukuman." };
  if (stamina < 0.2) return { ok: false, summary: "⚠️ Stamina terlalu rendah untuk bermain bagi Timnas." };

  const camp = getTimnasCampaign();

  // Match ratings & Poisson-like goal generation
  const egoStrength = overall / 100;
  const indoStrength = 0.65 + (egoStrength - 0.6) * 0.4;
  const oppStrength = camp.opponentStrength;

  const indoXG = Math.max(0.3, (indoStrength / oppStrength) * (1.2 + Math.random() * 0.9));
  const oppXG = Math.max(0.3, (oppStrength / indoStrength) * (1.2 + Math.random() * 0.9));

  function rollGoals(xg: number): number {
    let g = 0;
    let rem = xg;
    while (rem > 0) {
      if (Math.random() < Math.min(rem, 0.9)) g++;
      rem -= 1.0;
    }
    return g;
  }

  let indoGoals = rollGoals(indoXG);
  let oppGoals = rollGoals(oppXG);
  let penaltyNote = "";

  const isKnockout =
    camp.stageName.includes("Perempat Final") ||
    camp.stageName.includes("Semifinal") ||
    camp.stageName.includes("Final") ||
    camp.stageName.includes("16 Besar");

  if (isKnockout && indoGoals === oppGoals) {
    const penWin = Math.random() < (indoStrength >= oppStrength ? 0.55 : 0.45);
    if (penWin) {
      penaltyNote = " (Adu Penalti: Indonesia menang 5-4)";
    } else {
      penaltyNote = " (Adu Penalti: Indonesia kalah 4-5)";
    }
  }

  const won = penaltyNote.includes("menang") || (!penaltyNote && indoGoals > oppGoals);
  const draw = !penaltyNote && indoGoals === oppGoals;
  const lost = !won && !draw;

  // Ego goal scoring attribution
  let egoGoals = 0;
  if (indoGoals > 0) {
    let goalProb = 0.05;
    if (pos === 10) goalProb = 0.55; // ST
    else if (pos === 8 || pos === 9 || pos === 7) goalProb = 0.35; // LW, RW, AM
    else if (pos === 6 || pos === 5) goalProb = 0.12; // CM, DM
    else if (pos >= 2 && pos <= 4) goalProb = 0.05; // Defender

    goalProb += Math.max(0, (finishing + positioning - 100) / 400);

    for (let i = 0; i < indoGoals; i++) {
      if (Math.random() < goalProb) {
        egoGoals++;
      }
    }
  }

  // Update player stats
  const formDelta = won ? 0.06 : draw ? 0.01 : -0.04;
  db.run(
    `UPDATE players SET
       stamina = MAX(0.05, ROUND(stamina - 0.18, 2)),
       form = MIN(1.0, MAX(0.1, ROUND(form + ?, 2))),
       career_matches = career_matches + 1,
       career_goals = career_goals + ?
     WHERE id = ?`,
    [formDelta, egoGoals, playerId],
  );

  // Update campaign tally
  camp.played += 1;
  camp.goalsFor += indoGoals;
  camp.goalsAgainst += oppGoals;
  if (won) {
    camp.wins += 1;
    camp.points += 3;
  } else if (draw) {
    camp.draws += 1;
    camp.points += 1;
  } else {
    camp.losses += 1;
  }

  let trophyEarned = false;
  let cashReward = 0;
  let stageChangeMsg = "";

  // ─── Campaign Progression Rules ─────────────────────────────────────────────
  if (camp.competition === "kualifikasi_asia") {
    if (camp.matchIndex >= camp.totalMatches) {
      if (camp.points >= 7) {
        stageChangeMsg = "🎉 INDONESIA LOLOS KE PUTARAN FINAL PIALA ASIA! Tiket Asia diraih!";
        camp.competition = "piala_asia";
        camp.competitionName = "Piala Asia (AFC Asian Cup)";
        camp.stageName = "Fase Grup Piala Asia";
        camp.matchIndex = 1;
        camp.totalMatches = 3;
        camp.played = 0;
        camp.wins = 0;
        camp.draws = 0;
        camp.losses = 0;
        camp.points = 0;
        camp.goalsFor = 0;
        camp.goalsAgainst = 0;
        const nextOpp = ASIAN_CUP_GROUP_OPPONENTS[0];
        camp.opponentName = nextOpp.name;
        camp.opponentFlag = nextOpp.flag;
        camp.opponentStrength = nextOpp.strength;
        camp.status = "Fase Grup Piala Asia melawan kekuatan utama Asia.";
      } else {
        stageChangeMsg = `Kualifikasi tuntas (${camp.points} pts). Garuda belum berhasil lolos dan akan mencoba lagi siklus depan.`;
        resetToQualAsia(camp);
      }
    } else {
      camp.matchIndex += 1;
      const nextOpp = QUAL_ASIA_OPPONENTS[(camp.matchIndex - 1) % QUAL_ASIA_OPPONENTS.length];
      camp.opponentName = nextOpp.name;
      camp.opponentFlag = nextOpp.flag;
      camp.opponentStrength = nextOpp.strength;
    }
  } else if (camp.competition === "piala_asia") {
    if (camp.stageName === "Fase Grup Piala Asia") {
      if (camp.matchIndex >= camp.totalMatches) {
        if (camp.points >= 4) {
          stageChangeMsg = "🔥 LOLOS DARI FASE GRUP! Indonesia menembus Perempat Final Piala Asia!";
          camp.stageName = "Perempat Final";
          camp.matchIndex = 1;
          camp.totalMatches = 1;
          camp.opponentName = "Australia";
          camp.opponentFlag = "🇦🇺";
          camp.opponentStrength = 0.83;
          camp.status = "Babak Gugur Perempat Final Piala Asia.";
        } else {
          stageChangeMsg = "Tersingkir di fase grup Piala Asia. Melanjutkan ke Kualifikasi Piala Dunia.";
          advanceToWcQual(camp);
        }
      } else {
        camp.matchIndex += 1;
        const nextOpp = ASIAN_CUP_GROUP_OPPONENTS[(camp.matchIndex - 1) % ASIAN_CUP_GROUP_OPPONENTS.length];
        camp.opponentName = nextOpp.name;
        camp.opponentFlag = nextOpp.flag;
        camp.opponentStrength = nextOpp.strength;
      }
    } else if (camp.stageName === "Perempat Final") {
      if (won) {
        stageChangeMsg = "🚀 SENSASI ASIA! Indonesia menang dan melaju ke Semifinal Piala Asia!";
        camp.stageName = "Semifinal";
        camp.matchIndex = 1;
        camp.totalMatches = 1;
        camp.opponentName = "Korea Selatan";
        camp.opponentFlag = "🇰🇷";
        camp.opponentStrength = 0.86;
      } else {
        stageChangeMsg = "Perjuangan heroik terhenti di Perempat Final Piala Asia. Melanjutkan ke Kualifikasi Piala Dunia.";
        advanceToWcQual(camp);
      }
    } else if (camp.stageName === "Semifinal") {
      if (won) {
        stageChangeMsg = "🇮🇩 HISTORIS! Indonesia melaju ke FINAL PIALA ASIA!";
        camp.stageName = "Final";
        camp.matchIndex = 1;
        camp.totalMatches = 1;
        camp.opponentName = "Jepang";
        camp.opponentFlag = "🇯🇵";
        camp.opponentStrength = 0.89;
      } else {
        stageChangeMsg = "Finis Peringkat 3/4 Piala Asia! Tiket Kualifikasi Piala Dunia dipastikan.";
        advanceToWcQual(camp);
      }
    } else if (camp.stageName === "Final") {
      if (won) {
        trophyEarned = true;
        cashReward = 500_000_000;
        stageChangeMsg = "🏆 JUARA PIALA ASIA! Indonesia mengangkat trofi AFC Asian Cup!";
      } else {
        stageChangeMsg = "Indonesia finis sebagai Runner-Up Piala Asia dengan penuh kehormatan!";
      }
      advanceToWcQual(camp);
    }
  } else if (camp.competition === "kualifikasi_pildun") {
    if (camp.matchIndex >= camp.totalMatches) {
      if (camp.points >= 8) {
        stageChangeMsg = "🌍 SEJARAH DUNIA! INDONESIA LOLOS KE PUTARAN FINAL PIALA DUNIA FIFA!";
        camp.competition = "piala_dunia";
        camp.competitionName = "Piala Dunia FIFA";
        camp.stageName = "Fase Grup Piala Dunia";
        camp.matchIndex = 1;
        camp.totalMatches = 3;
        camp.played = 0;
        camp.wins = 0;
        camp.draws = 0;
        camp.losses = 0;
        camp.points = 0;
        camp.goalsFor = 0;
        camp.goalsAgainst = 0;
        const nextOpp = WORLD_CUP_GROUP_OPPONENTS[0];
        camp.opponentName = nextOpp.name;
        camp.opponentFlag = nextOpp.flag;
        camp.opponentStrength = nextOpp.strength;
        camp.status = "Fase Grup Piala Dunia FIFA melawan raksasa sepak bola global.";
      } else {
        stageChangeMsg = `Kualifikasi Piala Dunia berakhir (${camp.points} pts). Belum berhasil merebut tiket Piala Dunia kali ini.`;
        resetToQualAsia(camp);
      }
    } else {
      camp.matchIndex += 1;
      const nextOpp = WC_QUAL_OPPONENTS[(camp.matchIndex - 1) % WC_QUAL_OPPONENTS.length];
      camp.opponentName = nextOpp.name;
      camp.opponentFlag = nextOpp.flag;
      camp.opponentStrength = nextOpp.strength;
    }
  } else if (camp.competition === "piala_dunia") {
    if (camp.stageName === "Fase Grup Piala Dunia") {
      if (camp.matchIndex >= camp.totalMatches) {
        if (camp.points >= 4) {
          stageChangeMsg = "🔥 KEAJAIBAN! Indonesia lolos dari fase grup ke Babak 16 Besar Piala Dunia!";
          camp.stageName = "Babak 16 Besar";
          camp.matchIndex = 1;
          camp.totalMatches = 1;
          camp.opponentName = "Kroasia";
          camp.opponentFlag = "🇭🇷";
          camp.opponentStrength = 0.87;
        } else {
          stageChangeMsg = "Perjalanan Piala Dunia berakhir dengan kepala tegak di fase grup.";
          resetToQualAsia(camp);
        }
      } else {
        camp.matchIndex += 1;
        const nextOpp = WORLD_CUP_GROUP_OPPONENTS[(camp.matchIndex - 1) % WORLD_CUP_GROUP_OPPONENTS.length];
        camp.opponentName = nextOpp.name;
        camp.opponentFlag = nextOpp.flag;
        camp.opponentStrength = nextOpp.strength;
      }
    } else if (camp.stageName === "Babak 16 Besar") {
      if (won) {
        stageChangeMsg = "🌟 LUAR NALAR! Indonesia melaju ke Perempat Final Piala Dunia!";
        camp.stageName = "Perempat Final";
        camp.matchIndex = 1;
        camp.totalMatches = 1;
        camp.opponentName = "Inggris";
        camp.opponentFlag = "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
        camp.opponentStrength = 0.91;
      } else {
        stageChangeMsg = "Perjuangan terhenti di 16 Besar Piala Dunia. Sejarah emas telah diukir!";
        resetToQualAsia(camp);
      }
    } else if (camp.stageName === "Perempat Final") {
      if (won) {
        stageChangeMsg = "🎆 MAGIS! Garuda tembus SEMIFINAL PIALA DUNIA!";
        camp.stageName = "Semifinal";
        camp.matchIndex = 1;
        camp.totalMatches = 1;
        camp.opponentName = "Argentina";
        camp.opponentFlag = "🇦🇷";
        camp.opponentStrength = 0.94;
      } else {
        stageChangeMsg = "Tersingkir terhormat di Perempat Final Piala Dunia.";
        resetToQualAsia(camp);
      }
    } else if (camp.stageName === "Semifinal") {
      if (won) {
        stageChangeMsg = "👑 MENUJU PUNCAK DUNIA! Indonesia melaju ke FINAL PIALA DUNIA FIFA!";
        camp.stageName = "Final";
        camp.matchIndex = 1;
        camp.totalMatches = 1;
        camp.opponentName = "Brasil";
        camp.opponentFlag = "🇧🇷";
        camp.opponentStrength = 0.95;
      } else {
        stageChangeMsg = "Garuda meraih medali perunggu Peringkat 3 Piala Dunia!";
        resetToQualAsia(camp);
      }
    } else if (camp.stageName === "Final") {
      if (won) {
        trophyEarned = true;
        cashReward = 2_500_000_000;
        stageChangeMsg = "🏆🌍 INDONESIA JUARA PIALA DUNIA FIFA! LEGENDA SEPAKBOLA ABADI!";
      } else {
        stageChangeMsg = "Runner-Up Piala Dunia FIFA! Prestasi terbaik sepanjang masa!";
      }
      resetToQualAsia(camp);
    }
  }

  saveTimnasCampaign(camp);

  // Awards and bonuses
  if (trophyEarned) {
    db.run(`UPDATE players SET career_trophies = career_trophies + 1 WHERE id = ?`, [playerId]);
  }
  if (cashReward > 0) {
    const curCashRaw = db.exec(`SELECT value FROM world_state WHERE key = 'ego_personal_cash'`)[0]?.values[0]?.[0] as
      | string
      | undefined;
    const nextCash = (curCashRaw ? Number(curCashRaw) || 0 : 0) + cashReward;
    db.run(
      `INSERT INTO world_state (key, value) VALUES ('ego_personal_cash', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(nextCash)],
    );
  }

  // Save to recent results log
  const logRaw = db.exec(`SELECT value FROM world_state WHERE key = 'timnas_results'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  const log: string[] = logRaw ? (JSON.parse(logRaw) as string[]) : [];
  const symbol = won ? "✅" : draw ? "➖" : "❌";
  const resultStr = `${symbol} [${camp.competitionName}] Indonesia ${indoGoals}–${oppGoals} ${camp.opponentFlag} ${camp.opponentName}${penaltyNote}`;
  log.unshift(resultStr);
  db.run(
    `INSERT INTO world_state (key, value) VALUES ('timnas_results', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(log.slice(0, 10))],
  );

  const verdict = won ? "Menang" : draw ? "Seri" : "Kalah";
  const parts = [
    `🇮🇩 Timnas [${camp.competitionName} - ${camp.stageName}]: ${verdict} vs ${camp.opponentFlag} ${camp.opponentName} ${indoGoals}–${oppGoals}${penaltyNote}.`,
  ];
  if (egoGoals > 0) {
    parts.push(`⚽ ${name} mencetak ${egoGoals} gol penting untuk Garuda!`);
  }
  if (won) parts.push("Form +6%.");
  else if (draw) parts.push("Form +1%.");
  else parts.push("Form -4%.");

  if (stageChangeMsg) parts.push(stageChangeMsg);
  if (cashReward > 0) parts.push(`Bonus Prestasi: +Rp ${(cashReward / 1_000_000).toFixed(0)} Juta!`);

  return { ok: true, summary: parts.join(" ") };
}

function resetToQualAsia(camp: TimnasCampaignState): void {
  camp.competition = "kualifikasi_asia";
  camp.competitionName = "Kualifikasi Piala Asia";
  camp.stageName = "Grup Kualifikasi";
  camp.matchIndex = 1;
  camp.totalMatches = 4;
  camp.played = 0;
  camp.wins = 0;
  camp.draws = 0;
  camp.losses = 0;
  camp.points = 0;
  camp.goalsFor = 0;
  camp.goalsAgainst = 0;
  const nextOpp = QUAL_ASIA_OPPONENTS[0];
  camp.opponentName = nextOpp.name;
  camp.opponentFlag = nextOpp.flag;
  camp.opponentStrength = nextOpp.strength;
  camp.status = "Perjuangan siklus baru merebut tiket putaran final Piala Asia.";
}

function advanceToWcQual(camp: TimnasCampaignState): void {
  camp.competition = "kualifikasi_pildun";
  camp.competitionName = "Kualifikasi Piala Dunia";
  camp.stageName = "Putaran 3 Zona Asia";
  camp.matchIndex = 1;
  camp.totalMatches = 5;
  camp.played = 0;
  camp.wins = 0;
  camp.draws = 0;
  camp.losses = 0;
  camp.points = 0;
  camp.goalsFor = 0;
  camp.goalsAgainst = 0;
  const nextOpp = WC_QUAL_OPPONENTS[0];
  camp.opponentName = nextOpp.name;
  camp.opponentFlag = nextOpp.flag;
  camp.opponentStrength = nextOpp.strength;
  camp.status = "Putaran Ketiga Kualifikasi Piala Dunia Zona Asia.";
}

// ─── Periodic calendar tick ────────────────────────────────────────────────────

export function processTimnasCalendar(day: number, egoId: number): string | null {
  if (day % MATCH_INTERVAL !== 0) return null;

  // Roll fresh squad
  const squad = rollTimnasSquad();
  const camp = getTimnasCampaign();

  if (egoId <= 0 || !squad.includes(egoId)) {
    return null;
  }

  return `🇮🇩 Panggilan Timnas! Kamu masuk skuad untuk laga ${camp.competitionName} (${camp.stageName}) vs ${camp.opponentFlag} ${camp.opponentName}!`;
}

// ─── Squad Info for UI ─────────────────────────────────────────────────────────

export function getTimnasInfo(egoId: number, currentDay: number): TimnasSquadInfo {
  const db = getDB();
  const squadIds = getTimnasSquad();

  const squad = squadIds
    .map((pid) => {
      const row = db.exec(
        `SELECT p.id, p.name, p.position, p.overall, COALESCE(c.name, 'Free Agent') as club
         FROM players p LEFT JOIN clubs c ON c.id = p.club WHERE p.id = ?`,
        [pid],
      )[0]?.values[0] as [number, string, string, number, string] | undefined;
      if (!row) return null;
      return { id: row[0], name: row[1], position: row[2], overall: row[3], club: row[4] };
    })
    .filter(Boolean) as TimnasSquadInfo["squad"];

  const logRaw = db.exec(`SELECT value FROM world_state WHERE key = 'timnas_results'`)[0]?.values[0]?.[0] as
    | string
    | undefined;
  const recentResults: string[] = logRaw ? (JSON.parse(logRaw) as string[]) : [];

  const nextMatchDay = Math.ceil(currentDay / MATCH_INTERVAL + 1) * MATCH_INTERVAL;
  const campaign = getTimnasCampaign();

  return {
    squad,
    egoInSquad: squadIds.includes(egoId),
    nextMatchDay,
    recentResults,
    campaign,
  };
}

// ─── Naturalisasi ─────────────────────────────────────────────────────────────

export function canNaturalize(playerId: number, currentDay: number): { ok: boolean; reason?: string } {
  const db = getDB();
  const row = db.exec(
    `SELECT p.nationality, p.overall, p.contract_end, p.retired, c.league_id
     FROM players p LEFT JOIN clubs c ON c.id = p.club WHERE p.id = ?`,
    [playerId],
  )[0]?.values[0] as [number, number, number, number, number | null] | undefined;

  if (!row) return { ok: false, reason: "Data tidak ditemukan." };
  const [nationality, overall, contractEnd, retired, leagueId] = row;

  if (nationality === 1) return { ok: false, reason: "Sudah WNI." };
  if (retired) return { ok: false, reason: "Sudah pensiun." };
  if (overall < 40) return { ok: false, reason: `Overall terlalu rendah (min 40, sekarang ${overall}).` };
  if (!leagueId || ![1, 2, 5].includes(leagueId)) return { ok: false, reason: "Harus bermain di liga Indonesia." };
  if (contractEnd < currentDay + 90) return { ok: false, reason: "Kontrak terlalu pendek (min 90 hari tersisa)." };

  return { ok: true };
}

export function naturalize(playerId: number): string {
  const db = getDB();
  const nameRow = db.exec(`SELECT name FROM players WHERE id = ?`, [playerId])[0]?.values[0];
  const name = (nameRow?.[0] as string) ?? "Pemain";
  db.run(`UPDATE players SET nationality = 1 WHERE id = ?`, [playerId]);
  return `🇮🇩 ${name} resmi mendapatkan kewarganegaraan Indonesia! Kini eligible untuk Timnas.`;
}
