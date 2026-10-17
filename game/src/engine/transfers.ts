import { getDB } from "./db.js";

export interface TransferOffer {
  club_id: number;
  club_name: string;
  club_reputation: number;
  wage: number;
  contract_years: number;
  is_renewal: boolean;
}

function roundWage(raw: number): number {
  return Math.max(3_000_000, Math.round(raw / 500_000) * 500_000);
}

export function generateTransferOffers(playerId: number): TransferOffer[] {
  const db = getDB();

  const pRes = db.exec(`SELECT club, overall, pa, form, wage, age FROM players WHERE id = ?`, [playerId]);
  const pRow = pRes[0]?.values[0];
  if (!pRow) return [];

  const currentClubId = (pRow[0] as number | null) ?? null;
  const overall = (pRow[1] as number) ?? 8;
  const form = (pRow[3] as number) ?? 0.5;
  const currentWage = (pRow[4] as number) ?? 3_000_000;
  const age = (pRow[5] as number) ?? 20;

  const cRes = db.exec(`SELECT id, name, reputation FROM clubs WHERE league_id = 1 ORDER BY reputation DESC`);
  const clubs = (cRes[0]?.values ?? []).map((r) => ({
    id: r[0] as number,
    name: r[1] as string,
    reputation: (r[2] as number) ?? 50,
  }));

  const offers: TransferOffer[] = [];
  const baseWage = roundWage(overall * 400_000 + form * 5_000_000);

  if (currentClubId != null) {
    const currentClub = clubs.find((c) => c.id === currentClubId);
    if (currentClub) {
      offers.push({
        club_id: currentClub.id,
        club_name: currentClub.name,
        club_reputation: currentClub.reputation,
        wage: Math.max(baseWage, roundWage(currentWage * 1.05)),
        contract_years: 2,
        is_renewal: true,
      });
    }
  }

  const otherClubs = clubs.filter((c) => c.id !== currentClubId);
  const isHighTier = overall >= 60 || form >= 0.7;
  // Sort or slice candidate pool by reputation suitability
  const pool = isHighTier
    ? otherClubs.slice(0, Math.min(8, otherClubs.length))
    : otherClubs.slice(Math.max(0, Math.floor(otherClubs.length * 0.25)));

  // Shuffle candidate pool
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  for (const club of selected) {
    const repFactor = 0.85 + (club.reputation / 100) * 0.45;
    const jitter = 0.95 + Math.random() * 0.2;
    const offerWage = roundWage(baseWage * repFactor * jitter);
    const years = age >= 30 ? (Math.random() < 0.6 ? 1 : 2) : Math.floor(Math.random() * 3) + 1;

    offers.push({
      club_id: club.id,
      club_name: club.name,
      club_reputation: club.reputation,
      wage: offerWage,
      contract_years: years,
      is_renewal: false,
    });
  }

  return offers;
}

export function acceptTransferOffer(
  playerId: number,
  offer: TransferOffer,
  currentDay: number,
): { clubId: number; clubName: string; summary: string } {
  const db = getDB();
  const contractEnd = currentDay + offer.contract_years * 365;

  db.run(`UPDATE players SET club = ?, wage = ?, contract_end = ?, free_agent = 0 WHERE id = ?`, [
    offer.club_id,
    offer.wage,
    contractEnd,
    playerId,
  ]);

  const summary = offer.is_renewal
    ? `✍️ Kontrak diperpanjang bersama ${offer.club_name} (${offer.contract_years} tahun)!`
    : `✈️ Resmi pindah ke ${offer.club_name} dengan kontrak ${offer.contract_years} tahun!`;

  return {
    clubId: offer.club_id,
    clubName: offer.club_name,
    summary,
  };
}
