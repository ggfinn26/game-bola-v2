<script lang="ts">
  import type { MatchWeights, WheelSlice, TacticalMentality } from "../../engine/match.js";
  import { COMMENTARY_POOL } from "../../engine/match.js";

  interface Props {
    weights: MatchWeights;
    canIntervene?: boolean;
    userClubName?: string;
    onfinish?: (finalHomeGoals: number, finalAwayGoals: number) => void;
    onclose: () => void;
  }

  let { weights, canIntervene = false, userClubName = "", onfinish, onclose }: Props = $props();

  // ── Phase state machine ────────────────────────────────────────────────────
  type Phase = "team" | "event" | "card" | "penalty" | "result";

  let attackIdx    = $state(0);
  let phase        = $state<Phase>("team");
  let spinning     = $state(false);
  let spinResult   = $state<string | null>(null); // current wheel's chosen key
  let spinCount    = $state(0);

  // Live-rolled attack state
  let isHomeAttacking = $state(false);
  let outcomeKey      = $state("");
  let outcomeLabel    = $state("");
  let isGoal          = $state(false);
  let homeGoals       = $state(0);
  let awayGoals       = $state(0);
  let lastCommentary  = $state("");

  // Accumulated commentary log
  let log = $state<{ minute: number; text: string; goal: boolean }[]>([]);

  // Manager controls
  let liveMentality = $state<TacticalMentality>("balanced");
  let subsLeft      = $state(3);
  // ponytail: unlimited re-spins — no paywall, this is a personal game

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalAttacks = $derived(weights.minutes.length);
  const isFinished   = $derived(attackIdx >= totalAttacks);
  const currentMinute = $derived(weights.minutes[attackIdx] ?? 90);
  const isUserHome    = $derived(userClubName === weights.homeName);

  // Active wheel slices for current phase
  const activeSlices = $derived.by((): WheelSlice[] => {
    if (phase === "team") return [...weights.teamSlices];
    if (phase === "event") {
      const base = isHomeAttacking ? [...weights.eventSlicesHome] : [...weights.eventSlicesAway];
      return applyMentality(base, isHomeAttacking === isUserHome);
    }
    if (phase === "card") return [...weights.cardSlices];
    if (phase === "penalty") return [...weights.penaltySlices];
    return [];
  });

  function applyMentality(slices: WheelSlice[], isUserAtt: boolean): WheelSlice[] {
    if (liveMentality === "balanced") return slices;
    return slices.map((s) => {
      let w = s.weight;
      if (isUserAtt && liveMentality === "attacking" && s.key === "GOAL")   w = Math.round(w * 1.30);
      if (isUserAtt && liveMentality === "defensive" && s.key === "GOAL")   w = Math.round(w * 0.75);
      if (!isUserAtt && liveMentality === "defensive" && (s.key === "DEFENSE" || s.key === "SAVE")) w = Math.round(w * 1.35);
      return { ...s, weight: Math.max(1, w) };
    });
  }

  // Wheel visual gradient
  function buildGradient(slices: WheelSlice[]): string {
    const total = slices.reduce((s, x) => s + x.weight, 0) || 100;
    let acc = 0;
    return "conic-gradient(" +
      slices.map((s) => {
        const start = (acc / total) * 360;
        acc += s.weight;
        const end = (acc / total) * 360;
        return `${s.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
      }).join(", ") + ")";
  }

  // Chosen index (set when spin lands)
  let chosenIdx = $state(0);

  const wheelRotation = $derived.by((): number => {
    const slices = activeSlices;
    if (!slices.length) return spinCount * 1080; // 3 full turns per spin visually
    const safeIdx = Math.min(chosenIdx, slices.length - 1);
    const total = slices.reduce((s, x) => s + x.weight, 0) || 100;
    let before = 0;
    for (let i = 0; i < safeIdx; i++) before += (slices[i]?.weight ?? 0);
    const mid = before + (slices[safeIdx]?.weight ?? 0) / 2;
    return spinCount * 1080 + (360 - (mid / total) * 360);
  });

  // ── Random spin ───────────────────────────────────────────────────────────
  function rollWheel(slices: WheelSlice[]): number {
    const total = slices.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < slices.length; i++) {
      r -= slices[i].weight;
      if (r <= 0) return i;
    }
    return 0;
  }

  // ── Commentary ─────────────────────────────────────────────────────────────
  const lastPool: Partial<Record<string, number>> = {};
  function pickComment(pool: readonly string[], key: string, replacements: Record<string, string> = {}): string {
    const prev = lastPool[key] ?? -1;
    let idx = Math.floor(Math.random() * (pool.length - (prev >= 0 ? 1 : 0)));
    if (prev >= 0 && idx >= prev) idx++;
    lastPool[key] = idx;
    let t = pool[idx] || pool[0];
    for (const [k, v] of Object.entries(replacements)) t = t.replace(k, v);
    return t;
  }

  const attName = $derived(isHomeAttacking ? weights.homeName : weights.awayName);
  const defName = $derived(isHomeAttacking ? weights.awayName : weights.homeName);

  // ── Spin engine ───────────────────────────────────────────────────────────
  // pendingResult: wheel has stopped but user hasn't confirmed yet → can re-spin
  let pendingResult = $state<string | null>(null);
  const SPIN_DURATION = 1600; // ms — ~3 full turns visible

  function doSpin(slices: WheelSlice[]) {
    if (spinning || !slices.length) return;
    chosenIdx = rollWheel(slices);
    pendingResult = slices[chosenIdx]?.key ?? slices[0].key;
    spinResult = pendingResult;
    spinCount += 1;
    spinning = true;
    setTimeout(() => {
      spinning = false;
      // Do NOT auto-resolve — wait for user to press Confirm
    }, SPIN_DURATION);
  }

  function spin() {
    if (spinning || isFinished || pendingResult !== null) return;
    if (phase === "result") {
      // Re-open previous event to re-spin
      phase = "event";
      pendingResult = null;
    }
    doSpin(activeSlices);
  }

  function reSpin() {
    // Unlimited: re-roll the current phase wheel without advancing
    if (spinning) return;
    pendingResult = null;
    // If in result phase, go back to event phase and re-spin
    if (phase === "result") {
      phase = "event";
    }
    doSpin(activeSlices);
  }

  function confirmSpin() {
    if (spinning || pendingResult === null) return;
    const key = pendingResult;
    pendingResult = null;
    resolvePhase(key);
  }

  function resolvePhase(key: string) {
    if (phase === "team") {
      isHomeAttacking = key === "HOME";
      // Auto-advance to event wheel
      phase = "event";
    } else if (phase === "event") {
      outcomeKey = key;
      outcomeLabel = activeSlices.find((s) => s.key === key)?.label ?? key;
      if (key === "FOUL") {
        phase = "card";
      } else if (key === "PENALTY") {
        phase = "penalty";
      } else {
        resolveOutcome(key, false);
        phase = "result";
      }
    } else if (phase === "card") {
      // Resolve foul + card
      const cardKey = key;
      let commentary = "";
      if (cardKey === "YELLOW") {
        commentary = pickComment(COMMENTARY_POOL.yellow_card, "yc", { "{team}": defName });
      } else if (cardKey === "SECOND_YELLOW" || cardKey === "RED") {
        commentary = pickComment(COMMENTARY_POOL.red_card, "rc", { "{team}": defName });
      } else {
        commentary = pickComment(COMMENTARY_POOL.foul, "foul", { "{team}": attName });
      }
      isGoal = false;
      lastCommentary = commentary;
      log = [{ minute: currentMinute, text: commentary, goal: false }, ...log];
      phase = "result";
    } else if (phase === "penalty") {
      const scored = key === "GOAL";
      if (scored) {
        if (isHomeAttacking) homeGoals++;
        else awayGoals++;
        isGoal = true;
        lastCommentary = `PENALTI! ` + pickComment(COMMENTARY_POOL.goal, "pen_goal", { "{scorer}": "Pemain", "{team}": attName, "{assist}": "" }) + ` Skor ${homeGoals}–${awayGoals}.`;
      } else {
        isGoal = false;
        lastCommentary = `PENALTI GAGAL! ` + pickComment(COMMENTARY_POOL.chance_saved, "pen_miss", { "{team}": attName });
      }
      log = [{ minute: currentMinute, text: lastCommentary, goal: isGoal }, ...log];
      phase = "result";
    }
  }

  function resolveOutcome(key: string, _isGoalOverride: boolean) {
    let comm = "";
    switch (key) {
      case "GOAL":
        isGoal = true;
        if (isHomeAttacking) homeGoals++;
        else awayGoals++;
        comm = pickComment(COMMENTARY_POOL.goal, "goal", { "{scorer}": "Pemain", "{team}": attName, "{assist}": "" }) + ` Skor ${homeGoals}–${awayGoals}.`;
        break;
      case "SAVE":
        isGoal = false;
        comm = pickComment(COMMENTARY_POOL.chance_saved, "save", { "{team}": attName });
        break;
      case "WOODWORK":
        isGoal = false;
        comm = pickComment(COMMENTARY_POOL.chance_missed, "wood", { "{team}": attName });
        break;
      case "CORNER":
      case "FREEKICK":
      case "OUT":
        isGoal = false;
        comm = pickComment(COMMENTARY_POOL.chance_missed, "miss", { "{team}": attName });
        break;
      case "COUNTER":
        isGoal = false;
        comm = pickComment(COMMENTARY_POOL.quiet, "cnt", { "{team}": defName });
        break;
      default:
        isGoal = false;
        comm = pickComment(COMMENTARY_POOL.tackle, "def", { "{team}": defName });
    }
    lastCommentary = comm;
    log = [{ minute: currentMinute, text: comm, goal: isGoal }, ...log];
  }

  // ── Next attack ───────────────────────────────────────────────────────────
  function nextAttack() {
    if (isFinished) return;
    attackIdx += 1;
    phase = "team";
    spinResult = null;
    outcomeKey = "";
    isGoal = false;
  }

  function skipToEnd() {
    // Roll remaining attacks instantly
    while (attackIdx < totalAttacks) {
      const isHome = Math.random() < (weights.teamSlices[0].weight / 100);
      const slices = isHome ? weights.eventSlicesHome : weights.eventSlicesAway;
      const idx = rollWheel(slices);
      const key = slices[idx].key;
      const attk = isHome ? weights.homeName : weights.awayName;
      if (key === "GOAL") {
        if (isHome) homeGoals++;
        else awayGoals++;
        log = [{ minute: weights.minutes[attackIdx], text: `${attk}: GOL! Skor ${homeGoals}–${awayGoals}.`, goal: true }, ...log];
      } else if (key === "PENALTY") {
        if (Math.random() < 0.78) {
          if (isHome) homeGoals++;
          else awayGoals++;
          log = [{ minute: weights.minutes[attackIdx], text: `${attk}: PENALTI MASUK! Skor ${homeGoals}–${awayGoals}.`, goal: true }, ...log];
        }
      } else if (key === "FOUL") {
        const r = Math.random();
        if (r < 0.03) log = [{ minute: weights.minutes[attackIdx], text: `Kartu Merah!`, goal: false }, ...log];
      }
      attackIdx += 1;
    }
    phase = "result";
    lastCommentary = `FT — Pertandingan selesai. Skor akhir ${homeGoals}–${awayGoals}.`;
  }

  function finishMatch() {
    if (onfinish) onfinish(homeGoals, awayGoals);
    onclose();
  }

  // ── Phase label ───────────────────────────────────────────────────────────
  const phaseLabel = $derived(
    phase === "team"    ? "TEAM WHEEL"    :
    phase === "event"   ? "EVENT WHEEL"   :
    phase === "card"    ? "CARD WHEEL"    :
    phase === "penalty" ? "PENALTY WHEEL" :
    isFinished          ? "FULL TIME"     : "RESULT"
  );
</script>

<div class="match-wheel">

  <!-- Scoreboard -->
  <header class="scoreboard">
    <div class="team-col home">
      <span class="team-name">{weights.homeName}</span>
    </div>
    <div class="score-col">
      <div class="score">{homeGoals} – {awayGoals}</div>
      <div class="minute">{isFinished ? "FT · 90'" : `${currentMinute}'`}</div>
    </div>
    <div class="team-col away">
      <span class="team-name">{weights.awayName}</span>
    </div>
  </header>

  <!-- Attack counter + phase label -->
  <div class="phase-bar">
    <span class="phase-label">{phaseLabel}</span>
    <span class="attack-count">{Math.min(attackIdx + 1, totalAttacks)}/{totalAttacks}</span>
  </div>

  {#if !isFinished || phase === "result"}
    <!-- Wheel -->
    <div class="wheel-area">
      <div class="wheel-wrap">
        <div class="pointer">▼</div>
        <div
          class="wheel-disc"
          class:spinning
          style="background:{buildGradient(activeSlices)}; transform:rotate({wheelRotation}deg)"
        >
          <div class="wheel-center">
            {#if phase === "team"}⚽
            {:else if phase === "event"}🎡
            {:else if phase === "card"}🟨
            {:else if phase === "penalty"}🥅
            {:else}—
            {/if}
          </div>
        </div>
      </div>

      <!-- Slice list -->
      <div class="slice-list">
        {#each activeSlices as s, idx}
          <div class="slice-row" class:picked={spinResult !== null && idx === chosenIdx && !spinning}>
            <span class="swatch" style="background:{s.color}"></span>
            <span class="s-label">{s.label}</span>
            <span class="s-pct">{s.weight}%</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Result banner (shown after event/card/penalty resolved) -->
    {#if phase === "result" && lastCommentary}
      <div class="result-banner" class:goal={isGoal}>
        <span class="r-min">{currentMinute}'</span>
        <span class="r-text">{lastCommentary}</span>
      </div>
    {/if}

    <!-- Who's attacking (after team wheel) -->
    {#if phase === "event" || phase === "card" || phase === "penalty"}
      <div class="att-tag">
        <span class:att-home={isHomeAttacking} class:att-away={!isHomeAttacking}>
          {isHomeAttacking ? "▲" : "▼"} {attName} menyerang
        </span>
      </div>
    {/if}
  {:else}
    <!-- Finished state -->
    <div class="ft-banner">
      <div class="ft-score">{homeGoals} – {awayGoals}</div>
      <div class="ft-label">FULL TIME</div>
      <div class="ft-xg">xG: {weights.homeXG} – {weights.awayXG}</div>
    </div>
  {/if}

  <!-- Manager intervention -->
  {#if canIntervene && !isFinished && (phase === "event" || phase === "team")}
    <div class="intervene-bar">
      <div class="int-group">
        <button class="int-btn" class:active={liveMentality === "attacking"} onclick={() => (liveMentality = "attacking")}>⚔ Attack</button>
        <button class="int-btn" class:active={liveMentality === "balanced"}  onclick={() => (liveMentality = "balanced")}>⚖ Seimbang</button>
        <button class="int-btn" class:active={liveMentality === "defensive"} onclick={() => (liveMentality = "defensive")}>🛡 Bertahan</button>
      </div>
      <button class="sub-btn" disabled={subsLeft <= 0} onclick={() => subsLeft--}>
        Subs ({subsLeft}/3)
      </button>
    </div>
  {/if}

  <!-- Controls -->
  <div class="controls">
    {#if isFinished}
      <!-- Match over -->
      <button class="done-btn" onclick={finishMatch}>✓ Selesai Pertandingan</button>

    {:else if spinning}
      <!-- Wheel is spinning — wait -->
      <button disabled class="spin-btn">Spinning…</button>

    {:else if pendingResult !== null}
      <!-- Wheel stopped — user decides: re-spin or confirm -->
      <button class="respin-btn" onclick={reSpin}>↩ Re-Spin</button>
      {#if phase === "result"}
        <button class="next-btn" onclick={() => { pendingResult = null; nextAttack(); }}>Serangan Berikutnya ▸</button>
      {:else}
        <button class="confirm-btn" onclick={confirmSpin}>
          {phase === "team" ? "Konfirmasi Tim Penyerang ▸" :
           phase === "event" ? "Konfirmasi Hasil ▸" :
           phase === "card" ? "Konfirmasi Kartu ▸" : "Konfirmasi Penalti ▸"}
        </button>
      {/if}
      <button onclick={skipToEnd}>⏩ FT</button>

    {:else if phase === "result"}
      <!-- Result shown, no pending spin -->
      <button class="respin-btn" onclick={reSpin}>↩ Re-Spin Event</button>
      <button class="next-btn" onclick={nextAttack}>Serangan Berikutnya ▸</button>
      <button onclick={skipToEnd}>⏩ FT</button>

    {:else}
      <!-- Ready to spin -->
      <button class="spin-btn" onclick={spin}>
        ⚽ Spin {phase === "team" ? "— Team Wheel" : phase === "card" ? "— Card Wheel" : phase === "penalty" ? "— Penalty Wheel" : "— Event Wheel"}
      </button>
      <button onclick={skipToEnd}>⏩ FT</button>
    {/if}
  </div>

  <!-- Commentary log -->
  <div class="comm-log">
    {#each log.slice(0, 8) as item}
      <div class="comm-row" class:comm-goal={item.goal}>
        <span class="comm-min">{item.minute}'</span>
        <span>{item.text}</span>
      </div>
    {/each}
  </div>

</div>

<style>
  .match-wheel {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  /* ── Scoreboard ── */
  .scoreboard {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.6rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .team-col { display: flex; align-items: center; }
  .team-col.home { justify-content: flex-end; }
  .team-col.away { justify-content: flex-start; }
  .team-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }
  .score-col { text-align: center; }
  .score {
    font-family: var(--font-display, 'Impact', sans-serif);
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.1em;
    line-height: 1;
  }
  .minute { font-size: 0.65rem; color: var(--green); letter-spacing: 0.08em; }

  /* ── Phase bar ── */
  .phase-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .phase-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--green);
    text-transform: uppercase;
  }
  .attack-count { font-size: 0.65rem; color: var(--text3); }

  /* ── Wheel ── */
  .wheel-area {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 1rem;
    align-items: center;
  }
  @media (max-width: 420px) {
    .wheel-area { grid-template-columns: 1fr; }
  }

  .wheel-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pointer { font-size: 1rem; color: var(--text); margin-bottom: -4px; z-index: 2; }
  .wheel-disc {
    width: 170px;
    height: 170px;
    border-radius: 50%;
    border: 3px solid var(--border2);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .wheel-disc.spinning {
    transition: transform 0.6s cubic-bezier(0.1, 0.7, 0.3, 1);
  }
  .wheel-center {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--border2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
  }

  /* Slice list */
  .slice-list {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    font-size: 0.78rem;
    max-height: 190px;
    overflow-y: auto;
  }
  .slice-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.18rem 0.4rem;
    color: var(--text2);
    border-radius: 2px;
  }
  .slice-row.picked {
    background: var(--green-bg);
    color: var(--green);
    font-weight: 700;
    outline: 1px solid var(--green);
  }
  .swatch { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
  .s-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s-pct { color: var(--text3); min-width: 28px; text-align: right; }

  /* ── Result banner ── */
  .result-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.55rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-left: 3px solid var(--border2);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: 0.82rem;
    color: var(--text2);
    line-height: 1.45;
  }
  .result-banner.goal {
    border-left-color: #4caf70;
    background: rgba(76,175,112,0.08);
    color: #4caf70;
    font-weight: 700;
  }
  .r-min {
    background: var(--green);
    color: #0d1009;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  /* ── Attacking indicator ── */
  .att-tag {
    font-size: 0.72rem;
    text-align: center;
  }
  .att-home { color: var(--green); }
  .att-away { color: var(--blue); }

  /* ── FT Banner ── */
  .ft-banner {
    text-align: center;
    padding: 1.5rem 0;
  }
  .ft-score {
    font-family: var(--font-display, 'Impact', sans-serif);
    font-size: 3rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.1em;
  }
  .ft-label { font-size: 0.65rem; color: var(--green); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 0.2rem; }
  .ft-xg { font-size: 0.72rem; color: var(--text3); margin-top: 0.3rem; }

  /* ── Intervene bar ── */
  .intervene-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.65rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
  }
  .int-group { display: flex; gap: 0.3rem; }
  .int-btn {
    padding: 0.25rem 0.55rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.7rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.1s;
  }
  .int-btn.active { border-color: var(--green); background: var(--green-bg); color: var(--green); font-weight: 700; }
  .sub-btn {
    padding: 0.25rem 0.6rem;
    background: transparent;
    border: 1px solid var(--blue);
    color: var(--blue);
    font-family: inherit;
    font-size: 0.7rem;
    border-radius: 2px;
    cursor: pointer;
  }
  .sub-btn:disabled { opacity: 0.3; cursor: default; }

  /* ── Controls ── */
  .controls { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .controls button {
    padding: 0.4rem 0.85rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.78rem;
    border-radius: var(--radius);
    transition: all 0.12s;
  }
  .controls button:hover:not(:disabled) { background: var(--green-bg); border-color: var(--green); color: var(--green); }
  .controls button:disabled { opacity: 0.3; cursor: default; }
  .spin-btn { background: var(--green) !important; color: #0d1009 !important; border-color: var(--green) !important; font-weight: 700 !important; }
  .next-btn { background: var(--green-bg) !important; color: var(--green) !important; border-color: var(--green) !important; }
  .done-btn { background: var(--green) !important; color: #0d1009 !important; border-color: var(--green) !important; font-weight: 700 !important; }
  .respin-btn { font-size: 0.72rem !important; }
  .confirm-btn { background: var(--surface) !important; color: var(--text) !important; border-color: var(--border3) !important; font-weight: 700 !important; }

  /* ── Commentary log ── */
  .comm-log {
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    font-size: 0.74rem;
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
    max-height: 110px;
    overflow-y: auto;
  }
  .comm-row { display: flex; gap: 0.5rem; color: var(--text2); line-height: 1.4; }
  .comm-row.comm-goal { color: #4caf70; font-weight: 700; }
  .comm-min { color: var(--text3); min-width: 26px; text-align: right; flex-shrink: 0; }
</style>
