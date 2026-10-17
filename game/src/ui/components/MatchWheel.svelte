<script lang="ts">
  import type { MatchStep, WheelSlice } from "../../engine/match.js";

  interface Props {
    steps: MatchStep[];
    homeName: string;
    awayName: string;
    onclose: () => void;
  }

  let { steps, homeName, awayName, onclose }: Props = $props();

  let stepIdx = $state(0);
  let autoPlay = $state(false);
  let spinCount = $state(1);

  const current = $derived(steps[stepIdx] ?? null);
  const isFinished = $derived(stepIdx >= steps.length - 1);

  // Auto-advance timer when autoPlay is active
  $effect(() => {
    if (!autoPlay || isFinished) {
      if (isFinished) autoPlay = false;
      return;
    }
    const id = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        stepIdx++;
        spinCount++;
      } else {
        autoPlay = false;
      }
    }, 1100);
    return () => clearInterval(id);
  });

  function nextStep() {
    if (stepIdx < steps.length - 1) {
      stepIdx++;
      spinCount++;
    }
  }

  function skipToEnd() {
    autoPlay = false;
    stepIdx = steps.length - 1;
    spinCount++;
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

  const visibleLog = $derived(steps.slice(0, stepIdx + 1).reverse());
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

  <!-- Controls -->
  <section class="controls">
    {#if !isFinished}
      <button onclick={nextStep} disabled={autoPlay}>⏭ Step ({stepIdx + 1}/{steps.length})</button>
      <button onclick={() => (autoPlay = !autoPlay)}>
        {autoPlay ? "⏸ Pause" : "▶ Auto Play"}
      </button>
      <button onclick={skipToEnd}>⏩ Lewati ke 90'</button>
    {:else}
      <button onclick={() => { stepIdx = 0; spinCount = 1; autoPlay = false; }}>🔄 Putar Ulang</button>
      <button class="done-btn" onclick={onclose}>✓ Selesai Pertandingan</button>
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
