<script lang="ts">
  import type { MatchStep, WheelSlice, TacticalMentality } from "../../engine/match.js";

  interface Props {
    steps: MatchStep[];
    homeName: string;
    awayName: string;
    canIntervene?: boolean;
    userClubName?: string;
    onfinish?: (finalHomeGoals: number, finalAwayGoals: number) => void;
    onclose: () => void;
  }

  let {
    steps,
    homeName,
    awayName,
    canIntervene = false,
    userClubName = "",
    onfinish,
    onclose,
  }: Props = $props();

  let stepOverrides = $state<MatchStep[] | null>(null);
  const activeSteps = $derived(stepOverrides ?? steps);
  let stepIdx = $state(0);
  let autoPlay = $state(false);
  let spinCount = $state(1);
  let liveMentality = $state<TacticalMentality>("balanced");
  let subsLeft = $state(3);
  let subBoost = $state(0); // +1 per substitution made

  const current = $derived(activeSteps[stepIdx] ?? null);
  const isFinished = $derived(stepIdx >= activeSteps.length - 1);

  // Auto-advance timer when autoPlay is active
  $effect(() => {
    if (!autoPlay || isFinished) {
      if (isFinished) autoPlay = false;
      return;
    }
    const id = setInterval(() => {
      if (stepIdx < activeSteps.length - 1) {
        stepIdx++;
        spinCount++;
      } else {
        autoPlay = false;
      }
    }, 1100);
    return () => clearInterval(id);
  });

  function recalculateRemainingSteps(note: string) {
    if (isFinished || !current) return;
    const isUserHome = userClubName === homeName;
    const nextSteps = activeSteps.map((s) => ({
      ...s,
      team_slices: [{ ...s.team_slices[0] }, { ...s.team_slices[1] }] as [WheelSlice, WheelSlice],
      event_slices: s.event_slices.map((e) => ({ ...e })),
    }));

    nextSteps[stepIdx].commentary = `${nextSteps[stepIdx].commentary} ${note}`;

    let runningHG = nextSteps[stepIdx].home_goals;
    let runningAG = nextSteps[stepIdx].away_goals;

    const mentalityShift = liveMentality === "attacking" ? 8 : liveMentality === "defensive" ? -8 : 0;
    const totalUserShift = mentalityShift + subBoost * 4;

    for (let i = stepIdx + 1; i < nextSteps.length; i++) {
      const st = nextSteps[i];
      const baseHomePct = st.team_slices[0].weight;
      const newHomePct = Math.max(
        15,
        Math.min(85, baseHomePct + (isUserHome ? totalUserShift : -totalUserShift)),
      );
      st.team_slices[0].weight = newHomePct;
      st.team_slices[1].weight = 100 - newHomePct;

      const userAttacking = st.attacking_club_name === userClubName;
      for (const sl of st.event_slices) {
        if (userAttacking) {
          if (sl.key === "GOAL") {
            const mult =
              (liveMentality === "attacking" ? 1.35 : liveMentality === "defensive" ? 0.78 : 1.0) *
              (1 + subBoost * 0.12);
            sl.weight = Math.max(1, Math.round(sl.weight * mult));
          }
        } else {
          if (sl.key === "DEFENSE" || sl.key === "SAVE") {
            const mult =
              (liveMentality === "defensive" ? 1.4 : liveMentality === "attacking" ? 0.85 : 1.0) *
              (1 + subBoost * 0.08);
            sl.weight = Math.max(1, Math.round(sl.weight * mult));
          }
        }
      }

      // Normalize event_slices weights to ~100 and re-spin
      const sumW = st.event_slices.reduce((acc, x) => acc + x.weight, 0) || 100;
      for (const sl of st.event_slices) {
        sl.weight = Math.max(1, Math.round((sl.weight / sumW) * 100));
      }
      const normSum = st.event_slices.reduce((acc, x) => acc + x.weight, 0);
      let r = Math.random() * normSum;
      let chosenIdx = 0;
      for (let j = 0; j < st.event_slices.length; j++) {
        r -= st.event_slices[j].weight;
        if (r <= 0) {
          chosenIdx = j;
          break;
        }
      }
      const chosen = st.event_slices[chosenIdx];
      st.chosen_index = chosenIdx;
      st.outcome_key = chosen.key;
      st.outcome_label = chosen.label;

      const attIsHome = st.attacking_club_name === homeName;
      if (chosen.key === "GOAL" || (chosen.key === "PENALTY" && Math.random() < 0.78)) {
        st.is_goal = true;
        if (attIsHome) runningHG++;
        else runningAG++;
        st.commentary = `GOL! Momentum taktik membuahkan gol bagi ${st.attacking_club_name}! Skor ${runningHG}–${runningAG}.`;
      } else {
        st.is_goal = false;
        if (chosen.key === "SAVE") {
          st.commentary = `Tepis gemilang kiper menggagalkan peluang ${st.attacking_club_name}.`;
        } else if (chosen.key === "DEFENSE") {
          st.commentary = `Barisan pertahanan disiplin mematahkan serangan ${st.attacking_club_name}.`;
        } else if (chosen.key === "COUNTER") {
          st.commentary = `Serangan balik cepat mematahkan tekanan ${st.attacking_club_name}.`;
        } else {
          st.commentary = `${st.attacking_club_name} mendapat hasil ${chosen.label} di menit ${st.minute}'.`;
        }
      }
      st.home_goals = runningHG;
      st.away_goals = runningAG;
    }

    stepOverrides = nextSteps;
  }

  function changeMentality(m: TacticalMentality) {
    if (liveMentality === m || isFinished) return;
    liveMentality = m;
    const label = m === "attacking" ? "All-Out Attack" : m === "defensive" ? "Parkir Bus" : "Seimbang";
    recalculateRemainingSteps(`[📋 Instruksi Manajer: Taktik diubah ke ${label}!]`);
  }

  function makeSubstitution() {
    if (subsLeft <= 0 || isFinished) return;
    subsLeft--;
    subBoost++;
    recalculateRemainingSteps(`[🔄 Substitusi Manajer (${3 - subsLeft}/3): Pemain segar masuk menambah daya dobrak!]`);
  }

  function nextStep() {
    if (stepIdx < activeSteps.length - 1) {
      stepIdx++;
      spinCount++;
    }
  }

  function skipToEnd() {
    autoPlay = false;
    stepIdx = activeSteps.length - 1;
    spinCount++;
  }

  function finishMatch() {
    const last = activeSteps[activeSteps.length - 1];
    if (last && onfinish) {
      onfinish(last.home_goals, last.away_goals);
    }
    onclose();
  }

  // Build CSS conic-gradient string from slices
  function buildGradient(slices: WheelSlice[]): string {
    const total = slices.reduce((s, x) => s + x.weight, 0) || 100;
    let acc = 0;
    const stops: string[] = [];
    for (const s of slices) {
      const start = (acc / total) * 360;
      acc += s.weight;
      const end = (acc / total) * 360;
      stops.push(`${s.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  }

  // Compute rotation angle so chosen slice center aligns with top pointer (0deg)
  const wheelRotation = $derived(() => {
    if (!current) return 0;
    const slices = current.event_slices;
    const total = slices.reduce((s, x) => s + x.weight, 0) || 100;
    let before = 0;
    for (let i = 0; i < current.chosen_index; i++) before += slices[i].weight;
    const mid = before + slices[current.chosen_index].weight / 2;
    const sliceAngle = (mid / total) * 360;
    return spinCount * 360 + (360 - sliceAngle);
  });

  const visibleLog = $derived(activeSteps.slice(0, stepIdx + 1).reverse());
</script>

<div class="wheel-modal">
  <header class="scoreboard">
    <div class="team home">{homeName}</div>
    <div class="score-box">
      <div class="score">{current?.home_goals ?? 0} – {current?.away_goals ?? 0}</div>
      <div class="minute">{isFinished ? "FT 90'" : `${current?.minute ?? 1}'`}</div>
    </div>
    <div class="team away">{awayName}</div>
  </header>

  {#if current}
    <!-- Team Attack Wheel Bar -->
    <section class="team-wheel">
      <div class="tw-label">
        TEAM WHEEL · Serangan: <strong>{current.attacking_club_name}</strong>
      </div>
      <div class="tw-bar">
        <div
          class="tw-home"
          class:active={current.attacking_club_name === homeName}
          style="width:{current.team_slices[0].weight}%"
        >
          {current.team_slices[0].weight}%
        </div>
        <div
          class="tw-away"
          class:active={current.attacking_club_name === awayName}
          style="width:{current.team_slices[1].weight}%"
        >
          {current.team_slices[1].weight}%
        </div>
      </div>
    </section>

    <!-- Event Probability Wheel + Legend -->
    <section class="wheel-arena">
      <div class="wheel-wrap">
        <div class="pointer">▼</div>
        <div
          class="wheel-disc"
          style="background:{buildGradient(current.event_slices)}; transform:rotate({wheelRotation()}deg)"
        >
          <div class="wheel-center">{current.minute}'</div>
        </div>
      </div>

      <div class="slice-list">
        <div class="outcome-banner" class:goal={current.is_goal}>
          Hasil: <strong>{current.outcome_label}</strong>
        </div>
        {#each current.event_slices as s, idx}
          <div class="slice-row" class:picked={idx === current.chosen_index}>
            <span class="swatch" style="background:{s.color}"></span>
            <span class="s-label">{s.label}</span>
            <span class="s-pct">{s.weight}%</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if canIntervene && !isFinished}
    <section class="intervene-bar">
      <div class="int-group">
        <span class="int-title">🎯 Intervensi Taktik Live ({userClubName}):</span>
        <button
          class="int-btn"
          class:active={liveMentality === "attacking"}
          onclick={() => changeMentality("attacking")}
        >⚔️ All-Out Attack</button>
        <button
          class="int-btn"
          class:active={liveMentality === "balanced"}
          onclick={() => changeMentality("balanced")}
        >⚖️ Seimbang</button>
        <button
          class="int-btn"
          class:active={liveMentality === "defensive"}
          onclick={() => changeMentality("defensive")}
        >🛡️ Parkir Bus</button>
      </div>
      <button
        class="sub-btn"
        disabled={subsLeft <= 0}
        onclick={makeSubstitution}
      >
        🔄 Substitusi Pemain Segar ({subsLeft}/3)
      </button>
    </section>
  {/if}

  <!-- Controls -->
  <section class="controls">
    {#if !isFinished}
      <button onclick={nextStep} disabled={autoPlay}>⏭ Step ({stepIdx + 1}/{activeSteps.length})</button>
      <button onclick={() => (autoPlay = !autoPlay)}>
        {autoPlay ? "⏸ Pause" : "▶ Auto Play"}
      </button>
      <button onclick={skipToEnd}>⏩ Lewati ke 90'</button>
    {:else}
      <button onclick={() => { stepIdx = 0; spinCount = 1; autoPlay = false; }}>🔄 Putar Ulang</button>
      <button class="done-btn" onclick={finishMatch}>✓ Selesai Pertandingan</button>
    {/if}
  </section>

  <!-- Commentary Log -->
  <section class="commentary-feed">
    {#each visibleLog as item}
      <div class="comm-row" class:comm-goal={item.is_goal}>
        <span class="comm-min">{item.minute}'</span>
        <span class="comm-text">{item.commentary}</span>
      </div>
    {/each}
  </section>
</div>

<style>
  .wheel-modal {
    border: 1px solid var(--border2);
    background: var(--surface);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    border-radius: var(--radius);
  }

  .scoreboard {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.85rem;
  }
  .team { font-weight: bold; font-size: 0.95rem; color: var(--text); }
  .team.home { text-align: right; }
  .team.away { text-align: left; }
  .score-box {
    text-align: center;
    background: var(--surface2);
    padding: 0.4rem 1.2rem;
    border: 1px solid var(--border2);
    border-radius: var(--radius);
  }
  .score { font-size: 1.6rem; font-weight: bold; color: var(--text); letter-spacing: 0.05em; }
  .minute { font-size: 0.72rem; color: var(--green); }

  .team-wheel { display: flex; flex-direction: column; gap: 0.35rem; }
  .tw-label { font-size: 0.75rem; color: var(--text2); }
  .tw-label strong { color: var(--text); }
  .tw-bar { display: flex; height: 22px; font-size: 0.72rem; line-height: 22px; text-align: center; border-radius: 2px; overflow: hidden; }
  .tw-home { background: rgba(34,197,94,0.15); color: var(--text2); transition: all 0.2s; }
  .tw-away { background: rgba(96,165,250,0.15); color: var(--text2); transition: all 0.2s; }
  .tw-home.active { background: rgba(34,197,94,0.35); color: var(--green); font-weight: bold; }
  .tw-away.active { background: rgba(96,165,250,0.3); color: var(--blue); font-weight: bold; }

  .wheel-arena {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 1.2rem;
    align-items: center;
  }
  .wheel-wrap {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .pointer {
    color: var(--text);
    font-size: 1.1rem;
    margin-bottom: -6px;
    z-index: 2;
  }
  .wheel-disc {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    border: 3px solid var(--border2);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .wheel-center {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--border2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: bold;
    color: var(--text);
  }

  .slice-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 0.8rem;
    font-size: 0.82rem;
  }
  .outcome-banner {
    grid-column: 1 / -1;
    padding: 0.4rem 0.7rem;
    background: var(--surface2);
    border-left: 3px solid var(--border2);
    margin-bottom: 0.3rem;
    font-size: 0.88rem;
    color: var(--text);
    border-radius: 0 2px 2px 0;
  }
  .outcome-banner.goal {
    border-left-color: var(--green);
    background: var(--green-bg);
    color: var(--green);
  }
  .slice-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.4rem;
    color: var(--text2);
  }
  .slice-row.picked {
    background: var(--surface2);
    color: var(--text);
    font-weight: bold;
    outline: 1px solid var(--green);
    border-radius: 2px;
  }
  .swatch { width: 10px; height: 10px; display: inline-block; flex-shrink: 0; border-radius: 2px; }
  .s-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s-pct { color: var(--text2); font-weight: bold; min-width: 28px; text-align: right; }

  .intervene-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: var(--radius);
  }
  .int-group { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
  .int-title { font-size: 0.74rem; color: var(--amber); font-weight: bold; margin-right: 0.2rem; }
  .int-btn {
    padding: 0.28rem 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.73rem;
    border-radius: 2px;
    cursor: pointer;
  }
  .int-btn.active { border-color: var(--green); background: var(--green-bg); color: var(--green); font-weight: bold; }
  .sub-btn {
    padding: 0.3rem 0.7rem;
    background: transparent;
    border: 1px solid var(--blue);
    color: var(--blue);
    font-family: inherit;
    font-size: 0.74rem;
    border-radius: 2px;
    cursor: pointer;
  }
  .sub-btn:hover:not(:disabled) { background: rgba(96,165,250,0.12); }
  .sub-btn:disabled { opacity: 0.35; cursor: default; }

  .controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .controls button {
    padding: 0.45rem 0.9rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.82rem;
    border-radius: var(--radius);
    transition: all 0.15s;
  }
  .controls button:hover:not(:disabled) { background: var(--green-bg); border-color: var(--green); color: var(--green); }
  .controls button:disabled { opacity: 0.3; cursor: default; }
  .controls .done-btn {
    background: var(--green);
    color: #000;
    border-color: var(--green);
    font-weight: bold;
  }
  .controls .done-btn:hover { opacity: 0.88; background: var(--green); color: #000; }

  .commentary-feed {
    max-height: 165px;
    overflow-y: auto;
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
  }
  .comm-row { display: flex; gap: 0.6rem; color: var(--text2); line-height: 1.4; }
  .comm-row.comm-goal { color: var(--green); font-weight: bold; }
  .comm-min { color: var(--text3); min-width: 28px; text-align: right; flex-shrink: 0; }
</style>
