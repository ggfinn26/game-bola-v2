import { getDB } from "./db.js";

export interface TopPlayerRow {
  player_id: number;
  name: string;
  club_name: string;
  position: string;
  matches: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  rating: number;
}

export interface LeagueLeaders {
  topScorers: TopPlayerRow[];
  topAssists: TopPlayerRow[];
  topRated: TopPlayerRow[];
}

export interface CareerSeasonRow {
  season: number;
  club_name: string;
  matches: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  rating: number;
  yellow_cards: number;
  red_cards: number;
}

function mapTopPlayerRow(row: unknown[]): TopPlayerRow {
  return {
    player_id: row[0] as number,
    name: row[1] as string,
    club_name: row[2] as string,
    position: row[3] as string,
    matches: row[4] as number,
    goals: row[5] as number,
    assists: row[6] as number,
    clean_sheets: row[7] as number,
    rating: Number(row[8]) || 0,
  };
}

const BASE_LEADER_SELECT = `
  SELECT p.id, p.name, c.name, p.position, p.matches, p.goals, p.assists, p.clean_sheets, p.rating
  FROM players p
  JOIN clubs c ON c.id = p.club
  WHERE p.retired = 0 AND c.league_id = ? AND p.matches > 0
`;

export function getLeagueLeaders(leagueId = 1, limit = 5): LeagueLeaders {
  const db = getDB();

  const scorersRes = db.exec(
    `${BASE_LEADER_SELECT} AND p.goals > 0 ORDER BY p.goals DESC, p.assists DESC, p.rating DESC LIMIT ?`,
    [leagueId, limit],
  );
  const assistsRes = db.exec(
    `${BASE_LEADER_SELECT} AND p.assists > 0 ORDER BY p.assists DESC, p.goals DESC, p.rating DESC LIMIT ?`,
    [leagueId, limit],
  );
  const ratedRes = db.exec(
    `${BASE_LEADER_SELECT} ORDER BY p.rating DESC, p.matches DESC LIMIT ?`,
    [leagueId, limit],
  );

  return {
    topScorers: (scorersRes[0]?.values ?? []).map(mapTopPlayerRow),
    topAssists: (assistsRes[0]?.values ?? []).map(mapTopPlayerRow),
    topRated: (ratedRes[0]?.values ?? []).map(mapTopPlayerRow),
  };
}

export function getPlayerCareerHistory(playerId: number): CareerSeasonRow[] {
  const db = getDB();
  const res = db.exec(
    `SELECT ps.season, COALESCE(c.name, 'Free Agent'), ps.matches, ps.goals, ps.assists, ps.clean_sheets, ps.rating, ps.yellow_cards, ps.red_cards
     FROM player_stats ps
     LEFT JOIN clubs c ON c.id = ps.club_id
     WHERE ps.player_id = ?
     ORDER BY ps.season DESC`,
    [playerId],
  );

  return (res[0]?.values ?? []).map((r) => ({
    season: r[0] as number,
    club_name: r[1] as string,
    matches: r[2] as number,
    goals: r[3] as number,
    assists: r[4] as number,
    clean_sheets: r[5] as number,
    rating: Number(r[6]) || 0,
    yellow_cards: r[7] as number,
    red_cards: r[8] as number,
  }));
}

export function evaluateSeasonAwards(
  leagueId = 1,
  egoId = 0,
): { summary: string; egoAwards: string[] } {
  const db = getDB();
  const egoAwards: string[] = [];
  const parts: string[] = [];

  // 1) Sepatu Emas (Top Skor)
  const topScorer = db.exec(
    `SELECT p.id, p.name, p.goals
     FROM players p
     JOIN clubs c ON c.id = p.club
     WHERE p.retired = 0 AND c.league_id = ? AND p.matches > 0 AND p.goals > 0
     ORDER BY p.goals DESC, p.assists DESC, p.rating DESC
     LIMIT 1`,
    [leagueId],
  )[0]?.values[0];

  if (topScorer) {
    const [id, name, goals] = topScorer as [number, string, number];
    parts.push(`Sepatu Emas: ${name} (${goals} gol)`);
    if (id === egoId) egoAwards.push("Sepatu Emas");
  }

  // 2) Pemain Terbaik (MVP)
  const mvp = db.exec(
    `SELECT p.id, p.name, p.rating
     FROM players p
     JOIN clubs c ON c.id = p.club
     WHERE p.retired = 0 AND c.league_id = ? AND p.matches >= 5
     ORDER BY p.rating DESC, p.goals DESC, p.assists DESC
     LIMIT 1`,
    [leagueId],
  )[0]?.values[0];

  if (mvp) {
    const [id, name, rating] = mvp as [number, string, number];
    parts.push(`MVP: ${name} (${Number(rating).toFixed(2)})`);
    if (id === egoId) egoAwards.push("Pemain Terbaik (MVP)");
  }

  // 3) Pemain Muda Terbaik (U-21)
  const youngBest = db.exec(
    `SELECT p.id, p.name, p.rating
     FROM players p
     JOIN clubs c ON c.id = p.club
     WHERE p.retired = 0 AND c.league_id = ? AND p.matches >= 5 AND p.age <= 21
     ORDER BY p.rating DESC, p.goals DESC, p.assists DESC
     LIMIT 1`,
    [leagueId],
  )[0]?.values[0];

  if (youngBest) {
    const [id, name] = youngBest as [number, string, number];
    parts.push(`Muda Terbaik: ${name}`);
    if (id === egoId) egoAwards.push("Pemain Muda Terbaik (U-21)");
  }

  const summary = parts.length > 0 ? `🏅 Penghargaan: ${parts.join(" · ")}` : "";
  return { summary, egoAwards };
}
