<script lang="ts">
  import type { Player } from "../../types/index.js";
  import type { TransferTarget } from "../../engine/scheduler.js";

  interface FreeAgent {
    id: number; name: string; position: string; age: number;
    overall: number; ca: number; pa: number; wage: number;
  }

  interface Props {
    squad: Player[];
    freeAgents: FreeAgent[];
    transferTargets: TransferTarget[];
    clubCash: number;
    clubId: number;
    onclose: () => void;
    onsign: (playerId: number) => void;
    onbuy: (playerId: number) => void;
    onrelease: (playerId: number) => void;
  }

  let {
    squad,
    freeAgents,
    transferTargets,
    clubCash,
    clubId: _clubId,
    onclose,
    onsign,
    onbuy,
    onrelease,
  }: Props = $props();

  let tab = $state<"buy" | "sign" | "release">("buy");
  let posFilter = $state("ALL");

  const POSITIONS = ["ALL","GK","CB","LB","RB","DM","CM","AM","LW","RW","ST"];

  function formatRupiah(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  const filteredTargets = $derived(
    posFilter === "ALL" ? transferTargets : transferTargets.filter((p) => p.position === posFilter),
  );
  const filteredFree = $derived(
    posFilter === "ALL" ? freeAgents : freeAgents.filter((p) => p.position === posFilter),
  );
  const sortedSquad = $derived([...squad].sort((a, b) => b.overall - a.overall));
</script>

<div class="modal-overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-header">
      <div>
        <h3>💼 Bursa Transfer Manajer</h3>
        <span class="cash-pill">Kas Klub: <strong>{formatRupiah(clubCash)}</strong></span>
      </div>
      <button class="close-btn" onclick={onclose}>✕</button>
    </div>

    <div class="tabs">
      <button class="tab" class:active={tab === "buy"} onclick={() => (tab = "buy")}>
        💰 Beli Pemain ({transferTargets.length})
      </button>
      <button class="tab" class:active={tab === "sign"} onclick={() => (tab = "sign")}>
        📋 Free Agent ({freeAgents.length})
      </button>
      <button class="tab" class:active={tab === "release"} onclick={() => (tab = "release")}>
        🚪 Jual / Lepas ({squad.length})
      </button>
    </div>

    {#if tab === "buy" || tab === "sign"}
      <div class="filter-row">
        {#each POSITIONS as pos}
          <button
            class="pos-filter"
            class:active={posFilter === pos}
            onclick={() => (posFilter = pos)}
          >{pos}</button>
        {/each}
      </div>
    {/if}

    {#if tab === "buy"}
      <div class="player-list">
        {#each filteredTargets as p}
          <div class="player-row">
            <span class="pos-tag">{p.position}</span>
            <div class="pinfo">
              <span class="pname">{p.name}</span>
              <span class="pclub">{p.club_name}</span>
            </div>
            <span class="page">{p.age}th</span>
            <span class="povr">{p.overall}</span>
            <span class="fee-tag">{formatRupiah(p.fee)}</span>
            <button
              class="action-btn buy-btn"
              disabled={clubCash < p.fee}
              onclick={() => onbuy(p.id)}
            >
              Tebus
            </button>
          </div>
        {/each}
        {#if filteredTargets.length === 0}
          <p class="empty">Tidak ada pemain target di posisi {posFilter}.</p>
        {/if}
      </div>

    {:else if tab === "sign"}
      <div class="player-list">
        {#each filteredFree as p}
          <div class="player-row">
            <span class="pos-tag">{p.position}</span>
            <span class="pname">{p.name}</span>
            <span class="page">{p.age}th</span>
            <span class="povr">{p.overall}</span>
            <span class="wage">{formatRupiah(p.wage)}/bln</span>
            <button class="action-btn sign-btn" onclick={() => onsign(p.id)}>Kontrak Gratis</button>
          </div>
        {/each}
        {#if filteredFree.length === 0}
          <p class="empty">Tidak ada free agent posisi {posFilter}.</p>
        {/if}
      </div>

    {:else}
      <div class="player-list">
        {#each sortedSquad as p}
          {@const saleVal = Math.max(2_000_000, Math.round((p.overall * p.overall * 5_000) / 1_000_000) * 1_000_000)}
          <div class="player-row" class:injured-row={p.injured}>
            <span class="pos-tag">{p.position}</span>
            <span class="pname">{p.name}</span>
            <span class="page">{p.age}th</span>
            <span class="povr">{p.overall}</span>
            <span class="fee-tag">+{formatRupiah(saleVal)}</span>
            <button class="action-btn release-btn" onclick={() => onrelease(p.id)}>Jual/Lepas</button>
          </div>
        {/each}
        {#if sortedSquad.length === 0}
          <p class="empty">Skuad kosong.</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.72);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 2rem 1rem; z-index: 100; overflow-y: auto;
  }
  .modal {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: var(--radius); width: 100%; max-width: 720px;
    display: flex; flex-direction: column; gap: 0;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
  }
  h3 { margin: 0 0 0.25rem 0; font-size: 1rem; color: var(--text); }
  .cash-pill { font-size: 0.78rem; color: var(--text2); }
  .cash-pill strong { color: var(--green); }
  .close-btn {
    background: none; border: none; color: var(--text3);
    cursor: pointer; font-size: 1rem; padding: 0.25rem;
  }
  .close-btn:hover { color: var(--text); }

  .tabs {
    display: flex; border-bottom: 1px solid var(--border); padding: 0 1rem; gap: 0.25rem;
  }
  .tab {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--text2); cursor: pointer; font-family: inherit;
    font-size: 0.8rem; padding: 0.65rem 0.7rem; transition: all 0.15s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--green); border-bottom-color: var(--green); }

  .filter-row {
    display: flex; flex-wrap: wrap; gap: 0.3rem;
    padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border);
  }
  .pos-filter {
    background: var(--surface2); border: 1px solid var(--border);
    color: var(--text3); cursor: pointer; font-family: inherit;
    font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 2px;
    transition: all 0.12s;
  }
  .pos-filter:hover { border-color: var(--border2); color: var(--text2); }
  .pos-filter.active { border-color: var(--green); color: var(--green); background: var(--green-bg); }

  .player-list {
    display: flex; flex-direction: column; max-height: 420px; overflow-y: auto;
    padding: 0.5rem 1.25rem 1rem;
  }
  .player-row {
    display: flex; align-items: center; gap: 0.6rem;
    font-size: 0.82rem; padding: 0.38rem 0;
    border-bottom: 1px solid var(--border);
  }
  .player-row:last-child { border-bottom: none; }
  .injured-row { opacity: 0.6; }
  .pos-tag {
    background: var(--surface2); color: var(--text3);
    font-size: 0.68rem; padding: 0.1rem 0.35rem;
    border-radius: 2px; min-width: 28px; text-align: center;
  }
  .pinfo { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .pname { flex: 1; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pclub { font-size: 0.68rem; color: var(--text3); }
  .page { color: var(--text3); min-width: 28px; text-align: right; font-size: 0.75rem; }
  .povr { color: var(--green); font-weight: bold; min-width: 26px; text-align: right; }
  .wage { color: var(--text2); font-size: 0.76rem; min-width: 85px; text-align: right; }
  .fee-tag { color: var(--amber); font-weight: bold; font-size: 0.76rem; min-width: 82px; text-align: right; }

  .action-btn {
    padding: 0.22rem 0.65rem; border: 1px solid; cursor: pointer;
    font-family: inherit; font-size: 0.72rem; border-radius: 2px;
    background: transparent; transition: all 0.12s; white-space: nowrap;
  }
  .action-btn:disabled { opacity: 0.3; cursor: default; }
  .buy-btn { border-color: var(--amber); color: var(--amber); }
  .buy-btn:hover:not(:disabled) { background: rgba(245,158,11,0.12); }
  .sign-btn { border-color: var(--green); color: var(--green); }
  .sign-btn:hover:not(:disabled) { background: var(--green-bg); }
  .release-btn { border-color: var(--red); color: var(--red); }
  .release-btn:hover:not(:disabled) { background: rgba(248,113,113,0.1); }

  .empty { color: var(--text3); font-size: 0.82rem; padding: 1rem 0; text-align: center; }
</style>
