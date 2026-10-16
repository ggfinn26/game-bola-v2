<script lang="ts">
  import { onMount } from "svelte";
  import type { WorldState, Position, MatchResult } from "./types/index.js";
  import type { UpcomingFixture } from "./engine/scheduler.js";
  import NewGame from "./ui/routes/NewGame.svelte";
  import CareerLoop from "./ui/routes/CareerLoop.svelte";

  type Screen = "loading" | "error" | "title" | "new_game" | "career";

  let screen = $state<Screen>("loading");
  let world = $state<WorldState | null>(null);
  let clubs = $state<[number, string, number][]>([]);

  let playerName = $state("");
  let playerPosition = $state<Position>("ST");
  let playerClubId = $state(0);
  let clubName = $state("");
  let playerMatch = $state<MatchResult | null>(null);
  let upcoming = $state<UpcomingFixture[]>([]);

  let worker: Worker;

  onMount(() => {
    worker = new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "READY") {
        screen = "title";
      } else if (msg.type === "WORLD_STATE") {
        world = msg.state;
        if (msg.clubs) clubs = msg.clubs;
        // After NEW_GAME, stay on new_game screen until player picks character
      } else if (msg.type === "EVENT_RESULT") {
        world = msg.world;
        playerMatch = msg.player_match ?? null;
        upcoming = msg.upcoming ?? [];
      } else if (msg.type === "UPCOMING") {
        upcoming = msg.upcoming ?? [];
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

  function openNewGame() {
    worker.postMessage({ type: "NEW_GAME", mode: "player", characterId: 0, startAge: 17 });
    screen = "new_game";
  }

  function startCareer(p: { name: string; position: Position; age: number; clubId: number }) {
    playerName = p.name;
    playerPosition = p.position;
    playerClubId = p.clubId;
    const found = clubs.find((c) => c[0] === p.clubId);
    clubName = found?.[1] ?? "Free Agent";

    // Re-init world with player's age + club as character_id
    worker.postMessage({ type: "NEW_GAME", mode: "player", characterId: p.clubId, startAge: p.age });

    // Immediately fetch upcoming schedule
    worker.postMessage({ type: "GET_UPCOMING", playerClubId: p.clubId });

    screen = "career";
  }

  function advance() {
    worker.postMessage({ type: "ADVANCE_TO_NEXT_EVENT", playerClubId });
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
      <button onclick={openNewGame}>Mulai Game Baru</button>
    </div>

  {:else if screen === "new_game" && clubs.length > 0}
    <NewGame {clubs} onstart={startCareer} />

  {:else if screen === "new_game"}
    <p class="center">Membuat dunia…</p>

  {:else if screen === "career" && world}
    <CareerLoop
      {world}
      {playerName}
      {playerPosition}
      {playerClubId}
      {clubName}
      {playerMatch}
      {upcoming}
      onadvance={advance}
    />
  {/if}
</main>

<style>
  main {
    font-family: monospace;
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
    color: #eee;
  }
  .center { text-align: center; color: #888; margin-top: 4rem; }
  .error { color: #e44; }
  .title-screen { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-top: 4rem; }
  h1 { font-size: 2rem; margin: 0; }
  .tagline { color: #888; font-size: 1rem; margin: 0; }
  button {
    padding: 0.7rem 2rem; background: #2a6; color: #fff;
    border: none; cursor: pointer; font-family: monospace; font-size: 1.1rem;
  }
  button:hover { background: #3b7; }
</style>
