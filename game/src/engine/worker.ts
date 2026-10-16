import { initDB, getDB } from "./db.js";
import { fullSim } from "./match.js";
import { recalcPACA } from "./pa.js";
import { createWorld, advanceDay } from "./world.js";
import { generateWorld } from "./worldgen.js";
import { nextEventDay, processMatchDay, getUpcoming } from "./scheduler.js";

type WorkerMessage =
  | { type: "INIT" }
  | { type: "NEW_GAME"; mode: string; characterId: number; startAge: number; seed?: number }
  | { type: "ADVANCE_TO_NEXT_EVENT"; playerClubId: number }
  | { type: "GET_UPCOMING"; playerClubId: number; count?: number }
  | { type: "SIM_MATCH"; payload: Parameters<typeof fullSim>[0] }
  | { type: "RECALC_PA"; playerId: number; totalMatches: number; trainingQuality: number };

let worldState = createWorld("player", 0, 15);

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
      worldState = createWorld(msg.mode as import("../types/index.js").GameMode, msg.characterId, msg.startAge);
      const db = getDB();
      const clubs = db.exec("SELECT id,name,reputation FROM clubs ORDER BY reputation DESC")[0]?.values ?? [];
      self.postMessage({ type: "WORLD_STATE", state: worldState, clubs });
      break;
    }

    case "ADVANCE_TO_NEXT_EVENT": {
      const next = nextEventDay(worldState.current_day);
      if (next == null) {
        // Season over — nothing left
        self.postMessage({ type: "EVENT_RESULT", world: worldState, event_type: "season_end", match_results: [] });
        break;
      }

      // Advance world clock to next event day
      const delta = next - worldState.current_day;
      for (let i = 0; i < delta; i++) worldState = advanceDay(worldState);

      // Process all matches on that day
      const matchResults = processMatchDay(next);

      // Upcoming for player's club (next 5 after today)
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day);

      // Player's own match this day (if any)
      const playerMatch =
        matchResults.find((r) => r.home_club === msg.playerClubId || r.away_club === msg.playerClubId) ?? null;

      self.postMessage({
        type: "EVENT_RESULT",
        world: worldState,
        event_type: matchResults.length > 0 ? "match" : "idle",
        match_results: matchResults,
        player_match: playerMatch,
        upcoming,
      });
      break;
    }

    case "GET_UPCOMING": {
      const upcoming = getUpcoming(msg.playerClubId, worldState.current_day, msg.count ?? 5);
      self.postMessage({ type: "UPCOMING", upcoming });
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

    default:
      self.postMessage({ type: "ERROR", message: "Unknown message type" });
  }
};

export {};
