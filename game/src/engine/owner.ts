import { getDB } from "./db.js";

export interface ClubFinanceView {
  id: number;
  name: string;
  reputation: number;
  cash: number;
  debt: number;
  monthly_income: number;
  monthly_wages: number;
  monthly_facilities: number;
  monthly_loan_payment: number;
  monthly_total_costs: number;
  credit_score: number;
  consecutive_missed_payments: number;
  bankrupt: boolean;
  club_morale: number;
  fans: number;
  stadium_capacity: number;
  facilities_level: number;
  academy_level: number;
  valuation: number;
  interest_rate: number; // monthly % e.g. 0.012 = 1.2%
}

export interface OwnerState {
  id: number;
  name: string;
  personal_cash: number;
  reputation: number;
  credit_score: number;
  club_id: number | null;
  club: ClubFinanceView | null;
}

export interface SlotMarketRow {
  slot_id: number;
  club_id: number;
  club_name: string;
  reputation: number;
  cash: number;
  debt: number;
  bankrupt: boolean;
  slot_status: "occupied" | "available" | "suspended";
  slot_price: number;
  acquisition_price: number;
  is_owned: boolean;
}

// Monthly interest rate by credit score (SLOT-LIGA-BANKRUPTCY.md §4)
export function getMonthlyInterestRate(creditScore: number): number {
  if (creditScore <= 0) return 0.08; // Loan Shark flat 8.0%/month
  if (creditScore >= 80) return 0.008;
  if (creditScore >= 60) return 0.012;
  if (creditScore >= 40) return 0.02;
  if (creditScore >= 20) return 0.035;
  return 0.06;
}

function ensureOwnersTable(): void {
  const db = getDB();
  db.run(`
    CREATE TABLE IF NOT EXISTS owners (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      personal_cash INTEGER DEFAULT 15000000000,
      reputation INTEGER DEFAULT 50,
      credit_score INTEGER DEFAULT 75
    );
  `);
}

function calcClubFinance(clubId: number): ClubFinanceView | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id, name, reputation, cash, debt, monthly_income, credit_score,
            consecutive_missed_payments, bankrupt, club_morale, fans,
            stadium_capacity, facilities_level, academy_level
     FROM clubs WHERE id = ?`,
    [clubId],
  );
  const r = res[0]?.values[0];
  if (!r) return null;

  const wageRes = db.exec(
    `SELECT COALESCE(SUM(wage), 0) FROM players WHERE club = ? AND retired = 0`,
    [clubId],
  );
  const monthlyWages = Math.round(((wageRes[0]?.values[0]?.[0] as number) ?? 0));

  const rep = r[2] as number;
  const cash = r[3] as number;
  const debt = r[4] as number;
  const baseIncome = r[5] as number;
  const creditScore = r[6] as number;
  const missed = r[7] as number;
  const bankrupt = Boolean(r[8]);
  const morale = r[9] as number;
  const fans = r[10] as number;
  const stadiumCap = r[11] as number;
  const facLevel = r[12] as number;
  const acadLevel = r[13] as number;

  const monthlyFacilities = (facLevel * 35_000_000) + (acadLevel * 25_000_000);
  const interestRate = getMonthlyInterestRate(creditScore);
  // 12-month amortization + monthly interest when debt > 0
  const monthlyLoanPayment = debt > 0 ? Math.round(debt / 12 + debt * interestRate) : 0;
  const monthlyTotalCosts = monthlyWages + monthlyFacilities + monthlyLoanPayment;

  // Dynamic monthly income: base commercial/sponsor + gate receipts from fans & stadium
  const ticketIncome = Math.round(Math.min(fans, stadiumCap) * 12_000);
  const monthlyIncome = Math.max(baseIncome, rep * 4_500_000 + ticketIncome);

  const valuation = Math.max(
    1_500_000_000,
    Math.round(rep * 180_000_000 + stadiumCap * 80_000 + facLevel * 400_000_000 + Math.max(0, cash * 0.5) - debt * 0.8),
  );

  return {
    id: r[0] as number,
    name: r[1] as string,
    reputation: rep,
    cash,
    debt,
    monthly_income: monthlyIncome,
    monthly_wages: monthlyWages,
    monthly_facilities: monthlyFacilities,
    monthly_loan_payment: monthlyLoanPayment,
    monthly_total_costs: monthlyTotalCosts,
    credit_score: creditScore,
    consecutive_missed_payments: missed,
    bankrupt,
    club_morale: morale,
    fans,
    stadium_capacity: stadiumCap,
    facilities_level: facLevel,
    academy_level: acadLevel,
    valuation,
    interest_rate: interestRate,
  };
}

export function createEgoOwner(name: string, clubId: number): number {
  ensureOwnersTable();
  const db = getDB();
  const maxRes = db.exec(`SELECT COALESCE(MAX(id), 0) FROM owners`);
  const id = ((maxRes[0]?.values[0]?.[0] as number) ?? 0) + 1;

  db.run(
    `INSERT INTO owners (id, name, personal_cash, reputation, credit_score)
     VALUES (?, ?, 15000000000, 50, 75)`,
    [id, name],
  );

  db.run(`UPDATE clubs SET owner_id = NULL WHERE owner_id = ?`, [id]);
  db.run(`UPDATE clubs SET owner_id = ? WHERE id = ?`, [id, clubId]);

  // Calibrate club's initial monthly_income so it covers initial squad wages comfortably
  const view = calcClubFinance(clubId);
  if (view) {
    const healthyIncome = Math.max(view.monthly_income, Math.round(view.monthly_total_costs * 1.12));
    db.run(`UPDATE clubs SET monthly_income = ?, monthly_costs = ? WHERE id = ?`, [
      healthyIncome,
      view.monthly_total_costs,
      clubId,
    ]);
  }

  // Put one small NPC club into severe financial crisis so the Slot Liga market has an active distressed target
  const npcCrisis = db.exec(`SELECT id FROM clubs WHERE id != ? ORDER BY reputation ASC LIMIT 1`, [clubId]);
  const crisisClubId = npcCrisis[0]?.values[0]?.[0] as number | undefined;
  if (crisisClubId) {
    db.run(
      `UPDATE clubs SET cash = -350000000, debt = 4500000000, credit_score = 15, consecutive_missed_payments = 2 WHERE id = ?`,
      [crisisClubId],
    );
  }

  return id;
}

export function getOwnerState(ownerId: number): OwnerState | null {
  ensureOwnersTable();
  const db = getDB();
  const res = db.exec(
    `SELECT id, name, personal_cash, reputation, credit_score FROM owners WHERE id = ?`,
    [ownerId],
  );
  const row = res[0]?.values[0];
  if (!row) return null;

  const clubRes = db.exec(`SELECT id FROM clubs WHERE owner_id = ? LIMIT 1`, [ownerId]);
  const clubId = (clubRes[0]?.values[0]?.[0] as number | undefined) ?? null;
  const club = clubId != null ? calcClubFinance(clubId) : null;

  return {
    id: row[0] as number,
    name: row[1] as string,
    personal_cash: row[2] as number,
    reputation: row[3] as number,
    credit_score: row[4] as number,
    club_id: clubId,
    club,
  };
}

export function getClubMarket(ownerId: number): SlotMarketRow[] {
  const db = getDB();
  const res = db.exec(`
    SELECT c.id, c.name, c.reputation, c.cash, c.debt, c.bankrupt, c.owner_id,
           COALESCE(ls.id, c.id), COALESCE(ls.status, 'occupied'), COALESCE(ls.market_value, 5000000000)
    FROM clubs c
    LEFT JOIN league_slots ls ON ls.club_id = c.id
    ORDER BY c.bankrupt DESC, c.reputation DESC
  `);

  return (res[0]?.values ?? []).map((r) => {
    const clubId = r[0] as number;
    const bankrupt = Boolean(r[5]);
    const slotStatus = (bankrupt ? "available" : (r[8] as string)) as "occupied" | "available" | "suspended";
    const slotPrice = r[9] as number;
    const fin = calcClubFinance(clubId);
    const valuation = fin?.valuation ?? slotPrice;
    const acquisitionPrice = bankrupt || slotStatus === "available" ? slotPrice : valuation;

    return {
      slot_id: r[7] as number,
      club_id: clubId,
      club_name: r[1] as string,
      reputation: r[2] as number,
      cash: r[3] as number,
      debt: r[4] as number,
      bankrupt,
      slot_status: slotStatus,
      slot_price: slotPrice,
      acquisition_price: acquisitionPrice,
      is_owned: (r[6] as number | null) === ownerId,
    };
  });
}

export function takeBankLoan(ownerId: number, amount: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;

  if (c.bankrupt) return { ok: false, summary: "❌ Klub sudah bangkrut! Tidak dapat mengajukan pinjaman." };
  if (c.credit_score <= 0) {
    return { ok: false, summary: "❌ Skor kredit klub 0 (Blacklist Bank). Lunasi tunggakan terlebih dahulu." };
  }
  const maxLoan = Math.max(2_000_000_000, c.reputation * 200_000_000);
  if (c.debt + amount > maxLoan) {
    return {
      ok: false,
      summary: `⚠️ Total pinjaman melebihi plafon bank (Maks Rp ${(maxLoan / 1_000_000_000).toFixed(1)}M untuk reputasi ${c.reputation}).`,
    };
  }

  db.run(`UPDATE clubs SET cash = cash + ?, debt = debt + ?, consecutive_missed_payments = 0 WHERE id = ?`, [
    amount,
    amount,
    c.id,
  ]);

  const ratePct = (c.interest_rate * 100).toFixed(1);
  return {
    ok: true,
    summary: `🏦 Pinjaman bank Rp ${(amount / 1_000_000_000).toFixed(1)}M cair (Bunga ${ratePct}%/bln). Kas klub bertambah!`,
  };
}

export function takeLoanShark(ownerId: number, amount: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;
  if (c.bankrupt) return { ok: false, summary: "❌ Klub sudah bangkrut!" };

  db.run(
    `UPDATE clubs SET cash = cash + ?, debt = debt + ?, credit_score = 0, consecutive_missed_payments = 0, club_morale = MAX(15, club_morale - 5) WHERE id = ?`,
    [amount, amount, c.id],
  );
  return {
    ok: true,
    summary: `🦈 Pinjaman Rentenir Ilegal Rp ${(amount / 1_000_000_000).toFixed(1)}M cair instan (Bunga 8.0%/bln, Skor Kredit = 0). Awas: gagal bayar memicu teror & kasus hukum!`,
  };
}

export function repayBankLoan(ownerId: number, amount: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;

  if (c.debt <= 0) return { ok: false, summary: "Klub tidak memiliki utang bank aktif." };
  const pay = Math.min(c.debt, amount);
  if (c.cash < pay) {
    return { ok: false, summary: `❌ Kas klub tidak cukup untuk membayar Rp ${(pay / 1_000_000_000).toFixed(1)}M.` };
  }

  const remainingDebt = c.debt - pay;
  const creditBoost = remainingDebt === 0 ? 15 : 5;
  db.run(
    `UPDATE clubs SET cash = cash - ?, debt = ?, credit_score = MIN(100, credit_score + ?) WHERE id = ?`,
    [pay, remainingDebt, creditBoost, c.id],
  );

  return {
    ok: true,
    summary:
      remainingDebt === 0
        ? `✅ Seluruh utang bank lunas! Skor kredit klub naik +${creditBoost}.`
        : `💸 Cicilan pokok Rp ${(pay / 1_000_000_000).toFixed(1)}M dibayar. Sisa utang: Rp ${(remainingDebt / 1_000_000_000).toFixed(1)}M (Kredit +${creditBoost}).`,
  };
}

export function injectPersonalCash(ownerId: number, amount: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  if (state.personal_cash < amount) {
    return { ok: false, summary: "❌ Kas pribadi pemilik tidak mencukupi." };
  }

  db.run(`UPDATE owners SET personal_cash = personal_cash - ?, reputation = MIN(100, reputation + 1) WHERE id = ?`, [
    amount,
    ownerId,
  ]);
  db.run(
    `UPDATE clubs SET cash = cash + ?, consecutive_missed_payments = CASE WHEN cash + ? >= 0 THEN 0 ELSE consecutive_missed_payments END, club_morale = MIN(100, club_morale + 3) WHERE id = ?`,
    [amount, amount, state.club.id],
  );

  return {
    ok: true,
    summary: `💉 Suntikan modal pribadi Rp ${(amount / 1_000_000_000).toFixed(1)}M berhasil masuk ke kas ${state.club.name} (Morale +3).`,
  };
}

export function withdrawDividend(ownerId: number, amount: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;
  if (c.bankrupt || c.cash < amount + 500_000_000) {
    return {
      ok: false,
      summary: "⚠️ Kas klub harus menyisakan minimal Rp 500jt sebagai cadangan operasional.",
    };
  }

  db.run(`UPDATE clubs SET cash = cash - ?, club_morale = MAX(10, club_morale - 3) WHERE id = ?`, [amount, c.id]);
  db.run(`UPDATE owners SET personal_cash = personal_cash + ? WHERE id = ?`, [amount, ownerId]);

  return {
    ok: true,
    summary: `💰 Dividen Rp ${(amount / 1_000_000_000).toFixed(1)}M ditarik ke rekening pribadi (Morale klub -3).`,
  };
}

export function upgradeClubInfra(
  ownerId: number,
  target: "facilities" | "academy" | "stadium",
): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;
  if (c.bankrupt) return { ok: false, summary: "❌ Klub sedang bangkrut." };

  if (target === "facilities") {
    if (c.facilities_level >= 10) return { ok: false, summary: "Fasilitas latihan sudah mencapai level maksimal (10)." };
    const cost = c.facilities_level * 600_000_000;
    if (c.cash < cost) return { ok: false, summary: `❌ Butuh kas Rp ${(cost / 1_000_000_000).toFixed(1)}M untuk upgrade fasilitas.` };
    db.run(
      `UPDATE clubs SET cash = cash - ?, facilities_level = facilities_level + 1, reputation = MIN(100, reputation + 1) WHERE id = ?`,
      [cost, c.id],
    );
    return {
      ok: true,
      summary: `🏋️ Fasilitas latihan ${c.name} naik ke Level ${c.facilities_level + 1}! Perkembangan CA/PA pemain meningkat.`,
    };
  }

  if (target === "academy") {
    if (c.academy_level >= 10) return { ok: false, summary: "Akademi klub sudah mencapai level maksimal (10)." };
    const cost = Math.max(400_000_000, c.academy_level * 500_000_000);
    if (c.cash < cost) return { ok: false, summary: `❌ Butuh kas Rp ${(cost / 1_000_000_000).toFixed(1)}M untuk upgrade akademi.` };
    db.run(
      `UPDATE clubs SET cash = cash - ?, academy_level = academy_level + 1, reputation = MIN(100, reputation + 1) WHERE id = ?`,
      [cost, c.id],
    );
    return {
      ok: true,
      summary: `🌱 Akademi ${c.name} naik ke Level ${c.academy_level + 1}! Kualitas bibit muda meningkat.`,
    };
  }

  // stadium expansion (+5,000 capacity)
  if (c.stadium_capacity >= 85_000) return { ok: false, summary: "Kapasitas stadion sudah maksimal (85.000 kursi)." };
  const cost = 1_500_000_000;
  if (c.cash < cost) return { ok: false, summary: `❌ Butuh kas Rp 1.5M untuk ekspansi tribun stadion.` };
  db.run(
    `UPDATE clubs SET cash = cash - ?, stadium_capacity = stadium_capacity + 5000, fans = fans + 8000, monthly_income = monthly_income + 85000000 WHERE id = ?`,
    [cost, c.id],
  );
  return {
    ok: true,
    summary: `🏟️ Stadion diperluas +5.000 kursi (Kapasitas ${(c.stadium_capacity + 5000).toLocaleString("id-ID")})! Pendapatan tiket bulanan naik.`,
  };
}

export function signSponsorDeal(ownerId: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu belum memiliki klub aktif." };
  const c = state.club;
  if (c.bankrupt) return { ok: false, summary: "❌ Tidak ada sponsor yang mau bekerja sama dengan klub bangkrut." };

  const targetIncome = Math.round(c.reputation * 7_500_000 + Math.min(c.fans, c.stadium_capacity) * 14_000);
  if (c.monthly_income >= targetIncome) {
    return {
      ok: false,
      summary: `⚠️ Kontrak sponsor saat ini sudah optimal untuk reputasi klub (${c.reputation}). Tingkatkan reputasi atau stadion terlebih dahulu!`,
    };
  }

  const signingBonus = Math.round(c.reputation * 12_000_000);
  db.run(`UPDATE clubs SET monthly_income = ?, cash = cash + ? WHERE id = ?`, [targetIncome, signingBonus, c.id]);

  return {
    ok: true,
    summary: `🤝 Kontrak sponsor utama baru diteken! Bonus tanda tangan +Rp ${(signingBonus / 1_000_000).toFixed(0)}jt & pendapatan bulanan naik ke Rp ${(targetIncome / 1_000_000).toFixed(0)}jt/bln.`,
  };
}

export function sellClub(ownerId: number): { ok: boolean; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state || !state.club) return { ok: false, summary: "Kamu tidak memiliki klub untuk dijual." };
  const c = state.club;
  if (c.bankrupt) return { ok: false, summary: "❌ Klub sudah bangkrut dan disita operator liga." };

  const saleProceeds = Math.max(500_000_000, Math.round(c.valuation * 0.9));
  db.run(`UPDATE clubs SET owner_id = NULL WHERE id = ?`, [c.id]);
  db.run(`UPDATE owners SET personal_cash = personal_cash + ?, reputation = MIN(100, reputation + 2) WHERE id = ?`, [
    saleProceeds,
    ownerId,
  ]);

  return {
    ok: true,
    summary: `🏷️ Saham mayoritas ${c.name} resmi dijual senilai Rp ${(saleProceeds / 1_000_000_000).toFixed(2)}M! Pilih klub atau slot liga baru di tab Bursa Slot & Klub.`,
  };
}

export function buyClubOrSlot(
  ownerId: number,
  targetClubId: number,
  customClubName?: string,
): { ok: boolean; clubId: number; clubName: string; summary: string } {
  const db = getDB();
  const state = getOwnerState(ownerId);
  if (!state) return { ok: false, clubId: 0, clubName: "", summary: "Pemilik tidak ditemukan." };
  if (state.club_id === targetClubId) {
    return { ok: false, clubId: targetClubId, clubName: state.club?.name ?? "", summary: "Kamu sudah memiliki klub ini." };
  }

  const market = getClubMarket(ownerId);
  const target = market.find((m) => m.club_id === targetClubId);
  if (!target) return { ok: false, clubId: 0, clubName: "", summary: "Klub/slot tidak ditemukan." };

  // If owner currently owns another club, sell it automatically as part of takeover
  let availablePersonalCash = state.personal_cash;
  let soldOldNote = "";
  if (state.club && !state.club.bankrupt) {
    const oldProceeds = Math.max(500_000_000, Math.round(state.club.valuation * 0.85));
    availablePersonalCash += oldProceeds;
    db.run(`UPDATE clubs SET owner_id = NULL WHERE id = ?`, [state.club.id]);
    soldOldNote = ` (Saham ${state.club.name} dilepas Rp ${(oldProceeds / 1_000_000_000).toFixed(2)}M)`;
  } else if (state.club) {
    db.run(`UPDATE clubs SET owner_id = NULL WHERE id = ?`, [state.club.id]);
  }

  const price = target.acquisition_price;
  if (availablePersonalCash < price) {
    // Rollback old club ownership if needed
    if (state.club_id) db.run(`UPDATE clubs SET owner_id = ? WHERE id = ?`, [ownerId, state.club_id]);
    return {
      ok: false,
      clubId: state.club_id ?? 0,
      clubName: state.club?.name ?? "Tanpa Klub",
      summary: `❌ Kas pribadi tidak cukup untuk mengakuisisi ${target.club_name} (Butuh Rp ${(price / 1_000_000_000).toFixed(2)}M).`,
    };
  }

  const newPersonalCash = availablePersonalCash - price;
  const finalName = customClubName?.trim() ? customClubName.trim() : target.club_name;

  db.run(`UPDATE owners SET personal_cash = ?, reputation = MIN(100, reputation + 4) WHERE id = ?`, [
    newPersonalCash,
    ownerId,
  ]);

  if (target.bankrupt || target.slot_status === "available") {
    // Buying an available league slot / rescuing a bankrupt club (SLOT-LIGA-BANKRUPTCY.md §6 & §9)
    db.run(
      `UPDATE clubs
       SET name = ?, owner_id = ?, bankrupt = 0, cash = 3500000000, debt = 0,
           credit_score = 65, consecutive_missed_payments = 0, club_morale = 75
       WHERE id = ?`,
      [finalName, ownerId, targetClubId],
    );
    db.run(`UPDATE league_slots SET status = 'occupied' WHERE club_id = ?`, [targetClubId]);

    // Ensure the club has at least 15 players by signing free agents if squad was emptied on bankruptcy
    const sqCount = (db.exec(`SELECT COUNT(*) FROM players WHERE club = ? AND retired = 0`, [targetClubId])[0]?.values[0]?.[0] as number) ?? 0;
    if (sqCount < 15) {
      const needed = 15 - sqCount;
      db.run(
        `UPDATE players SET club = ?, free_agent = 0
         WHERE id IN (SELECT id FROM players WHERE free_agent = 1 AND retired = 0 ORDER BY overall DESC LIMIT ?)`,
        [targetClubId, needed],
      );
    }

    return {
      ok: true,
      clubId: targetClubId,
      clubName: finalName,
      summary: `🏛️ Slot Liga berhasil dibeli senilai Rp ${(price / 1_000_000_000).toFixed(2)}M! ${finalName} resmi kembali berkompetisi di bawah kepemimpinanmu${soldOldNote}.`,
    };
  }

  db.run(`UPDATE clubs SET name = ?, owner_id = ? WHERE id = ?`, [finalName, ownerId, targetClubId]);
  return {
    ok: true,
    clubId: targetClubId,
    clubName: finalName,
    summary: `👑 Akuisisi sukses! Kamu resmi menjadi pemilik penuh ${finalName} senilai Rp ${(price / 1_000_000_000).toFixed(2)}M${soldOldNote}.`,
  };
}

export function triggerClubBankruptcy(clubId: number, ownerId: number | null): string {
  const db = getDB();
  const nameRes = db.exec(`SELECT name FROM clubs WHERE id = ?`, [clubId]);
  const clubName = (nameRes[0]?.values[0]?.[0] as string) ?? "Klub";

  // 1. Keep minimal 11 youth/low-wage players or release stars to free agent market so transfer market floods (SLOT-LIGA-BANKRUPTCY.md §3)
  db.run(
    `UPDATE players SET free_agent = 1, club = NULL
     WHERE club = ? AND id IN (
       SELECT id FROM players WHERE club = ? AND retired = 0 ORDER BY overall DESC LIMIT 8
     )`,
    [clubId, clubId],
  );

  // 2. Mark club bankrupt, credit_score = 0, slot enters market ('available')
  db.run(
    `UPDATE clubs
     SET bankrupt = 1, credit_score = 0, consecutive_missed_payments = 3, club_morale = 20
     WHERE id = ?`,
    [clubId],
  );
  db.run(`UPDATE league_slots SET status = 'available' WHERE club_id = ?`, [clubId]);

  if (ownerId) {
    db.run(
      `UPDATE owners SET credit_score = MAX(0, credit_score - 30), reputation = MAX(0, reputation - 15) WHERE id = ?`,
      [ownerId],
    );
  }

  return `💥 ${clubName} DINYATAKAN BANGKRUT! Gagal menutup defisit kas 3 kali beruntun — pemain bintang menjadi Free Agent dan Slot Liga resmi masuk bursa penjualan!`;
}

export function tickClubFinances(ownerId: number, daysDelta: number): string | null {
  if (daysDelta <= 0) return null;
  const db = getDB();
  const state = getOwnerState(ownerId);
  const messages: string[] = [];

  // Check if any distressed NPC club defaults on its 3rd missed payment
  const npcDefault = db.exec(
    `SELECT id FROM clubs WHERE (owner_id IS NULL OR owner_id != ?) AND bankrupt = 0 AND cash < 0 AND consecutive_missed_payments >= 2 LIMIT 1`,
    [ownerId],
  );
  const npcClubId = npcDefault[0]?.values[0]?.[0] as number | undefined;
  if (npcClubId) {
    messages.push(triggerClubBankruptcy(npcClubId, null));
  }

  if (!state || !state.club || state.club.bankrupt) {
    return messages.length > 0 ? messages.join(" · ") : null;
  }

  const c = state.club;
  const factor = daysDelta / 30;
  const income = Math.round(c.monthly_income * factor);
  const costs = Math.round(c.monthly_total_costs * factor);
  const netDelta = income - costs;
  const newCash = c.cash + netDelta;

  // Reduce principal slightly when loan payment is made and cash is positive
  const principalPaid =
    c.debt > 0 && newCash >= 0 ? Math.min(c.debt, Math.round((c.debt / 12) * factor)) : 0;
  const newDebt = Math.max(0, c.debt - principalPaid);

  let missed = c.consecutive_missed_payments;
  let credit = c.credit_score;

  if (newCash < 0) {
    missed += 1;
  } else {
    missed = 0;
    credit = Math.min(100, credit + 1);
  }

  db.run(
    `UPDATE clubs
     SET cash = ?, debt = ?, consecutive_missed_payments = ?, credit_score = ?,
         monthly_costs = ?
     WHERE id = ?`,
    [newCash, newDebt, missed, credit, c.monthly_total_costs, c.id],
  );

  if (missed >= 3) {
    messages.push(triggerClubBankruptcy(c.id, ownerId));
  } else if (newCash < 0 && c.credit_score === 0) {
    if (missed === 1) {
      messages.push(
        `🦈 TEROR RENTENIR (Tunggakan 1/2): Penagih utang mengancam manajemen ${c.name}! Segera suntik kas sebelum dipaksa terlibat sindikat skor / pidana.`,
      );
    } else if (missed === 2) {
      messages.push(
        `🦈 EKSEKUSI RENTENIR (Tunggakan 2/2): Karena gagal bayar, sindikat rentenir memaksa ${c.name} mengalah & aliran dana ilegal bocor ke polisi!`,
      );
    }
  } else if (newCash < 0) {
    messages.push(
      `⚠️ PERINGATAN KEUANGAN: Kas ${c.name} defisit! Tunggakan ke-${missed}/3 sebelum klub disita & bangkrut.`,
    );
  }

  return messages.length > 0 ? messages.join(" · ") : null;
}
