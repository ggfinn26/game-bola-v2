<script lang="ts">
  import type { StandingRow } from "../../engine/scheduler.js";
  import type { FormatProposalView } from "../../engine/stages.js";

  export interface LeagueMeta {
    id: number;
    name: string;
    flag: string;
    short: string;
  }

  export const LEAGUES: LeagueMeta[] = [
    { id: 1, name: "BRI Liga 1", flag: "🇮🇩", short: "Liga 1" },
    { id: 2, name: "Pegadaian Liga 2", flag: "🇮🇩", short: "Liga 2" },
    { id: 5, name: "Liga 3 Indonesia", flag: "🇮🇩", short: "Liga 3" },
    { id: 11, name: "Premier League Inggris", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", short: "EPL" },
    { id: 17, name: "EFL Championship", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", short: "Championship" },
    { id: 18, name: "EFL League One", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", short: "League One" },
    { id: 19, name: "EFL League Two", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", short: "League Two" },
    { id: 21, name: "National League", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", short: "National League" },
    { id: 12, name: "La Liga Spanyol", flag: "🇪🇸", short: "La Liga" },
    { id: 22, name: "Segunda División", flag: "🇪🇸", short: "Segunda" },
    { id: 23, name: "Primera Federación", flag: "🇪🇸", short: "Primera Fed" },
    { id: 13, name: "Serie A Italia", flag: "🇮🇹", short: "Serie A" },
    { id: 24, name: "Serie B", flag: "🇮🇹", short: "Serie B" },
    { id: 25, name: "Serie C", flag: "🇮🇹", short: "Serie C" },
    { id: 14, name: "Bundesliga Jerman", flag: "🇩🇪", short: "Bundesliga" },
    { id: 26, name: "2. Bundesliga", flag: "🇩🇪", short: "2. Bundesliga" },
    { id: 27, name: "3. Liga", flag: "🇩🇪", short: "3. Liga" },
    { id: 28, name: "Ligue 1 Prancis", flag: "🇫🇷", short: "Ligue 1" },
    { id: 29, name: "Ligue 2 Prancis", flag: "🇫🇷", short: "Ligue 2" },
    { id: 15, name: "Eredivisie Belanda", flag: "🇳🇱", short: "Eredivisie" },
    { id: 32, name: "Eerste Divisie", flag: "🇳🇱", short: "Eerste Divisie" },
    { id: 33, name: "Primeira Liga Portugal", flag: "🇵🇹", short: "Primeira Liga" },
    { id: 34, name: "Liga Portugal 2", flag: "🇵🇹", short: "Liga Portugal 2" },
    { id: 35, name: "Süper Lig Turki", flag: "🇹🇷", short: "Süper Lig" },
    { id: 36, name: "TFF 1. Lig Turki", flag: "🇹🇷", short: "TFF 1. Lig" },
    { id: 3, name: "Malaysia Super League", flag: "🇲🇾", short: "Malaysia" },
    { id: 4, name: "Thai League 1", flag: "🇹🇭", short: "Thailand" },
    { id: 16, name: "V.League 1 Vietnam", flag: "🇻🇳", short: "Vietnam" },
    { id: 9, name: "Singapore Premier League", flag: "🇸🇬", short: "Singapura" },
    { id: 6, name: "J1 League Jepang", flag: "🇯🇵", short: "J-League" },
    { id: 7, name: "K League 1 Korea", flag: "🇰🇷", short: "K-League" },
    { id: 8, name: "Saudi Pro League", flag: "🇸🇦", short: "Saudi Pro" },
  ];

  interface Props {
    standings?: StandingRow[];
    standings2?: StandingRow[];
    standings3?: StandingRow[];
    allStandings?: Record<number, StandingRow[]>;
    playerClubId: number;
    championshipSeries?: boolean;
    formatProposal?: FormatProposalView | null;
    onproposeformat?: () => void;
    onvoteformat?: (proposalId: number, choice: "for" | "against" | "abstain") => void;
  }

  let {
    standings = [],
    standings2 = [],
    standings3 = [],
    allStandings = {},
    playerClubId,
    championshipSeries = false,
    formatProposal = null,
    onproposeformat,
    onvoteformat,
  }: Props = $props();
  let expanded = $state(false);
  let manualLeagueId = $state<number | null>(null);

  const defaultLeagueId = $derived.by(() => {
    if (allStandings && Object.keys(allStandings).length > 0) {
      for (const [lid, rows] of Object.entries(allStandings)) {
        if (rows.some((r) => r.club_id === playerClubId)) {
          return Number(lid);
        }
      }
    }
    if (standings3.some((r) => r.club_id === playerClubId)) return 5;
    if (standings2.some((r) => r.club_id === playerClubId)) return 2;
    return 1;
  });

  const activeLeagueId = $derived(manualLeagueId ?? defaultLeagueId);
  const activeLeague = $derived(LEAGUES.find((l) => l.id === activeLeagueId) ?? LEAGUES[0]);

  const activeRows = $derived.by(() => {
    if (allStandings && allStandings[activeLeagueId] && allStandings[activeLeagueId].length > 0) {
      return allStandings[activeLeagueId];
    }
    if (activeLeagueId === 5) return standings3;
    if (activeLeagueId === 2) return standings2;
    return standings;
  });
</script>

<section class="standings">
  {#if formatProposal && formatProposal.status === "open"}
    <div class="congress-card">
      <div class="congress-top">
        <span class="congress-badge">🗳️ KONGRES LIGA TERBUKA</span>
        <span class="congress-deadline">Batas: Hari {formatProposal.deadline_day} · Syarat Lulus: {Math.round(formatProposal.threshold * 100)}%</span>
      </div>
      <p class="congress-desc">
        <strong>{formatProposal.proposer_name}</strong> mengajukan perubahan format menjadi
        <strong>{formatProposal.enable_championship ? "Championship Series (Regular + Knockout 4 Besar)" : "Liga Penuh (Regular Season Tanpa Knockout)"}</strong>.
      </p>
      <div class="vote-tally">
        <span class="v-for">✅ Setuju: <strong>{formatProposal.votes_for}</strong></span>
        <span class="v-against">❌ Tolak: <strong>{formatProposal.votes_against}</strong></span>
        <span class="v-abstain">⚪ Abstain: <strong>{formatProposal.votes_abstain}</strong></span>
        <span class="v-total">({formatProposal.votes_for + formatProposal.votes_against + formatProposal.votes_abstain}/{formatProposal.total_clubs} suara masuk)</span>
      </div>
      {#if onvoteformat}
        <div class="vote-actions">
          <button class="btn-for" onclick={() => onvoteformat(formatProposal.id, "for")}>
            ✅ Vote Setuju & Ketok Palu
          </button>
          <button class="btn-against" onclick={() => onvoteformat(formatProposal.id, "against")}>
            ❌ Vote Tolak & Ketok Palu
          </button>
          <button class="btn-abstain" onclick={() => onvoteformat(formatProposal.id, "abstain")}>
            ⚪ Abstain
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="header-row">
    <button class="toggle" onclick={() => (expanded = !expanded)}>
      Klasemen {activeLeague.flag} {activeLeague.name} {activeLeagueId === 1 ? (championshipSeries ? "(Championship Series)" : "(Liga Penuh)") : ""} {expanded ? "▲" : "▼"}
    </button>
    <div class="right-controls">
      <div class="div-pills">
        {#each LEAGUES as l}
          <button
            class="div-pill"
            class:active={activeLeagueId === l.id}
            onclick={() => { manualLeagueId = l.id; expanded = true; }}
          >
            {l.flag} {l.short}
          </button>
        {/each}
      </div>
      {#if activeLeagueId === 1 && onproposeformat && (!formatProposal || formatProposal.status !== "open")}
        <button class="propose-link" onclick={onproposeformat}>
          📜 Ajukan Proposal Ubah Format ke Kongres
        </button>
      {/if}
    </div>
  </div>

  {#if expanded}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th class="left">Klub</th>
          <th>M</th>
          <th>M</th>
          <th>S</th>
          <th>K</th>
          <th>SG</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {#each activeRows as row, i}
          <tr
            class:highlight={row.club_id === playerClubId}
            class:playoff-zone={activeLeagueId === 1 && championshipSeries && i < 4}
            class:promotion-zone={(activeLeagueId === 2 || activeLeagueId === 5) && i < 3}
            class:champion-zone={activeLeagueId > 2 && activeLeagueId !== 5 && i === 0}
            class:relegation-zone={((activeLeagueId === 1 && activeRows.length >= 10) || activeLeagueId === 2) && i >= activeRows.length - 3}
          >
            <td>{i + 1}</td>
            <td class="left name">{row.name}</td>
            <td>{row.played}</td>
            <td>{row.wins}</td>
            <td>{row.draws}</td>
            <td>{row.losses}</td>
            <td>{row.goals_for - row.goals_against > 0 ? "+" : ""}{row.goals_for - row.goals_against}</td>
            <td class="pts">{row.points}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="legend">
      {#if activeLeagueId === 1}
        {#if championshipSeries}
          <span class="leg-item playoff">■ 4 Besar: Lolos Semifinal Championship Series</span>
        {/if}
        <span class="leg-item releg">■ 3 Terbawah: Degradasi Otomatis ke Pegadaian Liga 2</span>
      {:else if activeLeagueId === 2}
        <span class="leg-item promo">■ 3 Teratas: Promosi Otomatis ke BRI Liga 1 (+Bonus Rp 3M)</span>
        <span class="leg-item releg">■ 3 Terbawah: Degradasi Otomatis ke Liga 3</span>
      {:else if activeLeagueId === 5}
        <span class="leg-item promo">■ 3 Teratas: Promosi Otomatis ke Pegadaian Liga 2</span>
      {:else}
        <span class="leg-item champion">■ Peringkat 1: Juara Liga & Lolos AFC Champions League</span>
      {/if}
    </div>
  {/if}
</section>

<style>
  .standings { border-top: 1px solid var(--border); padding-top: 0.85rem; }

  .congress-card {
    background: var(--surface);
    border: 1px solid var(--amber);
    border-left: 4px solid var(--amber);
    border-radius: var(--radius);
    padding: 0.75rem 0.9rem;
    margin-bottom: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .congress-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .congress-badge {
    background: var(--amber);
    color: #000;
    font-size: 0.68rem;
    font-weight: bold;
    padding: 0.12rem 0.45rem;
    border-radius: 2px;
  }
  .congress-deadline { font-size: 0.72rem; color: var(--text2); }
  .congress-desc { margin: 0; font-size: 0.81rem; color: var(--text); line-height: 1.4; }
  .vote-tally {
    display: flex;
    gap: 0.85rem;
    flex-wrap: wrap;
    font-size: 0.78rem;
    padding: 0.35rem 0.6rem;
    background: var(--surface2);
    border-radius: var(--radius);
  }
  .v-for { color: var(--green); }
  .v-against { color: var(--red); }
  .v-abstain { color: var(--text2); }
  .v-total { color: var(--text3); }

  .vote-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-top: 0.15rem; }
  .vote-actions button {
    padding: 0.38rem 0.75rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    font-family: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .btn-for { border-color: var(--green) !important; color: var(--green); font-weight: bold; }
  .btn-against { border-color: var(--red) !important; color: var(--red); }
  .btn-abstain { color: var(--text2); }
  .vote-actions button:hover { opacity: 0.85; }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .right-controls {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .div-pills {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    max-width: 580px;
    padding-bottom: 2px;
  }
  .div-pill {
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.7rem;
    padding: 0.18rem 0.5rem;
    border-radius: var(--radius);
    cursor: pointer;
    white-space: nowrap;
  }
  .div-pill.active {
    border-color: var(--green);
    color: var(--green);
    font-weight: bold;
    background: var(--surface2);
  }

  .champion-zone {
    background: rgba(234, 179, 8, 0.08);
    font-weight: 600;
  }
  .leg-item.champion { color: #eab308; }

  .toggle {
    background: none; border: none; color: var(--text2);
    font-family: inherit; font-size: 0.78rem;
    cursor: pointer; padding: 0;
    letter-spacing: 0.02em;
  }
  .toggle:hover { color: var(--text); }

  .propose-link {
    background: none;
    border: 1px solid var(--border2);
    color: var(--blue);
    font-family: inherit;
    font-size: 0.72rem;
    padding: 0.22rem 0.55rem;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .propose-link:hover { border-color: var(--blue); background: var(--surface); }

  table { width: 100%; border-collapse: collapse; font-size: 0.79rem; }
  thead th {
    color: var(--text3);
    font-weight: normal;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border);
    text-align: center;
    letter-spacing: 0.04em;
  }
  thead th.left { text-align: left; }
  tbody td { padding: 0.28rem 0.5rem; color: var(--text2); text-align: center; }
  .left { text-align: left; }
  .name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pts { font-weight: bold; color: var(--text); }

  tr.playoff-zone td:first-child { border-left: 2px solid var(--blue); color: var(--blue); }
  tr.promotion-zone td:first-child { border-left: 2px solid var(--green); color: var(--green); }
  tr.relegation-zone td:first-child { border-left: 2px solid var(--red); color: var(--red); }

  tr.highlight td { color: var(--text); background: var(--green-bg); }
  tr.highlight .pts { color: var(--green); }
  tr.highlight .name { color: var(--green); font-weight: bold; }

  tbody tr:hover td { background: var(--surface2); }

  .legend {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
    font-size: 0.7rem;
  }
  .leg-item.playoff { color: var(--blue); }
  .leg-item.promo { color: var(--green); }
  .leg-item.releg { color: var(--red); }
</style>
