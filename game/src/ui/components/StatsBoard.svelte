<script lang="ts">
  import type { LeagueLeaders, CareerSeasonRow } from "../../engine/awards.js";

  interface Props {
    leaders: LeagueLeaders;
    careerHistory: CareerSeasonRow[];
    egoId: number;
  }

  let { leaders, careerHistory, egoId }: Props = $props();
  let expanded = $state(false);
  let activeTab = $state<"leaders" | "history">("leaders");
</script>

<section class="stats-board">
  <div class="board-header">
    <button class="toggle" onclick={() => (expanded = !expanded)}>
      Statistik & Riwayat Karir {expanded ? "▲" : "▼"}
    </button>

    {#if expanded}
      <div class="tabs">
        <button
          class="tab-btn"
          class:active={activeTab === "leaders"}
          onclick={() => (activeTab = "leaders")}
        >
          Statistik Liga 1
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "history"}
          onclick={() => (activeTab = "history")}
        >
          Riwayat Karir ({careerHistory.length})
        </button>
      </div>
    {/if}
  </div>

  {#if expanded}
    {#if activeTab === "leaders"}
      <div class="leaders-grid">
        <div class="leader-box">
          <h4>Top Skor</h4>
          {#if leaders.topScorers.length === 0}
            <p class="empty">Belum ada gol.</p>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th class="left">Pemain</th>
                  <th class="left">Klub</th>
                  <th>Gol</th>
                </tr>
              </thead>
              <tbody>
                {#each leaders.topScorers as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td>
                    <td class="left name">{row.name}</td>
                    <td class="left club">{row.club_name}</td>
                    <td class="val">{row.goals}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>

        <div class="leader-box">
          <h4>Top Assist</h4>
          {#if leaders.topAssists.length === 0}
            <p class="empty">Belum ada assist.</p>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th class="left">Pemain</th>
                  <th class="left">Klub</th>
                  <th>Ast</th>
                </tr>
              </thead>
              <tbody>
                {#each leaders.topAssists as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td>
                    <td class="left name">{row.name}</td>
                    <td class="left club">{row.club_name}</td>
                    <td class="val">{row.assists}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>

        <div class="leader-box">
          <h4>Rating Terbaik</h4>
          {#if leaders.topRated.length === 0}
            <p class="empty">Belum ada data pertandingan.</p>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th class="left">Pemain</th>
                  <th class="left">Klub</th>
                  <th>Rat</th>
                </tr>
              </thead>
              <tbody>
                {#each leaders.topRated as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td>
                    <td class="left name">{row.name}</td>
                    <td class="left club">{row.club_name}</td>
                    <td class="val">{row.rating.toFixed(2)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>
    {:else}
      <div class="history-section">
        {#if careerHistory.length === 0}
          <p class="empty">Belum ada arsip musim yang selesai.</p>
        {:else}
          <table>
            <thead>
              <tr>
                <th>Musim</th>
                <th class="left">Klub</th>
                <th>Main</th>
                <th>Gol</th>
                <th>Ast</th>
                <th>CS</th>
                <th>🟨/🟥</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {#each careerHistory as row}
                <tr>
                  <td>M{row.season}</td>
                  <td class="left name">{row.club_name}</td>
                  <td>{row.matches}</td>
                  <td class="val">{row.goals}</td>
                  <td>{row.assists}</td>
                  <td>{row.clean_sheets}</td>
                  <td>{row.yellow_cards}/{row.red_cards}</td>
                  <td class="val">{row.rating.toFixed(2)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .stats-board { border-top: 1px solid var(--border); padding-top: 0.85rem; }

  .board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .toggle {
    background: none; border: none; color: var(--text2);
    font-family: inherit; font-size: 0.78rem;
    cursor: pointer; padding: 0;
    letter-spacing: 0.02em;
  }
  .toggle:hover { color: var(--text); }

  .tabs { display: flex; gap: 0.35rem; }
  .tab-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text2);
    font-family: inherit;
    font-size: 0.72rem;
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: var(--text); border-color: var(--border2); }
  .tab-btn.active { color: var(--green); border-color: var(--green); background: var(--green-bg); }

  .leaders-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .leader-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.65rem 0.75rem;
  }

  h4 {
    margin: 0 0 0.45rem 0;
    font-size: 0.68rem;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.35rem;
  }

  .empty { color: var(--text3); font-size: 0.75rem; margin: 0.3rem 0; }

  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  thead th { color: var(--text3); font-weight: normal; padding: 0.25rem 0.35rem; border-bottom: 1px solid var(--border); text-align: center; }
  tbody td { padding: 0.25rem 0.35rem; color: var(--text2); text-align: center; }
  .left { text-align: left; }
  .name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .club { max-width: 85px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text3); }
  .val { font-weight: bold; color: var(--text); }

  tr.highlight td { color: var(--text); background: var(--green-bg); }
  tr.highlight .val { color: var(--green); }
  tr.highlight .name { color: var(--green); }

  tbody tr:hover td { background: var(--surface2); }
</style>
