<script lang="ts">
  import type { WorldState, MatchResult, Player } from "../../types/index.js";
  import type { UpcomingFixture, StandingRow, ClubManagerConfig, ClubStaffLevels } from "../../engine/scheduler.js";

  interface Props {
    world: WorldState;
    managerName: string;
    managerClubId: number;
    clubName: string;
    standings: StandingRow[];
    upcoming: UpcomingFixture[];
    squad: Player[];
    managerConfig: ClubManagerConfig | null;
    lastSummary: string | null;
    hasActiveEvent: boolean;
    playerMatch: MatchResult | null;
    championshipSeries: boolean;
    onadvance: (watch?: boolean) => void;
    onopentransfers: () => void;
    ontoggleformat: () => void;
    onsettactics: (formation: ClubManagerConfig["formation"], mentality: ClubManagerConfig["mentality"]) => void;
    ontogglestarter: (playerId: number) => void;
    onupgradestaff: (role: keyof ClubStaffLevels) => void;
  }

  let {
    world,
    managerName,
    managerClubId,
    clubName,
    standings,
    upcoming,
    squad,
    managerConfig,
    lastSummary,
    hasActiveEvent,
    playerMatch,
    championshipSeries,
    onadvance,
    onopentransfers,
    ontoggleformat,
    onsettactics,
    ontogglestarter,
    onupgradestaff,
  }: Props = $props();

  const DAYS_PER_SEASON = 365;
  const monthNames = ["Ags","Sep","Okt","Nov","Des","Jan","Feb","Mar","Apr","Mei","Jun","Jul"];
  const FORMATIONS: ClubManagerConfig["formation"][] = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"];
  const MENTALITIES: { key: ClubManagerConfig["mentality"]; label: string }[] = [
    { key: "attacking", label: "⚔️ Menyerang" },
    { key: "balanced", label: "⚖️ Seimbang" },
    { key: "defensive", label: "🛡️ Bertahan" },
  ];

  const STAFF_ROLES: { key: keyof ClubStaffLevels; label: string; desc: string }[] = [
    { key: "coach", label: "🎯 Pelatih Kepala", desc: "+2% Taktik & Latihan PA/Lv" },
    { key: "assistant", label: "📋 Asisten Manajer", desc: "+2% Kohesi & Taktik/Lv" },
    { key: "physio", label: "⚡ Fisioterapis", desc: "Pemulihan Stamina Cepat" },
    { key: "doctor", label: "🏥 Dokter Klub", desc: "-8% Durasi Cedera/Lv" },
  ];

  function dayToDate(day: number): string {
    const d = Math.max(0, day - 1) % DAYS_PER_SEASON;
    return `${(d % 30) + 1} ${monthNames[Math.floor(d / 30) % 12]}`;
  }

  function formatRupiah(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
    if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)}jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  const seasonProgress = $derived(Math.round(((world.current_day % DAYS_PER_SEASON) / DAYS_PER_SEASON) * 100));
  const seasonDay = $derived(world.current_day % DAYS_PER_SEASON);
  const transferWindowOpen = $derived(seasonDay < 14 || (seasonDay >= 180 && seasonDay < 194));

  const myRecord = $derived(standings.find((r) => r.club_id === managerClubId) ?? null);
  const myPosition = $derived(standings.findIndex((r) => r.club_id === managerClubId) + 1);

  const nextMatch = $derived(upcoming[0] ?? null);
  const daysToNext = $derived(nextMatch ? nextMatch.date - world.current_day : null);
  const nextOpponent = $derived(
    nextMatch
      ? nextMatch.home_club_id === managerClubId
        ? nextMatch.away_club_name
        : nextMatch.home_club_name
      : null,
  );

  const lastResult = $derived(() => {
    if (!playerMatch) return null;
    const isHome = playerMatch.home_club === managerClubId;
    const gf = isHome ? playerMatch.home_goals : playerMatch.away_goals;
    const ga = isHome ? playerMatch.away_goals : playerMatch.home_goals;
    const opp = isHome
      ? standings.find((r) => r.club_id === playerMatch.away_club)?.name ?? "?"
      : standings.find((r) => r.club_id === playerMatch.home_club)?.name ?? "?";
    const outcome = gf > ga ? "MENANG" : gf === ga ? "SERI" : "KALAH";
    const color = gf > ga ? "#2a6" : gf === ga ? "#996" : "#a33";
    return { gf, ga, opp, outcome, color };
  });

  const starterSet = $derived(new Set(managerConfig?.starter_ids ?? []));
  const curFormation = $derived(managerConfig?.formation ?? "4-3-3");
  const curMentality = $derived(managerConfig?.mentality ?? "balanced");
  const clubCash = $derived(managerConfig?.club_cash ?? 0);
</script>

<div class="mgr">
  <header>
    <div class="title-row">
      <h2>{clubName}</h2>
      {#if myPosition > 0}
        <span class="badge pos-badge">#{myPosition}</span>
      {/if}
      <span class="cash-badge">💰 Kas Klub: {formatRupiah(clubCash)}</span>
    </div>
    <p class="sub">
      Manajer: {managerName} · Musim {world.season} · {dayToDate(world.current_day)}
    </p>
  </header>

  {#if lastSummary}
    <div class="alert banner">{lastSummary}</div>
  {/if}

  <section class="stats-row">
    {#if myRecord}
      <div class="stat"><span class="label">Main</span><span class="val">{myRecord.played}</span></div>
      <div class="stat"><span class="label">M</span><span class="val win">{myRecord.wins}</span></div>
      <div class="stat"><span class="label">S</span><span class="val draw">{myRecord.draws}</span></div>
      <div class="stat"><span class="label">K</span><span class="val loss">{myRecord.losses}</span></div>
      <div class="stat"><span class="label">Gol</span><span class="val">{myRecord.goals_for}:{myRecord.goals_against}</span></div>
      <div class="stat"><span class="label">Poin</span><span class="val pts">{myRecord.points}</span></div>
    {/if}
    <div class="stat"><span class="label">Legacy</span><span class="val">{world.ego.legacy_score}</span></div>
  </section>

  {#if lastResult()}
    {@const r = lastResult()!}
    <section class="match-result" style="border-color:{r.color}">
      <span class="result-label" style="color:{r.color}">{r.outcome}</span>
      <span class="score">{r.gf} – {r.ga}</span>
      <span class="opponent-label">vs {r.opp}</span>
    </section>
  {/if}

  <section class="next-match">
    {#if nextMatch}
      <p class="nm-label">Pertandingan berikutnya</p>
      <p class="nm-opp">vs <strong>{nextOpponent}</strong></p>
      <p class="sub">
        {nextMatch.stage_id === "championship_sf"
          ? `🔥 Semifinal Championship (Pekan ${nextMatch.week})`
          : nextMatch.stage_id === "championship_final"
            ? `🏆 Final Championship (Pekan ${nextMatch.week})`
            : `Pekan ${nextMatch.week}`}
        · {dayToDate(nextMatch.date)}
        {daysToNext! > 0 ? `(${daysToNext} hari lagi)` : "(hari ini)"}
      </p>
    {:else}
      <p class="sub">Semua pekan Musim {world.season} telah selesai.</p>
    {/if}
  </section>

  <section class="progress-bar-wrap">
    <div class="progress-label">Progres musim {seasonProgress}%</div>
    <div class="progress-bar"><div class="progress-fill" style="width:{seasonProgress}%"></div></div>
  </section>

  <!-- Tactics & Staff Row -->
  <div class="mgr-grid">
    <section class="tactics-panel">
      <div class="panel-title">📋 Taktik & Formasi</div>
      <div class="tactic-group">
        <span class="t-label">Formasi:</span>
        <div class="t-btns">
          {#each FORMATIONS as f}
            <button
              class="t-btn"
              class:active={curFormation === f}
              onclick={() => onsettactics(f, curMentality)}
            >{f}</button>
          {/each}
        </div>
      </div>
      <div class="tactic-group">
        <span class="t-label">Gaya Main:</span>
        <div class="t-btns">
          {#each MENTALITIES as m}
            <button
              class="t-btn"
              class:active={curMentality === m.key}
              onclick={() => onsettactics(curFormation, m.key)}
            >{m.label}</button>
          {/each}
        </div>
      </div>
    </section>

    <section class="staff-panel">
      <div class="panel-title">🎓 Staf Pelatih & Medis</div>
      <div class="staff-list">
        {#each STAFF_ROLES as sr}
          {@const lv = managerConfig?.staff?.[sr.key] ?? 1}
          {@const cost = lv * 25_000_000}
          <div class="staff-row">
            <div class="staff-info">
              <span class="staff-name">{sr.label} <strong>Lv.{lv}</strong></span>
              <span class="staff-desc">{sr.desc}</span>
            </div>
            {#if lv < 5}
              <button
                class="staff-up-btn"
                disabled={clubCash < cost}
                onclick={() => onupgradestaff(sr.key)}
              >
                ⬆️ {formatRupiah(cost)}
              </button>
            {:else}
              <span class="max-badge">MAX</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </div>

  <section class="actions">
    <button onclick={() => onadvance(false)} disabled={hasActiveEvent}>
      {nextMatch
        ? `⚡ Simulasi Cepat (Pekan ${nextMatch.week})`
        : `🏆 Akhiri Musim ${world.season} & Lanjut ke Musim ${world.season + 1}`}
    </button>
    {#if nextMatch}
      <button class="watch-btn" onclick={() => onadvance(true)} disabled={hasActiveEvent}>
        🎡 Tonton Match (Intervensi Live)
      </button>
    {/if}
    <button class="transfer-btn" onclick={onopentransfers} disabled={hasActiveEvent || !transferWindowOpen}>
      💼 {transferWindowOpen ? "Bursa Transfer (Buka)" : "Transfer (Jendela Tutup)"}
    </button>
    <button class="format-btn" onclick={ontoggleformat} disabled={hasActiveEvent}>
      ⚙️ Format: {championshipSeries ? "Championship Series" : "Liga Penuh"}
    </button>
  </section>

  {#if squad.length > 0}
    <section class="squad-panel">
      <div class="panel-title">
        Skuad & Pemilihan Starting XI ({starterSet.size}/11 Starter · Total {squad.length} Pemain)
      </div>
      <div class="squad-list">
        {#each squad as p}
          {@const isStarter = starterSet.has(p.id)}
          {@const stamPct = Math.round((p.stamina ?? 1) * 100)}
          <div class="squad-row" class:starter-row={isStarter} class:injured={p.injured || p.in_prison}>
            <button
              class="xi-btn"
              class:xi-active={isStarter}
              onclick={() => ontogglestarter(p.id)}
              disabled={p.injured || p.in_prison}
              title="Klik untuk masuk/keluar Starting XI"
            >
              {isStarter ? "✅ XI" : "🪑 Sub"}
            </button>
            <span class="pos-tag">{p.position}</span>
            <span class="pname">{p.name}</span>
            <span class="page">{p.age}th</span>
            <span class="stam-tag" class:stam-low={stamPct < 55}>⚡{stamPct}%</span>
            <span class="povr">OVR {p.overall}</span>
            {#if p.in_prison}
              <span class="injbadge">⛓️ Penjara</span>
            {:else if p.injured}
              <span class="injbadge">🏥 {p.injury_duration}h</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .mgr { display: flex; flex-direction: column; gap: 1rem; }

  header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
  .title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 1.35rem; color: var(--text); letter-spacing: -0.3px; }
  .badge { padding: 0.15rem 0.5rem; font-size: 0.7rem; font-weight: bold; border-radius: 2px; }
  .pos-badge { background: var(--green); color: #000; }
  .cash-badge {
    margin-left: auto;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--amber);
    font-size: 0.76rem;
    font-weight: bold;
    padding: 0.2rem 0.6rem;
    border-radius: 2px;
  }
  .sub { margin: 0.3rem 0 0; color: var(--text2); font-size: 0.82rem; }

  .alert.banner {
    padding: 0.55rem 0.85rem;
    font-size: 0.83rem;
    border-left: 3px solid var(--green);
    background: var(--green-bg);
    color: var(--green);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .stats-row {
    display: flex; gap: 0.5rem; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 0.75rem 1rem;
  }
  .stat { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 40px; }
  .label { font-size: 0.68rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; }
  .val { font-size: 1.2rem; font-weight: bold; color: var(--text); margin-top: 0.15rem; }
  .val.win { color: var(--green); }
  .val.draw { color: var(--amber); }
  .val.loss { color: var(--red); }
  .val.pts { color: var(--blue); font-size: 1.4rem; }

  .match-result {
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    border: 1px solid var(--border2); padding: 0.75rem 1rem;
    border-radius: var(--radius); background: var(--surface);
  }
  .result-label { font-weight: bold; font-size: 0.85rem; letter-spacing: 0.06em; }
  .score { font-size: 1.5rem; font-weight: bold; color: var(--text); }
  .opponent-label { font-size: 0.82rem; color: var(--text2); }

  .next-match { display: flex; flex-direction: column; gap: 0.2rem; }
  .nm-label { font-size: 0.72rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; margin: 0; }
  .nm-opp { margin: 0; font-size: 1.05rem; color: var(--text); }

  .progress-bar-wrap { display: flex; flex-direction: column; gap: 0.35rem; }
  .progress-label { font-size: 0.72rem; color: var(--text3); }
  .progress-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--green); transition: width 0.4s; border-radius: 2px; }

  .mgr-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
  }
  @media (max-width: 680px) {
    .mgr-grid { grid-template-columns: 1fr; }
  }

  .tactics-panel, .staff-panel {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--radius);
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .tactic-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .t-label { font-size: 0.72rem; color: var(--text2); }
  .t-btns { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .t-btn {
    padding: 0.3rem 0.65rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.75rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .t-btn:hover { border-color: var(--text2); color: var(--text); }
  .t-btn.active { border-color: var(--green); background: var(--green-bg); color: var(--green); font-weight: bold; }

  .staff-list { display: flex; flex-direction: column; gap: 0.45rem; }
  .staff-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--border);
  }
  .staff-row:last-child { border-bottom: none; padding-bottom: 0; }
  .staff-info { display: flex; flex-direction: column; gap: 0.1rem; }
  .staff-name { font-size: 0.78rem; color: var(--text); }
  .staff-name strong { color: var(--blue); }
  .staff-desc { font-size: 0.68rem; color: var(--text3); }
  .staff-up-btn {
    padding: 0.22rem 0.55rem;
    background: transparent;
    border: 1px solid var(--amber);
    color: var(--amber);
    font-family: inherit;
    font-size: 0.72rem;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
  }
  .staff-up-btn:hover:not(:disabled) { background: rgba(245,158,11,0.12); }
  .staff-up-btn:disabled { opacity: 0.3; cursor: default; }
  .max-badge { font-size: 0.7rem; color: var(--green); font-weight: bold; }

  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .actions button {
    padding: 0.55rem 1rem; background: var(--surface);
    border: 1px solid var(--border2); color: var(--text2);
    cursor: pointer; font-family: inherit; font-size: 0.85rem;
    border-radius: var(--radius); transition: all 0.15s;
  }
  .actions button:hover:not(:disabled) { background: var(--surface2); border-color: var(--text2); color: var(--text); }
  .actions button:disabled { opacity: 0.3; cursor: default; }
  .actions button:first-child { border-color: var(--green); color: var(--green); }
  .actions button:first-child:hover:not(:disabled) { background: var(--green-hi); }
  .actions .watch-btn { border-color: var(--blue); color: var(--blue); }
  .actions .watch-btn:hover:not(:disabled) { background: rgba(96,165,250,0.12); }
  .actions .transfer-btn { border-color: var(--amber); color: var(--amber); }
  .actions .transfer-btn:hover:not(:disabled) { background: rgba(245,158,11,0.1); }
  .actions .format-btn { border-color: var(--border2); color: var(--text3); font-size: 0.78rem; }

  .squad-panel {
    border: 1px solid var(--border); background: var(--surface);
    border-radius: var(--radius); padding: 0.85rem;
  }
  .panel-title {
    font-size: 0.68rem; color: var(--text3); text-transform: uppercase;
    letter-spacing: 0.06em; border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem; margin-bottom: 0.5rem;
  }
  .squad-list { display: flex; flex-direction: column; gap: 0.25rem; max-height: 440px; overflow-y: auto; }
  .squad-row {
    display: flex; align-items: center; gap: 0.6rem;
    font-size: 0.8rem; padding: 0.28rem 0.35rem;
    border-bottom: 1px solid var(--border);
    border-radius: 2px;
  }
  .squad-row.starter-row { background: rgba(34,197,94,0.05); }
  .squad-row:last-child { border-bottom: none; }
  .squad-row.injured { opacity: 0.55; }
  .xi-btn {
    padding: 0.15rem 0.45rem;
    font-family: inherit;
    font-size: 0.7rem;
    border: 1px solid var(--border2);
    background: var(--surface2);
    color: var(--text3);
    border-radius: 2px;
    cursor: pointer;
    min-width: 52px;
  }
  .xi-btn.xi-active {
    border-color: var(--green);
    background: var(--green-bg);
    color: var(--green);
    font-weight: bold;
  }
  .pos-tag {
    background: var(--surface2); color: var(--text2);
    font-size: 0.68rem; padding: 0.1rem 0.35rem;
    border-radius: 2px; min-width: 28px; text-align: center;
  }
  .pname { flex: 1; color: var(--text); }
  .page { color: var(--text3); min-width: 30px; text-align: right; font-size: 0.75rem; }
  .stam-tag { color: var(--blue); font-size: 0.74rem; min-width: 48px; text-align: right; }
  .stam-tag.stam-low { color: var(--amber); }
  .povr { color: var(--green); font-weight: bold; min-width: 52px; text-align: right; }
  .injbadge { color: var(--amber); font-size: 0.72rem; }
</style>
