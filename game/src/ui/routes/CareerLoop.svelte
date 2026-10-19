<script lang="ts">
  import type { WorldState, MatchResult, Player } from "../../types/index.js";
  import type { UpcomingFixture } from "../../engine/scheduler.js";
  import type { TarkanLeague, TarkanStanding, TarkanFixture } from "../../engine/tarkan.js";
  import type { CupRound } from "../../engine/cup.js";
  import type { AFCRound, AFCGroupStanding } from "../../engine/afc.js";
  import type { U21StandingRow } from "../../engine/scheduler.js";
  import type { TimnasSquadInfo } from "../../engine/timnas.js";

  interface Props {
    world: WorldState;
    egoPlayer: Player | null;
    egoSuspended: number;
    hasActiveEvent: boolean;
    lastEventSummary: string | null;
    playerName: string;
    playerPosition: string;
    playerClubId: number;
    playerLeagueId?: number;
    clubName: string;
    playerMatch: MatchResult | null;
    upcoming: UpcomingFixture[];
    championshipSeries: boolean;
    onadvance: (watch?: boolean) => void;
    onopentransfers: () => void;
    ontoggleformat: () => void;
    tarkanLeagues: TarkanLeague[];
    tarkanStandings: TarkanStanding[];
    tarkanFixtures: TarkanFixture[];
    tarkanMsg: string | null;
    cupRounds: CupRound[];
    afcRounds: AFCRound[];
    afcGroupStandings: AFCGroupStanding[];
    u21Standings: U21StandingRow[];
    timnasInfo: TimnasSquadInfo | null;
    timnasMsg: string | null;
    onplaytarkam?: () => void;
    ongetcupbracket: () => void;
    ongetafcbracket: () => void;
    ongetu21standings: (leagueId?: number) => void;
    ontimnasgetinfo: () => void;
    ontimnasplaymatch: () => void;
    onnaturalize: () => void;
    ontransitionchild?: () => void;
    onopenretirement?: () => void;
    ontarkangetleagues: () => void;
    ontarkanenroll: (leagueId: number) => void;
    ontarkanunenroll: () => void;
    ontarkanplaymatch: (matchId: number) => void;
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
    playerLeagueId = 1,
    clubName,
    playerMatch,
    upcoming,
    championshipSeries,
    onadvance,
    onopentransfers,
    ontoggleformat,
    tarkanLeagues,
    tarkanStandings,
    tarkanFixtures,
    tarkanMsg,
    onplaytarkam,
    ontransitionchild,
    onopenretirement,
    ontarkangetleagues,
    ontarkanenroll,
    ontarkanunenroll,
    ontarkanplaymatch,
    cupRounds,
    afcRounds,
    afcGroupStandings,
    u21Standings,
    timnasInfo,
    timnasMsg,
    ongetcupbracket,
    ongetafcbracket,
    ongetu21standings,
    ontimnasgetinfo,
    ontimnasplaymatch,
    onnaturalize,
  }: Props = $props();

  let showCup = $state(false);
  let showAFC = $state(false);
  let showU21 = $state(false);
  let selectedYouthTier = $state<"u15" | "u18" | "u21">("u21");
  const isEPL = $derived(
    playerLeagueId === 11 || playerLeagueId === 17 || playerLeagueId === 18 || playerLeagueId === 19 || playerLeagueId === 21 ||
    (playerClubId >= 103 && playerClubId <= 110)
  );
  const currentYouthLeagueId = $derived.by(() => {
    if (isEPL) {
      return selectedYouthTier === "u15" ? 46 : selectedYouthTier === "u18" ? 41 : 31;
    }
    return selectedYouthTier === "u15" ? 45 : selectedYouthTier === "u18" ? 40 : 30;
  });
  const youthLeagueTitle = $derived.by(() => {
    if (isEPL) {
      return selectedYouthTier === "u15"
        ? "Premier League U-15"
        : selectedYouthTier === "u18"
          ? "Premier League U-18"
          : "Premier League 2 (U-21)";
    }
    return selectedYouthTier === "u15"
      ? "Elite Pro Academy U-15"
      : selectedYouthTier === "u18"
        ? "Elite Pro Academy U-18"
        : "Liga U-21 Indonesia";
  });
  const egoYouthEligible = $derived.by(() => {
    const age = egoPlayer?.age ?? 99;
    if (selectedYouthTier === "u15") return age <= 15;
    if (selectedYouthTier === "u18") return age <= 18;
    return age <= 21;
  });
  let showTimnas = $state(false);

  let showTarkan = $state(false);
  const enrolledLeague = $derived(tarkanLeagues.find((l) => l.enrolled) ?? null);
  const nextTarkanMatch = $derived(
    tarkanFixtures.find((f) => f.homeGoals === null) ?? null,
  );

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
  const canPlayNext = $derived(!egoPlayer?.injured && !egoPlayer?.in_prison && egoSuspended === 0);

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

  {#if egoPlayer?.in_prison || egoPlayer?.injured || egoSuspended > 0 || lastEventSummary}
    <section class="status-alerts">
      {#if lastEventSummary}
        <div class="alert event-outcome">
          ✨ <strong>Dampak Keputusan:</strong> {lastEventSummary}
        </div>
      {/if}
      {#if egoPlayer?.in_prison}
        <div class="alert suspended">
          ⛓️ <strong>MENDEKAM DI PENJARA:</strong> Sisa masa tahanan {egoPlayer.prison_duration} hari (Absen latihan & pertandingan, penurunan atribut akhir musim)
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
    {#if onplaytarkam}
      <button
        class="format-btn"
        onclick={onplaytarkam}
        disabled={hasActiveEvent || !canPlayNext || (egoPlayer?.stamina ?? 0) < 0.3}
      >
        🏟️ Main Tarkam {daysToNext !== null && daysToNext <= 3 ? "(⚠️ Bentrok Jadwal Klub!)" : "(+Amplop Tunai)"}
      </button>
    {/if}
    {#if onopenretirement && egoPlayer && (egoPlayer.age >= 32 || egoPlayer.retired || (egoPlayer.injured && (egoPlayer.injury_duration >= 90 || egoPlayer.injury_type === 'acl_rupture')))}
      <button class="format-btn retirement-btn" onclick={onopenretirement} disabled={hasActiveEvent}>
        🏆 Gantung Sepatu & Pilih Karir Berikutnya
      </button>
    {/if}
    {#if ontransitionchild && egoPlayer && (egoPlayer.age >= 28 || egoPlayer.retired)}
      <button class="format-btn" onclick={ontransitionchild} disabled={hasActiveEvent}>
        🧬 Pensiun & Lanjut sebagai Anak (Dinasti)
      </button>
    {/if}
    <button class="format-btn" onclick={ontoggleformat} disabled={hasActiveEvent}>
      ⚙️ Format: {championshipSeries ? "Championship Series (4 Besar)" : "Liga Penuh"}
    </button>
  </section>

  <!-- ── Piala Indonesia ── -->
  <section class="cup-section">
    <button
      class="cup-toggle"
      onclick={() => { showCup = !showCup; if (showCup && cupRounds.length === 0) ongetcupbracket(); }}
    >
      🏆 Piala Indonesia {showCup ? "▲" : "▼"}
    </button>

    {#if showCup}
      {#if cupRounds.length === 0}
        <p class="cup-hint">Bracket belum tersedia. Piala Indonesia dimulai hari ke-50.</p>
      {:else}
        {#each cupRounds as round}
          <details class="cup-round" open={round.matches.some(m => m.homeGoals === null)}>
            <summary>{round.label} ({round.matches.length} laga)</summary>
            <div class="cup-matches">
              {#each round.matches as m}
                <div class="cup-match" class:ego-match={m.homeId === playerClubId || m.awayId === playerClubId}>
                  <span class={m.homeGoals !== null && m.homeGoals > (m.awayGoals ?? 0) ? "winner" : ""}>{m.homeName}</span>
                  <span class="score">
                    {m.homeGoals !== null ? `${m.homeGoals} – ${m.awayGoals}` : "vs"}
                  </span>
                  <span class={m.awayGoals !== null && m.awayGoals > (m.homeGoals ?? 0) ? "winner" : ""}>{m.awayName}</span>
                </div>
              {/each}
            </div>
          </details>
        {/each}
      {/if}
    {/if}
  </section>

  <!-- ── AFC Champions League ── -->
  <section class="cup-section afc-section">
    <button
      class="cup-toggle afc-toggle"
      onclick={() => { showAFC = !showAFC; if (showAFC && afcRounds.length === 0) ongetafcbracket(); }}
    >
      🌏 AFC Champions League {showAFC ? "▲" : "▼"}
    </button>

    {#if showAFC}
      {#if afcRounds.length === 0}
        <p class="cup-hint">Bracket belum tersedia. AFC mulai hari ke-60.</p>
      {:else}
        <!-- Group stage standings -->
        {#if afcGroupStandings.length > 0}
          <div class="afc-groups">
            {#each [1, 2] as gNum}
              {@const rows = afcGroupStandings.filter(s => s.group === gNum)}
              {#if rows.length > 0}
                <details class="cup-round" open>
                  <summary>Grup {gNum === 1 ? 'A' : 'B'}</summary>
                  <table class="afc-table">
                    <thead><tr><th>Klub</th><th>M</th><th>M</th><th>S</th><th>K</th><th>Poin</th></tr></thead>
                    <tbody>
                      {#each rows as row, i}
                        <tr class:winner-row={i < 2} class:ego-match={row.clubId === playerClubId}>
                          <td class="left">{row.clubName}</td>
                          <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td>
                          <td><strong>{row.points}</strong></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </details>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- KO rounds -->
        {#each afcRounds.filter(r => r.stageId !== 'afc_group') as round}
          <details class="cup-round" open={round.matches.some(m => m.homeGoals === null)}>
            <summary>{round.label} ({round.matches.length} laga)</summary>
            <div class="cup-matches">
              {#each round.matches as m}
                <div class="cup-match" class:ego-match={m.homeId === playerClubId || m.awayId === playerClubId}>
                  <span class={m.homeGoals !== null && m.homeGoals > (m.awayGoals ?? 0) ? "winner" : ""}>{m.homeName}</span>
                  <span class="score">{m.homeGoals !== null ? `${m.homeGoals} – ${m.awayGoals}` : "vs"}</span>
                  <span class={m.awayGoals !== null && m.awayGoals > (m.homeGoals ?? 0) ? "winner" : ""}>{m.awayName}</span>
                </div>
              {/each}
            </div>
          </details>
        {/each}
      {/if}
    {/if}
  </section>

  <!-- ── Youth Competitions (U-15, U-18, U-21) ── -->
  <section class="u21-section">
    <button
      class="u21-toggle"
      onclick={() => {
        showU21 = !showU21;
        if (showU21) ongetu21standings(currentYouthLeagueId);
      }}
    >
      🌱 Kompetisi Usia Dini: {youthLeagueTitle} {egoYouthEligible ? "· ELIGIBLE ✅" : ""} {showU21 ? "▲" : "▼"}
    </button>

    {#if showU21}
      <div class="youth-tier-tabs" style="display: flex; gap: 0.4rem; margin: 0.4rem 0;">
        <button
          class="youth-tab-btn"
          style="padding: 0.2rem 0.6rem; font-size: 0.78rem; border-radius: 4px; border: 1px solid var(--border); background: {selectedYouthTier === 'u15' ? 'var(--accent)' : 'var(--surface2)'}; color: {selectedYouthTier === 'u15' ? '#fff' : 'var(--text)'}; cursor: pointer;"
          onclick={() => { selectedYouthTier = 'u15'; ongetu21standings(isEPL ? 46 : 45); }}
        >
          U-15 {(egoPlayer?.age ?? 99) <= 15 ? "✅" : ""}
        </button>
        <button
          class="youth-tab-btn"
          style="padding: 0.2rem 0.6rem; font-size: 0.78rem; border-radius: 4px; border: 1px solid var(--border); background: {selectedYouthTier === 'u18' ? 'var(--accent)' : 'var(--surface2)'}; color: {selectedYouthTier === 'u18' ? '#fff' : 'var(--text)'}; cursor: pointer;"
          onclick={() => { selectedYouthTier = 'u18'; ongetu21standings(isEPL ? 41 : 40); }}
        >
          U-18 {(egoPlayer?.age ?? 99) <= 18 ? "✅" : ""}
        </button>
        <button
          class="youth-tab-btn"
          style="padding: 0.2rem 0.6rem; font-size: 0.78rem; border-radius: 4px; border: 1px solid var(--border); background: {selectedYouthTier === 'u21' ? 'var(--accent)' : 'var(--surface2)'}; color: {selectedYouthTier === 'u21' ? '#fff' : 'var(--text)'}; cursor: pointer;"
          onclick={() => { selectedYouthTier = 'u21'; ongetu21standings(isEPL ? 31 : 30); }}
        >
          U-21 {(egoPlayer?.age ?? 99) <= 21 ? "✅" : ""}
        </button>
      </div>

      {#if egoYouthEligible}
        <p class="u21-note">✅ Usia {egoPlayer?.age} — kamu eligible dan otomatis bertanding di {youthLeagueTitle} jika ada jadwal matchday klub.</p>
      {:else}
        <p class="u21-note" style="color: var(--text3);">Pemain usia ≤{selectedYouthTier === 'u15' ? 15 : selectedYouthTier === 'u18' ? 18 : 21} tahun dari tiap klub bertanding di divisi ini. (Usiamu: {egoPlayer?.age ?? '-'})</p>
      {/if}

      {#if u21Standings.length === 0}
        <p class="u21-hint">Belum ada pertandingan selesai.</p>
      {:else}
        <details class="u21-table-wrap" open>
          <summary>Klasemen {youthLeagueTitle} ({u21Standings.length} klub)</summary>
          <table class="u21-table">
            <thead>
              <tr><th>#</th><th>Klub</th><th>M</th><th>M</th><th>S</th><th>K</th><th>Gol</th><th>Poin</th></tr>
            </thead>
            <tbody>
              {#each u21Standings as row, i}
                <tr class:ego-row={row.club_id === playerClubId}>
                  <td>{i + 1}</td>
                  <td class="left">{row.name}</td>
                  <td>{row.played}</td>
                  <td>{row.wins}</td>
                  <td>{row.draws}</td>
                  <td>{row.losses}</td>
                  <td>{row.goals_for}:{row.goals_against}</td>
                  <td><strong>{row.points}</strong></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </details>
      {/if}
    {/if}
  </section>

  <!-- ── Timnas & Naturalisasi ── -->
  <section class="timnas-section">
    <button
      class="timnas-toggle"
      onclick={() => { showTimnas = !showTimnas; if (showTimnas && !timnasInfo) ontimnasgetinfo(); }}
    >
      🇮🇩 Timnas Indonesia {timnasInfo?.egoInSquad ? "· DIPANGGIL ✅" : ""} {showTimnas ? "▲" : "▼"}
    </button>

    {#if showTimnas}
      {#if timnasMsg}
        <p class="timnas-msg">{timnasMsg}</p>
      {/if}

      {#if egoPlayer && egoPlayer.nationality !== 1}
        <div class="naturalisasi-box">
          <p>🌍 Kamu bukan WNI. Ajukan naturalisasi untuk eligible Timnas Indonesia.</p>
          <button onclick={onnaturalize} disabled={hasActiveEvent}>🇮🇩 Ajukan Naturalisasi</button>
        </div>
      {/if}

      {#if timnasInfo}
        {#if timnasInfo.campaign}
          <div class="timnas-campaign-card">
            <div class="campaign-header">
              <span class="campaign-title">🏆 {timnasInfo.campaign.competitionName}</span>
              <span class="campaign-stage">{timnasInfo.campaign.stageName} (Laga {timnasInfo.campaign.matchIndex}/{timnasInfo.campaign.totalMatches})</span>
            </div>
            <div class="campaign-body">
              <div class="campaign-opponent">
                <span class="camp-label">Lawan Berikutnya:</span>
                <span class="camp-opp-name">{timnasInfo.campaign.opponentFlag} {timnasInfo.campaign.opponentName}</span>
              </div>
              <div class="campaign-tally">
                <span>{timnasInfo.campaign.wins}M {timnasInfo.campaign.draws}S {timnasInfo.campaign.losses}K</span>
                <span class="camp-pts"><strong>{timnasInfo.campaign.points}</strong> Poin (SG: {timnasInfo.campaign.goalsFor - timnasInfo.campaign.goalsAgainst})</span>
              </div>
            </div>
            {#if timnasInfo.campaign.status}
              <div class="campaign-status">{timnasInfo.campaign.status}</div>
            {/if}
          </div>
        {/if}

        {#if timnasInfo.egoInSquad}
          <div class="timnas-callup">
            <p>✅ Kamu ada di skuad Timnas! Siap bela Garuda di Hari {timnasInfo.nextMatchDay}?</p>
            <button
              onclick={ontimnasplaymatch}
              disabled={hasActiveEvent || !!(egoPlayer?.injured) || (egoPlayer?.stamina ?? 0) < 0.2}
            >
              ▶ Tampil untuk Timnas vs {timnasInfo.campaign?.opponentFlag ?? ""} {timnasInfo.campaign?.opponentName ?? "Lawan"}
            </button>
          </div>
        {:else}
          <p class="timnas-hint">
            Butuh overall ≥ 55 + WNI untuk dipanggil. OVR kamu: {egoPlayer?.overall ?? "?"}.
          </p>
        {/if}

        {#if timnasInfo.recentResults.length > 0}
          <details class="timnas-results">
            <summary>Hasil Terakhir Timnas ({timnasInfo.recentResults.length})</summary>
            {#each timnasInfo.recentResults as r}
              <p>{r}</p>
            {/each}
          </details>
        {/if}

        <details class="timnas-squad-list">
          <summary>Skuad ({timnasInfo.squad.length} pemain)</summary>
          <div class="timnas-grid">
            {#each timnasInfo.squad as p}
              <div class="timnas-player" class:ego={p.id === egoPlayer?.id}>
                <span>{p.name}</span>
                <span>{p.position} · OVR {p.overall}</span>
                <span class="club-tag">{p.club}</span>
              </div>
            {/each}
          </div>
        </details>
      {/if}
    {/if}
  </section>

  <!-- ── Tarkan Pyramid ── -->
  <section class="tarkan-section">
    <button
      class="tarkan-toggle"
      onclick={() => { showTarkan = !showTarkan; if (showTarkan && tarkanLeagues.length === 0) ontarkangetleagues(); }}
    >
      🏟️ Liga Amatir: Tarkan & European Sunday League {enrolledLeague ? `· ${enrolledLeague.name}` : ""} {showTarkan ? "▲" : "▼"}
    </button>

    {#if showTarkan}
      {#if tarkanMsg}
        <p class="tarkan-msg">{tarkanMsg}</p>
      {/if}

      {#if !enrolledLeague}
        <p class="tarkan-hint">Pilih divisi untuk ikut liga Tarkan musim ini. Bebas pindah kapan saja.</p>
        <div class="tarkan-grid">
          {#each tarkanLeagues as league}
            <div class="tarkan-card">
              <strong>{league.name}</strong>
              <span>Rata-rata CA ~{league.avgCA}</span>
              <span>🏆 Juara: Rp {(league.prize / 1_000_000).toFixed(0)}jt</span>
              <button onclick={() => ontarkanenroll(league.id)} disabled={hasActiveEvent}>Daftar</button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="tarkan-enrolled">
          <p>⚽ Terdaftar: <strong>{enrolledLeague.enrolledClubName}</strong> — {enrolledLeague.name}</p>
          {#if nextTarkanMatch}
            <p>
              Laga berikutnya: <strong>{nextTarkanMatch.homeClubName} vs {nextTarkanMatch.awayClubName}</strong>
              (Hari {nextTarkanMatch.date}, Pekan {nextTarkanMatch.week})
            </p>
            <button
              onclick={() => ontarkanplaymatch(nextTarkanMatch.matchId)}
              disabled={hasActiveEvent || (egoPlayer?.stamina ?? 0) < 0.25 || !!(egoPlayer?.injured)}
            >
              ▶ Main Laga Tarkan
            </button>
          {:else}
            <p>✅ Semua laga selesai musim ini.</p>
          {/if}
          <button class="tarkan-leave" onclick={ontarkanunenroll} disabled={hasActiveEvent}>Keluar Liga</button>
        </div>

        {#if tarkanStandings.length > 0}
          <details class="tarkan-standings">
            <summary>Klasemen {enrolledLeague.name}</summary>
            <table>
              <thead><tr><th>#</th><th>Klub</th><th>M</th><th>M</th><th>S</th><th>K</th><th>Poin</th></tr></thead>
              <tbody>
                {#each tarkanStandings as row, i}
                  <tr class={row.clubId === enrolledLeague.enrolledClubId ? "ego-row" : ""}>
                    <td>{i + 1}</td>
                    <td>{row.clubName}</td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td><strong>{row.points}</strong></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        {/if}
      {/if}
    {/if}
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

  /* ── U-21 ── */
  .u21-section { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .u21-toggle { background: none; border: 1px solid #16a34a; border-radius: 6px; color: #4ade80; cursor: pointer; padding: 0.4rem 0.8rem; font-size: 0.85rem; width: 100%; text-align: left; }
  .u21-toggle:hover { background: rgba(22,163,74,0.1); }
  .u21-note { font-size: 0.82rem; color: #4ade80; margin: 0.35rem 0; }
  .u21-hint { font-size: 0.8rem; color: var(--text3); margin: 0.3rem 0; }
  .u21-table-wrap { font-size: 0.8rem; margin-top: 0.4rem; }
  .u21-table-wrap summary { cursor: pointer; color: var(--text2); padding: 0.3rem 0; }
  .u21-table { width: 100%; border-collapse: collapse; margin-top: 0.35rem; }
  .u21-table th { color: var(--text3); font-weight: 500; padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--border); text-align: center; }
  .u21-table td { padding: 0.2rem 0.4rem; color: var(--text2); text-align: center; }
  .u21-table .left { text-align: left; }
  .u21-table .ego-row { background: rgba(22,163,74,0.1); font-weight: 600; color: var(--text); }

  /* ── Timnas ── */
  .timnas-section { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .timnas-toggle { background: none; border: 1px solid #dc2626; border-radius: 6px; color: #ef4444; cursor: pointer; padding: 0.4rem 0.8rem; font-size: 0.85rem; width: 100%; text-align: left; }
  .timnas-toggle:hover { background: rgba(220,38,38,0.1); }
  .timnas-msg { font-size: 0.85rem; color: var(--accent); margin: 0.4rem 0; }
  .timnas-hint { font-size: 0.8rem; color: var(--text3); margin: 0.3rem 0; }
  .timnas-campaign-card { background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 6px; padding: 0.6rem; margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .campaign-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(220,38,38,0.2); padding-bottom: 0.25rem; font-size: 0.82rem; }
  .campaign-title { font-weight: 700; color: #f87171; }
  .campaign-stage { font-size: 0.76rem; color: var(--text3); }
  .campaign-body { display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; }
  .campaign-opponent { display: flex; gap: 0.3rem; align-items: center; }
  .camp-label { color: var(--text3); font-size: 0.78rem; }
  .camp-opp-name { font-weight: 600; color: var(--text); }
  .campaign-tally { display: flex; gap: 0.4rem; align-items: center; font-size: 0.78rem; color: var(--text2); }
  .camp-pts { color: #f87171; }
  .campaign-status { font-size: 0.74rem; color: var(--text3); font-style: italic; }
  .timnas-callup { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; padding: 0.4rem 0; }
  .timnas-callup button { align-self: flex-start; padding: 0.35rem 0.8rem; border: 1px solid #ef4444; background: none; color: #ef4444; border-radius: 4px; cursor: pointer; }
  .timnas-callup button:hover:not(:disabled) { background: rgba(220,38,38,0.12); }
  .naturalisasi-box { background: var(--surface2); border-radius: 6px; padding: 0.6rem; margin: 0.4rem 0; font-size: 0.83rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .naturalisasi-box button { align-self: flex-start; padding: 0.3rem 0.7rem; border: 1px solid var(--accent); background: none; color: var(--accent); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
  .timnas-results { font-size: 0.8rem; margin-top: 0.4rem; }
  .timnas-results summary { cursor: pointer; color: var(--text2); padding: 0.3rem 0; }
  .timnas-results p { margin: 0.15rem 0; color: var(--text2); }
  .timnas-squad-list { font-size: 0.8rem; margin-top: 0.4rem; }
  .timnas-squad-list summary { cursor: pointer; color: var(--text3); padding: 0.3rem 0; }
  .timnas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.35rem; margin-top: 0.35rem; }
  .timnas-player { background: var(--surface2); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.1rem; }
  .timnas-player.ego { border-left: 3px solid #ef4444; }
  .timnas-player span:first-child { font-size: 0.82rem; font-weight: 600; }
  .timnas-player span:nth-child(2) { font-size: 0.76rem; color: var(--text3); }
  .club-tag { font-size: 0.72rem; color: var(--text3); }

  /* ── Cup ── */
  .cup-section { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .cup-toggle { background: none; border: 1px solid var(--amber); border-radius: 6px; color: var(--amber); cursor: pointer; padding: 0.4rem 0.8rem; font-size: 0.85rem; width: 100%; text-align: left; }
  .cup-toggle:hover { background: rgba(245,158,11,0.1); }
  .cup-hint { font-size: 0.8rem; color: var(--text3); margin: 0.4rem 0; }
  .cup-round { margin-top: 0.5rem; font-size: 0.82rem; }
  .cup-round summary { cursor: pointer; color: var(--amber); font-weight: 600; padding: 0.3rem 0; }
  .cup-matches { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.35rem; }
  .cup-match { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.4rem; align-items: center; padding: 0.25rem 0.4rem; border-radius: 4px; background: var(--surface2); font-size: 0.8rem; }
  .cup-match:nth-child(even) { background: var(--surface); }
  .cup-match.ego-match { border-left: 3px solid var(--accent); }
  .cup-match .score { text-align: center; font-weight: 700; color: var(--text); min-width: 3rem; }
  .cup-match .winner { font-weight: 700; color: var(--green, #22c55e); }
  .cup-match span:last-child { text-align: right; }

  /* ── AFC ── */
  .afc-section { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .afc-toggle { border-color: #7c3aed !important; color: #a78bfa !important; }
  .afc-toggle:hover { background: rgba(124,58,237,0.1) !important; }
  .afc-groups { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
  .afc-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .afc-table th { color: var(--text3); font-weight: 500; padding: 0.2rem 0.3rem; border-bottom: 1px solid var(--border); text-align: left; }
  .afc-table td { padding: 0.2rem 0.3rem; color: var(--text2); }
  .afc-table .left { text-align: left; }
  .afc-table .winner-row { color: var(--text); font-weight: 600; }
  .afc-table .ego-match { background: rgba(99,102,241,0.1); }

  /* ── Tarkan ── */
  .tarkan-section { border-top: 1px solid var(--border); padding-top: 0.75rem; }
  .tarkan-toggle { background: none; border: 1px solid var(--border2); border-radius: 6px; color: var(--text2); cursor: pointer; padding: 0.4rem 0.8rem; font-size: 0.85rem; width: 100%; text-align: left; }
  .tarkan-toggle:hover { background: var(--surface2); }
  .tarkan-msg { font-size: 0.85rem; color: var(--accent); margin: 0.4rem 0; }
  .tarkan-hint { font-size: 0.8rem; color: var(--text3); margin: 0.4rem 0; }
  .tarkan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; margin-top: 0.5rem; }
  .tarkan-card { background: var(--surface2); border-radius: 6px; padding: 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; }
  .tarkan-card strong { font-size: 0.85rem; }
  .tarkan-card button { margin-top: 0.2rem; padding: 0.3rem; border: 1px solid var(--accent); background: none; color: var(--accent); border-radius: 4px; cursor: pointer; font-size: 0.78rem; }
  .tarkan-card button:hover:not(:disabled) { background: rgba(99,102,241,0.15); }
  .tarkan-enrolled { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; padding: 0.5rem 0; }
  .tarkan-enrolled button { align-self: flex-start; padding: 0.35rem 0.8rem; border: 1px solid var(--accent); background: none; color: var(--accent); border-radius: 4px; cursor: pointer; }
  .tarkan-enrolled button:hover:not(:disabled) { background: rgba(99,102,241,0.15); }
  .tarkan-leave { border-color: var(--red) !important; color: var(--red) !important; }
  .tarkan-standings { margin-top: 0.5rem; font-size: 0.8rem; }
  .tarkan-standings summary { cursor: pointer; color: var(--text2); padding: 0.3rem 0; }
  .tarkan-standings table { width: 100%; border-collapse: collapse; margin-top: 0.4rem; }
  .tarkan-standings th { text-align: left; color: var(--text3); font-weight: 500; padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--border); }
  .tarkan-standings td { padding: 0.2rem 0.4rem; }
  .tarkan-standings .ego-row { background: rgba(99,102,241,0.12); font-weight: 600; }

  .retirement-btn {
    background: linear-gradient(135deg, #0284c7, #2563eb) !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    border: 1px solid #38bdf8 !important;
  }
  .retirement-btn:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8) !important;
  }
</style>
