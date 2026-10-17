<script lang="ts">
  import { onMount } from "svelte";
  import type { WorldState, Position, MatchResult, Player, GameEvent } from "./types/index.js";
  import type { UpcomingFixture, StandingRow } from "./engine/scheduler.js";
  import type { MatchStep } from "./engine/match.js";
  import type { TransferOffer } from "./engine/transfers.js";
  import type { LeagueLeaders, CareerSeasonRow } from "./engine/awards.js";
  import { persistSave, readSave, saveMeta, loadMeta, clearMeta } from "./engine/savegame.js";
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
  import TransferModal from "./ui/components/TransferModal.svelte";
  import ManagerTransferModal from "./ui/components/ManagerTransferModal.svelte";
  import type { AgentState, ClientPlayer } from "./engine/agent.js";
  import type { OwnerState, SlotMarketRow } from "./engine/owner.js";
  import GameWorker from "./engine/worker.ts?worker";

  type Screen = "loading" | "error" | "title" | "new_game" | "career";
  type GameMode = "player" | "manager" | "agent" | "owner";

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

  let egoPlayer = $state<Player | null>(null);
  let egoSuspended = $state(0);
  let activeEvent = $state<GameEvent | null>(null);
  let transferOffers = $state<TransferOffer[] | null>(null);
  let lastEventSummary = $state<string | null>(null);
  let playerMatch = $state<MatchResult | null>(null);
  let watchedSteps = $state<MatchStep[] | null>(null);
  let watchedHomeName = $state("");
  let watchedAwayName = $state("");
  let upcoming = $state<UpcomingFixture[]>([]);
  let standings = $state<StandingRow[]>([]);
  let leaders = $state<LeagueLeaders>({ topScorers: [], topAssists: [], topRated: [] });
  let careerHistory = $state<CareerSeasonRow[]>([]);
  let championshipSeries = $state(false);
  let saveMeta_ = $state<SaveMeta | null>(loadMeta());
  let saveStatus = $state<"idle" | "saving" | "saved">("idle");

  let worker: Worker;

  onMount(() => {
    worker = new GameWorker();

    worker.onmessage = (e) => {
      const msg = e.data;
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
        upcoming = msg.upcoming ?? [];
        squad = msg.squad ?? [];
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
        if (msg.leaders) leaders = msg.leaders;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        lastEventSummary = null;
        screen = "career";
      } else if (msg.type === "AGENT_UPDATED") {
        if (msg.agent_state !== undefined) agentState = msg.agent_state;
        if (msg.agent_clients !== undefined) agentClients = msg.agent_clients;
        if (msg.scout_list !== undefined) scoutList = msg.scout_list;
        if (msg.standings) standings = msg.standings;
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
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "FREE_AGENTS") {
        freeAgents = msg.agents ?? [];
      } else if (msg.type === "SQUAD") {
        squad = msg.squad ?? [];
      } else if (msg.type === "MANAGER_TRANSFER_DONE") {
        squad = msg.squad ?? [];
        freeAgents = msg.free_agents ?? [];
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
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
      } else if (msg.type === "EVENT_RESULT") {
        world = msg.world;
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.ego_suspended_matches !== undefined) egoSuspended = msg.ego_suspended_matches;
        activeEvent = msg.triggered_event ?? null;
        if (msg.transfer_offers) transferOffers = msg.transfer_offers;
        lastEventSummary = msg.season_summary ?? null;
        playerMatch = msg.player_match ?? null;
        watchedSteps = msg.watched_steps ?? null;
        watchedHomeName = msg.watched_home_name ?? "";
        watchedAwayName = msg.watched_away_name ?? "";
        upcoming = msg.upcoming ?? [];
        standings = msg.standings ?? standings;
        if (msg.squad) squad = msg.squad;
        if (msg.agent_state !== undefined) agentState = msg.agent_state;
        if (msg.agent_clients !== undefined) agentClients = msg.agent_clients;
        if (msg.scout_list !== undefined) scoutList = msg.scout_list;
        if (msg.owner_state !== undefined) ownerState = msg.owner_state;
        if (msg.club_market !== undefined) clubMarket = msg.club_market;
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
      } else if (msg.type === "EVENT_CHOICE_APPLIED") {
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        lastEventSummary = msg.summary ?? null;
        activeEvent = null;
      } else if (msg.type === "TRANSFER_OFFERS") {
        transferOffers = msg.offers ?? [];
      } else if (msg.type === "TRANSFER_ACCEPTED") {
        if (msg.ego_player !== undefined) egoPlayer = msg.ego_player;
        if (msg.club_id !== undefined) playerClubId = msg.club_id;
        if (msg.club_name !== undefined) clubName = msg.club_name;
        if (msg.upcoming) upcoming = msg.upcoming;
        if (msg.standings) standings = msg.standings;
        lastEventSummary = msg.summary ?? null;
        transferOffers = null;
      } else if (msg.type === "FORMAT_UPDATED") {
        championshipSeries = msg.championship_series ?? false;
        lastEventSummary = msg.summary ?? null;
      } else if (msg.type === "STANDINGS") {
        standings = msg.standings ?? [];
      } else if (msg.type === "UPCOMING") {
        upcoming = msg.upcoming ?? [];
      } else if (msg.type === "SAVE_DATA") {
        const meta: SaveMeta = {
          playerName,
          clubName,
          season: world?.season ?? 1,
          currentDay: world?.current_day ?? 0,
          savedAt: Date.now(),
        };
        persistSave(msg.payload).then(() => {
          saveMeta(meta);
          saveMeta_ = meta;
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
        if (msg.squad) squad = msg.squad;
        if (msg.leaders) leaders = msg.leaders;
        if (msg.career_history) careerHistory = msg.career_history;
        if (msg.championship_series !== undefined) championshipSeries = msg.championship_series;
        screen = "career";
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

  function openNewGame(mode: GameMode = "player") {
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
    worker.postMessage({ type: "GET_FREE_AGENTS" });
    managerTransferOpen = true;
  }

  function managerSign(playerId: number) {
    worker.postMessage({ type: "MANAGER_SIGN", playerId, clubId: playerClubId });
  }

  function managerRelease(playerId: number) {
    worker.postMessage({ type: "MANAGER_RELEASE", playerId });
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

  function openTransfers() {
    worker.postMessage({ type: "OPEN_TRANSFERS" });
  }

  function acceptTransfer(offer: TransferOffer) {
    if (gameMode === "agent" && negotiatingClientId !== null) {
      worker.postMessage({ type: "AGENT_ACCEPT_DEAL", playerId: negotiatingClientId, offer: { ...offer } });
      return;
    }
    worker.postMessage({ type: "ACCEPT_TRANSFER", offer: { ...offer } });
  }

  function toggleChampionshipSeries() {
    worker.postMessage({ type: "TOGGLE_CHAMPIONSHIP_SERIES", enable: !championshipSeries });
  }

  function saveGame() {
    if (saveStatus === "saving") return;
    saveStatus = "saving";
    worker.postMessage({ type: "SAVE_GAME" });
  }

  async function continueGame() {
    const payload = await readSave();
    if (!payload) return;
    worker.postMessage({ type: "LOAD_GAME", payload });
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
      <div class="title-buttons">
        <button onclick={continueGame} class="btn-primary" disabled={!saveMeta_}>
          Lanjut Game
        </button>
        {#if saveMeta_}
          <div class="save-info">
            <span class="save-label">{saveMeta_.playerName} · Musim {saveMeta_.season}</span>
            <span class="save-date">{new Date(saveMeta_.savedAt).toLocaleDateString("id-ID")}</span>
          </div>
        {:else}
          <span class="save-empty">Belum ada save</span>
        {/if}
        <div class="mode-select">
          <button onclick={() => openNewGame("player")} class="btn-secondary">🧑 Mode Pemain</button>
          <button onclick={() => openNewGame("manager")} class="btn-secondary">🎯 Mode Manajer</button>
          <button onclick={() => openNewGame("agent")} class="btn-secondary">🕵️ Mode Agen</button>
          <button onclick={() => openNewGame("owner")} class="btn-secondary">👑 Mode Pemilik</button>
        </div>
      </div>
    </div>

  {:else if screen === "new_game" && clubs.length > 0}
    <NewGame {clubs} {leagues} mode={gameMode} onstart={startCareer} />

  {:else if screen === "new_game"}
    <p class="center">Membuat dunia…</p>

  {:else if screen === "career" && world}
    {#if watchedSteps && watchedSteps.length > 0}
      <MatchWheel
        steps={watchedSteps}
        homeName={watchedHomeName}
        awayName={watchedAwayName}
        onclose={() => (watchedSteps = null)}
      />
    {:else}
      {#if activeEvent}
        <EventModal event={activeEvent} onchoose={chooseEvent} />
      {/if}
      {#if gameMode === "manager"}
        {#if managerTransferOpen}
          <ManagerTransferModal
            {squad}
            {freeAgents}
            clubId={playerClubId}
            onclose={() => (managerTransferOpen = false)}
            onsign={managerSign}
            onrelease={managerRelease}
          />
        {/if}
        <ManagerLoop
          {world}
          managerName={playerName}
          managerClubId={playerClubId}
          {clubName}
          {standings}
          {upcoming}
          {squad}
          lastSummary={lastEventSummary}
          hasActiveEvent={activeEvent !== null}
          playerMatch={playerMatch}
          {championshipSeries}
          onadvance={advance}
          onopentransfers={openManagerTransfers}
          ontoggleformat={toggleChampionshipSeries}
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
          {standings}
          {upcoming}
          lastSummary={lastEventSummary}
          hasActiveEvent={activeEvent !== null}
          playerMatch={playerMatch}
          {championshipSeries}
          onadvance={advance}
          onloan={ownerLoan}
          onrepay={ownerRepay}
          oninject={ownerInject}
          ondividend={ownerDividend}
          onupgrade={ownerUpgrade}
          onsponsor={ownerSponsor}
          onsellclub={ownerSellClub}
          onbuyclub={ownerBuyClub}
          ontoggleformat={toggleChampionshipSeries}
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
          {clubName}
          {playerMatch}
          {upcoming}
          {championshipSeries}
          onadvance={advance}
          onopentransfers={openTransfers}
          ontoggleformat={toggleChampionshipSeries}
        />
      {/if}
      <div class="save-bar">
        <button onclick={saveGame} disabled={saveStatus === "saving"} class="btn-save">
          {saveStatus === "saving" ? "Menyimpan…" : saveStatus === "saved" ? "✓ Tersimpan" : "💾 Simpan"}
        </button>
      </div>
      {#if gameMode === "player"}
        <StatsBoard {leaders} {careerHistory} egoId={egoPlayer?.id ?? 0} />
      {:else}
        <StatsBoard {leaders} careerHistory={[]} egoId={0} />
      {/if}
      <LeagueTable {standings} {playerClubId} />
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
  .btn-secondary {
    padding: 0.6rem 1.8rem;
    background: transparent;
    color: var(--text2);
    border: 1px solid var(--border2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9rem;
    border-radius: var(--radius);
    transition: color 0.15s, border-color 0.15s;
  }
  .btn-secondary:hover { color: var(--text); border-color: var(--text2); }
  .title-buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 340px;
  }
  .title-buttons .btn-primary,
  .title-buttons .btn-secondary { width: 100%; }
  .mode-select {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    width: 100%;
  }
  .mode-select .btn-secondary { padding: 0.6rem 0.75rem; font-size: 0.82rem; }
  .save-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    color: var(--text2);
    font-size: 0.85rem;
  }
  .save-label { color: var(--text); }
  .save-date { font-size: 0.78rem; }
  .save-empty { color: var(--text3); font-size: 0.8rem; }
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
