import { getDB } from "./db.js";
import { acceptTransferOffer, type TransferOffer } from "./transfers.js";
import type { Agent, Position } from "../types/index.js";

export interface OfficeTier {
  level: number;
  name: string;
  max_clients: number;
  monthly_costs: number;
  upgrade_cost: number;
  rep_bonus: number;
  scout_bonus: number;
}

export const OFFICE_TIERS: OfficeTier[] = [
  { level: 0, name: "Kantor Rumahan", max_clients: 3, monthly_costs: 2_000_000, upgrade_cost: 0, rep_bonus: 0, scout_bonus: 0 },
  { level: 1, name: "Ruko Kecil", max_clients: 6, monthly_costs: 6_000_000, upgrade_cost: 40_000_000, rep_bonus: 8, scout_bonus: 15 },
  { level: 2, name: "Kantor Agensi", max_clients: 12, monthly_costs: 15_000_000, upgrade_cost: 120_000_000, rep_bonus: 15, scout_bonus: 20 },
  { level: 3, name: "Gedung Agensi Elit", max_clients: 25, monthly_costs: 35_000_000, upgrade_cost: 350_000_000, rep_bonus: 25, scout_bonus: 25 },
];

export interface AgentState extends Agent {
  judge_ca: number;
  judge_pa: number;
  max_clients: number;
  office_name: string;
  next_office_cost: number | null;
  next_office_name: string | null;
}

export interface ClientPlayer {
  id: number;
  name: string;
  position: Position;
  age: number;
  club_id: number | null;
  club_name: string;
  overall: number;
  ca: number;
  pa: number;
  est_ca: string;
  est_pa: string;
  wage: number;
  form: number;
  matches: number;
  goals: number;
  assists: number;
  rating: number;
  contract_end: number;
  sign_cost: number;
}

function estimateRange(actual: number, skill: number, seedId: number): string {
  // Higher skill (1-100) narrows the uncertainty window
  const spread = Math.max(0, Math.round((100 - skill) * 0.22));
  if (spread <= 2) return `${actual}`;
  const shift = ((seedId * 37) % (spread + 1)) - Math.floor(spread / 2);
  const low = Math.max(1, actual - spread + shift);
  const high = Math.min(100, actual + spread + shift);
  return `${low}–${high}`;
}

export function createEgoAgent(name: string): number {
  const db = getDB();
  const maxRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM agents`);
  const id = ((maxRes[0]?.values[0]?.[0] as number) ?? 0) + 1;

  db.run(
    `INSERT INTO agents (id, name, reputation, cash, monthly_costs, credit_score, consecutive_missed, bankrupt, office_level, judge_ca, judge_pa)
     VALUES (?, ?, 22, 35000000, 2000000, 65, 0, 0, 0, 45, 45)`,
    [id, name],
  );

  // Assign 1 promising young player as starter client so the agent has immediate income & action
  const starterRes = db.exec(
    `SELECT id FROM players WHERE retired = 0 AND agent_id IS NULL AND age <= 21 ORDER BY pa DESC LIMIT 1`,
  );
  const starterId = starterRes[0]?.values[0]?.[0] as number | undefined;
  if (starterId) {
    db.run(`UPDATE players SET agent_id = ? WHERE id = ?`, [id, starterId]);
  }

  return id;
}

export function getAgentState(agentId: number): AgentState | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id, name, reputation, cash, monthly_costs, credit_score, consecutive_missed, bankrupt, office_level, judge_ca, judge_pa
     FROM agents WHERE id = ?`,
    [agentId],
  );
  const row = res[0]?.values[0];
  if (!row) return null;

  const clientRes = db.exec(`SELECT id FROM players WHERE agent_id = ? AND retired = 0`, [agentId]);
  const clients = (clientRes[0]?.values ?? []).map((r) => r[0] as number);

  const officeLevel = row[8] as number;
  const tier = OFFICE_TIERS[officeLevel] ?? OFFICE_TIERS[0];
  const nextTier = OFFICE_TIERS[officeLevel + 1] ?? null;

  return {
    id: row[0] as number,
    name: row[1] as string,
    reputation: row[2] as number,
    cash: row[3] as number,
    monthly_costs: row[4] as number,
    credit_score: row[5] as number,
    consecutive_missed: row[6] as number,
    bankrupt: Boolean(row[7]),
    office_level: officeLevel,
    judge_ca: row[9] as number,
    judge_pa: row[10] as number,
    clients,
    max_clients: tier.max_clients,
    office_name: tier.name,
    next_office_cost: nextTier ? nextTier.upgrade_cost : null,
    next_office_name: nextTier ? nextTier.name : null,
  };
}

export function getAgentClients(agentId: number): ClientPlayer[] {
  const db = getDB();
  const res = db.exec(
    `SELECT p.id, p.name, p.position, p.age, p.club, COALESCE(c.name, 'Free Agent'),
            p.overall, p.ca, p.pa, p.wage, p.form, p.matches, p.goals, p.assists, p.rating, p.contract_end
     FROM players p
     LEFT JOIN clubs c ON c.id = p.club
     WHERE p.agent_id = ? AND p.retired = 0
     ORDER BY p.overall DESC`,
    [agentId],
  );
  return (res[0]?.values ?? []).map((r) => ({
    id: r[0] as number,
    name: r[1] as string,
    position: r[2] as Position,
    age: r[3] as number,
    club_id: (r[4] as number) ?? null,
    club_name: r[5] as string,
    overall: r[6] as number,
    ca: r[7] as number,
    pa: r[8] as number,
    est_ca: `${r[7] as number}`,
    est_pa: `${r[8] as number}`,
    wage: r[9] as number,
    form: r[10] as number,
    matches: r[11] as number,
    goals: r[12] as number,
    assists: r[13] as number,
    rating: r[14] as number,
    contract_end: r[15] as number,
    sign_cost: 0,
  }));
}

export function getScoutList(agentId: number, limit = 30): ClientPlayer[] {
  const db = getDB();
  const agent = getAgentState(agentId);
  const judgeCa = agent?.judge_ca ?? 45;
  const judgePa = agent?.judge_pa ?? 45;

  const res = db.exec(
    `SELECT p.id, p.name, p.position, p.age, p.club, COALESCE(c.name, 'Free Agent'),
            p.overall, p.ca, p.pa, p.wage, p.form, p.matches, p.goals, p.assists, p.rating, p.contract_end
     FROM players p
     LEFT JOIN clubs c ON c.id = p.club
     WHERE p.agent_id IS NULL AND p.retired = 0
     ORDER BY (p.pa + p.overall) DESC
     LIMIT ?`,
    [limit],
  );

  return (res[0]?.values ?? []).map((r) => {
    const id = r[0] as number;
    const ca = r[7] as number;
    const pa = r[8] as number;
    const wage = r[9] as number;
    const signCost = Math.max(2_000_000, Math.round((wage * 0.8) / 500_000) * 500_000);
    return {
      id,
      name: r[1] as string,
      position: r[2] as Position,
      age: r[3] as number,
      club_id: (r[4] as number) ?? null,
      club_name: r[5] as string,
      overall: r[6] as number,
      ca,
      pa,
      est_ca: estimateRange(ca, judgeCa, id),
      est_pa: estimateRange(pa, judgePa, id + 17),
      wage,
      form: r[10] as number,
      matches: r[11] as number,
      goals: r[12] as number,
      assists: r[13] as number,
      rating: r[14] as number,
      contract_end: r[15] as number,
      sign_cost: signCost,
    };
  });
}

export function recruitClient(agentId: number, playerId: number): { ok: boolean; summary: string } {
  const db = getDB();
  const agent = getAgentState(agentId);
  if (!agent) return { ok: false, summary: "Agen tidak ditemukan." };
  if (agent.bankrupt) return { ok: false, summary: "❌ Agensi sudah bangkrut! Tidak bisa merekrut klien." };
  if (agent.clients.length >= agent.max_clients) {
    return {
      ok: false,
      summary: `⚠️ Kapasitas klien penuh (${agent.clients.length}/${agent.max_clients}). Upgrade kantor terlebih dahulu!`,
    };
  }

  const pRes = db.exec(`SELECT name, overall, wage, agent_id FROM players WHERE id = ?`, [playerId]);
  const pRow = pRes[0]?.values[0];
  if (!pRow) return { ok: false, summary: "Pemain tidak ditemukan." };
  if (pRow[3] != null) return { ok: false, summary: "Pemain sudah memiliki agen." };

  const pName = pRow[0] as string;
  const pOvr = pRow[1] as number;
  const pWage = pRow[2] as number;
  const signCost = Math.max(2_000_000, Math.round((pWage * 0.8) / 500_000) * 500_000);

  if (agent.cash < signCost) {
    return { ok: false, summary: `❌ Kas tidak cukup untuk biaya perekrutan ${pName} (butuh Rp ${(signCost / 1_000_000).toFixed(1)}jt).` };
  }

  // Reputation check: elite players require minimum agent reputation
  const minRepNeeded = Math.max(0, pOvr - 22);
  if (agent.reputation < minRepNeeded) {
    return {
      ok: false,
      summary: `🚫 ${pName} (OVR ${pOvr}) menolak bergabung — reputasi agensi (${agent.reputation}) belum cukup tinggi (minimal ${minRepNeeded}).`,
    };
  }

  db.run(`UPDATE players SET agent_id = ? WHERE id = ?`, [agentId, playerId]);
  db.run(`UPDATE agents SET cash = cash - ?, reputation = MIN(100, reputation + 1) WHERE id = ?`, [signCost, agentId]);

  return {
    ok: true,
    summary: `🤝 ${pName} resmi menjadi klien agensi! (Biaya tanda tangan Rp ${(signCost / 1_000_000).toFixed(1)}jt)`,
  };
}

export function releaseClient(agentId: number, playerId: number): string {
  const db = getDB();
  const pRes = db.exec(`SELECT name FROM players WHERE id = ? AND agent_id = ?`, [playerId, agentId]);
  const pName = (pRes[0]?.values[0]?.[0] as string) ?? "Pemain";
  db.run(`UPDATE players SET agent_id = NULL WHERE id = ? AND agent_id = ?`, [playerId, agentId]);
  return `👋 Kontrak keagenan bersama ${pName} telah diakhiri.`;
}

export function upgradeAgentOffice(agentId: number): { ok: boolean; summary: string } {
  const db = getDB();
  const agent = getAgentState(agentId);
  if (!agent) return { ok: false, summary: "Agen tidak ditemukan." };
  const nextTier = OFFICE_TIERS[agent.office_level + 1];
  if (!nextTier) return { ok: false, summary: "Kantor sudah berada di level tertinggi!" };

  if (agent.cash < nextTier.upgrade_cost) {
    return {
      ok: false,
      summary: `❌ Kas tidak cukup untuk upgrade ke ${nextTier.name} (butuh Rp ${(nextTier.upgrade_cost / 1_000_000).toFixed(0)}jt).`,
    };
  }

  db.run(
    `UPDATE agents
     SET office_level = ?,
         cash = cash - ?,
         monthly_costs = ?,
         reputation = MIN(100, reputation + ?),
         judge_ca = MIN(98, judge_ca + ?),
         judge_pa = MIN(98, judge_pa + ?)
     WHERE id = ?`,
    [
      nextTier.level,
      nextTier.upgrade_cost,
      nextTier.monthly_costs,
      nextTier.rep_bonus,
      nextTier.scout_bonus,
      nextTier.scout_bonus,
      agentId,
    ],
  );

  return {
    ok: true,
    summary: `🏢 Kantor berhasil di-upgrade ke ${nextTier.name}! Kapasitas maks ${nextTier.max_clients} klien, akurasi scouting & reputasi meningkat.`,
  };
}

export function plantMediaRumor(agentId: number, playerId: number): { summary: string } {
  const db = getDB();
  const agent = getAgentState(agentId);
  if (!agent) return { summary: "Agen tidak ditemukan." };
  if (agent.bankrupt) return { summary: "❌ Agensi sudah bangkrut!" };

  const pRes = db.exec(`SELECT name, wage, form FROM players WHERE id = ? AND agent_id = ?`, [playerId, agentId]);
  const pRow = pRes[0]?.values[0];
  if (!pRow) return { summary: "Klien tidak ditemukan." };

  const pName = pRow[0] as string;
  const pWage = pRow[1] as number;
  const pForm = pRow[2] as number;

  // Success chance scales with agent reputation (40% to 75%)
  const successChance = Math.min(0.75, 0.4 + agent.reputation / 200);
  const roll = Math.random();

  if (roll < successChance) {
    // Rumor succeeded! Client gets wage bump or media hype bonus + agent earns fee
    const newWage = Math.round((pWage * 1.15) / 500_000) * 500_000;
    const feeBonus = Math.max(3_500_000, Math.round(newWage * 0.5));
    const newForm = Math.min(1.0, +(pForm + 0.06).toFixed(2));

    db.run(`UPDATE players SET wage = ?, form = ? WHERE id = ?`, [newWage, newForm, playerId]);
    db.run(`UPDATE agents SET cash = cash + ?, reputation = MIN(100, reputation + 3) WHERE id = ?`, [feeBonus, agentId]);

    return {
      summary: `📰 Rumor transfer ${pName} sukses besar! Klub panik menaikkan nilai kontrak ke Rp ${(newWage / 1_000_000).toFixed(1)}jt/bln — kamu dapat komisi Rp ${(feeBonus / 1_000_000).toFixed(1)}jt & Reputasi +3!`,
    };
  } else {
    // Caught planting fake rumor! Reputation destroyed & financial penalty (PRD §3.3)
    const fine = 15_000_000;
    const newCash = agent.cash - fine;
    const newRep = Math.max(0, agent.reputation - 12);
    const missed = newCash < 0 ? agent.consecutive_missed + 1 : agent.consecutive_missed;
    const bankrupt = missed >= 3 ? 1 : 0;

    db.run(
      `UPDATE agents SET cash = ?, reputation = ?, consecutive_missed = ?, bankrupt = ? WHERE id = ?`,
      [newCash, newRep, missed, bankrupt, agentId],
    );

    return {
      summary: `🚨 SKANDAL! Media membongkar rumor palsu soal ${pName}. Reputasi hancur (-12) dan kamu didenda Rp 15jt!${bankrupt ? " 💥 AGENSI BANGKRUT!" : ""}`,
    };
  }
}

export function negotiateClientDeal(
  agentId: number,
  playerId: number,
  offer: TransferOffer,
  currentDay: number,
): { summary: string } {
  const db = getDB();
  const res = acceptTransferOffer(playerId, offer, currentDay);
  // Agent gets 15% of 1-year contract value as commission
  const commission = Math.max(3_000_000, Math.round(offer.wage * 12 * 0.15));

  db.run(
    `UPDATE agents SET cash = cash + ?, reputation = MIN(100, reputation + 2), consecutive_missed = 0 WHERE id = ?`,
    [commission, agentId],
  );

  return {
    summary: `${res.summary} 💰 Komisi Agen: +Rp ${(commission / 1_000_000).toFixed(1)}jt (Reputasi +2)`,
  };
}

export function tickAgentFinances(agentId: number, daysDelta: number): string | null {
  if (daysDelta <= 0) return null;
  const db = getDB();
  const agent = getAgentState(agentId);
  if (!agent || agent.bankrupt) return null;

  const wageRes = db.exec(
    `SELECT COALESCE(SUM(wage), 0) FROM players WHERE agent_id = ? AND retired = 0`,
    [agentId],
  );
  const totalClientWages = (wageRes[0]?.values[0]?.[0] as number) ?? 0;

  // Agent receives 10% of clients' monthly wages, pro-rated by daysDelta / 30
  const commissionIncome = Math.round(totalClientWages * 0.1 * (daysDelta / 30));
  const officeExpense = Math.round(agent.monthly_costs * (daysDelta / 30));
  const netDelta = commissionIncome - officeExpense;
  const newCash = agent.cash + netDelta;

  let missed = agent.consecutive_missed;
  let bankrupt = 0;
  if (newCash < 0) {
    missed += 1;
    if (missed >= 3) bankrupt = 1;
  } else {
    missed = 0;
  }

  db.run(
    `UPDATE agents SET cash = ?, consecutive_missed = ?, bankrupt = ? WHERE id = ?`,
    [newCash, missed, bankrupt, agentId],
  );

  if (bankrupt) {
    return `💥 AGENSI BANGKRUT! Kas defisit terlalu lama dan gagal membayar biaya operasional kantor.`;
  }
  return null;
}
