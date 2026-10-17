<script lang="ts">
  import type { StandingRow } from "../../engine/scheduler.js";

  interface Props {
    standings: StandingRow[];
    playerClubId: number;
  }

  let { standings, playerClubId }: Props = $props();
  let expanded = $state(false);
</script>

<section class="standings">
  <button class="toggle" onclick={() => (expanded = !expanded)}>
    Klasemen Liga 1 {expanded ? "▲" : "▼"}
  </button>

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
        {#each standings as row, i}
          <tr class:highlight={row.club_id === playerClubId}>
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
  {/if}
</section>

<style>
  .standings { border-top: 1px solid var(--border); padding-top: 0.85rem; }

  .toggle {
    background: none; border: none; color: var(--text2);
    font-family: inherit; font-size: 0.78rem;
    cursor: pointer; padding: 0; margin-bottom: 0.65rem;
    letter-spacing: 0.02em;
  }
  .toggle:hover { color: var(--text); }

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

  tr.highlight td { color: var(--text); background: var(--green-bg); }
  tr.highlight .pts { color: var(--green); }
  tr.highlight .name { color: var(--green); font-weight: bold; }

  tbody tr:hover td { background: var(--surface2); }
</style>
