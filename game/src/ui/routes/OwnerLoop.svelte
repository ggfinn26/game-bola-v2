<script lang="ts">
  import type { WorldState, MatchResult } from "../../types/index.js";
  import type { UpcomingFixture, StandingRow } from "../../engine/scheduler.js";
  import type { OwnerState, SlotMarketRow } from "../../engine/owner.js";

  interface Props {
    world: WorldState;
    ownerState: OwnerState;
    clubMarket: SlotMarketRow[];
    standings: StandingRow[];
    upcoming: UpcomingFixture[];
    lastSummary: string | null;
    hasActiveEvent: boolean;
    playerMatch: MatchResult | null;
    championshipSeries: boolean;
    onadvance: (watch?: boolean) => void;
    onloan: (amount: number) => void;
    onloanshark: (amount: number) => void;
    onrepay: (amount: number) => void;
    oninject: (amount: number) => void;
    ondividend: (amount: number) => void;
    onupgrade: (target: "facilities" | "academy" | "stadium") => void;
    onsponsor: () => void;
    onsellclub: () => void;
    onbuyclub: (targetClubId: number, customClubName?: string) => void;
    ontoggleformat: () => void;
  }

  let {
    world,
    ownerState,
    clubMarket,
    standings,
    upcoming,
    lastSummary,
    hasActiveEvent,
    playerMatch,
    championshipSeries,
    onadvance,
    onloan,
    onloanshark,
    onrepay,
    oninject,
    ondividend,
    onupgrade,
    onsponsor,
    onsellclub,
    onbuyclub,
    ontoggleformat,
  }: Props = $props();

  let activeTab = $state<"finance" | "market">("finance");
  let customClubName = $state("");

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
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(0)}jt`;
    return `${sign}Rp ${abs.toLocaleString("id-ID")}`;
  }

  const club = $derived(ownerState.club);
  const clubId = $derived(ownerState.club_id ?? 0);
  const seasonProgress = $derived(Math.round(((world.current_day % DAYS_PER_SEASON) / DAYS_PER_SEASON) * 100));
  const netMonthly = $derived(club ? club.monthly_income - club.monthly_total_costs : 0);

  const myPosition = $derived(clubId > 0 ? standings.findIndex((r) => r.club_id === clubId) + 1 : 0);
  const nextMatch = $derived(upcoming[0] ?? null);
  const daysToNext = $derived(nextMatch ? nextMatch.date - world.current_day : null);
  const nextOpponent = $derived(
    nextMatch
      ? nextMatch.home_club_id === clubId
        ? nextMatch.away_club_name
        : nextMatch.home_club_name
      : null,
  );

  const lastResult = $derived(() => {
    if (!playerMatch || clubId === 0) return null;
    const isHome = playerMatch.home_club === clubId;
    const gf = isHome ? playerMatch.home_goals : playerMatch.away_goals;
    const ga = isHome ? playerMatch.away_goals : playerMatch.home_goals;
    const opp = isHome
      ? standings.find((r) => r.club_id === playerMatch.away_club)?.name ?? "?"
      : standings.find((r) => r.club_id === playerMatch.home_club)?.name ?? "?";
    const outcome = gf > ga ? "MENANG" : gf === ga ? "SERI" : "KALAH";
    const color = gf > ga ? "#22c55e" : gf === ga ? "#f59e0b" : "#f87171";
    return { gf, ga, opp, outcome, color };
  });

  const facUpgradeCost = $derived(club ? club.facilities_level * 600_000_000 : 0);
  const acadUpgradeCost = $derived(club ? Math.max(400_000_000, club.academy_level * 500_000_000) : 0);
  const availableSlotsCount = $derived(clubMarket.filter((m) => m.bankrupt || m.slot_status === "available").length);
</script>

<div class="owner-loop">
  <header>
    <div class="title-row">
      <h2>👑 {club ? club.name : "Konsorsium Tanpa Klub"}</h2>
      {#if myPosition > 0}
        <span class="badge pos-badge">#{myPosition}</span>
      {/if}
      {#if club?.bankrupt}
        <span class="badge bankrupt-badge">BANGKRUT</span>
      {:else if club}
        <span class="badge rep-badge">Rep Klub {club.reputation}</span>
      {/if}
    </div>
    <p class="sub">
      Pemilik: <strong>{ownerState.name}</strong> · Kas Pribadi: <strong class="personal-cash">{formatRupiah(ownerState.personal_cash)}</strong> · Kredit Pribadi: {ownerState.credit_score}/100 · Musim {world.season} ({dayToDate(world.current_day)})
    </p>
  </header>

  {#if club?.bankrupt}
    <div class="alert bankrupt">
      💥 <strong>KLUB BANGKRUT:</strong> Gagal menutup defisit kas 3 kali beruntun. Pemain bintang dilepas sebagai Free Agent dan Slot Liga telah masuk bursa penjualan. Kamu bisa mengakuisisi kembali slot ini atau membeli klub lain di tab <strong>Bursa Slot & Klub</strong>.
    </div>
  {:else if club && club.consecutive_missed_payments > 0}
    <div class="alert warning">
      ⚠️ <strong>PERINGATAN DEFISIT ({club.consecutive_missed_payments}/3):</strong> Kas klub negatif! Segera suntik modal pribadi atau ajukan pinjaman bank sebelum klub disita & bangkrut.
    </div>
  {/if}

  {#if lastSummary}
    <div class="alert summary">{lastSummary}</div>
  {/if}

  {#if club}
    <section class="stats-row">
      <div class="stat">
        <span class="label">Kas Klub</span>
        <span class="val" class:neg={club.cash < 0} class:pos={club.cash >= 0}>{formatRupiah(club.cash)}</span>
      </div>
      <div class="stat">
        <span class="label">Utang Bank ({(club.interest_rate * 100).toFixed(1)}%/bln)</span>
        <span class="val" class:warn={club.debt > 0}>{formatRupiah(club.debt)}</span>
      </div>
      <div class="stat">
        <span class="label">Pendapatan/Bln</span>
        <span class="val pos">+{formatRupiah(club.monthly_income)}</span>
      </div>
      <div class="stat">
        <span class="label">Beban/Bln</span>
        <span class="val warn">-{formatRupiah(club.monthly_total_costs)}</span>
      </div>
      <div class="stat">
        <span class="label">Arus Kas Bersih</span>
        <span class="val" class:pos={netMonthly >= 0} class:neg={netMonthly < 0}>
          {netMonthly >= 0 ? "+" : ""}{formatRupiah(netMonthly)}
        </span>
      </div>
      <div class="stat">
        <span class="label">Skor Kredit</span>
        <span class="val" class:neg={club.credit_score < 30}>{club.credit_score}/100</span>
      </div>
      <div class="stat">
        <span class="label">Valuasi Klub</span>
        <span class="val">{formatRupiah(club.valuation)}</span>
      </div>
    </section>
  {/if}

  {#if lastResult()}
    {@const r = lastResult()!}
    <section class="match-result" style="border-color:{r.color}">
      <span class="result-label" style="color:{r.color}">{r.outcome}</span>
      <span class="score">{r.gf} : {r.ga}</span>
      <span class="opponent-label">vs {r.opp}</span>
    </section>
  {/if}

  {#if club && nextMatch}
    <section class="next-match">
      <span class="nm-label">Jadwal Berikutnya:</span>
      <strong>vs {nextOpponent}</strong>
      <span class="sub-inline">
        · Pekan {nextMatch.week} · {dayToDate(nextMatch.date)}
        {daysToNext! > 0 ? `(${daysToNext} hari lagi)` : "(hari ini)"}
      </span>
    </section>
  {/if}

  <section class="progress-bar-wrap">
    <div class="progress-label">Progres musim {seasonProgress}%</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:{seasonProgress}%"></div>
    </div>
  </section>

  <section class="actions">
    <button class="primary-btn" onclick={() => onadvance(false)} disabled={hasActiveEvent}>
      {nextMatch
        ? `⚡ Lanjut ke Pekan ${nextMatch.week}`
        : `🏆 Lanjut / Evaluasi Musim`}
    </button>
    {#if club && nextMatch && !club.bankrupt}
      <button class="watch-btn" onclick={() => onadvance(true)} disabled={hasActiveEvent}>
        🎡 Tonton Match
      </button>
    {/if}
    <button class="format-btn" onclick={ontoggleformat} disabled={hasActiveEvent}>
      ⚙️ Format: {championshipSeries ? "Championship Series (4 Besar)" : "Liga Penuh"}
    </button>
  </section>

  <section class="tabs-panel">
    <div class="tab-header">
      <button
        class="tab-btn"
        class:active={activeTab === "finance"}
        onclick={() => (activeTab = "finance")}
      >
        🏦 Keuangan, Bank & Infrastruktur
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === "market"}
        onclick={() => (activeTab = "market")}
      >
        🏛️ Bursa Slot Liga & Klub
        {#if availableSlotsCount > 0}
          <span class="slot-pill">{availableSlotsCount} Slot Tersedia</span>
        {/if}
      </button>
    </div>

    {#if activeTab === "finance"}
      {#if !club}
        <p class="empty-msg">
          Kamu sedang tidak memiliki klub aktif. Buka tab <strong>Bursa Slot Liga & Klub</strong> untuk membeli slot liga atau mengakuisisi klub menggunakan kas pribadimu ({formatRupiah(ownerState.personal_cash)}).
        </p>
      {:else}
        <div class="finance-grid">
          <div class="fin-card">
            <div class="card-title">📊 Rincian Operasional Bulanan</div>
            <div class="fin-row">
              <span>Pendapatan Komersial, TV & Tiket</span>
              <strong class="pos">+{formatRupiah(club.monthly_income)}</strong>
            </div>
            <div class="fin-row">
              <span>Gaji Skuad Pemain</span>
              <strong class="warn">-{formatRupiah(club.monthly_wages)}</strong>
            </div>
            <div class="fin-row">
              <span>Perawatan Fasilitas & Akademi</span>
              <strong class="warn">-{formatRupiah(club.monthly_facilities)}</strong>
            </div>
            <div class="fin-row">
              <span>Cicilan & Bunga Pinjaman Bank</span>
              <strong class="warn">-{formatRupiah(club.monthly_loan_payment)}</strong>
            </div>
            <div class="fin-row total">
              <span>Estimasi Arus Kas Bersih / Bulan</span>
              <strong class:pos={netMonthly >= 0} class:neg={netMonthly < 0}>
                {netMonthly >= 0 ? "+" : ""}{formatRupiah(netMonthly)}
              </strong>
            </div>
          </div>

          <div class="fin-card">
            <div class="card-title">🏦 Pinjaman Bank & Modal Pemilik</div>
            <p class="card-desc">
              Skor Kredit Klub: <strong>{club.credit_score}/100</strong> · Bunga Pinjaman: <strong>{(club.interest_rate * 100).toFixed(1)}%/bln</strong>
            </p>
            <div class="btn-group">
              <button
                onclick={() => onloan(2_000_000_000)}
                disabled={club.bankrupt || club.credit_score <= 0}
              >
                🏦 Pinjam Bank Rp 2M
              </button>
              <button
                onclick={() => onloan(5_000_000_000)}
                disabled={club.bankrupt || club.credit_score <= 0}
              >
                🏦 Pinjam Bank Rp 5M
              </button>
              <button
                class="btn-red"
                onclick={() => onloanshark(3_000_000_000)}
                disabled={club.bankrupt}
              >
                🦈 Pinjam Rentenir Rp 3M (8%/bln)
              </button>
              <button
                onclick={() => onrepay(2_000_000_000)}
                disabled={club.debt <= 0 || club.cash < Math.min(club.debt, 2_000_000_000)}
              >
                💸 Bayar Utang Rp 2M
              </button>
              <button
                onclick={() => onrepay(club.debt)}
                disabled={club.debt <= 0 || club.cash < club.debt}
              >
                ✅ Lunasi Utang ({formatRupiah(club.debt)})
              </button>
            </div>
            <div class="divider"></div>
            <div class="btn-group">
              <button
                class="btn-green"
                onclick={() => oninject(2_000_000_000)}
                disabled={ownerState.personal_cash < 2_000_000_000}
              >
                💉 Suntik Modal Pribadi Rp 2M
              </button>
              <button
                class="btn-amber"
                onclick={() => ondividend(1_500_000_000)}
                disabled={club.bankrupt || club.cash < 2_000_000_000}
              >
                💰 Tarik Dividen Rp 1.5M
              </button>
              <button
                class="btn-blue"
                onclick={onsponsor}
                disabled={club.bankrupt}
              >
                🤝 Negosiasi Sponsor Baru
              </button>
            </div>
          </div>

          <div class="fin-card">
            <div class="card-title">🏟️ Infrastruktur, Akademi & Saham Klub</div>
            <div class="infra-list">
              <div class="infra-item">
                <div>
                  <strong>🏋️ Fasilitas Latihan (Lv. {club.facilities_level}/10)</strong>
                  <div class="infra-sub">Mempercepat pertumbuhan CA/PA pemain setiap akhir musim</div>
                </div>
                <button
                  onclick={() => onupgrade("facilities")}
                  disabled={club.bankrupt || club.facilities_level >= 10 || club.cash < facUpgradeCost}
                >
                  {club.facilities_level >= 10 ? "Maksimal" : `Upgrade (${formatRupiah(facUpgradeCost)})`}
                </button>
              </div>

              <div class="infra-item">
                <div>
                  <strong>🌱 Akademi Muda (Lv. {club.academy_level}/10)</strong>
                  <div class="infra-sub">Meningkatkan reputasi & pembinaan talenta muda klub</div>
                </div>
                <button
                  onclick={() => onupgrade("academy")}
                  disabled={club.bankrupt || club.academy_level >= 10 || club.cash < acadUpgradeCost}
                >
                  {club.academy_level >= 10 ? "Maksimal" : `Upgrade (${formatRupiah(acadUpgradeCost)})`}
                </button>
              </div>

              <div class="infra-item">
                <div>
                  <strong>🏟️ Stadion ({club.stadium_capacity.toLocaleString("id-ID")} Kursi · {club.fans.toLocaleString("id-ID")} Fans)</strong>
                  <div class="infra-sub">Tambah +5.000 kursi untuk mendongkrak pendapatan tiket bulanan</div>
                </div>
                <button
                  onclick={() => onupgrade("stadium")}
                  disabled={club.bankrupt || club.stadium_capacity >= 85000 || club.cash < 1_500_000_000}
                >
                  {club.stadium_capacity >= 85000 ? "Maksimal" : "Perluas (+Rp 1.50M)"}
                </button>
              </div>
            </div>

            <div class="divider"></div>
            <div class="sell-row">
              <div>
                <strong>🏷️ Jual Saham Mayoritas Klub</strong>
                <div class="infra-sub">Lepas kepemilikan {club.name} ke investor dan cairkan ke Kas Pribadi</div>
              </div>
              <button
                class="btn-red"
                onclick={onsellclub}
                disabled={club.bankrupt}
              >
                Jual Klub ({formatRupiah(Math.round(club.valuation * 0.9))})
              </button>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <div class="market-header">
        <div class="market-hint">
          💡 Saat klub gagal membayar defisit 3 kali beruntun, klub dinyatakan <strong>Bangkrut</strong> dan <strong>Slot Liga</strong> miliknya masuk pasar. Kamu dapat membeli slot kosong atau mengakuisisi klub lain menggunakan Kas Pribadi (<strong>{formatRupiah(ownerState.personal_cash)}</strong>).
        </div>
        <label class="rename-box">
          <span>Nama Baru Klub (Opsional saat beli Slot / Akuisisi):</span>
          <input
            bind:value={customClubName}
            maxlength={36}
            placeholder="Kosongkan jika tetap memakai nama asli klub..."
          />
        </label>
      </div>

      <div class="market-list">
        {#each clubMarket as m (m.club_id)}
          <div class="market-card" class:bankrupt-card={m.bankrupt || m.slot_status === "available"} class:owned-card={m.is_owned}>
            <div class="m-info">
              <div class="m-top">
                <strong class="m-name">{m.club_name}</strong>
                <span class="m-rep">Rep {m.reputation}</span>
                {#if m.is_owned}
                  <span class="m-badge owned">KLUB MILIKMU</span>
                {:else if m.bankrupt || m.slot_status === "available"}
                  <span class="m-badge slot-open">SLOT LIGA TERSEDIA (BANGKRUT)</span>
                {:else}
                  <span class="m-badge occupied">SLOT TERISI</span>
                {/if}
              </div>
              <div class="m-meta">
                <span>💰 Kas Klub: <strong class:neg={m.cash < 0}>{formatRupiah(m.cash)}</strong></span>
                <span>🏦 Utang: <strong>{formatRupiah(m.debt)}</strong></span>
                <span>🏷️ {m.bankrupt || m.slot_status === "available" ? "Harga Slot Liga" : "Valuasi Akuisisi"}: <strong>{formatRupiah(m.acquisition_price)}</strong></span>
              </div>
            </div>
            <div class="m-actions">
              {#if !m.is_owned}
                <button
                  class={m.bankrupt || m.slot_status === "available" ? "btn-slot" : "btn-buy"}
                  onclick={() => onbuyclub(m.club_id, customClubName)}
                >
                  {m.bankrupt || m.slot_status === "available"
                    ? `🏛️ Beli Slot Liga (${formatRupiah(m.acquisition_price)})`
                    : `👑 Akuisisi (${formatRupiah(m.acquisition_price)})`}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .owner-loop { display: flex; flex-direction: column; gap: 1rem; }

  header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
  .title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 1.35rem; color: var(--text); }
  .badge { padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: bold; border-radius: 2px; }
  .pos-badge { background: var(--green); color: #000; }
  .rep-badge { background: var(--surface2); color: var(--blue); border: 1px solid var(--border2); }
  .bankrupt-badge { background: var(--red); color: #000; }
  .sub { margin: 0.35rem 0 0; color: var(--text2); font-size: 0.82rem; }
  .personal-cash { color: var(--green); }

  .alert {
    padding: 0.6rem 0.85rem;
    font-size: 0.83rem;
    border-left: 3px solid var(--green);
    background: var(--green-bg);
    color: var(--green);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .alert.warning {
    border-left-color: var(--amber);
    background: rgba(245, 158, 11, 0.1);
    color: var(--amber);
  }
  .alert.bankrupt {
    border-left-color: var(--red);
    background: rgba(248, 113, 113, 0.1);
    color: var(--red);
  }

  .stats-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 95px;
  }
  .label { font-size: 0.65rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; text-align: center; }
  .val { font-size: 0.98rem; font-weight: bold; color: var(--text); margin-top: 0.2rem; }
  .val.pos, strong.pos { color: var(--green); }
  .val.warn, strong.warn { color: var(--amber); }
  .val.neg, strong.neg { color: var(--red); }

  .match-result {
    display: flex;
    align-items: center;
    gap: 1rem;
    border: 1px solid var(--border2);
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    background: var(--surface);
  }
  .result-label { font-weight: bold; font-size: 0.85rem; }
  .score { font-size: 1.35rem; font-weight: bold; color: var(--text); }
  .opponent-label { font-size: 0.82rem; color: var(--text2); }

  .next-match { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; font-size: 0.86rem; }
  .nm-label { color: var(--text3); text-transform: uppercase; font-size: 0.72rem; }
  .sub-inline { color: var(--text2); font-size: 0.8rem; }

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
  .actions .watch-btn { border-color: var(--blue); color: var(--blue); }
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
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.6rem;
    margin-bottom: 0.8rem;
  }
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.9rem;
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
  .slot-pill {
    background: var(--amber);
    color: #000;
    font-size: 0.68rem;
    font-weight: bold;
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
  }

  .empty-msg { color: var(--text2); font-size: 0.85rem; text-align: center; padding: 1.5rem 0.5rem; }

  .finance-grid { display: flex; flex-direction: column; gap: 0.75rem; }
  .fin-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .card-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text2);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.35rem;
  }
  .card-desc { margin: 0; font-size: 0.78rem; color: var(--text2); }

  .fin-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.82rem;
    color: var(--text2);
    padding: 0.15rem 0;
  }
  .fin-row.total {
    border-top: 1px solid var(--border);
    padding-top: 0.4rem;
    margin-top: 0.2rem;
    color: var(--text);
  }

  .btn-group { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .btn-group button, .infra-item button, .sell-row button {
    padding: 0.42rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text);
    font-family: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    border-radius: var(--radius);
    transition: all 0.12s;
  }
  .btn-group button:hover:not(:disabled),
  .infra-item button:hover:not(:disabled),
  .sell-row button:hover:not(:disabled) {
    border-color: var(--green);
    color: var(--green);
  }
  .btn-group button:disabled,
  .infra-item button:disabled,
  .sell-row button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .btn-green { border-color: var(--green) !important; color: var(--green) !important; }
  .btn-amber { border-color: var(--amber) !important; color: var(--amber) !important; }
  .btn-blue { border-color: var(--blue) !important; color: var(--blue) !important; }
  .btn-red { border-color: var(--red) !important; color: var(--red) !important; }

  .divider { border-top: 1px solid var(--border); margin: 0.2rem 0; }

  .infra-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .infra-item, .sell-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    font-size: 0.82rem;
  }
  .infra-sub { font-size: 0.73rem; color: var(--text2); margin-top: 0.15rem; }

  .market-header {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-bottom: 0.75rem;
  }
  .market-hint {
    font-size: 0.76rem;
    color: var(--text2);
    padding: 0.5rem 0.7rem;
    background: var(--surface2);
    border-radius: var(--radius);
    line-height: 1.4;
  }
  .rename-box {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.74rem;
    color: var(--text2);
  }
  .rename-box input {
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 0.45rem 0.65rem;
    font-family: inherit;
    font-size: 0.82rem;
    border-radius: var(--radius);
  }
  .rename-box input:focus { outline: 1px solid var(--green); border-color: var(--green); }

  .market-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 440px;
    overflow-y: auto;
  }
  .market-card {
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
  .market-card.bankrupt-card {
    border-color: var(--amber);
    background: rgba(245, 158, 11, 0.06);
  }
  .market-card.owned-card {
    border-color: var(--green);
  }
  .m-info { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; min-width: 240px; }
  .m-top { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.86rem; }
  .m-name { color: var(--text); }
  .m-rep { color: var(--text3); font-size: 0.76rem; }
  .m-badge {
    font-size: 0.66rem;
    font-weight: bold;
    padding: 0.1rem 0.45rem;
    border-radius: 2px;
  }
  .m-badge.owned { background: var(--green); color: #000; }
  .m-badge.slot-open { background: var(--amber); color: #000; }
  .m-badge.occupied { background: var(--border2); color: var(--text2); }

  .m-meta {
    display: flex;
    gap: 0.85rem;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: var(--text2);
  }
  .m-actions button {
    padding: 0.4rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    font-family: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .btn-slot { border-color: var(--amber) !important; color: var(--amber) !important; font-weight: bold; }
  .btn-buy { border-color: var(--green) !important; color: var(--green) !important; }
</style>
