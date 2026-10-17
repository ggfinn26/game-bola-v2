<script lang="ts">
  import type { TransferOffer } from "../../engine/transfers.js";

  interface Props {
    offers: TransferOffer[];
    currentClubId: number;
    onaccept: (offer: TransferOffer) => void;
    onclose: () => void;
  }

  let { offers, currentClubId, onaccept, onclose }: Props = $props();

  let accepted = $state(false);

  function accept(offer: TransferOffer) {
    if (accepted) return;
    accepted = true;
    onaccept(offer);
  }

  function formatWage(wage: number): string {
    const jt = wage / 1_000_000;
    const formatted = Number.isInteger(jt) ? jt.toString() : jt.toFixed(1);
    return `Rp ${formatted}jt/bln`;
  }
</script>

<div class="transfer-card" data-current-club={currentClubId}>
  <div class="transfer-header">
    <span class="cat-badge">KONTRAK</span>
    <h3>💼 Bursa Transfer & Negosiasi Kontrak</h3>
  </div>

  <p class="desc">
    Jendela negosiasi kontrak dibuka. Pilih tawaran perpanjangan atau pindah ke klub baru untuk musim mendatang:
  </p>

  <div class="offers-list">
    {#each offers as offer}
      <div class="offer-item" class:renewal={offer.is_renewal}>
        <div class="offer-info">
          <div class="offer-top">
            <span class="club-name">{offer.club_name}</span>
            <span class="rep-tag">Rep {offer.club_reputation}</span>
            <span class="type-badge" class:renewal-badge={offer.is_renewal}>
              {offer.is_renewal ? "Perpanjangan" : "Transfer"}
            </span>
          </div>
          <div class="offer-details">
            <span class="wage">{formatWage(offer.wage)}</span>
            <span class="dot">·</span>
            <span class="duration">Durasi: {offer.contract_years} musim</span>
          </div>
        </div>
        <button class="accept-btn" onclick={() => accept(offer)} disabled={accepted}>
          {accepted ? "Diproses…" : "Terima Tawaran"}
        </button>
      </div>
    {/each}
  </div>

  <div class="footer-actions">
    <button class="close-btn" onclick={onclose}>
      Tetap di Klub Saat Ini / Tutup
    </button>
  </div>
</div>

<style>
  .transfer-card {
    border: 1px solid var(--border2);
    border-top: 2px solid var(--amber);
    background: var(--surface);
    padding: 1.1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    border-radius: var(--radius);
  }
  .transfer-header {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .cat-badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.5rem;
    background: var(--amber);
    color: #000;
    font-weight: bold;
    border-radius: 2px;
  }
  h3 { margin: 0; font-size: 1.05rem; color: var(--text); }
  .desc { margin: 0; font-size: 0.85rem; color: var(--text2); line-height: 1.45; }

  .offers-list { display: flex; flex-direction: column; gap: 0.5rem; }

  .offer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 0.9rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    flex-wrap: wrap;
    transition: border-color 0.15s;
  }
  .offer-item:hover { border-color: var(--border2); }
  .offer-item.renewal {
    border-color: rgba(34,197,94,0.3);
    background: var(--green-bg);
  }

  .offer-info { display: flex; flex-direction: column; gap: 0.3rem; }
  .offer-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .club-name { font-weight: bold; color: var(--text); font-size: 0.95rem; }
  .rep-tag {
    font-size: 0.7rem;
    color: var(--blue);
    background: rgba(96,165,250,0.1);
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
    border: 1px solid rgba(96,165,250,0.2);
  }
  .type-badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.1rem 0.45rem;
    background: rgba(96,165,250,0.15);
    color: var(--blue);
    font-weight: bold;
    border-radius: 2px;
  }
  .type-badge.renewal-badge {
    background: var(--green-bg);
    color: var(--green);
  }
  .offer-details { font-size: 0.82rem; color: var(--text2); display: flex; align-items: center; gap: 0.4rem; }
  .wage { color: var(--green); font-weight: bold; }
  .dot { color: var(--text3); }
  .duration { color: var(--text2); }

  .accept-btn {
    padding: 0.45rem 0.9rem;
    background: var(--green);
    border: none;
    color: #000;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.82rem;
    font-weight: bold;
    border-radius: var(--radius);
    transition: opacity 0.15s;
    white-space: nowrap;
  }
  .accept-btn:hover:not(:disabled) { opacity: 0.85; }
  .accept-btn:disabled { opacity: 0.35; cursor: default; background: var(--text3); color: var(--text2); }

  .footer-actions { display: flex; justify-content: flex-end; padding-top: 0.2rem; }
  .close-btn {
    padding: 0.45rem 0.9rem;
    background: transparent;
    border: 1px solid var(--border2);
    color: var(--text2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.82rem;
    border-radius: var(--radius);
    transition: all 0.15s;
  }
  .close-btn:hover { background: var(--surface2); color: var(--text); }
</style>
