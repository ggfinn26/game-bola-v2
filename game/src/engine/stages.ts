import { getDB } from "./db.js";
import type { StageConfig as BaseStageConfig } from "../types/index.js";

export interface StageConfig extends Partial<BaseStageConfig> {
  id: string;
  name: string;
  type?: "league" | "knockout" | "group";
  group_count?: number;
  legs?: 1 | 2;
  advance_count?: number;
  relegate_count?: number;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;
  tiebreakers?: string[];
}

const DEFAULT_REGULAR_STAGE: StageConfig = {
  id: "regular_season",
  name: "Regular Season",
  type: "league",
  format: "round_robin",
  group_count: 1,
  num_groups: 1,
  legs: 2,
  advance_count: 0,
  relegate_count: 3,
  points_win: 3,
  points_draw: 1,
  points_loss: 0,
  tiebreakers: ["goal_diff", "goals_for", "h2h"],
};

export function getActiveStages(leagueId: number): StageConfig[] {
  const db = getDB();
  const res = db.exec(
    `SELECT stages FROM competition_configs
     WHERE league_id = ? AND status = 'active'
     ORDER BY season_apply DESC LIMIT 1`,
    [leagueId],
  );
  const raw = res[0]?.values[0]?.[0] as string | undefined;
  if (!raw) return [{ ...DEFAULT_REGULAR_STAGE }];
  try {
    const parsed = JSON.parse(raw) as StageConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback to default stage
  }
  return [{ ...DEFAULT_REGULAR_STAGE }];
}

export function buildStagesPreset(enableChampionshipSeries: boolean): StageConfig[] {
  return enableChampionshipSeries
    ? [
        {
          id: "regular_season",
          name: "Regular Season",
          type: "league",
          format: "round_robin",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 4,
          relegate_count: 3,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for", "h2h"],
        },
        {
          id: "championship_series",
          name: "Championship Series",
          type: "knockout",
          format: "knockout",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 1,
          relegate_count: 0,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for"],
        },
      ]
    : [
        {
          id: "regular_season",
          name: "Regular Season",
          type: "league",
          format: "round_robin",
          group_count: 1,
          num_groups: 1,
          legs: 2,
          advance_count: 0,
          relegate_count: 3,
          points_win: 3,
          points_draw: 1,
          points_loss: 0,
          tiebreakers: ["goal_diff", "goals_for", "h2h"],
        },
      ];
}

export function setChampionshipSeriesFormat(leagueId: number, enable: boolean): string {
  const db = getDB();
  const stages = buildStagesPreset(enable);

  db.run(
    `UPDATE competition_configs SET stages = ? WHERE league_id = ? AND status = 'active'`,
    [JSON.stringify(stages), leagueId],
  );

  return enable
    ? "Format Championship Series (Regular Season + Knockout 4 Besar) diaktifkan."
    : "Format Liga Penuh (Regular Season tanpa Knockout) diaktifkan.";
}

export function hasChampionshipSeries(leagueId: number): boolean {
  const stages = getActiveStages(leagueId);
  return stages.some((s) => s.type === "knockout" || s.format === "knockout");
}

// ─── Format Proposals & Voting (Kongres Liga) ─────────────────────────────────

export interface FormatProposalView {
  id: number;
  league_id: number;
  proposed_by: number;
  proposer_name: string;
  proposer_type: "club_owner" | "federation";
  season_apply: number;
  enable_championship: boolean;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  total_clubs: number;
  threshold: number;
  status: "open" | "passed" | "rejected" | "withdrawn";
  created_day: number;
  deadline_day: number;
  user_vote: "for" | "against" | "abstain" | null;
}

function stagesHaveKnockout(stagesJson: string): boolean {
  try {
    const parsed = JSON.parse(stagesJson) as StageConfig[];
    return Array.isArray(parsed) && parsed.some((s) => s.type === "knockout" || s.format === "knockout");
  } catch {
    return false;
  }
}

function decideNpcClubVote(rank: number, enableChamp: boolean): "for" | "against" | "abstain" {
  const r = Math.random();
  if (enableChamp) {
    // Rank 2-8 love playoff chance & extra gate receipts; Rank 1 prefers straight league table
    if (rank === 1) return r < 0.7 ? "against" : r < 0.9 ? "for" : "abstain";
    if (rank >= 2 && rank <= 8) return r < 0.78 ? "for" : r < 0.93 ? "against" : "abstain";
    return r < 0.58 ? "for" : r < 0.88 ? "against" : "abstain";
  } else {
    // Switching back to full league without playoffs
    if (rank === 1 || rank > 10) return r < 0.68 ? "for" : r < 0.9 ? "against" : "abstain";
    if (rank >= 2 && rank <= 6) return r < 0.35 ? "for" : r < 0.9 ? "against" : "abstain";
    return r < 0.55 ? "for" : r < 0.88 ? "against" : "abstain";
  }
}

function refreshProposalCounts(proposalId: number): { forCount: number; againstCount: number; abstainCount: number } {
  const db = getDB();
  const rows =
    db.exec(`SELECT vote, COUNT(*) FROM format_votes WHERE proposal_id = ? GROUP BY vote`, [proposalId])[0]?.values ??
    [];
  let forCount = 0;
  let againstCount = 0;
  let abstainCount = 0;
  for (const r of rows) {
    const v = r[0] as string;
    const c = r[1] as number;
    if (v === "for") forCount = c;
    else if (v === "against") againstCount = c;
    else abstainCount = c;
  }
  db.run(`UPDATE format_proposals SET votes_for = ?, votes_against = ?, votes_abstain = ? WHERE id = ?`, [
    forCount,
    againstCount,
    abstainCount,
    proposalId,
  ]);
  return { forCount, againstCount, abstainCount };
}

export function getFormatProposalState(leagueId: number, voterId = 0): FormatProposalView | null {
  const db = getDB();
  const res = db.exec(
    `SELECT id, league_id, proposed_by, proposer_type, season_apply, proposed_stages,
            votes_for, votes_against, votes_abstain, threshold, status, created_day, deadline_day
     FROM format_proposals
     WHERE league_id = ?
     ORDER BY (status = 'open') DESC, id DESC LIMIT 1`,
    [leagueId],
  );
  const row = res[0]?.values[0];
  if (!row) return null;

  const proposalId = row[0] as number;
  const proposedBy = row[2] as number;
  const proposerType = (row[3] as "club_owner" | "federation") ?? "federation";
  let proposerName = "Federasi (PSSI / LIB)";
  if (proposerType === "club_owner" && proposedBy > 0) {
    const cName = db.exec(`SELECT name FROM clubs WHERE id = ?`, [proposedBy])[0]?.values[0]?.[0] as string | undefined;
    if (cName) proposerName = cName;
  }

  const totalClubs =
    (db.exec(`SELECT COUNT(*) FROM clubs WHERE league_id = ?`, [leagueId])[0]?.values[0]?.[0] as number) ?? 18;

  const effectiveVoterId = voterId > 0 ? voterId : 999;
  const uvRes = db.exec(`SELECT vote FROM format_votes WHERE proposal_id = ? AND voter_id = ?`, [
    proposalId,
    effectiveVoterId,
  ]);
  const userVote = (uvRes[0]?.values[0]?.[0] as "for" | "against" | "abstain" | undefined) ?? null;

  return {
    id: proposalId,
    league_id: row[1] as number,
    proposed_by: proposedBy,
    proposer_name: proposerName,
    proposer_type: proposerType,
    season_apply: row[4] as number,
    enable_championship: stagesHaveKnockout(row[5] as string),
    votes_for: row[6] as number,
    votes_against: row[7] as number,
    votes_abstain: row[8] as number,
    total_clubs: totalClubs,
    threshold: row[9] as number,
    status: row[10] as FormatProposalView["status"],
    created_day: row[11] as number,
    deadline_day: row[12] as number,
    user_vote: userVote,
  };
}

export function proposeFormatChange(
  leagueId: number,
  proposerClubId: number,
  proposerType: "club_owner" | "federation",
  currentDay: number,
  currentSeason: number,
): { proposal: FormatProposalView | null; summary: string } {
  const db = getDB();
  const existingOpen = db.exec(`SELECT id FROM format_proposals WHERE league_id = ? AND status = 'open' LIMIT 1`, [
    leagueId,
  ])[0]?.values[0];
  if (existingOpen) {
    return {
      proposal: getFormatProposalState(leagueId, proposerClubId),
      summary: "🗳️ Proposal perubahan format liga sedang dalam masa pemungutan suara Kongres.",
    };
  }

  const targetEnable = !hasChampionshipSeries(leagueId);
  const stagesJson = JSON.stringify(buildStagesPreset(targetEnable));

  const cfgRow = db.exec(
    `SELECT foreign_rules, card_rules FROM competition_configs WHERE league_id = ? AND status = 'active' LIMIT 1`,
    [leagueId],
  )[0]?.values[0];
  const foreignRules = (cfgRow?.[0] as string) ?? "{}";
  const cardRules = (cfgRow?.[1] as string) ?? "{}";

  const nextId =
    ((db.exec(`SELECT COALESCE(MAX(id), 0) FROM format_proposals`)[0]?.values[0]?.[0] as number) ?? 0) + 1;
  const deadlineDay = currentDay + 14;

  db.run(
    `INSERT INTO format_proposals
      (id, league_id, proposed_by, proposer_type, season_apply, proposed_stages, proposed_foreign_rules, proposed_card_rules,
       votes_for, votes_against, votes_abstain, threshold, status, created_day, deadline_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0.51, 'open', ?, ?)`,
    [
      nextId,
      leagueId,
      proposerClubId,
      proposerType,
      currentSeason,
      stagesJson,
      foreignRules,
      cardRules,
      currentDay,
      deadlineDay,
    ],
  );

  // Cast initial early votes from ~8 NPC clubs so the Congress board shows live momentum
  const clubsOrdered =
    (db.exec(
      `SELECT id FROM clubs WHERE league_id = ? ORDER BY points DESC, (goals_for - goals_against) DESC`,
      [leagueId],
    )[0]?.values as [number][] | undefined) ?? [];

  let earlyVotesCast = 0;
  for (let i = 0; i < clubsOrdered.length; i++) {
    const cid = clubsOrdered[i][0];
    if (cid === proposerClubId) continue;
    if (earlyVotesCast >= 8) break;
    const vote = decideNpcClubVote(i + 1, targetEnable);
    db.run(
      `INSERT OR REPLACE INTO format_votes (proposal_id, voter_id, voter_type, vote, voted_day)
       VALUES (?, ?, 'club_owner', ?, ?)`,
      [nextId, cid, vote, currentDay],
    );
    earlyVotesCast++;
  }

  refreshProposalCounts(nextId);
  const label = targetEnable ? "Championship Series (4 Besar)" : "Liga Penuh (Tanpa Knockout)";
  return {
    proposal: getFormatProposalState(leagueId, proposerClubId),
    summary: `📜 Proposal Kongres diajukan: Ubah ke ${label}. Pemungutan suara 18 klub dibuka (batas Hari ${deadlineDay})!`,
  };
}

function finalizeProposalInternal(proposalId: number, currentDay: number, userVoterId: number): string {
  const db = getDB();
  const pRow = db.exec(
    `SELECT league_id, proposed_stages, threshold, status FROM format_proposals WHERE id = ?`,
    [proposalId],
  )[0]?.values[0];
  if (!pRow || pRow[3] !== "open") return "";

  const leagueId = pRow[0] as number;
  const stagesJson = pRow[1] as string;
  const threshold = (pRow[2] as number) ?? 0.51;
  const targetEnable = stagesHaveKnockout(stagesJson);

  // Cast remaining NPC club votes
  const clubsOrdered =
    (db.exec(
      `SELECT id FROM clubs WHERE league_id = ? ORDER BY points DESC, (goals_for - goals_against) DESC`,
      [leagueId],
    )[0]?.values as [number][] | undefined) ?? [];

  const votedIds = new Set<number>(
    (
      db.exec(`SELECT voter_id FROM format_votes WHERE proposal_id = ?`, [proposalId])[0]?.values ?? []
    ).map((r) => r[0] as number),
  );

  for (let i = 0; i < clubsOrdered.length; i++) {
    const cid = clubsOrdered[i][0];
    if (votedIds.has(cid) || cid === userVoterId) continue;
    const vote = decideNpcClubVote(i + 1, targetEnable);
    db.run(
      `INSERT OR REPLACE INTO format_votes (proposal_id, voter_id, voter_type, vote, voted_day)
       VALUES (?, ?, 'club_owner', ?, ?)`,
      [proposalId, cid, vote, currentDay],
    );
  }

  const { forCount, againstCount, abstainCount } = refreshProposalCounts(proposalId);
  const decisiveTotal = Math.max(1, forCount + againstCount);
  const ratio = forCount / decisiveTotal;
  const passed = ratio >= threshold;
  const newStatus = passed ? "passed" : "rejected";

  db.run(`UPDATE format_proposals SET status = ? WHERE id = ?`, [newStatus, proposalId]);

  const formatName = targetEnable ? "Championship Series (4 Besar)" : "Liga Penuh (Regular Season)";
  if (passed) {
    setChampionshipSeriesFormat(leagueId, targetEnable);
    return `🏛️ KONGRES LIGA SAH: Proposal ${formatName} DISETUJUI (${forCount} Setuju, ${againstCount} Tolak, ${abstainCount} Abstain)! Format aktif sekarang.`;
  }
  return `🏛️ KONGRES LIGA: Proposal ${formatName} DITOLAK (${forCount} Setuju, ${againstCount} Tolak, ${abstainCount} Abstain). Format tidak berubah.`;
}

export function voteOnFormatProposal(
  proposalId: number,
  voterClubId: number,
  voterType: "club_owner" | "federation_member",
  choice: "for" | "against" | "abstain",
  currentDay: number,
): { proposal: FormatProposalView | null; championship_series: boolean; summary: string } {
  const db = getDB();
  const effectiveVoterId = voterClubId > 0 ? voterClubId : 999;

  const pRow = db.exec(`SELECT league_id, status FROM format_proposals WHERE id = ?`, [proposalId])[0]?.values[0];
  if (!pRow) {
    return {
      proposal: null,
      championship_series: hasChampionshipSeries(1),
      summary: "Proposal tidak ditemukan.",
    };
  }
  const leagueId = pRow[0] as number;
  if (pRow[1] !== "open") {
    return {
      proposal: getFormatProposalState(leagueId, voterClubId),
      championship_series: hasChampionshipSeries(leagueId),
      summary: "Pemungutan suara proposal ini sudah ditutup.",
    };
  }

  db.run(
    `INSERT OR REPLACE INTO format_votes (proposal_id, voter_id, voter_type, vote, voted_day)
     VALUES (?, ?, ?, ?, ?)`,
    [proposalId, effectiveVoterId, voterType, choice, currentDay],
  );

  const summary = finalizeProposalInternal(proposalId, currentDay, effectiveVoterId);
  return {
    proposal: getFormatProposalState(leagueId, voterClubId),
    championship_series: hasChampionshipSeries(leagueId),
    summary,
  };
}

export function tickFormatProposals(
  leagueId: number,
  currentDay: number,
  currentSeason: number,
  userClubId = 0,
): string | null {
  const db = getDB();
  // 1. Check if any open proposal reached its deadline_day
  const openRow = db.exec(
    `SELECT id, deadline_day FROM format_proposals WHERE league_id = ? AND status = 'open' LIMIT 1`,
    [leagueId],
  )[0]?.values[0];

  if (openRow) {
    const propId = openRow[0] as number;
    const deadline = openRow[1] as number;
    if (currentDay >= deadline) {
      return finalizeProposalInternal(propId, currentDay, userClubId);
    }
    return null;
  }

  // 2. Mid-season Federation/NPC club initiative: if no proposal yet this season and around day 85-130 of season
  const dayInSeason = currentDay % 365;
  if (dayInSeason >= 85 && dayInSeason <= 130 && Math.random() < 0.2) {
    const countThisSeason =
      (db.exec(`SELECT COUNT(*) FROM format_proposals WHERE league_id = ? AND season_apply = ?`, [
        leagueId,
        currentSeason,
      ])[0]?.values[0]?.[0] as number) ?? 0;
    if (countThisSeason === 0) {
      const npcClubRes = db.exec(
        `SELECT id FROM clubs WHERE league_id = ? AND id != ? ORDER BY reputation DESC LIMIT 5`,
        [leagueId, userClubId],
      )[0]?.values;
      const npcProposerId = (npcClubRes?.[Math.floor(Math.random() * (npcClubRes?.length || 1))]?.[0] as number) ?? 0;
      const res = proposeFormatChange(leagueId, npcProposerId, "club_owner", currentDay, currentSeason);
      return res.summary;
    }
  }
  return null;
}

function roundRobin(teams: number[]): [number, number][][] {
  const ts = [...teams];
  if (ts.length % 2 !== 0) ts.push(-1);
  const n = ts.length;
  const rounds: [number, number][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = ts[i];
      const away = ts[n - 1 - i];
      if (home !== -1 && away !== -1) round.push([home, away]);
    }
    rounds.push(round);
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

export function generateMultiStageFixtures(
  leagueId: number,
  clubIds: number[],
  startDay: number,
  competition = "liga1",
  daySpacing = 7,
): void {
  const db = getDB();
  const stages = getActiveStages(leagueId);
  const firstStage = stages[0] ?? DEFAULT_REGULAR_STAGE;
  const groupCount = firstStage.group_count ?? firstStage.num_groups ?? 1;
  const legs = firstStage.legs ?? 2;
  const stageId = firstStage.id || "regular_season";

  let matchId =
    ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  const insertGroupFixtures = (groupClubs: number[], groupNum: number) => {
    const firstLeg = roundRobin(groupClubs);
    const allRounds =
      legs === 2
        ? [...firstLeg, ...firstLeg.map((round) => round.map(([h, a]) => [a, h] as [number, number]))]
        : firstLeg;

    allRounds.forEach((round, roundIdx) => {
      const matchDay = startDay + roundIdx * daySpacing;
      const weekNum = roundIdx + 1;
      round.forEach(([home, away]) => {
        db.run(
          `INSERT INTO match_results
            (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
           VALUES (?,?,?,?,NULL,NULL,?,?,?,?,?,'{}','[]')`,
          [matchId++, leagueId, home, away, matchDay, weekNum, stageId, groupNum, competition],
        );
      });
    });
  };

  if (groupCount > 1) {
    const perGroup = Math.ceil(clubIds.length / groupCount);
    for (let g = 0; g < groupCount; g++) {
      const slice = clubIds.slice(g * perGroup, (g + 1) * perGroup);
      if (slice.length >= 2) {
        insertGroupFixtures(slice, g + 1);
      }
    }
  } else {
    insertGroupFixtures(clubIds, 0);
  }
}

interface KnockoutRow {
  homeClub: number;
  awayClub: number;
  homeGoals: number | null;
  awayGoals: number | null;
  stageId: string;
}

function resolveTieWinner(matches: KnockoutRow[], leagueId: number): number | null {
  if (matches.length === 0) return null;
  const db = getDB();
  const goalsByClub = new Map<number, number>();
  for (const m of matches) {
    goalsByClub.set(m.homeClub, (goalsByClub.get(m.homeClub) ?? 0) + (m.homeGoals ?? 0));
    goalsByClub.set(m.awayClub, (goalsByClub.get(m.awayClub) ?? 0) + (m.awayGoals ?? 0));
  }
  const clubs = [...goalsByClub.keys()];
  if (clubs.length < 2) return clubs[0] ?? null;
  const [clubA, clubB] = clubs;
  const goalsA = goalsByClub.get(clubA) ?? 0;
  const goalsB = goalsByClub.get(clubB) ?? 0;
  if (goalsA > goalsB) return clubA;
  if (goalsB > goalsA) return clubB;

  // Tiebreaker: higher regular season points, then goal difference, then goals_for
  const rankRes = db.exec(
    `SELECT id FROM clubs
     WHERE league_id = ? AND id IN (?, ?)
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC LIMIT 1`,
    [leagueId, clubA, clubB],
  );
  return (rankRes[0]?.values[0]?.[0] as number) ?? clubA;
}

export function checkAndGenerateNextStage(
  leagueId: number,
  seasonStartDay: number,
  competition = "liga1",
): string | null {
  const db = getDB();
  const stages = getActiveStages(leagueId);
  const knockoutStage = stages.find((s) => s.type === "knockout" || s.format === "knockout");
  if (!knockoutStage) return null;

  const legs = knockoutStage.legs ?? 2;

  const koRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals, stage_id
     FROM match_results
     WHERE league_id = ? AND date >= ? AND stage_id IN ('championship_sf', 'championship_final')
     ORDER BY id ASC`,
    [leagueId, seasonStartDay],
  );

  const koMatches: KnockoutRow[] = (koRes[0]?.values ?? []).map((r) => ({
    homeClub: r[0] as number,
    awayClub: r[1] as number,
    homeGoals: r[2] as number | null,
    awayGoals: r[3] as number | null,
    stageId: r[4] as string,
  }));

  const sfMatches = koMatches.filter((m) => m.stageId === "championship_sf");
  const finalMatches = koMatches.filter((m) => m.stageId === "championship_final");

  const lastDateRes = db.exec(
    `SELECT COALESCE(MAX(date), ?) FROM match_results WHERE league_id = ?`,
    [seasonStartDay, leagueId],
  );
  const lastDate = (lastDateRes[0]?.values[0]?.[0] as number) ?? seasonStartDay;

  let nextMatchId =
    ((db.exec("SELECT COALESCE(MAX(id), 0) FROM match_results")[0]?.values[0]?.[0] as number) ?? 0) + 1;

  // Case A: No championship_sf matches exist yet in this season
  if (sfMatches.length === 0) {
    const top4Res = db.exec(
      `SELECT id FROM clubs
       WHERE league_id = ?
       ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC
       LIMIT 4`,
      [leagueId],
    );
    const top4 = (top4Res[0]?.values ?? []).map((r) => r[0] as number);
    if (top4.length < 4) return null;

    const [seed1, seed2, seed3, seed4] = top4;
    const pairings: [number, number][] = [
      [seed1, seed4],
      [seed2, seed3],
    ];

    // Leg 1 (week 35, lastDate + 7)
    for (const [home, away] of pairings) {
      db.run(
        `INSERT INTO match_results
          (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
         VALUES (?,?,?,?,NULL,NULL,?,35,'championship_sf',0,?,'{}','[]')`,
        [nextMatchId++, leagueId, home, away, lastDate + 7, competition],
      );
    }

    // Leg 2 if legs === 2 (week 36, lastDate + 14)
    if (legs === 2) {
      for (const [home, away] of pairings) {
        db.run(
          `INSERT INTO match_results
            (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
           VALUES (?,?,?,?,NULL,NULL,?,36,'championship_sf',0,?,'{}','[]')`,
          [nextMatchId++, leagueId, away, home, lastDate + 14, competition],
        );
      }
    }

    return "🔥 Babak Semifinal Championship Series dimulai! (4 Klub Teratas)";
  }

  // Case B: championship_sf matches exist and are all played, and no championship_final matches exist yet
  const sfAllPlayed = sfMatches.every((m) => m.homeGoals !== null && m.awayGoals !== null);
  if (sfAllPlayed && finalMatches.length === 0) {
    // Group SF matches by unordered pair of clubs
    const pairMap = new Map<string, KnockoutRow[]>();
    for (const m of sfMatches) {
      const key = [m.homeClub, m.awayClub].sort((a, b) => a - b).join("-");
      const arr = pairMap.get(key) ?? [];
      arr.push(m);
      pairMap.set(key, arr);
    }

    const winners: number[] = [];
    for (const pairMatches of pairMap.values()) {
      const w = resolveTieWinner(pairMatches, leagueId);
      if (w !== null) winners.push(w);
    }

    if (winners.length < 2) return null;
    const [finalistA, finalistB] = winners;

    // Leg 1 (week 37, lastDate + 7)
    db.run(
      `INSERT INTO match_results
        (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
       VALUES (?,?,?,?,NULL,NULL,?,37,'championship_final',0,?,'{}','[]')`,
      [nextMatchId++, leagueId, finalistA, finalistB, lastDate + 7, competition],
    );

    // Leg 2 if legs === 2 (week 38, lastDate + 14)
    if (legs === 2) {
      db.run(
        `INSERT INTO match_results
          (id,league_id,home_club,away_club,home_goals,away_goals,date,week,stage_id,group_num,competition,stats,scorers)
         VALUES (?,?,?,?,NULL,NULL,?,38,'championship_final',0,?,'{}','[]')`,
        [nextMatchId++, leagueId, finalistB, finalistA, lastDate + 14, competition],
      );
    }

    return "🏆 Partai Final Championship Series dimulai!";
  }

  // Case C: championship_final matches exist and are all played (or waiting for unplayed matches)
  return null;
}

export function getSeasonChampion(
  leagueId: number,
  seasonStartDay: number,
): { club_id: number; name: string; points: number } | null {
  const db = getDB();

  const finalRes = db.exec(
    `SELECT home_club, away_club, home_goals, away_goals, stage_id
     FROM match_results
     WHERE league_id = ? AND date >= ? AND stage_id = 'championship_final' AND home_goals IS NOT NULL
     ORDER BY id ASC`,
    [leagueId, seasonStartDay],
  );

  const finalMatches: KnockoutRow[] = (finalRes[0]?.values ?? []).map((r) => ({
    homeClub: r[0] as number,
    awayClub: r[1] as number,
    homeGoals: r[2] as number | null,
    awayGoals: r[3] as number | null,
    stageId: r[4] as string,
  }));

  if (finalMatches.length > 0) {
    const winnerId = resolveTieWinner(finalMatches, leagueId);
    if (winnerId !== null) {
      const clubRes = db.exec(`SELECT id, name, points FROM clubs WHERE id = ?`, [winnerId]);
      const row = clubRes[0]?.values[0];
      if (row) {
        return {
          club_id: row[0] as number,
          name: row[1] as string,
          points: row[2] as number,
        };
      }
    }
  }

  const topRes = db.exec(
    `SELECT id, name, points FROM clubs
     WHERE league_id = ?
     ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC
     LIMIT 1`,
    [leagueId],
  );
  const topRow = topRes[0]?.values[0];
  if (!topRow) return null;

  return {
    club_id: topRow[0] as number,
    name: topRow[1] as string,
    points: topRow[2] as number,
  };
}
