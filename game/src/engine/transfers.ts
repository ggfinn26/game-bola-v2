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

  const pRes = db.exec(`SELECT club, overall, pa, form, wage, age, traits FROM players WHERE id = ?`, [playerId]);
  const pRow = pRes[0]?.values[0];
  if (!pRow) return [];

  const currentClubId = (pRow[0] as number | null) ?? null;
  const overall = (pRow[1] as number) ?? 8;
  const form = (pRow[3] as number) ?? 0.5;
  const currentWage = (pRow[4] as number) ?? 3_000_000;
  const age = (pRow[5] as number) ?? 20;
  const traits: string[] = JSON.parse((pRow[6] as string) || "[]");

  // Include foreign leagues for high-overall players; always include current club's league
  const leagueIds =
    overall >= 80
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 17, 18, 12, 22, 13, 24, 14, 26, 28, 29, 15, 32, 33, 34, 35, 36, 16]
      : overall >= 70
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 29, 32, 34, 36]
        : overall >= 55
          ? [1, 2, 3, 4, 5, 9, 16, 19, 21, 23, 25, 27]
          : [1, 2, 5, 21];
  const placeholders = leagueIds.map(() => "?").join(",");
  const cRes = db.exec(
    `SELECT id, name, reputation, league_id FROM clubs WHERE league_id IN (${placeholders}) ORDER BY reputation DESC`,
    leagueIds,
  );
  const clubs = (cRes[0]?.values ?? []).map((r) => ({
    id: r[0] as number,
    name: r[1] as string,
    reputation: (r[2] as number) ?? 50,
    league_id: r[3] as number,
  }));

  const has = (t: string) => traits.includes(t);
  const offers: TransferOffer[] = [];
  let wageMult = 1.0;
  if (has("greedy")) wageMult *= 1.25;
  if (has("generous")) wageMult *= 0.9;
  if (has("mercenary")) wageMult *= 1.2;
  // Tiered foreign wage incentive
  const foreignWageBonus = (leagueId: number) => {
    if (leagueId === 11) return 3.0; // Premier League (+200%)
    if (leagueId === 12) return 2.8; // La Liga (+180%)
    if (leagueId === 13 || leagueId === 14) return 2.4; // Serie A & Bundesliga (+140%)
    if (leagueId === 28) return 2.2; // Ligue 1 (+120%)
    if (leagueId === 8) return 2.5; // Saudi Pro League (+150%)
    if (leagueId === 33 || leagueId === 35) return 2.0; // Primeira Liga & Süper Lig (+100%)
    if (leagueId === 15) return 1.8; // Eredivisie (+80%)
    if (leagueId === 17 || leagueId === 22 || leagueId === 24 || leagueId === 26) return 1.6; // Tier 2 Big 4 (+60%)
    if (leagueId === 6 || leagueId === 7) return 1.6; // J1 & K-League (+60%)
    if (leagueId === 18 || leagueId === 29 || leagueId === 32 || leagueId === 34 || leagueId === 36) return 1.4; // Tier 2/3 (+40%)
    if (leagueId === 3 || leagueId === 4 || leagueId === 9 || leagueId === 16) return 1.25; // ASEAN (+25%)
    if (leagueId === 19 || leagueId === 23 || leagueId === 25 || leagueId === 27) return 1.2; // Tier 3/4 (+20%)
    if (leagueId === 21) return 1.1; // National League (+10%)
    return 1.0;
  };
  const baseWage = roundWage((overall * 400_000 + form * 5_000_000) * wageMult);

  const currentClub = currentClubId != null ? clubs.find((c) => c.id === currentClubId) : undefined;
  const currentRep = currentClub?.reputation ?? 0;

  if (currentClub) {
    offers.push({
      club_id: currentClub.id,
      club_name: currentClub.name,
      club_reputation: currentClub.reputation,
      wage: Math.max(baseWage, roundWage(currentWage * 1.05 * wageMult)),
      contract_years: 2,
      is_renewal: true,
    });
  }

  const otherClubs = clubs.filter((c) => c.id !== currentClubId);

  // Reputation gate: club rep must be compatible with player overall
  // Formula: club.rep >= overall * 0.9 - 25 (elite player → only big clubs approach)
  //          club.rep <= overall * 1.4 + 20  (weak player → elite clubs won't bother)
  const repMin = Math.max(0, overall * 0.9 - 25);
  const repMax = overall * 1.4 + 20;
  const compatibleClubs = has("mercenary")
    ? otherClubs
    : otherClubs.filter((c) => c.reputation >= repMin && c.reputation <= repMax);
  const poolBase = compatibleClubs.length > 0 ? compatibleClubs : otherClubs; // fallback if no match

  const isHighTier = overall >= 60 || form >= 0.7;
  // Sort or slice candidate pool by reputation suitability
  let pool = has("mercenary")
    ? otherClubs
    : isHighTier
      ? poolBase.slice(0, Math.min(8, poolBase.length))
      : poolBase.slice(Math.max(0, Math.floor(poolBase.length * 0.25)));

  if (has("loyal") && currentClub) {
    pool = pool.filter((c) => c.reputation >= currentRep + 10);
  }

  if (has("ambitious")) {
    const higherRep = otherClubs.filter((c) => c.reputation > currentRep);
    if (higherRep.length > 0) pool = higherRep;
  }

  let offerCount = 3;
  if (has("generous")) offerCount += 1;
  if (has("mercenary")) offerCount += 1;
  if (has("loyal") && currentClub) offerCount = Math.max(1, offerCount - 2);

  // Shuffle candidate pool (ambitious prefers clubs with higher reputation)
  const shuffled = has("ambitious")
    ? [...pool].sort((a, b) => b.reputation - a.reputation + (Math.random() - 0.5) * 10)
    : [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, offerCount);

  for (const club of selected) {
    const repFactor = 0.85 + (club.reputation / 100) * 0.45;
    const jitter = 0.95 + Math.random() * 0.2;
    const offerWage = roundWage(baseWage * repFactor * jitter * foreignWageBonus(club.league_id));
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
