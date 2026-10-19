import { getDB } from "./db.js";

export interface LegalCase {
  id: string;
  title: string;
  description: string;
  severity: number; // 1–5
  base_min_days: number;
  base_max_days: number;
  case_value: number; // baseline Rp for bribe calculation
  officer_bribability: number; // 0.0–0.80
  officer_tier_label: string;
  media_exposure: number; // 0–100
}

const CASE_TEMPLATES: Record<
  string,
  {
    title: string;
    description: string;
    severity: number;
    minDays: number;
    maxDays: number;
    caseValue: number;
  }
> = {
  match_fixing_investigation: {
    title: "⚖️ Penyidikan Skandal Pengaturan Skor (Match-Fixing)",
    description:
      "Satgas Anti-Mafia Bola menyita bukti komunikasi mencurigakan terkait tawaran pengaturan skor. Kamu dipanggil untuk pemeriksaan darurat dengan ancaman kurungan penjara dan sanksi larangan bermain.",
    severity: 5,
    minDays: 365,
    maxDays: 730,
    caseValue: 500_000_000,
  },
  illegal_endorsement_probe: {
    title: "⚖️ Kasus Promosi Situs Judi Online Ilegal",
    description:
      "Bareskrim memanggilmu atas dugaan keterlibatan mempromosikan platform taruhan daring ilegal berkedok game. Kasusnya mulai ramai diberitakan media nasional.",
    severity: 3,
    minDays: 90,
    maxDays: 180,
    caseValue: 200_000_000,
  },
  tax_evasion: {
    title: "⚖️ Tuduhan Penggelapan Pajak Penghasilan",
    description:
      "Direktorat Jenderal Pajak menemukan selisih laporan pendapatan bonus dan kontrak yang disembunyikan. Penyidik membuka berkas perkara pidana perpajakan.",
    severity: 3,
    minDays: 90,
    maxDays: 240,
    caseValue: 300_000_000,
  },
  drink_driving: {
    title: "⚖️ Kecelakaan Lalu Lintas & Mengemudi di Bawah Pengaruh Alkohol",
    description:
      "Mobilmu menabrak pembatas jalan sepulang dari pesta larut malam. Polisi menahanmu di lokasi kejadian sebelum wartawan tiba.",
    severity: 2,
    minDays: 30,
    maxDays: 90,
    caseValue: 100_000_000,
  },
  loan_shark_extortion: {
    title: "⚖️ Penyidikan Sindikat Rentenir & Pencucian Uang Klub",
    description:
      "Aliran dana gelap dari sindikat rentenir ilegal ke kas klub terendus aparat penegak hukum. Kamu berstatus tersangka utama.",
    severity: 4,
    minDays: 180,
    maxDays: 365,
    caseValue: 800_000_000,
  },
};

function rollOfficerTier(): { bribability: number; label: string } {
  const r = Math.random();
  if (r < 0.2) return { bribability: 0.65 + Math.random() * 0.15, label: "Korup (Terbuka Suap)" };
  if (r < 0.5) return { bribability: 0.38 + Math.random() * 0.2, label: "Mata Duitan (Bisa Dinegosiasi)" };
  if (r < 0.78) return { bribability: 0.18 + Math.random() * 0.15, label: "Netral (Waspada)" };
  if (r < 0.92) return { bribability: 0.05 + Math.random() * 0.08, label: "Bersih (Sulit Disuap)" };
  return { bribability: 0.0, label: "Anti-Suap (Integritas Tinggi)" };
}

export function createLegalCase(caseKey: string): LegalCase {
  const tpl = CASE_TEMPLATES[caseKey] ?? CASE_TEMPLATES.illegal_endorsement_probe;
  const officer = rollOfficerTier();
  const mediaExposure = 25 + Math.floor(Math.random() * 45);
  return {
    id: caseKey,
    title: tpl.title,
    description: tpl.description,
    severity: tpl.severity,
    base_min_days: tpl.minDays,
    base_max_days: tpl.maxDays,
    case_value: tpl.caseValue,
    officer_bribability: Number(officer.bribability.toFixed(2)),
    officer_tier_label: officer.label,
    media_exposure: mediaExposure,
  };
}

export type LegalResolutionInput =
  | { path: "bribe"; bribeAmount: number }
  | { path: "lawyer"; lawyerSkill: 3 | 6 | 9 | 10; lawyerCost: number }
  | { path: "surrender" };

function deductFineOrFee(mode: string, characterId: number, amount: number): void {
  if (amount <= 0) return;
  const db = getDB();
  if (mode === "owner") {
    db.run(`UPDATE owners SET personal_cash = MAX(0, personal_cash - ?) WHERE id = ?`, [amount, characterId]);
  } else if (mode === "agent") {
    db.run(`UPDATE agents SET cash = cash - ? WHERE id = ?`, [amount, characterId]);
  } else if (mode === "manager") {
    db.run(`UPDATE clubs SET cash = cash - ? WHERE id = ?`, [amount, characterId]);
  } else if (mode === "player" && characterId > 0) {
    // Deduct from player's wage / savings by trimming wage slightly (min Rp 1.5jt)
    db.run(`UPDATE players SET wage = MAX(1500000, wage - ?) WHERE id = ?`, [Math.round(amount / 24), characterId]);
  }
}

function applyPrisonSentence(mode: string, characterId: number, prisonDays: number, isMatchFixing: boolean): void {
  const db = getDB();
  if (mode === "player" && characterId > 0) {
    db.run(
      `UPDATE players SET
         in_prison = 1,
         prison_duration = prison_duration + ?,
         stamina = 0.40,
         form = 0.20,
         transfer_ban = CASE WHEN ? = 1 THEN 1 ELSE transfer_ban END
       WHERE id = ?`,
      [prisonDays, isMatchFixing ? 1 : 0, characterId],
    );
  } else if (mode === "owner") {
    const cId = db.exec(`SELECT club_id FROM owners WHERE id = ?`, [characterId])[0]?.values[0]?.[0] as number | null;
    if (cId) {
      db.run(`UPDATE clubs SET points = MAX(0, points - 6), reputation = MAX(10, reputation - 10) WHERE id = ?`, [cId]);
    }
  } else if (mode === "agent") {
    db.run(`UPDATE agents SET reputation = MAX(5, reputation - 20) WHERE id = ?`, [characterId]);
  }
}

export function resolveLegalCase(
  legalCase: LegalCase,
  input: LegalResolutionInput,
  mode: string,
  characterId: number,
): { prisonDays: number; summary: string } {
  const baseSentence =
    legalCase.base_min_days +
    Math.floor(Math.random() * (legalCase.base_max_days - legalCase.base_min_days + 1));
  const isFixing = legalCase.id === "match_fixing_investigation";

  // Path A: Bribe Police
  if (input.path === "bribe") {
    deductFineOrFee(mode, characterId, input.bribeAmount);

    if (legalCase.officer_bribability <= 0) {
      const sentence = baseSentence + 90;
      applyPrisonSentence(mode, characterId, sentence, isFixing);
      return {
        prisonDays: sentence,
        summary: `🚨 SUAP GAGAL TOTAL! Penyidik (${legalCase.officer_tier_label}) menolak uang suap dan menambahkan pasal penyuapan (+90 hari). Kamu divonis ${sentence} hari penjara!`,
      };
    }

    const moneyBonus = Math.min(0.3, (input.bribeAmount / Math.max(1, legalCase.case_value)) * 0.3);
    const sevPenalty = legalCase.severity * 0.1;
    const mediaPenalty = legalCase.media_exposure > 50 ? 0.2 : 0;
    const successChance = Math.max(
      0.05,
      Math.min(0.9, legalCase.officer_bribability + moneyBonus - sevPenalty - mediaPenalty),
    );

    if (Math.random() < successChance) {
      return {
        prisonDays: 0,
        summary: `🤫 KASUS DITUTUP DIAM-DIAM: Penyidik (${legalCase.officer_tier_label}) menerima uang damai. Berkas perkara dihentikan tanpa vonis penjara.`,
      };
    }

    const addedBribeDays = 30 + Math.floor(Math.random() * 61);
    const totalSentence = baseSentence + addedBribeDays;
    applyPrisonSentence(mode, characterId, totalSentence, isFixing);
    return {
      prisonDays: totalSentence,
      summary: `🚔 OPERASI TANGKAP TANGAN! Upaya suap ke penyidik (${legalCase.officer_tier_label}) terbongkar. Hukuman ditambah +${addedBribeDays} hari menjadi total ${totalSentence} hari penjara!`,
    };
  }

  // Path B: Fight with Lawyer
  if (input.path === "lawyer") {
    deductFineOrFee(mode, characterId, input.lawyerCost);
    const baseWin = input.lawyerSkill * 0.08;
    const sevPenalty = legalCase.severity * 0.08;
    const mediaPenalty = legalCase.media_exposure > 70 ? 0.15 : 0;
    const winChance = Math.max(0.08, Math.min(0.85, baseWin - sevPenalty - mediaPenalty));
    const roll = Math.random();

    if (roll < winChance) {
      if (mode === "player" && characterId > 0) {
        getDB().run(`UPDATE players SET form = MIN(1.0, ROUND(form + 0.06, 2)) WHERE id = ?`, [characterId]);
      }
      return {
        prisonDays: 0,
        summary: `⚖️ BEBAS MURNI! Pengacara (Skill ${input.lawyerSkill}/10) berhasil mematahkan dakwaan di pengadilan. Nama baikmu pulih!`,
      };
    }

    if (roll < winChance + 0.18) {
      const reducedSentence = Math.max(14, Math.round(baseSentence * 0.6));
      applyPrisonSentence(mode, characterId, reducedSentence, false);
      return {
        prisonDays: reducedSentence,
        summary: `⚖️ VONIS RINGAN (-40%): Pengacara berhasil meringankan tuntutan menjadi ${reducedSentence} hari tahanan.`,
      };
    }

    applyPrisonSentence(mode, characterId, baseSentence, isFixing);
    return {
      prisonDays: baseSentence,
      summary: `🔨 VONIS PENUH: Pembelaan pengacara ditolak hakim. Kamu dijatuhi hukuman ${baseSentence} hari penjara!`,
    };
  }

  // Path C: Surrender (remorse reduction -20%)
  const remorseSentence = Math.max(14, Math.round(baseSentence * 0.8));
  applyPrisonSentence(mode, characterId, remorseSentence, isFixing);
  return {
    prisonDays: remorseSentence,
    summary: `⛓️ MENYERAHKAN DIRI (-20% keringanan sikap kooperatif): Kamu menjalani vonis ${remorseSentence} hari penjara.`,
  };
}
