<script lang="ts">
  import { onMount } from "svelte";
  import type { WorldState, Position, MatchResult, Player, GameEvent } from "./types/index.js";
  import type {
    UpcomingFixture,
    StandingRow,
    ClubManagerConfig,
    ClubStaffLevels,
    TransferTarget,
  } from "./engine/scheduler.js";
  import type { MatchStep } from "./engine/match.js";
  import type { TransferOffer } from "./engine/transfers.js";
  import type { LeagueLeaders, CareerSeasonRow } from "./engine/awards.js";
  import {
    persistSave, readSave, saveMeta, loadMeta, clearMeta,
    loadAllMeta, deleteSlot, MAX_SLOTS,
  } from "./engine/savegame.js";
  import type { SaveMeta } from "./engine/savegame.js";
  import NewGame from "./ui/routes/NewGame.svelte";
  import CareerLoop from "./ui/routes/CareerLoop.svelte";
  import ManagerLoop from "./ui/routes/ManagerLoop.svelte";
  import AgentLoop from "./ui/routes/AgentLoop.svelte";
  import OwnerLoop from "./ui/routes/OwnerLoop.svelte";
  import LeagueTable from "./ui/components/LeagueTable.svelte";
  import StatsBoard from "./ui/components/StatsBoard.svelte";
  import MatchWheel from "./ui/components/MatchWheel.svelte";
  import EventModal from "./ui/components/EventModal.svelte";
  import LegalModal from "./ui/components/LegalModal.svelte";
  import TransferModal from "./ui/components/TransferModal.svelte";
  import ManagerTransferModal from "./ui/components/ManagerTransferModal.svelte";
  import RetirementModal from "./ui/components/RetirementModal.svelte";
  import PunditLoop from "./ui/routes/PunditLoop.svelte";
  import type { RetirementOptions, PunditState } from "./engine/retirement.js";
  import type { AgentState, ClientPlayer } from "./engine/agent.js";
  import type { OwnerState, SlotMarketRow } from "./engine/owner.js";
  import type { FormatProposalView } from "./engine/stages.js";
  import type { LegalCase, LegalResolutionInput } from "./engine/legal.js";
  import type { TarkanLeague, TarkanStanding, TarkanFixture } from "./engine/tarkan.js";
  import type { CupRound } from "./engine/cup.js";
  import type { AFCRound, AFCGroupStanding } from "./engine/afc.js";
  import type { U21StandingRow } from "./engine/scheduler.js";
  import type { TimnasSquadInfo } from "./engine/timnas.js";
  import GameWorker from "./engine/worker.ts?worker";

  type Screen = "loading" | "error" | "title" | "new_game" | "career";
  type GameMode = "player" | "manager" | "agent" | "owner" | "pundit";

  let screen = $state<Screen>("loading");
  let gameMode = $state<GameMode>("player");
  let world = $state<WorldState | null>(null);
  let clubs = $state<[number, string, number, number][]>([]); // [id, name, rep, league_id]
  let leagues = $state<[number, string][]>([]);

  let playerName = $state("");
  let playerPosition = $state<Position>("ST");
  let playerClubId = $state(0);
  let clubName = $state("");

  // Manager mode state
  interface FreeAgent { id: number; name: string; position: string; age: number; overall: number; ca: number; pa: number; wage: number; nationality: number; }
  let squad = $state<import("./types/index.js").Player[]>([]);
  let freeAgents = $state<FreeAgent[]>([]);
  let transferTargets = $state<TransferTarget[]>([]);
  let managerConfig = $state<ClubManagerConfig | null>(null);
  let managerTransferOpen = $state(false);

  // Agent mode state
  let agentState = $state<AgentState | null>(null);
  let agentClients = $state<ClientPlayer[]>([]);
  let scoutList = $state<ClientPlayer[]>([]);
  let negotiatingClientId = $state<number | null>(null);
  let negotiatingClientClubId = $state<number>(0);

  // Owner mode state
  let ownerState = $state<OwnerState | null>(null);
  let clubMarket = $state<SlotMarketRow[]>([]);

  // Retirement & Pundit state
  let retirementOptions = $state<RetirementOptions | null>(null);
  let punditState = $state<PunditState | null>(null);

  let egoPlayer = $state<Player | null>(null);
  let egoSuspended = $state(0);
  let activeEvent = $state<GameEvent | null>(null);
  let activeLegalCase = $state<LegalCase | null>(null);
  let transferOffers = $state<TransferOffer[] | null>(null);
  let lastEventSummary = $state<string | null>(null);
  let playerMatch = $state<MatchResult | null>(null);
  let watchedSteps = $state<MatchStep[] | null>(null);
  let watchedHomeName = $state("");
  let watchedAwayName = $state("");
  let upcoming = $state<UpcomingFixture[]>([]);
  let standings = $state<StandingRow[]>([]);
  let standings2 = $state<StandingRow[]>([]);
  let standings3 = $state<StandingRow[]>([]);
  let allStandings = $state<Record<number, StandingRow[]>>({});
  let leaders = $state<LeagueLeaders>({ topScorers: [], topAssists: [], topRated: [] });
  let careerHistory = $state<CareerSeasonRow[]>([]);
  let championshipSeries = $state(false);
  let formatProposal = $state<FormatProposalView | null>(null);
  let allMeta = $state<(SaveMeta | null)[]>(loadAllMeta());
  let activeSlot = $state(0);
  let saveStatus = $state<"idle" | "saving" | "saved">("idle");
  // Legacy compat — first occupied slot or slot 0
  const saveMeta_ = $derived(allMeta.find(Boolean) ?? null);

  // Tarkan state
  let tarkanLeagues = $state<TarkanLeague[]>([]);
  let tarkanStandings = $state<TarkanStanding[]>([]);
  let tarkanFixtures = $state<TarkanFixture[]>([]);
  let tarkanMsg = $state<string | null>(null);

  // Cup state
  let cupRounds = $state<CupRound[]>([]);

  // AFC state
  let afcRounds = $state<AFCRound[]>([]);
  let afcGroupStandings = $state<AFCGroupStanding[]>([]);

  // U-21 state
  let u21Standings = $state<U21StandingRow[]>([]);

  // Timnas state
  let timnasInfo = $state<TimnasSquadInfo | null>(null);
  let timnasMsg = $state<string | null>(null);

  let worker: Worker;

  onMount(() => {
    worker = new GameWorker();

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.all_standings) {
        allStandings = msg.all_standings;
      }
      if (msg.type === "READY") {
        screen = "title";
      } else if (msg.type === "MANAGER_STARTED") {
        world = msg.state;
        gameMode = "manager";
        playerName = msg.manager_name ?? "";
        playerClubId = msg.club_id ?? 0;
        const foundClub = clubs.find((c) => c[0] === playerClubId);
        clubName = foundClub?.[1] ?? "Unknown";
        standings = msg.standings ?? [];
        standings2 = msg.standings2 ?? [];
        standings3 = msg.standings3 ?? [];
        upcoming = msg.upcoming ?? [];
        squad = msg.squad ?? [];
        if (msg.manager_config) managerConfig = msg.manager_config;
        if (msg.leaders) leaders = msg.leaders;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        screen = "career";
      } else if (msg.type === "AGENT_STARTED") {
        world = msg.state;
        gameMode = "agent";
        agentState = msg.agent_state ?? null;
        agentClients = msg.agent_clients ?? [];
        scoutList = msg.scout_list ?? [];
        playerName = agentState?.name ?? "";
        clubName = agentState?.office_name ?? "Agensi";
        standings = msg.standings ?? [];
        standings2 = msg.standings2 ?? [];
        standings3 = msg.standings3 ?? [];
        if (msg.leaders) leaders = msg.leaders;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        lastEventSummary = null;
        screen = "career";
      } else if (msg.type === "AGENT_UPDATED") {
        if (msg.agent_state !== undefined) agentState = msg.agent_state;
        if (msg.agent_clients !== undefined) agentClients = msg.agent_clients;
        if (msg.scout_list !== undefined) scoutList = msg.scout_list;
        if (msg.standings) standings = msg.standings;
        if (msg.standings2) standings2 = msg.standings2;
        if (msg.standings3) standings3 = msg.standings3;
        lastEventSummary = msg.summary ?? null;
        transferOffers = null;
        negotiatingClientId = null;
      } else if (msg.type === "OWNER_STARTED") {
        world = msg.state;
        gameMode = "owner";
        ownerState = msg.owner_state ?? null;
        clubMarket = msg.club_market ?? [];
        playerClubId = msg.club_id ?? 0;
        playerName = ownerState?.name ?? "";
        clubName = ownerState?.club?.name ?? "Konsorsium";
        upcoming = msg.upcoming ?? [];
        standings = msg.standings ?? [];
        standings2 = msg.standings2 ?? [];
        standings3 = msg.standings3 ?? [];
        if (msg.leaders) leaders = msg.leaders;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        lastEventSummary = null;
        screen = "career";
      } else if (msg.type === "OWNER_UPDATED") {
        if (msg.owner_state !== undefined) {
          ownerState = msg.owner_state;
          playerClubId = ownerState?.club_id ?? 0;
          clubName = ownerState?.club?.name ?? "Tanpa Klub";
        }
        if (msg.club_market !== undefined) clubMarket = msg.club_market;
        if (msg.club_id !== undefined) playerClubId = msg.club_id;
        if (msg.club_name !== undefined) clubName = msg.club_name;
        if (msg.upcoming !== undefined) upcoming = msg.upcoming;
        if (msg.standings !== undefined) standings = msg.standings;
        if (msg.standings2 !== undefined) standings2 = msg.standings2;
        if (msg.standings3 !== undefined) standings3 = msg.standings3;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "FREE_AGENTS") {
        freeAgents = msg.agents ?? [];
        if (msg.transfer_targets) transferTargets = msg.transfer_targets;
        if (msg.manager_config) managerConfig = msg.manager_config;
      } else if (msg.type === "SQUAD") {
        squad = msg.squad ?? [];
        if (msg.manager_config) managerConfig = msg.manager_config;
      } else if (msg.type === "MANAGER_TRANSFER_DONE") {
        squad = msg.squad ?? [];
        if (msg.free_agents) freeAgents = msg.free_agents;
        if (msg.transfer_targets) transferTargets = msg.transfer_targets;
        if (msg.manager_config) managerConfig = msg.manager_config;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "MANAGER_CONFIG_UPDATED") {
        if (msg.manager_config) managerConfig = msg.manager_config;
        if (msg.squad) squad = msg.squad;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "WORLD_STATE") {
        world = msg.state;
        if (msg.clubs) clubs = msg.clubs;
        if (msg.leagues) leagues = msg.leagues;
      } else if (msg.type === "CAREER_STARTED") {
        world = msg.state;
        egoPlayer = msg.ego_player ?? null;
        egoSuspended = msg.ego_suspended_matches ?? 0;
        activeEvent = null;
        transferOffers = null;
        lastEventSummary = null;
        upcoming = msg.upcoming ?? [];
        standings = msg.standings ?? [];
        standings2 = msg.standings2 ?? [];
        standings3 = msg.standings3 ?? [];
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
      } else if (msg.type === "EVENT_RESULT") {
        world = msg.world;
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.ego_suspended_matches !== undefined) egoSuspended = msg.ego_suspended_matches;
        activeEvent = msg.triggered_event ?? null;
        if (msg.legal_case !== undefined) activeLegalCase = msg.legal_case;
        if (msg.transfer_offers) transferOffers = msg.transfer_offers;
        lastEventSummary = msg.season_summary ?? null;
        playerMatch = msg.player_match ?? null;
        watchedSteps = msg.watched_steps ?? null;
        watchedHomeName = msg.watched_home_name ?? "";
        watchedAwayName = msg.watched_away_name ?? "";
        upcoming = msg.upcoming ?? [];
        standings = msg.standings ?? standings;
        standings2 = msg.standings2 ?? standings2;
        standings3 = msg.standings3 ?? standings3;
        if (msg.squad) squad = msg.squad;
        if (msg.manager_config) managerConfig = msg.manager_config;
        if (msg.agent_state !== undefined) agentState = msg.agent_state;
        if (msg.agent_clients !== undefined) agentClients = msg.agent_clients;
        if (msg.scout_list !== undefined) scoutList = msg.scout_list;
        if (msg.owner_state !== undefined) ownerState = msg.owner_state;
        if (msg.club_market !== undefined) clubMarket = msg.club_market;
        if (msg.pundit_state !== undefined) punditState = msg.pundit_state;
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        if (msg.format_proposal !== undefined) formatProposal = msg.format_proposal;
      } else if (msg.type === "RETIREMENT_OPTIONS_READY") {
        retirementOptions = msg.options;
      } else if (msg.type === "RETIREMENT_PATH_CHOSEN") {
        retirementOptions = null;
        lastEventSummary = msg.summary ?? null;
        world = msg.state;
        gameMode = msg.mode;
        if (msg.mode === "manager") {
          playerClubId = msg.club_id;
          const foundClub = clubs.find((c) => c[0] === playerClubId);
          clubName = foundClub?.[1] ?? clubName;
          upcoming = msg.upcoming ?? [];
          standings = msg.standings ?? [];
          standings2 = msg.standings2 ?? [];
          standings3 = msg.standings3 ?? [];
          if (msg.all_standings) allStandings = msg.all_standings;
          squad = msg.squad ?? [];
          managerConfig = msg.manager_config ?? null;
          if (msg.leaders) leaders = msg.leaders;
        } else if (msg.mode === "agent") {
          agentState = msg.agent_state ?? null;
          agentClients = msg.agent_clients ?? [];
          scoutList = msg.scout_list ?? [];
          if (msg.leaders) leaders = msg.leaders;
        } else if (msg.mode === "pundit") {
          punditState = msg.pundit_state ?? null;
          standings = msg.standings ?? [];
          standings2 = msg.standings2 ?? [];
          if (msg.all_standings) allStandings = msg.all_standings;
          if (msg.leaders) leaders = msg.leaders;
        }
      } else if (msg.type === "PUNDIT_UPDATED") {
        punditState = msg.pundit_state ?? punditState;
        lastEventSummary = msg.summary ?? lastEventSummary;
      } else if (msg.type === "EVENT_CHOICE_APPLIED") {
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.legal_case !== undefined) activeLegalCase = msg.legal_case;
        lastEventSummary = msg.summary ?? null;
        activeEvent = null;
      } else if (msg.type === "CHILD_TRANSITIONED") {
        world = msg.state;
        egoPlayer = msg.ego_player ?? null;
        egoSuspended = 0;
        if (msg.club_id !== undefined) playerClubId = msg.club_id;
        const foundClub = clubs.find((c) => c[0] === playerClubId);
        clubName = foundClub?.[1] ?? clubName;
        playerName = egoPlayer?.name ?? playerName;
        if (msg.upcoming) upcoming = msg.upcoming;
        if (msg.career_history) careerHistory = msg.career_history;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "LEGAL_CASE_RESOLVED") {
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.agent_state !== undefined) agentState = msg.agent_state;
        if (msg.owner_state !== undefined) ownerState = msg.owner_state;
        activeLegalCase = null;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "TRANSFER_OFFERS") {
        transferOffers = msg.offers ?? [];
      } else if (msg.type === "TRANSFER_ACCEPTED") {
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.club_id !== undefined) playerClubId = msg.club_id;
        if (msg.club_name !== undefined) clubName = msg.club_name;
        if (msg.upcoming) upcoming = msg.upcoming;
        if (msg.standings) standings = msg.standings;
        if (msg.standings2) standings2 = msg.standings2;
        if (msg.standings3) standings3 = msg.standings3;
        lastEventSummary = msg.summary ?? null;
        transferOffers = null;
      } else if (msg.type === "FORMAT_UPDATED") {
        championshipSeries = msg.championship_series ?? false;
        if (msg.format_proposal !== undefined) formatProposal = msg.format_proposal;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "STANDINGS") {
        standings = msg.standings ?? [];
        if (msg.standings2) standings2 = msg.standings2;
      } else if (msg.type === "UPCOMING") {
        upcoming = msg.upcoming ?? [];
      } else if (msg.type === "SAVE_DATA") {
        const meta: SaveMeta = {
          slot: activeSlot,
          playerName,
          clubName,
          season: world?.season ?? 1,
          currentDay: world?.current_day ?? 0,
          savedAt: Date.now(),
          mode: gameMode,
        };
        persistSave(msg.payload, activeSlot).then(() => {
          saveMeta(meta);
          allMeta = loadAllMeta();
          saveStatus = "saved";
          setTimeout(() => (saveStatus = "idle"), 2000);
        });
      } else if (msg.type === "GAME_LOADED") {
        world = msg.state;
        const loadedMode = msg.state?.ego?.mode;
        gameMode =
          loadedMode === "manager"
            ? "manager"
            : loadedMode === "agent"
              ? "agent"
              : loadedMode === "owner"
                ? "owner"
                : "player";
        egoPlayer = msg.ego_player ?? null;
        egoSuspended = msg.ego_suspended_matches ?? 0;
        playerClubId = msg.club_id ?? 0;
        const foundClub = clubs.find((c) => c[0] === playerClubId);
        clubName = foundClub?.[1] ?? "Free Agent";
        if (msg.agent_state) {
          agentState = msg.agent_state;
          agentClients = msg.agent_clients ?? [];
          scoutList = msg.scout_list ?? [];
          playerName = agentState?.name ?? "";
          clubName = agentState?.office_name ?? "Agensi";
        } else if (msg.owner_state) {
          ownerState = msg.owner_state;
          clubMarket = msg.club_market ?? [];
          playerName = ownerState?.name ?? "";
          clubName = ownerState?.club?.name ?? "Tanpa Klub";
        } else {
          playerName = egoPlayer?.name ?? playerName;
        }
        activeEvent = null;
        transferOffers = null;
        lastEventSummary = null;
        upcoming = msg.upcoming ?? [];
        standings = msg.standings ?? [];
        standings2 = msg.standings2 ?? [];
        standings3 = msg.standings3 ?? [];
        if (msg.squad) squad = msg.squad;
        if (msg.manager_config) managerConfig = msg.manager_config;
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        if (msg.format_proposal !== undefined) formatProposal = msg.format_proposal;
        screen = "career";
      } else if (msg.type === "CUP_BRACKET") {
        cupRounds = msg.rounds;
      } else if (msg.type === "AFC_BRACKET") {
        afcRounds = msg.rounds;
        afcGroupStandings = msg.groupStandings;
      } else if (msg.type === "U21_STANDINGS") {
        u21Standings = msg.standings;
      } else if (msg.type === "TIMNAS_INFO") {
        timnasInfo = msg.info;
      } else if (msg.type === "TIMNAS_MATCH_RESULT") {
        timnasMsg = msg.summary;
        if (msg.ego_player) egoPlayer = msg.ego_player;
        if (msg.info) timnasInfo = msg.info;
      } else if (msg.type === "NATURALIZE_RESULT") {
        timnasMsg = msg.summary;
        if (msg.ego_player) egoPlayer = msg.ego_player;
      } else if (msg.type === "TARKAN_LEAGUES") {
        tarkanLeagues = msg.leagues;
      } else if (msg.type === "TARKAN_ENROLLED") {
        tarkanLeagues = msg.leagues;
        tarkanMsg = msg.summary;
        // Auto-fetch standings/fixtures for enrolled league
        const enrolled = (msg.leagues as TarkanLeague[]).find((l) => l.enrolled);
        if (enrolled?.enrolledClubId) {
          worker.postMessage({ type: "TARKAN_GET_STANDINGS", leagueId: enrolled.id });
          worker.postMessage({ type: "TARKAN_GET_FIXTURES", leagueId: enrolled.id, clubId: enrolled.enrolledClubId });
        } else {
          tarkanStandings = [];
          tarkanFixtures = [];
        }
      } else if (msg.type === "TARKAN_STANDINGS") {
        tarkanStandings = msg.standings;
      } else if (msg.type === "TARKAN_FIXTURES") {
        tarkanFixtures = msg.fixtures;
      } else if (msg.type === "TARKAN_MATCH_RESULT") {
        tarkanMsg = msg.summary;
        if (msg.ego_player) egoPlayer = msg.ego_player;
        // Refresh fixtures/standings
        const enrolled = tarkanLeagues.find((l) => l.enrolled);
        if (enrolled?.enrolledClubId) {
          worker.postMessage({ type: "TARKAN_GET_STANDINGS", leagueId: enrolled.id });
          worker.postMessage({ type: "TARKAN_GET_FIXTURES", leagueId: enrolled.id, clubId: enrolled.enrolledClubId });
        }
      } else if (msg.type === "ERROR") {
        screen = "error";
        console.error("Worker error:", msg.message);
      }
    };

    worker.onerror = (err) => {
      screen = "error";
      console.error("Worker crash:", err);
    };

    worker.postMessage({ type: "INIT" });
    return () => worker.terminate();
  });

  function openNewGame(mode: GameMode = "player", slot = activeSlot) {
    activeSlot = slot;
    gameMode = mode;
    worker.postMessage({ type: "NEW_GAME", mode, characterId: 0, startAge: 17 });
    screen = "new_game";
  }

  function startCareer(p: { name: string; position: Position; age: number; clubId: number; appearance?: string }) {
    if (gameMode === "manager") {
      worker.postMessage({ type: "START_MANAGER", name: p.name, clubId: p.clubId });
      return;
    }
    if (gameMode === "agent") {
      worker.postMessage({ type: "START_AGENT", name: p.name });
      return;
    }
    if (gameMode === "owner") {
      worker.postMessage({ type: "START_OWNER", name: p.name, clubId: p.clubId });
      return;
    }
    playerName = p.name;
    playerPosition = p.position;
    playerClubId = p.clubId;
    const found = clubs.find((c) => c[0] === p.clubId);
    clubName = found?.[1] ?? "Free Agent";

    worker.postMessage({
      type: "START_CAREER",
      name: p.name,
      position: p.position,
      age: p.age,
      clubId: p.clubId,
      appearance: p.appearance,
    });

    screen = "career";
  }

  function openManagerTransfers() {
    worker.postMessage({ type: "GET_FREE_AGENTS", clubId: playerClubId });
    managerTransferOpen = true;
  }

  function managerSign(playerId: number) {
    worker.postMessage({ type: "MANAGER_SIGN", playerId, clubId: playerClubId });
  }

  function managerBuy(playerId: number) {
    worker.postMessage({ type: "MANAGER_BUY_PLAYER", playerId, clubId: playerClubId });
  }

  function managerRelease(playerId: number) {
    worker.postMessage({ type: "MANAGER_RELEASE", playerId });
  }

  function managerSetTactics(
    formation: ClubManagerConfig["formation"],
    mentality: ClubManagerConfig["mentality"],
  ) {
    worker.postMessage({ type: "MANAGER_SET_TACTICS", clubId: playerClubId, formation, mentality });
  }

  function managerToggleStarter(playerId: number) {
    worker.postMessage({ type: "MANAGER_TOGGLE_STARTER", clubId: playerClubId, playerId });
  }

  function managerUpgradeStaff(role: keyof ClubStaffLevels) {
    worker.postMessage({ type: "MANAGER_UPGRADE_STAFF", clubId: playerClubId, role });
  }

  function handleWatchedMatchFinish(finalHomeGoals: number, finalAwayGoals: number) {
    if (playerMatch && (playerMatch.home_goals !== finalHomeGoals || playerMatch.away_goals !== finalAwayGoals)) {
      playerMatch = { ...playerMatch, home_goals: finalHomeGoals, away_goals: finalAwayGoals };
      worker.postMessage({
        type: "APPLY_MIDMATCH_SCORE",
        matchId: playerMatch.id,
        homeGoals: finalHomeGoals,
        awayGoals: finalAwayGoals,
        playerClubId,
      });
    }
  }

  function agentRecruit(playerId: number) {
    worker.postMessage({ type: "AGENT_RECRUIT", playerId });
  }

  function agentRelease(playerId: number) {
    worker.postMessage({ type: "AGENT_RELEASE", playerId });
  }

  function agentUpgradeOffice() {
    worker.postMessage({ type: "AGENT_UPGRADE_OFFICE" });
  }

  function agentPlantRumor(playerId: number) {
    worker.postMessage({ type: "AGENT_PLANT_RUMOR", playerId });
  }

  function agentOpenDeal(playerId: number, currentClubId: number) {
    negotiatingClientId = playerId;
    negotiatingClientClubId = currentClubId;
    worker.postMessage({ type: "AGENT_OPEN_DEAL", playerId });
  }

  function ownerLoan(amount: number) {
    worker.postMessage({ type: "OWNER_LOAN", amount });
  }

  function ownerLoanShark(amount: number) {
    worker.postMessage({ type: "OWNER_LOAN_SHARK", amount });
  }

  function ownerRepay(amount: number) {
    worker.postMessage({ type: "OWNER_REPAY", amount });
  }

  function ownerInject(amount: number) {
    worker.postMessage({ type: "OWNER_INJECT", amount });
  }

  function ownerDividend(amount: number) {
    worker.postMessage({ type: "OWNER_DIVIDEND", amount });
  }

  function ownerUpgrade(target: "facilities" | "academy" | "stadium") {
    worker.postMessage({ type: "OWNER_UPGRADE", target });
  }

  function ownerSponsor() {
    worker.postMessage({ type: "OWNER_SPONSOR" });
  }

  function ownerSellClub() {
    worker.postMessage({ type: "OWNER_SELL_CLUB" });
  }

  function ownerBuyClub(targetClubId: number, customClubName?: string) {
    worker.postMessage({ type: "OWNER_BUY_CLUB", targetClubId, customClubName });
  }

  function advance(watch = false) {
    worker.postMessage({ type: "ADVANCE_TO_NEXT_EVENT", playerClubId, watch });
  }

  function chooseEvent(eventId: string, choiceId: string) {
    worker.postMessage({ type: "CHOOSE_EVENT", eventId, choiceId });
  }

  function resolveLegal(input: LegalResolutionInput) {
    worker.postMessage({ type: "RESOLVE_LEGAL_CASE", input });
  }

  function openTransfers() {
    worker.postMessage({ type: "OPEN_TRANSFERS" });
  }

  function playTarkam() {
    worker.postMessage({ type: "PLAY_TARKAM" });
  }

  function getCupBracket() {
    worker.postMessage({ type: "GET_CUP_BRACKET" });
  }

  function getAFCBracket() {
    worker.postMessage({ type: "GET_AFC_BRACKET" });
  }

  function getU21Standings(overrideLeagueId?: number) {
    if (overrideLeagueId) {
      worker.postMessage({ type: "GET_U21_STANDINGS", leagueId: overrideLeagueId });
      return;
    }
    const isEPL = (playerClubId >= 103 && playerClubId <= 110) || (clubs.find((c) => c[0] === playerClubId)?.[3] === 11);
    worker.postMessage({ type: "GET_U21_STANDINGS", leagueId: isEPL ? 31 : 30 });
  }

  function timnasGetInfo() {
    worker.postMessage({ type: "TIMNAS_GET_INFO" });
  }
  function timnasPlayMatch() {
    worker.postMessage({ type: "TIMNAS_PLAY_MATCH" });
  }
  function doNaturalize() {
    worker.postMessage({ type: "NATURALIZE" });
  }

  function tarkanGetLeagues() {
    worker.postMessage({ type: "TARKAN_GET_LEAGUES" });
  }
  function tarkanEnroll(leagueId: number) {
    worker.postMessage({ type: "TARKAN_ENROLL", leagueId });
  }
  function tarkanUnenroll() {
    worker.postMessage({ type: "TARKAN_UNENROLL" });
  }
  function tarkanPlayMatch(matchId: number) {
    worker.postMessage({ type: "TARKAN_PLAY_MATCH", matchId });
  }

  function transitionChild() {
    worker.postMessage({ type: "TRANSITION_TO_CHILD" });
  }

  function openRetirementModal() {
    worker.postMessage({ type: "GET_RETIREMENT_OPTIONS" });
  }

  function chooseRetirement(
    choice: "manager" | "agent" | "staff" | "pundit" | "child",
    extraData?: {
      clubId?: number;
      agencyName?: string;
      role?: import("./engine/scheduler.js").ClubStaffLevels extends Record<infer K, any> ? K : never;
      childName?: string;
    },
  ) {
    worker.postMessage({ type: "CHOOSE_RETIREMENT_PATH", choice, extraData });
  }

  function punditAction(actionId: "criticize_manager" | "praise_wonderkid" | "leak_dressing_room" | "neutral_analysis") {
    worker.postMessage({ type: "PUNDIT_ACTION", actionId });
  }

  function acceptTransfer(offer: TransferOffer) {
    if (gameMode === "agent" && negotiatingClientId !== null) {
      worker.postMessage({ type: "AGENT_ACCEPT_DEAL", playerId: negotiatingClientId, offer: { ...offer } });
      return;
    }
    worker.postMessage({ type: "ACCEPT_TRANSFER", offer: { ...offer } });
  }

  function toggleChampionshipSeries() {
    worker.postMessage({ type: "TOGGLE_CHAMPIONSHIP_SERIES", enable: !championshipSeries, clubId: playerClubId });
  }

  function voteFormatProposal(proposalId: number, choice: "for" | "against" | "abstain") {
    worker.postMessage({ type: "VOTE_FORMAT_PROPOSAL", proposalId, choice, clubId: playerClubId });
  }

  function saveGame() {
    if (saveStatus === "saving") return;
    saveStatus = "saving";
    worker.postMessage({ type: "SAVE_GAME" });
  }

  async function continueGame(slot = activeSlot) {
    activeSlot = slot;
    const payload = await readSave(slot);
    if (!payload) return;
    worker.postMessage({ type: "LOAD_GAME", payload });
  }

  async function deleteAndReset(slot: number) {
    await deleteSlot(slot);
    clearMeta(slot);
    allMeta = loadAllMeta();
  }
</script>

<main>
  {#if screen === "loading"}
    <p class="center">Memuat engine…</p>

  {:else if screen === "error"}
    <p class="center error">Engine gagal dimuat. Lihat console.</p>

  {:else if screen === "title"}
    <div class="title-screen">
      <h1>⚽ Football Life Simulator</h1>
      <p class="tagline">Karir. Drama. Warisan.</p>

      <!-- Save slots -->
      <div class="slot-grid">
        {#each Array.from({ length: MAX_SLOTS }, (_, i) => i) as i}
          {@const meta = allMeta[i]}
          <div class="slot-card" class:active-slot={activeSlot === i}>
            <div class="slot-header">
              <span class="slot-label">Slot {i + 1}</span>
              {#if meta}<button class="slot-delete" onclick={() => deleteAndReset(i)} title="Hapus">✕</button>{/if}
            </div>
            {#if meta}
              <p class="slot-name">{meta.playerName}</p>
              <p class="slot-detail">{meta.clubName} · Musim {meta.season} · {meta.mode ?? "player"}</p>
              <p class="slot-date">{new Date(meta.savedAt).toLocaleDateString("id-ID")}</p>
              <button class="btn-primary slot-continue" onclick={() => continueGame(i)}>▶ Lanjut</button>
            {:else}
              <p class="slot-empty">— Kosong —</p>
              <div class="slot-newgame">
                <button onclick={() => openNewGame("player", i)}>🧑 Pemain</button>
                <button onclick={() => openNewGame("manager", i)}>🎯 Manajer</button>
                <button onclick={() => openNewGame("agent", i)}>🕵️ Agen</button>
                <button onclick={() => openNewGame("owner", i)}>👑 Pemilik</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

  {:else if screen === "new_game" && clubs.length > 0}
    <NewGame {clubs} {leagues} mode={gameMode === "pundit" ? "player" : gameMode} onstart={startCareer} />

  {:else if screen === "new_game"}
    <p class="center">Membuat dunia…</p>

  {:else if screen === "career" && world}
    {#if watchedSteps && watchedSteps.length > 0}
      <MatchWheel
        steps={watchedSteps}
        homeName={watchedHomeName}
        awayName={watchedAwayName}
        canIntervene={gameMode === "manager"}
        userClubName={clubName}
        onfinish={handleWatchedMatchFinish}
        onclose={() => (watchedSteps = null)}
      />
    {:else}
      {#if activeLegalCase}
        <LegalModal legalCase={activeLegalCase} onresolve={resolveLegal} />
      {:else if activeEvent}
        <EventModal event={activeEvent} onchoose={chooseEvent} />
      {/if}
      {#if retirementOptions}
        <RetirementModal
          options={retirementOptions}
          onchoose={chooseRetirement}
          onclose={() => (retirementOptions = null)}
        />
      {/if}
      {#if gameMode === "manager"}
        {#if managerTransferOpen}
          <ManagerTransferModal
            {squad}
            {freeAgents}
            {transferTargets}
            clubCash={managerConfig?.club_cash ?? 0}
            clubId={playerClubId}
            onclose={() => (managerTransferOpen = false)}
            onsign={managerSign}
            onbuy={managerBuy}
            onrelease={managerRelease}
          />
        {/if}
        <ManagerLoop
          {world}
          managerName={playerName}
          managerClubId={playerClubId}
          {clubName}
          standings={standings2.some((r) => r.club_id === playerClubId) ? standings2 : standings}
          {upcoming}
          {squad}
          {managerConfig}
          lastSummary={lastEventSummary}
          hasActiveEvent={activeEvent !== null || activeLegalCase !== null}
          playerMatch={playerMatch}
          {championshipSeries}
          onadvance={advance}
          onopentransfers={openManagerTransfers}
          ontoggleformat={toggleChampionshipSeries}
          onsettactics={managerSetTactics}
          ontogglestarter={managerToggleStarter}
          onupgradestaff={managerUpgradeStaff}
        />
      {:else if gameMode === "agent" && agentState}
        {#if transferOffers && transferOffers.length > 0}
          <TransferModal
            offers={transferOffers}
            currentClubId={negotiatingClientClubId}
            onaccept={acceptTransfer}
            onclose={() => {
              transferOffers = null;
              negotiatingClientId = null;
            }}
          />
        {/if}
        <AgentLoop
          {world}
          {agentState}
          clients={agentClients}
          {scoutList}
          lastSummary={lastEventSummary}
          {championshipSeries}
          onadvance={() => advance(false)}
          onupgradeoffice={agentUpgradeOffice}
          onrecruitclient={agentRecruit}
          onreleaseclient={agentRelease}
          onplantrumor={agentPlantRumor}
          onnegotiateclient={agentOpenDeal}
          ontoggleformat={toggleChampionshipSeries}
        />
      {:else if gameMode === "owner" && ownerState}
        <OwnerLoop
          {world}
          {ownerState}
          {clubMarket}
          standings={standings2.some((r) => r.club_id === playerClubId) ? standings2 : standings}
          {upcoming}
          lastSummary={lastEventSummary}
          hasActiveEvent={activeEvent !== null || activeLegalCase !== null}
          playerMatch={playerMatch}
          {championshipSeries}
          onadvance={advance}
          onloan={ownerLoan}
          onloanshark={ownerLoanShark}
          onrepay={ownerRepay}
          oninject={ownerInject}
          ondividend={ownerDividend}
          onupgrade={ownerUpgrade}
          onsponsor={ownerSponsor}
          onsellclub={ownerSellClub}
          onbuyclub={ownerBuyClub}
          ontoggleformat={toggleChampionshipSeries}
        />
      {:else if gameMode === "pundit" && punditState}
        <PunditLoop
          {world}
          {punditState}
          lastSummary={lastEventSummary}
          onadvance={() => advance(false)}
          onaction={punditAction}
        />
      {:else}
        {#if transferOffers && transferOffers.length > 0}
          <TransferModal
            offers={transferOffers}
            currentClubId={playerClubId}
            onaccept={acceptTransfer}
            onclose={() => (transferOffers = null)}
          />
        {/if}
        <CareerLoop
          {world}
          {egoPlayer}
          {egoSuspended}
          hasActiveEvent={activeEvent !== null}
          {lastEventSummary}
          {playerName}
          {playerPosition}
          {playerClubId}
          playerLeagueId={clubs.find((c) => c[0] === playerClubId)?.[3] ?? (playerClubId >= 103 && playerClubId <= 110 ? 11 : 1)}
          {clubName}
          {playerMatch}
          {upcoming}
          {championshipSeries}
          {tarkanLeagues}
          {tarkanStandings}
          {tarkanFixtures}
          {tarkanMsg}
          {cupRounds}
          {afcRounds}
          {afcGroupStandings}
          {u21Standings}
          {timnasInfo}
          {timnasMsg}
          onadvance={advance}
          ongetcupbracket={getCupBracket}
          ongetafcbracket={getAFCBracket}
          ongetu21standings={getU21Standings}
          ontimnasgetinfo={timnasGetInfo}
          ontimnasplaymatch={timnasPlayMatch}
          onnaturalize={doNaturalize}
          onopentransfers={openTransfers}
          ontoggleformat={toggleChampionshipSeries}
          onplaytarkam={playTarkam}
          ontransitionchild={transitionChild}
          onopenretirement={openRetirementModal}
          ontarkangetleagues={tarkanGetLeagues}
          ontarkanenroll={tarkanEnroll}
          ontarkanunenroll={tarkanUnenroll}
          ontarkanplaymatch={tarkanPlayMatch}
        />
      {/if}
      <div class="save-bar">
        <button onclick={saveGame} disabled={saveStatus === "saving"} class="btn-save">
          {saveStatus === "saving" ? "Menyimpan…" : saveStatus === "saved" ? "✓ Tersimpan" : "💾 Simpan"}
        </button>
      </div>
      {#if gameMode === "player"}
        <StatsBoard {leaders} {careerHistory} egoId={egoPlayer?.id ?? 0} {egoPlayer} />
      {:else}
        <StatsBoard {leaders} careerHistory={[]} egoId={0} />
      {/if}
      <LeagueTable
        {standings}
        {standings2}
        {standings3}
        {allStandings}
        {playerClubId}
        {championshipSeries}
        {formatProposal}
        onproposeformat={toggleChampionshipSeries}
        onvoteformat={voteFormatProposal}
      />
    {/if}
  {/if}
</main>

<style>
  :global(:root) {
    --bg:       #080c11;
    --surface:  #0f1620;
    --surface2: #172030;
    --border:   #1e2d3d;
    --border2:  #2a3f55;
    --green:    #22c55e;
    --green-bg: rgba(34,197,94,0.08);
    --green-hi: rgba(34,197,94,0.18);
    --amber:    #f59e0b;
    --blue:     #60a5fa;
    --red:      #f87171;
    --purple:   #a78bfa;
    --text:     #e2e8f0;
    --text2:    #8fa3b8;
    --text3:    #3d5470;
    --radius:   3px;
  }

  :global(body) {
    background: var(--bg);
    color: var(--text);
    margin: 0;
  }

  :global(*) { box-sizing: border-box; }

  main {
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace;
    max-width: 860px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
    min-height: 100vh;
  }

  .center {
    text-align: center;
    color: var(--text2);
    margin-top: 5rem;
    font-size: 0.9rem;
  }
  .error { color: var(--red); }

  .title-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    margin-top: 6rem;
  }
  .title-screen h1 {
    font-size: 2.2rem;
    margin: 0;
    color: var(--text);
    letter-spacing: -0.5px;
  }
  .title-screen .tagline {
    color: var(--text2);
    font-size: 0.95rem;
    margin: 0;
    letter-spacing: 0.05em;
  }
  .title-screen button {
    padding: 0.75rem 2.5rem;
    background: var(--green);
    color: #000;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 1rem;
    font-weight: bold;
    border-radius: var(--radius);
    letter-spacing: 0.03em;
    transition: opacity 0.15s;
  }
  .title-screen button:hover { opacity: 0.88; }
  .btn-primary {
    padding: 0.75rem 2.5rem;
    background: var(--green);
    color: #000;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 1rem;
    font-weight: bold;
    border-radius: var(--radius);
    letter-spacing: 0.03em;
    transition: opacity 0.15s;
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.35; cursor: default; }
  /* ── Save slots ── */
  .slot-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1.5rem; max-width: 700px; width: 100%; }
  .slot-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem; min-height: 160px; }
  .slot-card.active-slot { border-color: var(--accent); }
  .slot-header { display: flex; justify-content: space-between; align-items: center; }
  .slot-label { font-size: 0.75rem; color: var(--text3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .slot-delete { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 0.85rem; padding: 0.1rem 0.3rem; }
  .slot-delete:hover { color: var(--red, #ef4444); }
  .slot-name { font-size: 1rem; font-weight: 700; color: var(--text); }
  .slot-detail { font-size: 0.78rem; color: var(--text2); }
  .slot-date { font-size: 0.72rem; color: var(--text3); }
  .slot-continue { padding: 0.4rem 0.8rem; font-size: 0.83rem; margin-top: 0.25rem; }
  .slot-empty { color: var(--text3); font-size: 0.82rem; flex: 1; display: flex; align-items: center; justify-content: center; }
  .slot-newgame { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; margin-top: 0.25rem; }
  .slot-newgame button { background: none; border: 1px solid var(--border2); border-radius: 5px; color: var(--text2); cursor: pointer; padding: 0.3rem 0.4rem; font-size: 0.76rem; text-align: left; }
  .slot-newgame button:hover { background: var(--surface2); color: var(--text); }

  .save-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
  }
  .btn-save {
    padding: 0.35rem 1rem;
    background: transparent;
    color: var(--text2);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8rem;
    border-radius: var(--radius);
    transition: color 0.15s, border-color 0.15s;
  }
  .btn-save:hover:not(:disabled) { color: var(--green); border-color: var(--green); }
  .btn-save:disabled { opacity: 0.6; cursor: default; }
</style>
