import { initDB, getDB, exportDB, loadDB } from "./db.js";
import { fullSim } from "./match.js";
import { createWorld, advanceDay, calcLegacyScore } from "./world.js";
import { generateWorld, createEgoPlayer } from "./worldgen.js";
import { rollEventForPlayer, applyEventChoice, getChoiceLegalCase } from "./events.js";
import { createLegalCase, resolveLegalCase, type LegalCase, type LegalResolutionInput } from "./legal.js";
import { generateTransferOffers, acceptTransferOffer, type TransferOffer } from "./transfers.js";
import { getLeagueLeaders, getPlayerCareerHistory } from "./awards.js";
import {
  checkAndGenerateNextStage,
  hasChampionshipSeries,
  getFormatProposalState,
  proposeFormatChange,
  voteOnFormatProposal,
  tickFormatProposals,
} from "./stages.js";
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
  takeLoanShark,
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
  getU21Standings,
  getEPLU21Standings,
  getAgeStandings,
  getLeagueIdForClub,
  getPlayer,
  getSquad,
  getClubRoster,
  getClubManagerConfig,
  setClubTactics,
  toggleClubStarter,
  upgradeClubStaff,
  getTransferTargets,
  buyTransferTarget,
  applyMidMatchScoreUpdate,
  getPlayerSuspension,
  healInjuries,
  rolloverSeason,
} from "./scheduler.js";
import { tickCrossModeAndAI, playTarkamMatch, transitionToChild } from "./world_ai.js";
import {
  getTarkanLeagues,
  getTarkanEnrollment,
  enrollInTarkan,
  unenrollFromTarkan,
  getTarkanStandings,
  getTarkanFixtures,
  playTarkanMatchForPlayer,
  processTarkanDay,
  checkTarkanSeasonPrize,
} from "./tarkan.js";
import { checkCupProgression, getCupBracket } from "./cup.js";
import { checkAFCProgression, getAFCBracket, getAFCGroupStandings } from "./afc.js";
import type { AFCRound, AFCGroupStanding } from "./afc.js";
import { processTimnasCalendar, playTimnasMatch, getTimnasInfo, canNaturalize, naturalize } from "./timnas.js";
import {
  getRetirementOptions,
  chooseRetirementPath,
  tickPunditWeek,
  executePunditAction,
  getPunditState,
  type RetirementOptions,
  type PunditState,
} from "./retirement.js";
import type { StandingRow, U21StandingRow, ClubManagerConfig, ClubStaffLevels } from "./scheduler.js";
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
  | { type: "OWNER_LOAN_SHARK"; amount: number }
  | { type: "OWNER_REPAY"; amount: number }
  | { type: "OWNER_INJECT"; amount: number }
  | { type: "OWNER_DIVIDEND"; amount: number }
  | { type: "OWNER_UPGRADE"; target: "facilities" | "academy" | "stadium" }
  | { type: "OWNER_SPONSOR" }
  | { type: "OWNER_SELL_CLUB" }
  | { type: "OWNER_BUY_CLUB"; targetClubId: number; customClubName?: string }
  | { type: "ADVANCE_TO_NEXT_EVENT"; playerClubId: number; watch?: boolean }
  | { type: "CHOOSE_EVENT"; eventId: string; choiceId: string }
  | { type: "RESOLVE_LEGAL_CASE"; input: LegalResolutionInput }
  | { type: "PLAY_TARKAM" }
  | { type: "GET_CUP_BRACKET" }
  | { type: "GET_AFC_BRACKET" }
  | { type: "GET_U21_STANDINGS"; leagueId?: number }
  | { type: "TIMNAS_GET_INFO" }
  | { type: "TIMNAS_PLAY_MATCH" }
  | { type: "NATURALIZE" }
  | { type: "TARKAN_GET_LEAGUES" }
  | { type: "TARKAN_ENROLL"; leagueId: number }
  | { type: "TARKAN_UNENROLL" }
  | { type: "TARKAN_GET_STANDINGS"; leagueId: number }
  | { type: "TARKAN_GET_FIXTURES"; leagueId: number; clubId: number }
  | { type: "TARKAN_PLAY_MATCH"; matchId: number }
  | { type: "TRANSITION_TO_CHILD"; childName?: string }
  | { type: "GET_RETIREMENT_OPTIONS" }
  | {
      type: "CHOOSE_RETIREMENT_PATH";
      choice: "manager" | "agent" | "staff" | "pundit" | "child";
      extraData?: any;
    }
  | {
      type: "PUNDIT_ACTION";
      actionId: "criticize_manager" | "praise_wonderkid" | "leak_dressing_room" | "neutral_analysis";
      targetClubId?: number;
      targetPlayerId?: number;
    }
  | { type: "OPEN_TRANSFERS" }
  | { type: "ACCEPT_TRANSFER"; offer: TransferOffer }
  | { type: "TOGGLE_CHAMPIONSHIP_SERIES"; enable: boolean; clubId?: number }
  | { type: "VOTE_FORMAT_PROPOSAL"; proposalId: number; choice: "for" | "against" | "abstain"; clubId: number }
  | { type: "GET_UPCOMING"; playerClubId: number; count?: number }
  | { type: "GET_STANDINGS"; playerClubId: number }
  | { type: "GET_SQUAD"; clubId: number }
  | { type: "GET_FREE_AGENTS"; clubId?: number }
  | { type: "MANAGER_SIGN"; playerId: number; clubId: number }
  | { type: "MANAGER_BUY_PLAYER"; playerId: number; clubId: number }
  | { type: "MANAGER_RELEASE"; playerId: number }
  | {
      type: "MANAGER_SET_TACTICS";
      clubId: number;
      formation: ClubManagerConfig["formation"];
      mentality: ClubManagerConfig["mentality"];
    }
  | { type: "MANAGER_TOGGLE_STARTER"; clubId: number; playerId: number }
  | { type: "MANAGER_UPGRADE_STAFF"; clubId: number; role: keyof ClubStaffLevels }
  | { type: "APPLY_MIDMATCH_SCORE"; matchId: number; homeGoals: number; awayGoals: number; playerClubId: number }
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
let activeLegalCase: LegalCase | null = null;

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

function getAllLeaguesStandings(): Record<number, StandingRow[]> {
  return {
    1: getStandings(1),
    2: getStandings(2),
    5: getStandings(5),
    3: getStandings(3),
    4: getStandings(4),
    6: getStandings(6),
    7: getStandings(7),
    8: getStandings(8),
    9: getStandings(9),
    11: getStandings(11),
    17: getStandings(17),
    18: getStandings(18),
    19: getStandings(19),
    21: getStandings(21),
    12: getStandings(12),
    22: getStandings(22),
    23: getStandings(23),
    13: getStandings(13),
    24: getStandings(24),
    25: getStandings(25),
    14: getStandings(14),
    26: getStandings(26),
    27: getStandings(27),
    28: getStandings(28),
    29: getStandings(29),
    15: getStandings(15),
    32: getStandings(32),
    33: getStandings(33),
    34: getStandings(34),
    35: getStandings(35),
    36: getStandings(36),
    16: getStandings(16),
  };
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
      self.postMessage({
        type: "CAREER_STARTED",
        state: worldState,
        ego_player: egoPlayer,
        ego_suspended_matches: 0,
        upcoming,
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
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
      const managerConfig = getClubManagerConfig(msg.clubId);
      const squad = getClubRoster(msg.clubId, leagueId, worldState.season);
      self.postMessage({
        type: "MANAGER_STARTED",
        state: worldState,
        manager_name: msg.name,
        club_id: msg.clubId,
        upcoming,
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
        squad,
        manager_config: managerConfig,
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
      self.postMessage({
        type: "AGENT_STARTED",
        state: worldState,
        agent_state: getAgentState(agentId),
        agent_clients: getAgentClients(agentId),
        scout_list: getScoutList(agentId),
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
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
      self.postMessage({
        type: "OWNER_STARTED",
        state: worldState,
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        club_id: msg.clubId,
        upcoming,
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
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
      const isPundit = worldState.ego.mode === "pundit";
      const agentId = isAgent ? worldState.ego.character_id : 0;
      const ownerId = isOwner ? worldState.ego.character_id : 0;
      const leagueId = getLeagueIdForClub(msg.playerClubId) ?? 1;
      const next = nextEventDay(worldState.current_day);

      if (next == null) {
        // Check if a multi-stage knockout phase (Semifinal / Final) should be generated before ending the season
        const stageMsg = checkAndGenerateNextStage(leagueId, (worldState.season - 1) * 365, "liga1");
        if (stageMsg !== null) {
          const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);
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
            standings: getStandings(1),
            standings2: getStandings(2),
            squad: isManager ? getClubRoster(msg.playerClubId, leagueId, worldState.season) : undefined,
            manager_config: isManager ? getClubManagerConfig(msg.playerClubId) : undefined,
            agent_state: isAgent ? getAgentState(agentId) : undefined,
            agent_clients: isAgent ? getAgentClients(agentId) : undefined,
            scout_list: isAgent ? getScoutList(agentId) : undefined,
            owner_state: isOwner ? getOwnerState(ownerId) : undefined,
            club_market: isOwner ? getClubMarket(ownerId) : undefined,
            pundit_state: isPundit ? getPunditState() : undefined,
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
        const newLeagueId = getLeagueIdForClub(msg.playerClubId) ?? 1;
        const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);
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
          standings: getStandings(1),
          standings2: getStandings(2),
          squad: isManager ? getClubRoster(msg.playerClubId, newLeagueId, worldState.season) : undefined,
          manager_config: isManager ? getClubManagerConfig(msg.playerClubId) : undefined,
          agent_state: isAgent ? getAgentState(agentId) : undefined,
          agent_clients: isAgent ? getAgentClients(agentId) : undefined,
          scout_list: isAgent ? getScoutList(agentId) : undefined,
          owner_state: isOwner ? getOwnerState(ownerId) : undefined,
          club_market: isOwner ? getClubMarket(ownerId) : undefined,
          pundit_state: isPundit ? getPunditState() : undefined,
          leaders: getLeagueLeaders(newLeagueId),
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
      let punditPayoutMsg: string | null = null;
      if (isPundit) {
        const pState = getPunditState();
        if (pState) {
          const pTick = tickPunditWeek(pState, next);
          if (pTick.summary) punditPayoutMsg = pTick.summary;
        }
      }
      const proposalMsg = tickFormatProposals(leagueId, worldState.current_day, worldState.season, msg.playerClubId);
      const worldAiMsg = tickCrossModeAndAI(worldState.current_day, worldState.season, egoId, msg.playerClubId);

      // Process all matches on that day
      const enrollment = getEgoPlayerId() > 0 ? getTarkanEnrollment(getEgoPlayerId(), worldState.season) : null;
      processTarkanDay(next, enrollment?.clubId ?? null);
      const cupMsg = checkCupProgression();
      const afcMsg = checkAFCProgression();
      const timnasMsg = processTimnasCalendar(next, egoId);
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

      // If Loan Shark 2nd miss occurred, trigger loan_shark_extortion legal case
      if (ownerFinanceMsg?.includes("EKSEKUSI RENTENIR") && !activeLegalCase) {
        activeLegalCase = createLegalCase("loan_shark_extortion");
      }

      // If regular season just ended and Championship Series is active, auto-generate Semifinal/Final fixtures right away
      let stageBanner: string | null =
        [agentBankruptMsg, ownerFinanceMsg, punditPayoutMsg, proposalMsg, worldAiMsg, cupMsg, afcMsg, timnasMsg]
          .filter(Boolean)
          .join(" · ") || null;
      if (nextEventDay(worldState.current_day) == null) {
        const nextStageMsg = checkAndGenerateNextStage(leagueId, (worldState.season - 1) * 365, "liga1");
        if (nextStageMsg) stageBanner = stageBanner ? `${stageBanner} · ${nextStageMsg}` : nextStageMsg;
      }

      // Upcoming for player's club (next 5 after today)
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);

      // Player's own match this day (if any)
      const playerMatch =
        matchResults.find((r) => r.home_club === msg.playerClubId || r.away_club === msg.playerClubId) ?? null;

      // Current standings
      const egoSuspendedMatches = getPlayerSuspension(egoId, leagueId, worldState.season);

      self.postMessage({
        type: "EVENT_RESULT",
        world: worldState,
        ego_player: egoPlayer,
        ego_suspended_matches: egoSuspendedMatches,
        triggered_event: triggeredEvent,
        legal_case: activeLegalCase,
        season_summary: stageBanner,
        event_type: matchResults.length > 0 ? "match" : "idle",
        match_results: matchResults,
        player_match: playerMatch,
        watched_steps: watchedSteps,
        watched_home_name: watchedHomeName,
        watched_away_name: watchedAwayName,
        upcoming,
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
        squad: isManager ? getClubRoster(msg.playerClubId, leagueId, worldState.season) : undefined,
        manager_config: isManager ? getClubManagerConfig(msg.playerClubId) : undefined,
        agent_state: isAgent ? getAgentState(agentId) : undefined,
        agent_clients: isAgent ? getAgentClients(agentId) : undefined,
        scout_list: isAgent ? getScoutList(agentId) : undefined,
        owner_state: isOwner ? getOwnerState(ownerId) : undefined,
        club_market: isOwner ? getClubMarket(ownerId) : undefined,
        pundit_state: isPundit ? getPunditState() : undefined,
        leaders: getLeagueLeaders(leagueId),
        career_history: getPlayerCareerHistory(egoId),
        championship_series: hasChampionshipSeries(leagueId),
        format_proposal: getFormatProposalState(leagueId, msg.playerClubId),
      });
      break;
    }

    case "CHOOSE_EVENT": {
      const egoId = worldState.ego.character_id;
      const summary = applyEventChoice(egoId, msg.eventId, msg.choiceId);
      const legalKey = getChoiceLegalCase(msg.eventId, msg.choiceId);
      if (legalKey) {
        activeLegalCase = createLegalCase(legalKey);
      }
      const egoPlayer = getPlayer(egoId);
      self.postMessage({
        type: "EVENT_CHOICE_APPLIED",
        ego_player: egoPlayer,
        legal_case: activeLegalCase,
        summary,
      });
      break;
    }

    case "RESOLVE_LEGAL_CASE": {
      if (!activeLegalCase) break;
      const mode = worldState.ego.mode;
      const charId = worldState.ego.character_id;
      const res = resolveLegalCase(activeLegalCase, msg.input, mode, charId);
      activeLegalCase = null;
      const egoId = getEgoPlayerId();
      const isAgent = mode === "agent";
      const isOwner = mode === "owner";
      self.postMessage({
        type: "LEGAL_CASE_RESOLVED",
        ego_player: egoId > 0 ? getPlayer(egoId) : null,
        agent_state: isAgent ? getAgentState(charId) : undefined,
        owner_state: isOwner ? getOwnerState(charId) : undefined,
        summary: res.summary,
      });
      break;
    }

    case "PLAY_TARKAM": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const res = playTarkamMatch(egoId, worldState.current_day);
      self.postMessage({
        type: "EVENT_CHOICE_APPLIED",
        ego_player: getPlayer(egoId),
        legal_case: activeLegalCase,
        summary: res.summary,
      });
      break;
    }

    case "GET_CUP_BRACKET": {
      self.postMessage({ type: "CUP_BRACKET", rounds: getCupBracket() });
      break;
    }

    case "GET_AFC_BRACKET": {
      self.postMessage({
        type: "AFC_BRACKET",
        rounds: getAFCBracket(),
        groupStandings: getAFCGroupStandings(),
      });
      break;
    }

    case "GET_U21_STANDINGS": {
      const lid = msg.leagueId ?? 30;
      const YOUTH_AGES: Record<number, number> = {
        30: 21,
        31: 21,
        40: 18,
        41: 18,
        45: 15,
        46: 15,
      };
      const maxAge = YOUTH_AGES[lid] ?? 21;
      const standings = getAgeStandings(lid, maxAge);
      self.postMessage({ type: "U21_STANDINGS", standings, leagueId: lid });
      break;
    }

    case "TIMNAS_GET_INFO": {
      const egoId = getEgoPlayerId();
      self.postMessage({ type: "TIMNAS_INFO", info: getTimnasInfo(egoId, worldState.current_day) });
      break;
    }

    case "TIMNAS_PLAY_MATCH": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const res = playTimnasMatch(egoId, worldState.current_day);
      self.postMessage({
        type: "TIMNAS_MATCH_RESULT",
        ok: res.ok,
        summary: res.summary,
        ego_player: getPlayer(egoId),
        info: getTimnasInfo(egoId, worldState.current_day),
      });
      break;
    }

    case "NATURALIZE": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const check = canNaturalize(egoId, worldState.current_day);
      if (!check.ok) {
        self.postMessage({ type: "NATURALIZE_RESULT", ok: false, summary: `⚠️ ${check.reason}` });
        break;
      }
      const summary = naturalize(egoId);
      self.postMessage({
        type: "NATURALIZE_RESULT",
        ok: true,
        summary,
        ego_player: getPlayer(egoId),
      });
      break;
    }

    case "TARKAN_GET_LEAGUES": {
      const egoId = getEgoPlayerId();
      self.postMessage({
        type: "TARKAN_LEAGUES",
        leagues: getTarkanLeagues(egoId, worldState.season),
      });
      break;
    }

    case "TARKAN_ENROLL": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const res = enrollInTarkan(egoId, msg.leagueId, worldState.season);
      self.postMessage({
        type: "TARKAN_ENROLLED",
        ok: res.ok,
        summary: res.summary,
        leagues: getTarkanLeagues(egoId, worldState.season),
      });
      break;
    }

    case "TARKAN_UNENROLL": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const summary = unenrollFromTarkan(egoId, worldState.season);
      self.postMessage({
        type: "TARKAN_ENROLLED",
        ok: true,
        summary,
        leagues: getTarkanLeagues(egoId, worldState.season),
      });
      break;
    }

    case "TARKAN_GET_STANDINGS": {
      self.postMessage({
        type: "TARKAN_STANDINGS",
        leagueId: msg.leagueId,
        standings: getTarkanStandings(msg.leagueId),
      });
      break;
    }

    case "TARKAN_GET_FIXTURES": {
      self.postMessage({
        type: "TARKAN_FIXTURES",
        leagueId: msg.leagueId,
        fixtures: getTarkanFixtures(msg.leagueId, msg.clubId),
      });
      break;
    }

    case "TARKAN_PLAY_MATCH": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const res = playTarkanMatchForPlayer(egoId, msg.matchId, worldState.current_day);
      self.postMessage({
        type: "TARKAN_MATCH_RESULT",
        ok: res.ok,
        summary: res.summary,
        ego_player: getPlayer(egoId),
      });
      break;
    }

    case "TRANSITION_TO_CHILD": {
      const egoId = getEgoPlayerId();
      if (egoId <= 0) break;
      const res = transitionToChild(egoId, worldState.ego, worldState.current_day, msg.childName);
      worldState = { ...worldState, ego: res.newEgo };
      eventCounts = {};
      egoCareerAwards = 0;
      const newPlayer = getPlayer(res.newPlayerId);
      const clubId = newPlayer?.club ?? 1;
      self.postMessage({
        type: "CHILD_TRANSITIONED",
        state: worldState,
        ego_player: newPlayer,
        club_id: clubId,
        upcoming: getUpcoming(clubId, worldState.current_day),
        career_history: getPlayerCareerHistory(res.newPlayerId),
        summary: res.summary,
      });
      break;
    }

    case "GET_RETIREMENT_OPTIONS": {
      const egoId = worldState.ego.character_id;
      if (egoId <= 0) break;
      const options = getRetirementOptions(egoId);
      self.postMessage({
        type: "RETIREMENT_OPTIONS_READY",
        options,
      });
      break;
    }

    case "CHOOSE_RETIREMENT_PATH": {
      const egoId = worldState.ego.character_id;
      if (egoId <= 0) break;
      const res = chooseRetirementPath(egoId, msg.choice, {
        ...msg.extraData,
        egoState: worldState.ego,
        currentDay: worldState.current_day,
      });

      if (res.mode === "manager") {
        worldState = {
          ...worldState,
          ego: {
            ...worldState.ego,
            mode: "manager",
            character_id: res.characterId,
          },
        };
        const leagueId = getLeagueIdForClub(res.characterId) ?? 1;
        self.postMessage({
          type: "RETIREMENT_PATH_CHOSEN",
          choice: msg.choice,
          mode: "manager",
          state: worldState,
          club_id: res.characterId,
          upcoming: getUpcoming(res.characterId, worldState.current_day),
          standings: getStandings(1),
          standings2: getStandings(2),
          standings3: getStandings(5),
          all_standings: getAllLeaguesStandings(),
          squad: getClubRoster(res.characterId, leagueId, worldState.season),
          manager_config: getClubManagerConfig(res.characterId),
          championship_series: hasChampionshipSeries(leagueId),
          leaders: getLeagueLeaders(leagueId),
          summary: res.summary,
        });
      } else if (res.mode === "agent") {
        worldState = {
          ...worldState,
          ego: {
            ...worldState.ego,
            mode: "agent",
            character_id: res.characterId,
          },
        };
        self.postMessage({
          type: "RETIREMENT_PATH_CHOSEN",
          choice: msg.choice,
          mode: "agent",
          state: worldState,
          agent_state: getAgentState(res.characterId),
          agent_clients: getAgentClients(res.characterId),
          scout_list: getScoutList(res.characterId),
          standings: getStandings(1),
          standings2: getStandings(2),
          standings3: getStandings(5),
          all_standings: getAllLeaguesStandings(),
          leaders: getLeagueLeaders(1),
          summary: res.summary,
        });
      } else if (res.mode === "pundit") {
        worldState = {
          ...worldState,
          ego: {
            ...worldState.ego,
            mode: "pundit",
            character_id: res.characterId,
          },
        };
        self.postMessage({
          type: "RETIREMENT_PATH_CHOSEN",
          choice: msg.choice,
          mode: "pundit",
          state: worldState,
          pundit_state: res.punditState ?? getPunditState(),
          standings: getStandings(1),
          standings2: getStandings(2),
          standings3: getStandings(5),
          all_standings: getAllLeaguesStandings(),
          leaders: getLeagueLeaders(1),
          summary: res.summary,
        });
      } else if (res.mode === "player" && res.newPlayerId) {
        worldState = {
          ...worldState,
          ego: {
            ...worldState.ego,
            mode: "player",
            character_id: res.newPlayerId,
          },
        };
        const newPlayer = getPlayer(res.newPlayerId);
        const clubId = newPlayer?.club ?? 1;
        self.postMessage({
          type: "CHILD_TRANSITIONED",
          state: worldState,
          ego_player: newPlayer,
          club_id: clubId,
          upcoming: getUpcoming(clubId, worldState.current_day),
          career_history: getPlayerCareerHistory(res.newPlayerId),
          summary: res.summary,
        });
      }
      break;
    }

    case "PUNDIT_ACTION": {
      const pState = getPunditState();
      if (!pState) break;
      const res = executePunditAction(
        pState,
        msg.actionId,
        worldState.current_day,
        msg.targetClubId,
        msg.targetPlayerId,
      );
      self.postMessage({
        type: "PUNDIT_UPDATED",
        pundit_state: res.updatedState,
        summary: res.summary,
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
      const upcoming = getUpcoming(res.clubId, worldState.current_day);
      self.postMessage({
        type: "TRANSFER_ACCEPTED",
        ego_player: egoPlayer,
        club_id: res.clubId,
        club_name: res.clubName,
        summary: res.summary,
        upcoming,
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
      });
      break;
    }

    case "TOGGLE_CHAMPIONSHIP_SERIES": {
      const clubId = msg.clubId ?? 0;
      const proposerType = clubId > 0 ? "club_owner" : "federation";
      const res = proposeFormatChange(1, clubId, proposerType, worldState.current_day, worldState.season);
      self.postMessage({
        type: "FORMAT_UPDATED",
        championship_series: hasChampionshipSeries(1),
        format_proposal: res.proposal,
        summary: res.summary,
      });
      break;
    }

    case "VOTE_FORMAT_PROPOSAL": {
      const voterType = msg.clubId > 0 ? "club_owner" : "federation_member";
      const res = voteOnFormatProposal(msg.proposalId, msg.clubId, voterType, msg.choice, worldState.current_day);
      self.postMessage({
        type: "FORMAT_UPDATED",
        championship_series: res.championship_series,
        format_proposal: res.proposal,
        summary: res.summary,
      });
      break;
    }

    case "GET_UPCOMING": {
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day, msg.count ?? 5);
      self.postMessage({ type: "UPCOMING", upcoming });
      break;
    }

    case "GET_STANDINGS": {
      self.postMessage({
        type: "STANDINGS",
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        all_standings: getAllLeaguesStandings(),
      });
      break;
    }

    case "GET_SQUAD": {
      const squad = getClubRoster(msg.clubId, 1, worldState.season);
      self.postMessage({ type: "SQUAD", squad, manager_config: getClubManagerConfig(msg.clubId) });
      break;
    }

    case "GET_FREE_AGENTS": {
      const db = getDB();
      const clubId = msg.clubId ?? worldState.ego.character_id;
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
      self.postMessage({
        type: "FREE_AGENTS",
        agents,
        transfer_targets: getTransferTargets(clubId),
        manager_config: getClubManagerConfig(clubId),
      });
      break;
    }

    case "MANAGER_SIGN": {
      const db = getDB();
      db.run(`UPDATE players SET club = ?, free_agent = 0, contract_end = ? WHERE id = ? AND free_agent = 1`, [
        msg.clubId,
        worldState.current_day + 365,
        msg.playerId,
      ]);
      const squad = getClubRoster(msg.clubId, 1, worldState.season);
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
        transfer_targets: getTransferTargets(msg.clubId),
        manager_config: getClubManagerConfig(msg.clubId),
        summary: "✍️ Pemain bebas transfer berhasil dikontrak.",
      });
      break;
    }

    case "MANAGER_BUY_PLAYER": {
      const res = buyTransferTarget(msg.clubId, msg.playerId, worldState.current_day);
      const squad = getClubRoster(msg.clubId, 1, worldState.season);
      self.postMessage({
        type: "MANAGER_TRANSFER_DONE",
        squad,
        transfer_targets: getTransferTargets(msg.clubId),
        manager_config: getClubManagerConfig(msg.clubId),
        summary: res.summary,
      });
      break;
    }

    case "MANAGER_RELEASE": {
      const db = getDB();
      const clubId = worldState.ego.character_id;
      const pRow = db.exec(`SELECT name, overall FROM players WHERE id = ?`, [msg.playerId])[0]?.values[0];
      const pName = (pRow?.[0] as string) ?? "Pemain";
      const ovr = (pRow?.[1] as number) ?? 40;
      const saleFee = Math.max(2_000_000, Math.round((ovr * ovr * 5_000) / 1_000_000) * 1_000_000);
      db.run(`UPDATE clubs SET cash = cash + ? WHERE id = ?`, [saleFee, clubId]);
      db.run(`UPDATE players SET club = NULL, free_agent = 1, contract_end = 0 WHERE id = ?`, [msg.playerId]);
      const squad = getClubRoster(clubId, 1, worldState.season);
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
        transfer_targets: getTransferTargets(clubId),
        manager_config: getClubManagerConfig(clubId),
        summary: `🚪 ${pName} dijual/dilepas (+Rp ${(saleFee / 1_000_000).toFixed(1)}M ke kas klub).`,
      });
      break;
    }

    case "MANAGER_SET_TACTICS": {
      const res = setClubTactics(msg.clubId, msg.formation, msg.mentality);
      self.postMessage({
        type: "MANAGER_CONFIG_UPDATED",
        manager_config: res.config,
        squad: getClubRoster(msg.clubId, 1, worldState.season),
        summary: res.summary,
      });
      break;
    }

    case "MANAGER_TOGGLE_STARTER": {
      const res = toggleClubStarter(msg.clubId, msg.playerId);
      self.postMessage({
        type: "MANAGER_CONFIG_UPDATED",
        manager_config: res.config,
        squad: getClubRoster(msg.clubId, 1, worldState.season),
        summary: res.summary,
      });
      break;
    }

    case "MANAGER_UPGRADE_STAFF": {
      const res = upgradeClubStaff(msg.clubId, msg.role);
      self.postMessage({
        type: "MANAGER_CONFIG_UPDATED",
        manager_config: res.config,
        squad: getClubRoster(msg.clubId, 1, worldState.season),
        summary: res.summary,
      });
      break;
    }

    case "APPLY_MIDMATCH_SCORE": {
      applyMidMatchScoreUpdate(msg.matchId, msg.homeGoals, msg.awayGoals);
      self.postMessage({
        type: "STANDINGS",
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
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
        standings2: getStandings(2),
        standings3: getStandings(5),
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

    case "OWNER_LOAN_SHARK": {
      const ownerId = worldState.ego.character_id;
      const res = takeLoanShark(ownerId, msg.amount);
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
      self.postMessage({
        type: "OWNER_UPDATED",
        owner_state: getOwnerState(ownerId),
        club_market: getClubMarket(ownerId),
        club_id: res.clubId,
        club_name: res.clubName,
        upcoming: res.clubId > 0 ? getUpcoming(res.clubId, worldState.current_day) : [],
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
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
        standings: getStandings(1),
        standings2: getStandings(2),
        standings3: getStandings(5),
        leaders: getLeagueLeaders(leagueId),
        career_history: egoId > 0 ? getPlayerCareerHistory(egoId) : [],
        championship_series: hasChampionshipSeries(leagueId),
        format_proposal: getFormatProposalState(leagueId, clubId),
        club_id: clubId,
        squad: isManager ? getClubRoster(clubId, leagueId, worldState.season) : undefined,
        manager_config: isManager ? getClubManagerConfig(clubId) : undefined,
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
