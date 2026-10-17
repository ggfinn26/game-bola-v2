import { initDB, getDB, exportDB, loadDB } from "./db.js";
import { fullSim } from "./match.js";
import { createWorld, advanceDay, calcLegacyScore } from "./world.js";
import { generateWorld, createEgoPlayer } from "./worldgen.js";
import { rollEventForPlayer, applyEventChoice } from "./events.js";
import { generateTransferOffers, acceptTransferOffer, type TransferOffer } from "./transfers.js";
import { getLeagueLeaders, getPlayerCareerHistory } from "./awards.js";
import { checkAndGenerateNextStage, setChampionshipSeriesFormat, hasChampionshipSeries } from "./stages.js";
import {
  createEgoAgent,
  getAgentState,
  getAgentClients,
  getScoutList,
  recruitClient,
  releaseClient,
  upgradeAgentOffice,
  plantMediaRumor,
  negotiateClientDeal,
  tickAgentFinances,
} from "./agent.js";
import {
  createEgoOwner,
  getOwnerState,
  getClubMarket,
  takeBankLoan,
  repayBankLoan,
  injectPersonalCash,
  withdrawDividend,
  upgradeClubInfra,
  signSponsorDeal,
  sellClub,
  buyClubOrSlot,
  tickClubFinances,
} from "./owner.js";
import {
  nextEventDay,
  processMatchDay,
  getUpcoming,
  getStandings,
  getLeagueIdForClub,
  getPlayer,
  getSquad,
  getPlayerSuspension,
  healInjuries,
  rolloverSeason,
} from "./scheduler.js";
import type { StandingRow } from "./scheduler.js";
import type { Position } from "../types/index.js";

type WorkerMessage =
  | { type: "INIT" }
  | { type: "NEW_GAME"; mode: string; characterId: number; startAge: number; seed?: number }
  | { type: "START_CAREER"; name: string; position: Position; age: number; clubId: number; appearance?: string }
  | { type: "START_MANAGER"; name: string; clubId: number }
  | { type: "START_AGENT"; name: string }
  | { type: "START_OWNER"; name: string; clubId: number }
  | { type: "AGENT_RECRUIT"; playerId: number }
  | { type: "AGENT_RELEASE"; playerId: number }
  | { type: "AGENT_UPGRADE_OFFICE" }
  | { type: "AGENT_PLANT_RUMOR"; playerId: number }
  | { type: "AGENT_OPEN_DEAL"; playerId: number }
  | { type: "AGENT_ACCEPT_DEAL"; playerId: number; offer: TransferOffer }
  | { type: "OWNER_LOAN"; amount: number }
  | { type: "OWNER_REPAY"; amount: number }
  | { type: "OWNER_INJECT"; amount: number }
  | { type: "OWNER_DIVIDEND"; amount: number }
  | { type: "OWNER_UPGRADE"; target: "facilities" | "academy" | "stadium" }
  | { type: "OWNER_SPONSOR" }
  | { type: "OWNER_SELL_CLUB" }
  | { type: "OWNER_BUY_CLUB"; targetClubId: number; customClubName?: string }
  | { type: "ADVANCE_TO_NEXT_EVENT"; playerClubId: number; watch?: boolean }
  | { type: "CHOOSE_EVENT"; eventId: string; choiceId: string }
  | { type: "OPEN_TRANSFERS" }
  | { type: "ACCEPT_TRANSFER"; offer: TransferOffer }
  | { type: "TOGGLE_CHAMPIONSHIP_SERIES"; enable: boolean }
  | { type: "GET_UPCOMING"; playerClubId: number; count?: number }
  | { type: "GET_STANDINGS"; playerClubId: number }
  | { type: "GET_SQUAD"; clubId: number }
  | { type: "GET_FREE_AGENTS" }
  | { type: "MANAGER_SIGN"; playerId: number; clubId: number }
  | { type: "MANAGER_RELEASE"; playerId: number }
  | { type: "SIM_MATCH"; payload: Parameters<typeof fullSim>[0] }
  | { type: "RECALC_PA"; playerId: number; totalMatches: number; trainingQuality: number }
  | { type: "SAVE_GAME" }
  | {
      type: "LOAD_GAME";
      payload: {
        dbData: Uint8Array;
        worldState: typeof worldState;
        eventCounts: Record<string, number>;
        egoCareerAwards: number;
      };
    };

let worldState = createWorld("player", 0, 15);
let eventCounts: Record<string, number> = {};
let egoCareerAwards = 0;

function getEgoPlayerId(): number {
  return worldState.ego.mode === "player" ? worldState.ego.character_id : 0;
}
function getManagerClubId(): number {
  return worldState.ego.mode === "manager" ? worldState.ego.character_id : 0;
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "INIT": {
      await initDB();
      self.postMessage({ type: "READY" });
      break;
    }

    case "NEW_GAME": {
      generateWorld(msg.seed ?? 42);
      eventCounts = {};
      egoCareerAwards = 0;
      worldState = createWorld(msg.mode as import("../types/index.js").GameMode, msg.characterId, msg.startAge);
      const db = getDB();
      const clubs = db.exec("SELECT id,name,reputation,league_id FROM clubs ORDER BY reputation DESC")[0]?.values ?? [];
      const leagues = db.exec("SELECT id,name FROM leagues ORDER BY id")[0]?.values ?? [];
      self.postMessage({ type: "WORLD_STATE", state: worldState, clubs, leagues });
      break;
    }

    case "START_CAREER": {
      eventCounts = {};
      egoCareerAwards = 0;
      const playerId = createEgoPlayer({
        name: msg.name,
        position: msg.position,
        age: msg.age,
        clubId: msg.clubId,
        appearance: msg.appearance,
      });
      worldState = createWorld("player", playerId, msg.age);
      const egoPlayer = getPlayer(playerId);
      const upcoming = getUpcoming(msg.clubId, worldState.current_day);
      const leagueId = getLeagueIdForClub(msg.clubId) ?? 1;
      const standings: StandingRow[] = getStandings(leagueId);
      self.postMessage({
        type: "CAREER_STARTED",
        state: worldState,
        ego_player: egoPlayer,
        ego_suspended_matches: 0,
        upcoming,
        standings,
        leaders: getLeagueLeaders(leagueId),
        career_history: getPlayerCareerHistory(playerId),
        championship_series: hasChampionshipSeries(leagueId),
      });
      break;
    }

    case "START_MANAGER": {
      eventCounts = {};
      egoCareerAwards = 0;
      worldState = createWorld("manager", msg.clubId, 40);
      const leagueId = getLeagueIdForClub(msg.clubId) ?? 1;
      const upcoming = getUpcoming(msg.clubId, worldState.current_day);
      const standings = getStandings(leagueId);
      const squad = getSquad(msg.clubId, 0, 1, worldState.season);
      self.postMessage({
        type: "MANAGER_STARTED",
        state: worldState,
        manager_name: msg.name,
        club_id: msg.clubId,
        upcoming,
        standings,
        squad,
        championship_series: hasChampionshipSeries(leagueId),
        leaders: getLeagueLeaders(leagueId),
      });
      break;
    }

    case "START_AGENT": {
      eventCounts = {};
      egoCareerAwards = 0;
      const agentId = createEgoAgent(msg.name);
      worldState = createWorld("agent", agentId, 32);
      const standings = getStandings(1);
      self.postMessage({
        type: "AGENT_STARTED",
        state: worldState,
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        standings,
        leaders: getLeagueLeaders(1),
        championship_series: hasChampionshipSeries(1),
      });
      break;
    }

    case "START_OWNER": {
      eventCounts = {};
      egoCareerAwards = 0;
      const ownerId = createEgoOwner(msg.name, msg.clubId);
      worldState = createWorld("owner", ownerId, 45);
      const leagueId = getLeagueIdForClub(msg.clubId) ?? 1;
      const upcoming = getUpcoming(msg.clubId, worldState.current_day);
      const standings = getStandings(leagueId);
      self.postMessage({
        type: "OWNER_STARTED",
        state: worldState,
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        club_id: msg.clubId,
        upcoming,
        standings,
        leaders: getLeagueLeaders(leagueId),
        championship_series: hasChampionshipSeries(leagueId),
      });
      break;
    }

    case "ADVANCE_TO_NEXT_EVENT": {
      const egoId = getEgoPlayerId();
      const isAgent = worldState.ego.mode === "agent";
      const isManager = worldState.ego.mode === "manager";
      const isOwner = worldState.ego.mode === "owner";
      const agentId = isAgent ? worldState.ego.character_id : 0;
      const ownerId = isOwner ? worldState.ego.character_id : 0;
      const leagueId = getLeagueIdForClub(msg.playerClubId) ?? 1;
      const next = nextEventDay(worldState.current_day);

      if (next == null) {
        // Check if a multi-stage knockout phase (Semifinal / Final) should be generated before ending the season
        const stageMsg = checkAndGenerateNextStage(leagueId, (worldState.season - 1) * 365, "liga1");
        if (stageMsg !== null) {
          const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);
          const standings: StandingRow[] = getStandings(leagueId);
          self.postMessage({
            type: "EVENT_RESULT",
            world: worldState,
            ego_player: getPlayer(egoId),
            ego_suspended_matches: getPlayerSuspension(egoId, leagueId, worldState.season),
            triggered_event: null,
            season_summary: stageMsg,
            event_type: "stage_advance",
            match_results: [],
            player_match: null,
            upcoming,
            standings,
            squad: isManager ? getSquad(msg.playerClubId, 0, 1, worldState.season) : undefined,
            agent_state: isAgent ? getAgentState(agentId) : undefined,
            agent_clients: isAgent ? getAgentClients(agentId) : undefined,
            scout_list: isAgent ? getScoutList(agentId) : undefined,
            owner_state: isOwner ? getOwnerState(ownerId) : undefined,
            club_market: isOwner ? getClubMarket(ownerId) : undefined,
            leaders: getLeagueLeaders(leagueId),
            career_history: getPlayerCareerHistory(egoId),
          });
          break;
        }

        const { summary: seasonSummary, egoAwardsCount } = rolloverSeason(worldState.season, egoId);
        egoCareerAwards += egoAwardsCount;
        worldState = {
          ...worldState,
          current_day: worldState.season * 365,
          season: worldState.season + 1,
          ego: { ...worldState.ego, age: worldState.ego.age + 1 },
        };
        const egoPlayer = getPlayer(egoId);
        if (egoPlayer) {
          worldState.ego.legacy_score = calcLegacyScore(worldState.ego, {
            career_matches: egoPlayer.career_matches,
            career_goals: egoPlayer.career_goals,
            career_trophies: egoPlayer.career_trophies,
            career_awards: egoCareerAwards,
            net_worth_peak: 0,
            prison_days: 0,
            scandal_hits: 0,
          });
        }
        const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);
        const standings: StandingRow[] = getStandings(leagueId);
        const transferOffers = egoId > 0 ? generateTransferOffers(egoId) : [];
        self.postMessage({
          type: "EVENT_RESULT",
          world: worldState,
          ego_player: egoPlayer,
          ego_suspended_matches: 0,
          triggered_event: null,
          transfer_offers: transferOffers,
          season_summary: seasonSummary,
          event_type: "season_end",
          match_results: [],
          player_match: null,
          upcoming,
          standings,
          squad: isManager ? getSquad(msg.playerClubId, 0, 1, worldState.season) : undefined,
          agent_state: isAgent ? getAgentState(agentId) : undefined,
          agent_clients: isAgent ? getAgentClients(agentId) : undefined,
          scout_list: isAgent ? getScoutList(agentId) : undefined,
          owner_state: isOwner ? getOwnerState(ownerId) : undefined,
          club_market: isOwner ? getClubMarket(ownerId) : undefined,
          leaders: getLeagueLeaders(leagueId),
          career_history: getPlayerCareerHistory(egoId),
        });
        break;
      }

      // Advance world clock to next event day and heal injuries
      const delta = next - worldState.current_day;
      for (let i = 0; i < delta; i++) worldState = advanceDay(worldState);
      healInjuries(delta);
      const agentBankruptMsg = isAgent ? tickAgentFinances(agentId, delta) : null;
      const ownerFinanceMsg = isOwner ? tickClubFinances(ownerId, delta) : null;

      // Process all matches on that day
      const {
        results: matchResults,
        watchedSteps,
        watchedHomeName,
        watchedAwayName,
      } = processMatchDay(next, egoId, msg.watch ? msg.playerClubId : 0, worldState.season);
      const egoPlayer = getPlayer(egoId);

      if (egoPlayer) {
        worldState.ego.legacy_score = calcLegacyScore(worldState.ego, {
          career_matches: egoPlayer.career_matches,
          career_goals: egoPlayer.career_goals,
          career_trophies: egoPlayer.career_trophies,
          career_awards: egoCareerAwards,
          net_worth_peak: 0,
          prison_days: 0,
          scandal_hits: 0,
        });
      }

      const triggeredEvent = egoPlayer ? rollEventForPlayer(egoPlayer, eventCounts) : null;
      if (triggeredEvent) {
        eventCounts[triggeredEvent.id] = (eventCounts[triggeredEvent.id] ?? 0) + 1;
      }

      // If regular season just ended and Championship Series is active, auto-generate Semifinal/Final fixtures right away
      let stageBanner: string | null = agentBankruptMsg ?? ownerFinanceMsg;
      if (nextEventDay(worldState.current_day) == null) {
        const nextStageMsg = checkAndGenerateNextStage(leagueId, (worldState.season - 1) * 365, "liga1");
        if (nextStageMsg) stageBanner = stageBanner ? `${stageBanner} · ${nextStageMsg}` : nextStageMsg;
      }

      // Upcoming for player's club (next 5 after today)
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);

      // Player's own match this day (if any)
      const playerMatch =
        matchResults.find((r) => r.home_club === msg.playerClubId || r.away_club === msg.playerClubId) ?? null;

      // Current standings for player's league
      const standings: StandingRow[] = getStandings(leagueId);
      const egoSuspendedMatches = getPlayerSuspension(egoId, leagueId, worldState.season);

      self.postMessage({
        type: "EVENT_RESULT",
        world: worldState,
        ego_player: egoPlayer,
        ego_suspended_matches: egoSuspendedMatches,
        triggered_event: triggeredEvent,
        season_summary: stageBanner,
        event_type: matchResults.length > 0 ? "match" : "idle",
        match_results: matchResults,
        player_match: playerMatch,
        watched_steps: watchedSteps,
        watched_home_name: watchedHomeName,
        watched_away_name: watchedAwayName,
        upcoming,
        standings,
        squad: isManager ? getSquad(msg.playerClubId, 0, 1, worldState.season) : undefined,
        agent_state: isAgent ? getAgentState(agentId) : undefined,
        agent_clients: isAgent ? getAgentClients(agentId) : undefined,
        scout_list: isAgent ? getScoutList(agentId) : undefined,
        owner_state: isOwner ? getOwnerState(ownerId) : undefined,
        club_market: isOwner ? getClubMarket(ownerId) : undefined,
        leaders: getLeagueLeaders(leagueId),
        career_history: getPlayerCareerHistory(egoId),
      });
      break;
    }

    case "CHOOSE_EVENT": {
      const egoId = worldState.ego.character_id;
      const summary = applyEventChoice(egoId, msg.eventId, msg.choiceId);
      const egoPlayer = getPlayer(egoId);
      self.postMessage({
        type: "EVENT_CHOICE_APPLIED",
        ego_player: egoPlayer,
        summary,
      });
      break;
    }

    case "OPEN_TRANSFERS": {
      const egoId = worldState.ego.character_id;
      const offers = generateTransferOffers(egoId);
      self.postMessage({
        type: "TRANSFER_OFFERS",
        offers,
      });
      break;
    }

    case "ACCEPT_TRANSFER": {
      const egoId = worldState.ego.character_id;
      const res = acceptTransferOffer(egoId, msg.offer, worldState.current_day);
      const egoPlayer = getPlayer(egoId);
      const leagueId = getLeagueIdForClub(res.clubId) ?? 1;
      const upcoming = getUpcoming(res.clubId, worldState.current_day);
      const standings: StandingRow[] = getStandings(leagueId);
      self.postMessage({
        type: "TRANSFER_ACCEPTED",
        ego_player: egoPlayer,
        club_id: res.clubId,
        club_name: res.clubName,
        summary: res.summary,
        upcoming,
        standings,
      });
      break;
    }

    case "TOGGLE_CHAMPIONSHIP_SERIES": {
      const summary = setChampionshipSeriesFormat(1, msg.enable);
      self.postMessage({
        type: "FORMAT_UPDATED",
        championship_series: hasChampionshipSeries(1),
        summary,
      });
      break;
    }

    case "GET_UPCOMING": {
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day, msg.count ?? 5);
      self.postMessage({ type: "UPCOMING", upcoming });
      break;
    }

    case "GET_STANDINGS": {
      const leagueId = getLeagueIdForClub(msg.playerClubId);
      const standings: StandingRow[] = leagueId != null ? getStandings(leagueId) : [];
      self.postMessage({ type: "STANDINGS", standings });
      break;
    }

    case "GET_SQUAD": {
      const squad = getSquad(msg.clubId, 0, 1, worldState.season);
      self.postMessage({ type: "SQUAD", squad });
      break;
    }

    case "GET_FREE_AGENTS": {
      const db = getDB();
      const res = db.exec(
        `SELECT id,name,position,age,overall,ca,pa,wage,nationality
         FROM players WHERE free_agent = 1 AND retired = 0
         ORDER BY overall DESC LIMIT 60`,
      );
      const agents = (res[0]?.values ?? []).map((r) => ({
        id: r[0] as number,
        name: r[1] as string,
        position: r[2] as string,
        age: r[3] as number,
        overall: r[4] as number,
        ca: r[5] as number,
        pa: r[6] as number,
        wage: r[7] as number,
        nationality: r[8] as number,
      }));
      self.postMessage({ type: "FREE_AGENTS", agents });
      break;
    }

    case "MANAGER_SIGN": {
      const db = getDB();
      db.run(`UPDATE players SET club = ?, free_agent = 0, contract_end = ? WHERE id = ? AND free_agent = 1`, [
        msg.clubId,
        worldState.current_day + 365,
        msg.playerId,
      ]);
      const squad = getSquad(msg.clubId, 0, 1, worldState.season);
      const updatedFreeRes = db.exec(
        `SELECT id,name,position,age,overall,ca,pa,wage,nationality
         FROM players WHERE free_agent = 1 AND retired = 0
         ORDER BY overall DESC LIMIT 60`,
      );
      const updatedFreeAgents = (updatedFreeRes[0]?.values ?? []).map((r) => ({
        id: r[0] as number,
        name: r[1] as string,
        position: r[2] as string,
        age: r[3] as number,
        overall: r[4] as number,
        ca: r[5] as number,
        pa: r[6] as number,
        wage: r[7] as number,
        nationality: r[8] as number,
      }));
      self.postMessage({
        type: "MANAGER_TRANSFER_DONE",
        squad,
        free_agents: updatedFreeAgents,
        summary: "✍️ Pemain berhasil dikontrak.",
      });
      break;
    }

    case "MANAGER_RELEASE": {
      const db = getDB();
      db.run(`UPDATE players SET club = NULL, free_agent = 1, contract_end = 0 WHERE id = ?`, [msg.playerId]);
      const clubId = worldState.ego.character_id;
      const squad = getSquad(clubId, 0, 1, worldState.season);
      const updatedFreeRes = db.exec(
        `SELECT id,name,position,age,overall,ca,pa,wage,nationality
         FROM players WHERE free_agent = 1 AND retired = 0
         ORDER BY overall DESC LIMIT 60`,
      );
      const updatedFreeAgents = (updatedFreeRes[0]?.values ?? []).map((r) => ({
        id: r[0] as number,
        name: r[1] as string,
        position: r[2] as string,
        age: r[3] as number,
        overall: r[4] as number,
        ca: r[5] as number,
        pa: r[6] as number,
        wage: r[7] as number,
        nationality: r[8] as number,
      }));
      self.postMessage({
        type: "MANAGER_TRANSFER_DONE",
        squad,
        free_agents: updatedFreeAgents,
        summary: "🚪 Pemain dilepas.",
      });
      break;
    }

    case "AGENT_RECRUIT": {
      const agentId = worldState.ego.character_id;
      const res = recruitClient(agentId, msg.playerId);
      self.postMessage({
        type: "AGENT_UPDATED",
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        summary: res.summary,
      });
      break;
    }

    case "AGENT_RELEASE": {
      const agentId = worldState.ego.character_id;
      const summary = releaseClient(agentId, msg.playerId);
      self.postMessage({
        type: "AGENT_UPDATED",
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        summary,
      });
      break;
    }

    case "AGENT_UPGRADE_OFFICE": {
      const agentId = worldState.ego.character_id;
      const res = upgradeAgentOffice(agentId);
      self.postMessage({
        type: "AGENT_UPDATED",
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        summary: res.summary,
      });
      break;
    }

    case "AGENT_PLANT_RUMOR": {
      const agentId = worldState.ego.character_id;
      const res = plantMediaRumor(agentId, msg.playerId);
      self.postMessage({
        type: "AGENT_UPDATED",
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        summary: res.summary,
      });
      break;
    }

    case "AGENT_OPEN_DEAL": {
      const offers = generateTransferOffers(msg.playerId);
      self.postMessage({
        type: "TRANSFER_OFFERS",
        offers,
        client_id: msg.playerId,
      });
      break;
    }

    case "AGENT_ACCEPT_DEAL": {
      const agentId = worldState.ego.character_id;
      const res = negotiateClientDeal(agentId, msg.playerId, msg.offer, worldState.current_day);
      self.postMessage({
        type: "AGENT_UPDATED",
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        standings: getStandings(1),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_LOAN": {
      const ownerId = worldState.ego.character_id;
      const res = takeBankLoan(ownerId, msg.amount);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_REPAY": {
      const ownerId = worldState.ego.character_id;
      const res = repayBankLoan(ownerId, msg.amount);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_INJECT": {
      const ownerId = worldState.ego.character_id;
      const res = injectPersonalCash(ownerId, msg.amount);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_DIVIDEND": {
      const ownerId = worldState.ego.character_id;
      const res = withdrawDividend(ownerId, msg.amount);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_UPGRADE": {
      const ownerId = worldState.ego.character_id;
      const res = upgradeClubInfra(ownerId, msg.target);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_SPONSOR": {
      const ownerId = worldState.ego.character_id;
      const res = signSponsorDeal(ownerId);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        summary: res.summary,
      });
      break;
    }

    case "OWNER_SELL_CLUB": {
      const ownerId = worldState.ego.character_id;
      const res = sellClub(ownerId);
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        club_id: 0,
        club_name: "Tanpa Klub",
        upcoming: [],
        summary: res.summary,
      });
      break;
    }

    case "OWNER_BUY_CLUB": {
      const ownerId = worldState.ego.character_id;
      const res = buyClubOrSlot(ownerId, msg.targetClubId, msg.customClubName);
      const leagueId = res.clubId > 0 ? (getLeagueIdForClub(res.clubId) ?? 1) : 1;
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        club_id: res.clubId,
        club_name: res.clubName,
        upcoming: res.clubId > 0 ? getUpcoming(res.clubId, worldState.current_day) : [],
        standings: getStandings(leagueId),
        summary: res.summary,
      });
      break;
    }

    case "SIM_MATCH": {
      const result = fullSim(msg.payload);
      self.postMessage({ type: "MATCH_RESULT", result });
      break;
    }

    case "RECALC_PA": {
      self.postMessage({ type: "PA_DONE", playerId: msg.playerId });
      break;
    }

    case "SAVE_GAME": {
      const dbData = exportDB();
      self.postMessage({
        type: "SAVE_DATA",
        payload: { dbData, worldState, eventCounts, egoCareerAwards },
      });
      break;
    }

    case "LOAD_GAME": {
      const p = msg.payload;
      await loadDB(p.dbData);
      worldState = p.worldState;
      eventCounts = p.eventCounts;
      egoCareerAwards = p.egoCareerAwards;
      const isManager = worldState.ego.mode === "manager";
      const isAgent = worldState.ego.mode === "agent";
      const isOwner = worldState.ego.mode === "owner";
      const egoId = getEgoPlayerId();
      const agentId = isAgent ? worldState.ego.character_id : 0;
      const ownerId = isOwner ? worldState.ego.character_id : 0;
      const ownerState = isOwner ? getOwnerState(ownerId) : undefined;
      const egoPlayer = egoId > 0 ? getPlayer(egoId) : null;
      const clubId = isManager
        ? worldState.ego.character_id
        : isOwner
          ? (ownerState?.club_id ?? 0)
          : (egoPlayer?.club ?? 0);
      const leagueId = getLeagueIdForClub(clubId) ?? 1;
      self.postMessage({
        type: "GAME_LOADED",
        state: worldState,
        ego_player: egoPlayer,
        ego_suspended_matches: egoId > 0 ? getPlayerSuspension(egoId, leagueId, worldState.season) : 0,
        upcoming: clubId > 0 ? getUpcoming(clubId, worldState.current_day) : [],
        standings: getStandings(leagueId),
        leaders: getLeagueLeaders(leagueId),
        career_history: egoId > 0 ? getPlayerCareerHistory(egoId) : [],
        championship_series: hasChampionshipSeries(leagueId),
        club_id: clubId,
        squad: isManager ? getSquad(clubId, 0, 1, worldState.season) : undefined,
        agent_state: isAgent ? getAgentState(agentId) : undefined,
        agent_clients: isAgent ? getAgentClients(agentId) : undefined,
        scout_list: isAgent ? getScoutList(agentId) : undefined,
        owner_state: ownerState,
        club_market: isOwner ? getClubMarket(ownerId) : undefined,
      });
      break;
    }

    default:
      self.postMessage({ type: "ERROR", message: "Unknown message type" });
  }
};

export {};
