<script lang="ts">
  import type { WorldState, MatchResult, Player } from "../../types/index.js";
  import type { UpcomingFixture } from "../../engine/scheduler.js";

  interface Props {
    world: WorldState;
    egoPlayer: Player | null;
    egoSuspended: number;
    hasActiveEvent: boolean;
    lastEventSummary: string | null;
    playerName: string;
    playerPosition: string;
    playerClubId: number;
    clubName: string;
    playerMatch: MatchResult | null;
    upcoming: UpcomingFixture[];
    championshipSeries: boolean;
    onadvance: (watch?: boolean) => void;
    onopentransfers: () => void;
    ontoggleformat: () => void;
  }

  let {
    world,
    egoPlayer,
    egoSuspended,
    hasActiveEvent,
    lastEventSummary,
    playerName,
    playerPosition,
    playerClubId,
    clubName,
    playerMatch,
    upcoming,
    championshipSeries,
    onadvance,
    onopentransfers,
    ontoggleformat,
  }: Props = $props();

  const DAYS_PER_SEASON = 365;
  const seasonProgress = $derived(Math.round(((world.current_day % DAYS_PER_SEASON) / DAYS_PER_SEASON) * 100));

  const monthNames = ["Ags", "Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul"];
  function dayToDate(day: number): string {
    const d = Math.max(0, day - 1) % DAYS_PER_SEASON;
    return `${(d % 30) + 1} ${monthNames[Math.floor(d / 30) % 12]}`;
  }

  function formatRupiah(n: number): string {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
    if (n >= 1_000_000) return `Rp ${Math.round(n / 1_000_000)}jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }

  const nextMatch = $derived(upcoming[0] ?? null);
  const DAYS_PER_SEASON_LOCAL = 365;
  const seasonDay = $derived(world.current_day % DAYS_PER_SEASON_LOCAL);
  // Window: pre-season (hari 0-13) atau mid-season (hari 180-193)
  const transferWindowOpen = $derived(seasonDay < 14 || (seasonDay >= 180 && seasonDay < 194));
  const nextOpponent = $derived(
    nextMatch
      ? nextMatch.home_club_id === playerClubId
        ? nextMatch.away_club_name
        : nextMatch.home_club_name
      : null,
  );
  const daysToNext = $derived(nextMatch ? nextMatch.date - world.current_day : null);
  const canPlayNext = $derived(!egoPlayer?.injured && egoSuspended === 0);

  // Last match result display + player contribution
  const matchOutcome = $derived(() => {
    if (!playerMatch) return null;
    const isHome = playerMatch.home_club === playerClubId;
    const gf = isHome ? playerMatch.home_goals : playerMatch.away_goals;
    const ga = isHome ? playerMatch.away_goals : playerMatch.home_goals;
    const result = gf > ga ? "MENANG" : gf === ga ? "SERI" : "KALAH";
    const color = gf > ga ? "#2a6" : gf === ga ? "#996" : "#a33";
    const egoId = egoPlayer?.id ?? 0;
    const myGoals = playerMatch.scorers.filter((s) => s.scorer_id === egoId).map((s) => `${s.minute}'`);
    const myAssists = playerMatch.scorers.filter((s) => s.assist_id === egoId).map((s) => `${s.minute}'`);
    return { gf, ga, result, color, myGoals, myAssists };
  });
</script>

<div class="career">
  <header>
    <div class="title-row">
      <h2>{egoPlayer?.name ?? playerName}</h2>
      <span class="badge">{egoPlayer?.position ?? playerPosition}</span>
      {#if egoPlayer}
        <span class="ovr">OVR {egoPlayer.overall} <small>(PA {egoPlayer.pa})</small></span>
      {/if}
    </div>
    <p class="sub">
      {clubName} · Musim {world.season} · {dayToDate(world.current_day)}
      {#if egoPlayer}
        · {egoPlayer.height}cm / {egoPlayer.weight}kg · Kaki {egoPlayer.foot}
      {/if}
    </p>
    {#if egoPlayer && egoPlayer.traits.length > 0}
      <div class="traits-row">
        {#each egoPlayer.traits as t}
          <span class="trait-tag">{t}</span>
        {/each}
      </div>
    {/if}
  </header>

  {#if egoPlayer?.injured || egoSuspended > 0 || lastEventSummary}
    <section class="status-alerts">
      {#if lastEventSummary}
        <div class="alert event-outcome">
          ✨ <strong>Dampak Keputusan:</strong> {lastEventSummary}
        </div>
      {/if}
      {#if egoPlayer?.injured}
        <div class="alert injury">
          🏥 <strong>CEDERA:</strong> {egoPlayer.injury_type?.replaceAll("_", " ")} (sisa {egoPlayer.injury_duration} hari)
        </div>
      {/if}
      {#if egoSuspended > 0}
        <div class="alert suspended">
          🟥 <strong>SKORSING KARTU:</strong> Absen {egoSuspended} pertandingan berikutnya
        </div>
      {/if}
    </section>
  {/if}

  <section class="stats-row">
    <div class="stat">
      <span class="label">Umur</span>
      <span class="val">{egoPlayer?.age ?? world.ego.age}</span>
    </div>
    <div class="stat">
      <span class="label">Main</span>
      <span class="val">{egoPlayer?.matches ?? 0}</span>
    </div>
    <div class="stat">
      <span class="label">Gol</span>
      <span class="val">{egoPlayer?.goals ?? 0}</span>
    </div>
    <div class="stat">
      <span class="label">Assist</span>
      <span class="val">{egoPlayer?.assists ?? 0}</span>
    </div>
    <div class="stat">
      <span class="label">Kartu</span>
      <span class="val cards-val">🟨{egoPlayer?.yellow_cards ?? 0} 🟥{egoPlayer?.red_cards ?? 0}</span>
    </div>
    <div class="stat">
      <span class="label">Rating</span>
      <span class="val">{egoPlayer && egoPlayer.matches > 0 ? egoPlayer.rating.toFixed(2) : "—"}</span>
    </div>
    <div class="stat">
      <span class="label">Trofi</span>
      <span class="val">🏆{egoPlayer?.career_trophies ?? 0}</span>
    </div>
    <div class="stat">
      <span class="label">Legacy</span>
      <span class="val">{world.ego.legacy_score}</span>
    </div>
  </section>

  {#if egoPlayer}
    <section class="profile-grid">
      <div class="panel">
        <div class="panel-title">Atribut (1–100)</div>
        {#if egoPlayer.position === "GK"}
          <div class="attr-group-label">Kiper</div>
          <div class="attr-grid">
            <div><span>REF</span><strong>{egoPlayer.reflexes}</strong></div>
            <div><span>HAN</span><strong>{egoPlayer.handling}</strong></div>
            <div><span>GKP</span><strong>{egoPlayer.gk_positioning}</strong></div>
            <div><span>1v1</span><strong>{egoPlayer.one_on_ones}</strong></div>
            <div><span>CMD</span><strong>{egoPlayer.command}</strong></div>
          </div>
        {:else}
          <div class="attr-group-label">Teknis</div>
          <div class="attr-grid">
            <div><span>FIN</span><strong>{egoPlayer.finishing}</strong></div>
            <div><span>PAS</span><strong>{egoPlayer.passing}</strong></div>
            <div><span>DRI</span><strong>{egoPlayer.dribbling}</strong></div>
            <div><span>HEA</span><strong>{egoPlayer.heading}</strong></div>
            <div><span>CRO</span><strong>{egoPlayer.crossing}</strong></div>
            <div><span>TAC</span><strong>{egoPlayer.tackling}</strong></div>
            <div><span>TEC</span><strong>{egoPlayer.technique}</strong></div>
            <div><span>LSH</span><strong>{egoPlayer.long_shots}</strong></div>
          </div>
        {/if}
        <div class="attr-group-label">Mental</div>
        <div class="attr-grid">
          <div><span>DEC</span><strong>{egoPlayer.decisions}</strong></div>
          <div><span>CMP</span><strong>{egoPlayer.composure}</strong></div>
          <div><span>POS</span><strong>{egoPlayer.positioning}</strong></div>
          <div><span>VIS</span><strong>{egoPlayer.vision}</strong></div>
          <div><span>ANT</span><strong>{egoPlayer.anticipation}</strong></div>
          <div><span>OTB</span><strong>{egoPlayer.off_the_ball}</strong></div>
          <div><span>WRK</span><strong>{egoPlayer.work_rate}</strong></div>
        </div>
        <div class="attr-group-label">Fisik</div>
        <div class="attr-grid">
          <div><span>PAC</span><strong>{egoPlayer.pace}</strong></div>
          <div><span>STR</span><strong>{egoPlayer.strength}</strong></div>
          <div><span>AGI</span><strong>{egoPlayer.agility}</strong></div>
          <div><span>JMP</span><strong>{egoPlayer.jumping}</strong></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Kondisi, Kontrak & Karir</div>
        <div class="meta-list">
          <div><span>Form / Stamina</span><strong>{Math.round(egoPlayer.form * 100)}% / {Math.round(egoPlayer.stamina * 100)}%</strong></div>
          <div><span>Total Karir</span><strong>{egoPlayer.career_matches} main · {egoPlayer.career_goals} gol · {egoPlayer.career_assists} ast</strong></div>
          <div><span>Gaji</span><strong>{formatRupiah(egoPlayer.wage)}/bln</strong></div>
          <div><span>Sisa Kontrak</span><strong>{Math.max(0, egoPlayer.contract_end - world.current_day)} hari</strong></div>
        </div>
      </div>
    </section>
  {/if}

  {#if matchOutcome()}
    {@const o = matchOutcome()!}
    <section class="match-result" style="border-color:{o.color}">
      <span class="result-label" style="color:{o.color}">{o.result}</span>
      <span class="score">{o.gf} – {o.ga}</span>
      {#if o.myGoals.length > 0}
        <span class="contrib">⚽ Gol ({o.myGoals.join(", ")})</span>
      {/if}
      {#if o.myAssists.length > 0}
        <span class="contrib">🎯 Assist ({o.myAssists.join(", ")})</span>
      {/if}
    </section>
  {/if}

  <section class="next-match">
    {#if nextMatch}
      <p class="label">Pertandingan berikutnya</p>
      <p class="opponent">vs <strong>{nextOpponent}</strong></p>
      <p class="sub">
        {nextMatch.stage_id === "championship_sf"
          ? `🔥 Semifinal Championship (Pekan ${nextMatch.week})`
          : nextMatch.stage_id === "championship_final"
            ? `🏆 Final Championship (Pekan ${nextMatch.week})`
            : nextMatch.week > 0
              ? `Pekan ${nextMatch.week}`
              : nextMatch.competition} ·
        {dayToDate(nextMatch.date)}
        {daysToNext! > 0 ? `(${daysToNext} hari lagi)` : "(hari ini)"}
      </p>
    {:else}
      <p class="sub">Semua pekan Musim {world.season} telah selesai dimainkan.</p>
    {/if}
  </section>

  <section class="progress-bar-wrap">
    <div class="progress-label">Progres musim {seasonProgress}%</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:{seasonProgress}%"></div>
    </div>
  </section>

  <section class="actions">
    <button onclick={() => onadvance(false)} disabled={hasActiveEvent}>
      {nextMatch
        ? `⚡ Simulasi Cepat (Pekan ${nextMatch.week}${!canPlayNext ? " · Absen" : ""})`
        : `🏆 Akhiri Musim ${world.season} & Lanjut ke Musim ${world.season + 1}`}
    </button>
    {#if nextMatch}
      <button class="watch-btn" onclick={() => onadvance(true)} disabled={hasActiveEvent}>
        🎡 Tonton Match
      </button>
    {/if}
    <button class="transfer-btn" onclick={onopentransfers} disabled={hasActiveEvent || !transferWindowOpen}>
      💼 {transferWindowOpen ? "Kontrak & Transfer" : "Transfer (Jendela Tutup)"}
    </button>
    <button class="format-btn" onclick={ontoggleformat} disabled={hasActiveEvent}>
      ⚙️ Format: {championshipSeries ? "Championship Series (4 Besar)" : "Liga Penuh"}
    </button>
  </section>
</div>

<style>
  .career { display: flex; flex-direction: column; gap: 1rem; }

  /* ── Header ── */
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
  }
  .title-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 1.35rem; color: var(--text); letter-spacing: -0.3px; }
  .badge {
    background: var(--green);
    color: #000;
    padding: 0.15rem 0.5rem;
    font-size: 0.7rem;
    font-weight: bold;
    border-radius: 2px;
  }
  .ovr { color: var(--green); font-weight: bold; font-size: 0.85rem; }
  .ovr small { color: var(--text3); font-weight: normal; }
  .sub { margin: 0.3rem 0 0; color: var(--text2); font-size: 0.82rem; }
  .traits-row { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .trait-tag {
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-size: 0.7rem;
    padding: 0.1rem 0.5rem;
    border-radius: 2px;
  }

  /* ── Alerts ── */
  .status-alerts { display: flex; flex-direction: column; gap: 0.4rem; }
  .alert {
    padding: 0.55rem 0.85rem;
    font-size: 0.83rem;
    border-left: 3px solid var(--red);
    background: rgba(248,113,113,0.07);
    color: var(--red);
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .alert.injury {
    border-left-color: var(--amber);
    background: rgba(245,158,11,0.07);
    color: var(--amber);
  }
  .alert.event-outcome {
    border-left-color: var(--green);
    background: var(--green-bg);
    color: var(--green);
  }

  /* ── Stats row ── */
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
    min-width: 48px;
  }
  .label { font-size: 0.68rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; }
  .val { font-size: 1.2rem; font-weight: bold; color: var(--text); margin-top: 0.15rem; }
  .cards-val { font-size: 0.95rem; line-height: 1.6rem; }

  /* ── Profile panels ── */
  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .panel {
    border: 1px solid var(--border);
    background: var(--surface);
    padding: 0.85rem;
    border-radius: var(--radius);
  }
  .panel-title {
    font-size: 0.68rem;
    color: var(--text3);
    margin-bottom: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem;
  }
  .attr-group-label {
    font-size: 0.62rem;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0.45rem 0 0.2rem;
  }
  .attr-group-label:first-of-type { margin-top: 0; }
  .attr-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem 0.5rem;
    font-size: 0.78rem;
  }
  .attr-grid div { display: flex; justify-content: space-between; gap: 0.3rem; }
  .attr-grid span { color: var(--text3); }
  .attr-grid strong { color: var(--text); }
  .meta-list { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.82rem; }
  .meta-list div { display: flex; justify-content: space-between; align-items: baseline; }
  .meta-list span { color: var(--text2); }
  .meta-list strong { color: var(--text); }

  /* ── Match result ── */
  .match-result {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    border: 1px solid var(--border2);
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    background: var(--surface);
  }
  .result-label { font-weight: bold; font-size: 0.85rem; letter-spacing: 0.06em; }
  .score { font-size: 1.5rem; font-weight: bold; color: var(--text); }
  .contrib { font-size: 0.82rem; color: var(--text2); }

  /* ── Next match ── */
  .next-match { display: flex; flex-direction: column; gap: 0.2rem; }
  .next-match .label { font-size: 0.72rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; }
  .opponent { margin: 0; font-size: 1.05rem; color: var(--text); }
  .sub { margin: 0; color: var(--text2); font-size: 0.82rem; }

  /* ── Progress ── */
  .progress-bar-wrap { display: flex; flex-direction: column; gap: 0.35rem; }
  .progress-label { font-size: 0.72rem; color: var(--text3); }
  .progress-bar { height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--green); transition: width 0.4s; border-radius: 2px; }

  /* ── Actions ── */
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .actions button {
    padding: 0.55rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
    border-radius: var(--radius);
    transition: all 0.15s;
  }
  .actions button:hover:not(:disabled) {
    background: var(--surface2);
    border-color: var(--text2);
    color: var(--text);
  }
  .actions button:disabled { opacity: 0.3; cursor: default; }

  /* Primary action — simulasi */
  .actions button:first-child {
    border-color: var(--green);
    color: var(--green);
  }
  .actions button:first-child:hover:not(:disabled) {
    background: var(--green-hi);
    color: var(--green);
  }
  .actions .watch-btn { border-color: var(--blue); color: var(--blue); }
  .actions .watch-btn:hover:not(:disabled) { background: rgba(96,165,250,0.12); }
  .actions .transfer-btn { border-color: var(--amber); color: var(--amber); }
  .actions .transfer-btn:hover:not(:disabled) { background: rgba(245,158,11,0.1); }
  .actions .format-btn { border-color: var(--border2); color: var(--text3); font-size: 0.78rem; }
  .actions .format-btn:hover:not(:disabled) { background: var(--surface2); color: var(--text2); }
</style>
