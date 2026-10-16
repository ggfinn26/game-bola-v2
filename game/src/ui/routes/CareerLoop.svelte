<script lang="ts">
  import type { WorldState, MatchResult } from "../../types/index.js";
  import type { UpcomingFixture } from "../../engine/scheduler.js";

  interface Props {
    world: WorldState;
    playerName: string;
    playerPosition: string;
    playerClubId: number;
    clubName: string;
    playerMatch: MatchResult | null;
    upcoming: UpcomingFixture[];
    onadvance: () => void;
  }

  let { world, playerName, playerPosition, playerClubId, clubName, playerMatch, upcoming, onadvance }: Props =
    $props();

  const DAYS_PER_SEASON = 365;
  const seasonProgress = $derived(Math.round(((world.current_day % DAYS_PER_SEASON) / DAYS_PER_SEASON) * 100));

  const monthNames = ["Ags", "Sep", "Okt", "Nov", "Des", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul"];
  function dayToDate(day: number): string {
    const d = (day - 1) % DAYS_PER_SEASON;
    return `${(d % 30) + 1} ${monthNames[Math.floor(d / 30) % 12]}`;
  }

  const nextMatch = $derived(upcoming[0] ?? null);
  const nextOpponent = $derived(
    nextMatch
      ? nextMatch.home_club_id === playerClubId
        ? nextMatch.away_club_name
        : nextMatch.home_club_name
      : null,
  );
  const daysToNext = $derived(nextMatch ? nextMatch.date - world.current_day : null);

  // Last match result display
  const matchOutcome = $derived(() => {
    if (!playerMatch) return null;
    const isHome = playerMatch.home_club === playerClubId;
    const gf = isHome ? playerMatch.home_goals : playerMatch.away_goals;
    const ga = isHome ? playerMatch.away_goals : playerMatch.home_goals;
    const result = gf > ga ? "MENANG" : gf === ga ? "SERI" : "KALAH";
    const color = gf > ga ? "#2a6" : gf === ga ? "#996" : "#a33";
    return { gf, ga, result, color };
  });
</script>

<div class="career">
  <header>
    <div class="title-row">
      <h2>{playerName}</h2>
      <span class="badge">{playerPosition}</span>
    </div>
    <p class="sub">{clubName} · Musim {world.season} · {dayToDate(world.current_day)}</p>
  </header>

  <section class="stats-row">
    <div class="stat">
      <span class="label">Umur</span>
      <span class="val">{world.ego.age}</span>
    </div>
    <div class="stat">
      <span class="label">Hari ke-</span>
      <span class="val">{world.current_day}</span>
    </div>
    <div class="stat">
      <span class="label">Legacy</span>
      <span class="val">{world.ego.legacy_score}</span>
    </div>
  </section>

  {#if matchOutcome()}
    {@const o = matchOutcome()!}
    <section class="match-result" style="border-color:{o.color}">
      <span class="result-label" style="color:{o.color}">{o.result}</span>
      <span class="score">{o.gf} – {o.ga}</span>
    </section>
  {/if}

  <section class="next-match">
    {#if nextMatch}
      <p class="label">Pertandingan berikutnya</p>
      <p class="opponent">vs <strong>{nextOpponent}</strong></p>
      <p class="sub">
        {nextMatch.week > 0 ? `Pekan ${nextMatch.week}` : nextMatch.competition} ·
        {dayToDate(nextMatch.date)}
        {daysToNext! > 0 ? `(${daysToNext} hari lagi)` : "(hari ini)"}
      </p>
    {:else}
      <p class="sub">Tidak ada pertandingan terjadwal.</p>
    {/if}
  </section>

  <section class="progress-bar-wrap">
    <div class="progress-label">Progres musim {seasonProgress}%</div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:{seasonProgress}%"></div>
    </div>
  </section>

  <section class="actions">
    <button onclick={onadvance} disabled={!nextMatch}>
      {nextMatch ? `Lanjut ke Pekan ${nextMatch.week}` : "Musim Selesai"}
    </button>
  </section>
</div>

<style>
  .career { display: flex; flex-direction: column; gap: 1.2rem; }

  header { border-bottom: 1px solid #333; padding-bottom: 0.8rem; }
  .title-row { display: flex; align-items: center; gap: 0.8rem; }
  h2 { margin: 0; font-size: 1.4rem; }
  .badge { background: #2a6; color: #fff; padding: 0.15rem 0.5rem; font-size: 0.75rem; }
  .sub { margin: 0.25rem 0 0; color: #888; font-size: 0.85rem; }

  .stats-row { display: flex; gap: 2rem; }
  .stat { display: flex; flex-direction: column; }
  .label { font-size: 0.75rem; color: #666; }
  .val { font-size: 1.5rem; font-weight: bold; color: #eee; }

  .match-result {
    display: flex; align-items: center; gap: 1rem;
    border: 1px solid #444; padding: 0.6rem 1rem;
  }
  .result-label { font-weight: bold; font-size: 0.9rem; }
  .score { font-size: 1.4rem; font-weight: bold; color: #eee; }

  .next-match { display: flex; flex-direction: column; gap: 0.2rem; }
  .opponent { margin: 0; font-size: 1rem; color: #ccc; }

  .progress-bar-wrap { display: flex; flex-direction: column; gap: 0.3rem; }
  .progress-label { font-size: 0.75rem; color: #666; }
  .progress-bar { height: 6px; background: #222; }
  .progress-fill { height: 100%; background: #2a6; transition: width 0.3s; }

  .actions button {
    padding: 0.6rem 1.4rem; background: #1a1a1a;
    border: 1px solid #2a6; color: #2a6;
    cursor: pointer; font-family: monospace; font-size: 1rem;
  }
  .actions button:hover:not(:disabled) { background: #2a6; color: #fff; }
  .actions button:disabled { border-color: #333; color: #444; cursor: default; }
</style>
