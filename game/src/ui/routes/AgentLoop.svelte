<script lang="ts">
  import type { WorldState } from "../../types/index.js";
  import type { AgentState, ClientPlayer } from "../../engine/agent.js";

  interface Props {
    world: WorldState;
    agentState: AgentState;
    clients: ClientPlayer[];
    scoutList: ClientPlayer[];
    lastSummary: string | null;
    championshipSeries: boolean;
    onadvance: () => void;
    onupgradeoffice: () => void;
    onrecruitclient: (playerId: number) => void;
    onreleaseclient: (playerId: number) => void;
    onplantrumor: (playerId: number) => void;
    onnegotiateclient: (playerId: number, currentClubId: number) => void;
    ontoggleformat: () => void;
  }

  let {
    world,
    agentState,
    clients,
    scoutList,
    lastSummary,
    championshipSeries,
    onadvance,
    onupgradeoffice,
    onrecruitclient,
    onreleaseclient,
    onplantrumor,
    onnegotiateclient,
    ontoggleformat,
  }: Props = $props();

  let activeTab = $state<"clients" | "scouting">("clients");

  const DAYS_PER_SEASON = 365;
  const monthNames = ["Ags","Sep","Okt","Nov","Des","Jan","Feb","Mar","Apr","Mei","Jun","Jul"];

  function dayToDate(day: number): string {
    const d = Math.max(0, day - 1) % DAYS_PER_SEASON;
    return `${(d % 30) + 1} ${monthNames[Math.floor(d / 30) % 12]}`;
  }

  function formatRupiah(n: number): string {
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2)}M`;
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}jt`;
    return `${sign}Rp ${abs.toLocaleString("id-ID")}`;
  }

  const seasonProgress = $derived(Math.round(((world.current_day % DAYS_PER_SEASON) / DAYS_PER_SEASON) * 100));
  const monthlyCommission = $derived(
    Math.round(clients.reduce((sum, c) => sum + c.wage * 0.1, 0)),
  );
  const netMonthly = $derived(monthlyCommission - agentState.monthly_costs);
</script>

<div class="agent-loop">
  <header>
    <div class="title-row">
      <h2>🕵️ Agensi {agentState.name}</h2>
      <span class="badge office-badge">{agentState.office_name}</span>
      <span class="rep">Reputasi <strong>{agentState.reputation}</strong>/100</span>
    </div>
    <p class="sub">
      Mode Agen · Musim {world.season} · Hari {world.current_day} ({dayToDate(world.current_day)})
    </p>
  </header>

  {#if agentState.bankrupt}
    <div class="alert bankrupt">
      💥 <strong>AGENSI BANGKRUT:</strong> Kas defisit beruntun membuat agensi disita bank. Negosiasi & rekrutmen dibekukan.
    </div>
  {/if}

  {#if lastSummary}
    <div class="alert summary">{lastSummary}</div>
  {/if}

  <section class="stats-row">
    <div class="stat">
      <span class="label">Kas Agensi</span>
      <span class="val" class:neg={agentState.cash < 0}>{formatRupiah(agentState.cash)}</span>
    </div>
    <div class="stat">
      <span class="label">Komisi/Bln (10%)</span>
      <span class="val pos">+{formatRupiah(monthlyCommission)}</span>
    </div>
    <div class="stat">
      <span class="label">Biaya Kantor/Bln</span>
      <span class="val warn">-{formatRupiah(agentState.monthly_costs)}</span>
    </div>
    <div class="stat">
      <span class="label">Arus Kas Bersih</span>
      <span class="val" class:pos={netMonthly >= 0} class:neg={netMonthly < 0}>
        {netMonthly >= 0 ? "+" : ""}{formatRupiah(netMonthly)}
      </span>
    </div>
    <div class="stat">
      <span class="label">Klien</span>
      <span class="val">{clients.length} / {agentState.max_clients}</span>
    </div>
    <div class="stat">
      <span class="label">Akurasi Scout</span>
      <span class="val">{agentState.judge_ca} / {agentState.judge_pa}</span>
    </div>
  </section>

  <section class="progress-bar-wrap">
    <div class="progress-label">Progres musim {seasonProgress}%</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:{seasonProgress}%"></div>
    </div>
  </section>

  <section class="actions">
    <button class="primary-btn" onclick={onadvance}>
      ⚡ Lanjut ke Pekan Berikutnya
    </button>
    {#if agentState.next_office_name && agentState.next_office_cost}
      <button
        class="upgrade-btn"
        onclick={onupgradeoffice}
        disabled={agentState.bankrupt || agentState.cash < agentState.next_office_cost}
      >
        🏢 Upgrade ke {agentState.next_office_name} ({formatRupiah(agentState.next_office_cost)})
      </button>
    {/if}
    <button class="format-btn" onclick={ontoggleformat}>
      ⚙️ Format: {championshipSeries ? "Championship Series (4 Besar)" : "Liga Penuh"}
    </button>
  </section>

  <section class="tabs-panel">
    <div class="tab-header">
      <button
        class="tab-btn"
        class:active={activeTab === "clients"}
        onclick={() => (activeTab = "clients")}
      >
        🤝 Klien Agensi ({clients.length}/{agentState.max_clients})
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "scouting"}
        onclick={() => (activeTab = "scouting")}
      >
        🔭 Radar Scouting Pemain ({scoutList.length})
      </button>
    </div>

    {#if activeTab === "clients"}
      {#if clients.length === 0}
        <p class="empty-msg">Belum ada klien. Buka tab Radar Scouting untuk merekrut pemain!</p>
      {:else}
        <div class="client-list">
          {#each clients as c (c.id)}
            <div class="client-card">
              <div class="client-info">
                <div class="client-top">
                  <span class="pos-badge">{c.position}</span>
                  <strong class="cname">{c.name}</strong>
                  <span class="cage">{c.age} th</span>
                  <span class="covr">OVR {c.overall} <small>(CA {c.ca} · PA {c.pa})</small></span>
                </div>
                <div class="client-meta">
                  <span>🏟️ {c.club_name}</span>
                  <span>💵 Gaji: <strong>{formatRupiah(c.wage)}/bln</strong> (Komisi {formatRupiah(Math.round(c.wage * 0.1))}/bln)</span>
                  <span>📊 Musim ini: {c.matches} main · {c.goals} gol · {c.assists} ast · Rating {c.matches > 0 ? c.rating.toFixed(2) : "—"}</span>
                </div>
              </div>
              <div class="client-actions">
                <button
                  class="btn-deal"
                  onclick={() => onnegotiateclient(c.id, c.club_id ?? 0)}
                  disabled={agentState.bankrupt}
                  title="Negosiasikan kontrak baru atau pindah klub untuk komisi 15%"
                >
                  💼 Negosiasi
                </button>
                <button
                  class="btn-rumor"
                  onclick={() => onplantrumor(c.id)}
                  disabled={agentState.bankrupt}
                  title="Sebar rumor transfer palsu ke media (Berhasil: gaji & komisi naik; Ketahuan: denda Rp 15jt & reputasi -12)"
                >
                  📰 Rumor Media
                </button>
                <button
                  class="btn-release"
                  onclick={() => onreleaseclient(c.id)}
                  title="Putus kontrak keagenan"
                >
                  👋 Lepas
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="scout-hint">
        Akurasi laporan scouting ditentukan oleh <strong>Judge CA ({agentState.judge_ca})</strong> &
        <strong>Judge PA ({agentState.judge_pa})</strong>. Upgrade kantor untuk mempersempit rentang estimasi!
      </div>
      <div class="client-list">
        {#each scoutList as s (s.id)}
          <div class="client-card">
            <div class="client-info">
              <div class="client-top">
                <span class="pos-badge">{s.position}</span>
                <strong class="cname">{s.name}</strong>
                <span class="cage">{s.age} th</span>
                <span class="covr">OVR {s.overall} <small>(Est. CA {s.est_ca} · Est. PA {s.est_pa})</small></span>
              </div>
              <div class="client-meta">
                <span>🏟️ {s.club_name}</span>
                <span>💵 Gaji: {formatRupiah(s.wage)}/bln</span>
                <span>✍️ Biaya Rekrut: <strong>{formatRupiah(s.sign_cost)}</strong></span>
              </div>
            </div>
            <div class="client-actions">
              <button
                class="btn-recruit"
                onclick={() => onrecruitclient(s.id)}
                disabled={agentState.bankrupt || clients.length >= agentState.max_clients || agentState.cash < s.sign_cost}
              >
                🤝 Rekrut ({formatRupiah(s.sign_cost)})
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .agent-loop { display: flex; flex-direction: column; gap: 1rem; }

  header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
  .title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 1.35rem; color: var(--text); }
  .office-badge {
    background: var(--amber);
    color: #000;
    padding: 0.15rem 0.55rem;
    font-size: 0.72rem;
    font-weight: bold;
    border-radius: 2px;
  }
  .rep { font-size: 0.85rem; color: var(--text2); }
  .rep strong { color: var(--green); }
  .sub { margin: 0.3rem 0 0; color: var(--text2); font-size: 0.82rem; }

  .alert {
    padding: 0.6rem 0.85rem;
    font-size: 0.83rem;
    border-left: 3px solid var(--green);
    background: var(--green-bg);
    color: var(--green);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .alert.bankrupt {
    border-left-color: var(--red);
    background: rgba(248,113,113,0.1);
    color: var(--red);
  }

  .stats-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 90px;
  }
  .label { font-size: 0.66rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; }
  .val { font-size: 1.05rem; font-weight: bold; color: var(--text); margin-top: 0.2rem; }
  .val.pos { color: var(--green); }
  .val.warn { color: var(--amber); }
  .val.neg { color: var(--red); }

  .progress-bar-wrap { display: flex; flex-direction: column; gap: 0.35rem; }
  .progress-label { font-size: 0.72rem; color: var(--text3); }
  .progress-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--green); transition: width 0.4s; }

  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .actions button {
    padding: 0.55rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.84rem;
    border-radius: var(--radius);
    transition: all 0.15s;
  }
  .actions button:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
  .actions button:disabled { opacity: 0.35; cursor: default; }
  .actions .primary-btn { border-color: var(--green); color: var(--green); }
  .actions .upgrade-btn { border-color: var(--amber); color: var(--amber); }
  .actions .format-btn { font-size: 0.78rem; color: var(--text3); }

  .tabs-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.85rem;
  }
  .tab-header {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.6rem;
    margin-bottom: 0.75rem;
  }
  .tab-btn {
    padding: 0.4rem 0.9rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .tab-btn.active {
    background: var(--surface2);
    border-color: var(--green);
    color: var(--green);
    font-weight: bold;
  }

  .scout-hint {
    font-size: 0.76rem;
    color: var(--text2);
    margin-bottom: 0.65rem;
    padding: 0.45rem 0.65rem;
    background: var(--surface2);
    border-radius: var(--radius);
  }
  .empty-msg { color: var(--text3); font-size: 0.84rem; text-align: center; padding: 1.5rem 0; }

  .client-list { display: flex; flex-direction: column; gap: 0.55rem; max-height: 440px; overflow-y: auto; }
  .client-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.65rem 0.8rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .client-info { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 240px; }
  .client-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.86rem; }
  .pos-badge {
    background: var(--border2);
    color: var(--text);
    font-size: 0.68rem;
    font-weight: bold;
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
  }
  .cname { color: var(--text); }
  .cage { color: var(--text3); font-size: 0.78rem; }
  .covr { color: var(--green); font-weight: bold; font-size: 0.8rem; }
  .covr small { color: var(--text2); font-weight: normal; }
  .client-meta {
    display: flex;
    gap: 0.85rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text2);
  }

  .client-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .client-actions button {
    padding: 0.35rem 0.65rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .client-actions button:hover:not(:disabled) { color: var(--text); border-color: var(--text2); }
  .client-actions button:disabled { opacity: 0.35; cursor: default; }
  .btn-deal { border-color: var(--green) !important; color: var(--green) !important; }
  .btn-rumor { border-color: var(--amber) !important; color: var(--amber) !important; }
  .btn-release { border-color: var(--red) !important; color: var(--red) !important; }
  .btn-recruit { border-color: var(--green) !important; color: var(--green) !important; }
</style>
