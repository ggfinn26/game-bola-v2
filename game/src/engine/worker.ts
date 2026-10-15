import { initDB } from "./db.js";
import { fullSim } from "./match.js";
import { recalcPACA } from "./pa.js";
import { createWorld, advanceDay } from "./world.js";

type WorkerMessage =
  | { type: "INIT" }
  | { type: "NEW_GAME"; mode: string; characterId: number; startAge: number }
  | { type: "ADVANCE_DAY"; days: number }
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
      worldState = createWorld(msg.mode as import("../types/index.js").GameMode, msg.characterId, msg.startAge);
      self.postMessage({ type: "WORLD_STATE", state: worldState });
      break;
    }

    case "ADVANCE_DAY": {
      for (let i = 0; i < (msg.days ?? 1); i++) {
        worldState = advanceDay(worldState);
      }
      self.postMessage({ type: "WORLD_STATE", state: worldState });
      break;
    }

    case "SIM_MATCH": {
      const result = fullSim(msg.payload);
      self.postMessage({ type: "MATCH_RESULT", result });
      break;
    }

    case "RECALC_PA": {
      // Placeholder — real impl queries DB for player
      self.postMessage({ type: "PA_DONE", playerId: msg.playerId });
      break;
    }

    default:
      self.postMessage({ type: "ERROR", message: "Unknown message type" });
  }
};

export {};
