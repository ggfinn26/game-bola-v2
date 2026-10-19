<script lang="ts">
  import type { LegalCase, LegalResolutionInput } from "../../engine/legal.js";

  interface Props {
    legalCase: LegalCase;
    onresolve: (input: LegalResolutionInput) => void;
  }

  let { legalCase, onresolve }: Props = $props();

  function formatRupiah(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  const bribeSmall = $derived(Math.round(legalCase.case_value * 0.5));
  const bribeFull = $derived(legalCase.case_value);
  const bribeHigh = $derived(Math.round(legalCase.case_value * 1.5));
</script>

<div class="overlay">
  <div class="modal">
    <div class="header">
      <span class="badge-sev">TINGKAT BAHAYA {legalCase.severity}/5</span>
      <span class="badge-media">📰 Sorotan Media: {legalCase.media_exposure}%</span>
    </div>

    <h3>{legalCase.title}</h3>
    <p class="desc">{legalCase.description}</p>

    <div class="info-bar">
      <span>⛓️ Ancaman Vonis Dasar: <strong>{legalCase.base_min_days}–{legalCase.base_max_days} hari penjara</strong></span>
      <span>🕵️ Sikap Penyidik: <strong>??? (Terungkap saat eksekusi)</strong></span>
    </div>

    <div class="paths">
      <div class="path-card bribe">
        <div class="path-title">🤫 Jalur A — Suap Penyidik (Risiko Tinggi)</div>
        <p class="path-sub">
          Tawarkan uang damai di bawah meja. Jika penyidik jujur/anti-suap, uang hangus dan hukuman ditambah pasal penyuapan (+30–90 hari).
        </p>
        <div class="btn-row">
          <button onclick={() => onresolve({ path: "bribe", bribeAmount: bribeSmall })}>
            Amplop Kecil ({formatRupiah(bribeSmall)})
          </button>
          <button onclick={() => onresolve({ path: "bribe", bribeAmount: bribeFull })}>
            Suap Standar ({formatRupiah(bribeFull)})
          </button>
          <button class="hi-bribe" onclick={() => onresolve({ path: "bribe", bribeAmount: bribeHigh })}>
            Koper Penuh ({formatRupiah(bribeHigh)})
          </button>
        </div>
      </div>

      <div class="path-card lawyer">
        <div class="path-title">⚖️ Jalur B — Lawan di Pengadilan (Sewa Pengacara)</div>
        <p class="path-sub">
          Peluang menang ditentukan Skill Pengacara (1–10) dikurangi tingkat keparahan kasus & tekanan media. Bisa Bebas Murni, Vonis Ringan (-40%), atau Vonis Penuh.
        </p>
        <div class="btn-row">
          <button onclick={() => onresolve({ path: "lawyer", lawyerSkill: 3, lawyerCost: 25_000_000 })}>
            Pengacara Junior (Skill 3 · Rp 25jt)
          </button>
          <button onclick={() => onresolve({ path: "lawyer", lawyerSkill: 6, lawyerCost: 150_000_000 })}>
            Pengacara Kriminal (Skill 6 · Rp 150jt)
          </button>
          <button onclick={() => onresolve({ path: "lawyer", lawyerSkill: 9, lawyerCost: 600_000_000 })}>
            Pengacara Kondang (Skill 9 · Rp 600jt)
          </button>
          <button class="hi-lawyer" onclick={() => onresolve({ path: "lawyer", lawyerSkill: 10, lawyerCost: 1_500_000_000 })}>
            Tim Hukum Elit (Skill 10 · Rp 1.50M)
          </button>
        </div>
      </div>

      <div class="path-card surrender">
        <div class="path-title">⛓️ Jalur C — Pasrah & Kooperatif</div>
        <p class="path-sub">
          Akui kesalahan tanpa biaya pengacara atau suap. Hakim memberikan keringanan masa tahanan -20% karena sikap kooperatif.
        </p>
        <div class="btn-row">
          <button class="btn-surrender" onclick={() => onresolve({ path: "surrender" })}>
            🏳️ Terima Vonis Kooperatif (-20% Masa Hukuman)
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 250;
  }
  .modal {
    background: var(--surface);
    border: 2px solid var(--red);
    border-radius: var(--radius);
    max-width: 640px;
    width: 100%;
    max-height: 92vh;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .badge-sev {
    background: var(--red);
    color: #000;
    font-size: 0.7rem;
    font-weight: bold;
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
  }
  .badge-media {
    font-size: 0.74rem;
    color: var(--amber);
    background: rgba(245, 158, 11, 0.12);
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
  }
  h3 { margin: 0; font-size: 1.15rem; color: var(--text); }
  .desc { margin: 0; font-size: 0.84rem; color: var(--text2); line-height: 1.5; }
  .info-bar {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.78rem;
    color: var(--text2);
    background: var(--surface2);
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius);
    border-left: 3px solid var(--red);
  }
  .paths { display: flex; flex-direction: column; gap: 0.65rem; }
  .path-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .path-card.bribe { border-left: 3px solid var(--amber); }
  .path-card.lawyer { border-left: 3px solid var(--blue); }
  .path-card.surrender { border-left: 3px solid var(--text3); }

  .path-title { font-size: 0.84rem; font-weight: bold; color: var(--text); }
  .path-sub { margin: 0; font-size: 0.75rem; color: var(--text2); line-height: 1.4; }

  .btn-row { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-top: 0.15rem; }
  .btn-row button {
    padding: 0.42rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text);
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    border-radius: var(--radius);
    transition: all 0.12s;
  }
  .btn-row button:hover { border-color: var(--green); color: var(--green); }
  .hi-bribe { border-color: var(--amber) !important; color: var(--amber) !important; font-weight: bold; }
  .hi-lawyer { border-color: var(--blue) !important; color: var(--blue) !important; font-weight: bold; }
  .btn-surrender { border-color: var(--red) !important; color: var(--red) !important; }
</style>
