<script lang="ts">
  import type { PunditState, PunditReactionOption } from "../../engine/retirement.js";
  import type { WorldState } from "../../types/index.js";
  import { PUNDIT_REACTION_OPTIONS } from "../../engine/retirement.js";

  interface Props {
    world: WorldState | null;
    punditState: PunditState;
    lastSummary?: string | null;
    onadvance: () => void;
    onaction: (actionId: PunditReactionOption["id"]) => void;
  }

  let { world, punditState, lastSummary, onadvance, onaction }: Props = $props();

  let selectedAction = $state<PunditReactionOption["id"]>("criticize_manager");

  function formatMoney(amount: number): string {
    if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)} Miliar`;
    if (amount >= 1_000_000) return `Rp ${Math.round(amount / 1_000_000)} Juta`;
    return `Rp ${amount.toLocaleString("id-ID")}`;
  }

  function handleBroadcast() {
    onaction(selectedAction);
  }
</script>

<div class="pundit-container">
  <!-- Pundit Header Profile -->
  <header class="pundit-header">
    <div class="profile-main">
      <span class="badge-role">🎙️ PUNDIT SEPAK BOLA & MEDIA EXPERT</span>
      <h2>{punditState.name}</h2>
      <div class="shows-list">
        {#each punditState.active_shows as show}
          <span class="show-tag">📺 {show}</span>
        {/each}
      </div>
    </div>
    <div class="finances-box">
      <div class="fin-item">
        <span class="fin-label">Total Royalti & Fee</span>
        <span class="fin-value cash">{formatMoney(punditState.total_earnings)}</span>
      </div>
      <div class="fin-item">
        <span class="fin-label">Royalti Bulanan</span>
        <span class="fin-value">{formatMoney(punditState.monthly_royalty)}/bln</span>
      </div>
    </div>
  </header>

  <!-- Pundit Ratings -->
  <section class="ratings-grid">
    <div class="rating-card fame">
      <div class="rc-header">
        <span class="rc-icon">🌟</span>
        <span class="rc-title">Ketenaran (Fame)</span>
      </div>
      <span class="rc-val">{punditState.fame}/100</span>
      <div class="meter-bg"><div class="meter-fill fame" style="width: {punditState.fame}%"></div></div>
      <span class="rc-hint">Mempengaruhi nilai kontrak sponsor & viewers program Anda.</span>
    </div>

    <div class="rating-card cred">
      <div class="rc-header">
        <span class="rc-icon">🧠</span>
        <span class="rc-title">Kredibilitas Taktis</span>
      </div>
      <span class="rc-val">{punditState.credibility}/100</span>
      <div class="meter-bg"><div class="meter-fill cred" style="width: {punditState.credibility}%"></div></div>
      <span class="rc-hint">Kepercayaan asosiasi pelatih & analis terhadap argumen Anda.</span>
    </div>

    <div class="rating-card cont">
      <div class="rc-header">
        <span class="rc-icon">🌶️</span>
        <span class="rc-title">Tingkat Kontroversi</span>
      </div>
      <span class="rc-val">{punditState.controversy_level}/100</span>
      <div class="meter-bg"><div class="meter-fill cont" style="width: {punditState.controversy_level}%"></div></div>
      <span class="rc-hint">Semakin pedas opini, semakin viral di medsos (namun risiko kecaman).</span>
    </div>
  </section>

  <!-- Last Summary Notification -->
  {#if lastSummary}
    <div class="summary-banner">
      📢 {lastSummary}
    </div>
  {/if}

  <!-- Weekly Opinion & Broadcast Center -->
  <section class="action-center">
    <div class="section-title">
      <h3>🗣️ Siaran Matchday: Pilih Reaksi & Opini Publik Pekan Ini</h3>
      <p>Pilih topik bahasan untuk episode televisi dan podcast malam ini. Suaramu akan mengguncang dinamika liga!</p>
    </div>

    <div class="options-list">
      {#each PUNDIT_REACTION_OPTIONS as opt}
        <label class="opinion-card" class:active={selectedAction === opt.id}>
          <input
            type="radio"
            name="punditOpt"
            value={opt.id}
            checked={selectedAction === opt.id}
            onchange={() => (selectedAction = opt.id)}
          />
          <div class="opinion-content">
            <div class="opinion-head">
              <span class="op-title">{opt.title}</span>
              <div class="op-deltas">
                <span class="delta fame">Fame +{opt.fameDelta}</span>
                <span class="delta cred" class:negative={opt.credibilityDelta < 0}>
                  Kred {opt.credibilityDelta >= 0 ? `+${opt.credibilityDelta}` : opt.credibilityDelta}
                </span>
                <span class="delta cont" class:negative={opt.controversyDelta < 0}>
                  Kontrov {opt.controversyDelta >= 0 ? `+${opt.controversyDelta}` : opt.controversyDelta}
                </span>
              </div>
            </div>
            <p class="op-desc">{opt.desc}</p>
          </div>
        </label>
      {/each}
    </div>

    <div class="action-bar">
      <button class="btn-broadcast" onclick={handleBroadcast}>
        🎙️ Siarkan Opini ke Publik (Broadcast)
      </button>
      <button class="btn-advance" onclick={onadvance}>
        ⏭️ Lanjut Pekan Berikutnya
      </button>
    </div>
  </section>

  <!-- Action History Log -->
  {#if punditState.history && punditState.history.length > 0}
    <section class="history-section">
      <h4>📰 Arsip Siaran & Liputan Media Terakhir</h4>
      <div class="history-list">
        {#each punditState.history as item}
          <div class="history-row">
            <span class="h-day">Hari ke-{item.day}</span>
            <span class="h-summary">{item.summary}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .pundit-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    max-width: 1000px;
    margin: 0 auto;
    color: #e2e8f0;
  }

  .pundit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #141b2d;
    border: 1px solid #2d3b5c;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
  }

  .badge-role {
    font-size: 0.72rem;
    font-weight: 700;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    padding: 2px 8px;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 0.35rem;
  }

  .profile-main h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #f8fafc;
  }

  .shows-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .show-tag {
    font-size: 0.75rem;
    background: #1e293b;
    color: #cbd5e1;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid #334155;
  }

  .finances-box {
    display: flex;
    gap: 1.5rem;
    text-align: right;
  }

  .fin-item {
    display: flex;
    flex-direction: column;
  }

  .fin-label {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .fin-value {
    font-size: 1.15rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  .fin-value.cash {
    color: #4ade80;
  }

  /* Ratings Grid */
  .ratings-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .rating-card {
    background: #141b2d;
    border: 1px solid #263554;
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .rc-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .rc-title {
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .rc-val {
    font-size: 1.4rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .meter-bg {
    height: 6px;
    background: #0f1626;
    border-radius: 3px;
    overflow: hidden;
  }

  .meter-fill {
    height: 100%;
  }

  .meter-fill.fame {
    background: #38bdf8;
  }

  .meter-fill.cred {
    background: #4ade80;
  }

  .meter-fill.cont {
    background: #f87171;
  }

  .rc-hint {
    font-size: 0.72rem;
    color: #64748b;
    line-height: 1.3;
    margin-top: 0.2rem;
  }

  /* Summary Banner */
  .summary-banner {
    background: #1e293b;
    border-left: 4px solid #38bdf8;
    padding: 0.85rem 1.25rem;
    border-radius: 6px;
    font-size: 0.88rem;
    color: #f1f5f9;
  }

  /* Action Center */
  .action-center {
    background: #141b2d;
    border: 1px solid #2d3b5c;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
  }

  .section-title h3 {
    margin: 0 0 0.35rem 0;
    font-size: 1.15rem;
  }

  .section-title p {
    margin: 0 0 1rem 0;
    font-size: 0.82rem;
    color: #94a3b8;
  }

  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-bottom: 1.25rem;
  }

  .opinion-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: #182239;
    border: 1px solid #263554;
    border-radius: 8px;
    padding: 0.85rem 1rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .opinion-card:hover {
    border-color: #38bdf8;
    background: #1e2b48;
  }

  .opinion-card.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .opinion-content {
    flex: 1;
  }

  .opinion-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .op-title {
    font-weight: 700;
    font-size: 0.95rem;
    color: #f8fafc;
  }

  .op-deltas {
    display: flex;
    gap: 0.4rem;
  }

  .delta {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .delta.fame {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
  }

  .delta.cred {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
  }

  .delta.cont {
    background: rgba(248, 113, 113, 0.2);
    color: #f87171;
  }

  .delta.negative {
    background: rgba(148, 163, 184, 0.2);
    color: #94a3b8;
  }

  .op-desc {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.35;
  }

  .action-bar {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .btn-broadcast {
    background: #e11d48;
    color: #ffffff;
    border: none;
    padding: 0.65rem 1.4rem;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-broadcast:hover {
    background: #be123c;
  }

  .btn-advance {
    background: #0284c7;
    color: #ffffff;
    border: none;
    padding: 0.65rem 1.4rem;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-advance:hover {
    background: #0369a1;
  }

  /* History Log */
  .history-section {
    background: #141b2d;
    border: 1px solid #263554;
    border-radius: 12px;
    padding: 1rem 1.5rem;
  }

  .history-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    color: #f8fafc;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .history-row {
    display: flex;
    gap: 0.75rem;
    font-size: 0.82rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid #1e293b;
  }

  .h-day {
    color: #38bdf8;
    font-weight: 600;
    white-space: nowrap;
  }

  .h-summary {
    color: #cbd5e1;
  }
</style>
