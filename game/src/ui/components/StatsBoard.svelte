<script lang="ts">
  import type { LeagueLeaders, CareerSeasonRow } from "../../engine/awards.js";
  import type { Player } from "../../types/index.js";

  interface Props {
    leaders: LeagueLeaders;
    careerHistory: CareerSeasonRow[];
    egoId: number;
    egoPlayer?: Player | null;
  }

  let { leaders, careerHistory, egoId, egoPlayer = null }: Props = $props();
  let expanded = $state(false);
  let activeTab = $state<"leaders" | "history" | "profile">("leaders");

  const totalGoals = $derived(careerHistory.reduce((s, r) => s + r.goals, 0));
  const totalAssists = $derived(careerHistory.reduce((s, r) => s + r.assists, 0));
  const totalMatches = $derived(careerHistory.reduce((s, r) => s + r.matches, 0));
  const avgRating = $derived(
    careerHistory.length > 0
      ? (careerHistory.reduce((s, r) => s + r.rating, 0) / careerHistory.length).toFixed(2)
      : "—",
  );

  const NATIONALITY: Record<number, string> = { 1: "🇮🇩 Indonesia", 2: "🇲🇾 Malaysia", 3: "🇹🇭 Thailand" };
</script>

<section class="stats-board">
  <div class="board-header">
    <button class="toggle" onclick={() => (expanded = !expanded)}>
      Statistik & Riwayat Karir {expanded ? "▲" : "▼"}
    </button>

    {#if expanded}
      <div class="tabs">
        {#if egoPlayer}
          <button class="tab-btn" class:active={activeTab === "profile"} onclick={() => (activeTab = "profile")}>
            👤 Profil
          </button>
        {/if}
        <button class="tab-btn" class:active={activeTab === "leaders"} onclick={() => (activeTab = "leaders")}>
          Statistik Liga
        </button>
        <button class="tab-btn" class:active={activeTab === "history"} onclick={() => (activeTab = "history")}>
          Riwayat ({careerHistory.length})
        </button>
      </div>
    {/if}
  </div>

  {#if expanded}
    {#if activeTab === "profile" && egoPlayer}
      <div class="profile-section">
        <div class="profile-top">
          <div class="profile-name">
            <h3>{egoPlayer.name}</h3>
            <span class="profile-pos">{egoPlayer.position} · Usia {egoPlayer.age}</span>
            <span class="profile-nat">{NATIONALITY[egoPlayer.nationality] ?? `Nat. ${egoPlayer.nationality}`}</span>
          </div>
          <div class="ovr-badge">
            <span class="ovr-val">{egoPlayer.overall}</span>
            <span class="ovr-lbl">OVR</span>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-cell">
            <span class="stat-val">{egoPlayer.career_matches}</span>
            <span class="stat-lbl">Total Main</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{egoPlayer.career_goals}</span>
            <span class="stat-lbl">Career Gol</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{egoPlayer.career_assists}</span>
            <span class="stat-lbl">Career Ast</span>
          </div>
          <div class="stat-cell trophy">
            <span class="stat-val">{egoPlayer.career_trophies}</span>
            <span class="stat-lbl">🏆 Trofi</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{totalMatches > 0 ? avgRating : "—"}</span>
            <span class="stat-lbl">Avg Rating</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{totalGoals}</span>
            <span class="stat-lbl">Gol (Arsip)</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{egoPlayer.ca}</span>
            <span class="stat-lbl">CA</span>
          </div>
          <div class="stat-cell">
            <span class="stat-val">{egoPlayer.pa}</span>
            <span class="stat-lbl">PA</span>
          </div>
        </div>

        <div class="attr-section">
          <h4>Atribut Utama</h4>
          <div class="attr-bars">
            {#each [
              ["Finishing", egoPlayer.finishing],
              ["Passing", egoPlayer.passing],
              ["Dribbling", egoPlayer.dribbling],
              ["Tackling", egoPlayer.tackling],
              ["Pace", egoPlayer.pace],
              ["Strength", egoPlayer.strength],
              ["Decisions", egoPlayer.decisions],
              ["Vision", egoPlayer.vision],
            ] as [attrName, attrVal]}
              <div class="attr-row">
                <span class="attr-name">{attrName}</span>
                <div class="bar-bg">
                  <div class="bar-fill" style="width: {attrVal}%"></div>
                </div>
                <span class="attr-num">{attrVal}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

    {:else if activeTab === "leaders"}
      <div class="leaders-grid">
        <div class="leader-box">
          <h4>Top Skor</h4>
          {#if leaders.topScorers.length === 0}
            <p class="empty">Belum ada gol.</p>
          {:else}
            <table>
              <thead><tr><th>#</th><th class="left">Pemain</th><th class="left">Klub</th><th>Gol</th></tr></thead>
              <tbody>
                {#each leaders.topScorers as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td><td class="left name">{row.name}</td><td class="left club">{row.club_name}</td><td class="val">{row.goals}</td>
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
              <thead><tr><th>#</th><th class="left">Pemain</th><th class="left">Klub</th><th>Ast</th></tr></thead>
              <tbody>
                {#each leaders.topAssists as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td><td class="left name">{row.name}</td><td class="left club">{row.club_name}</td><td class="val">{row.assists}</td>
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
              <thead><tr><th>#</th><th class="left">Pemain</th><th class="left">Klub</th><th>Rat</th></tr></thead>
              <tbody>
                {#each leaders.topRated as row, i}
                  <tr class:highlight={row.player_id === egoId}>
                    <td>{i + 1}</td><td class="left name">{row.name}</td><td class="left club">{row.club_name}</td><td class="val">{row.rating.toFixed(2)}</td>
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
              <tr><th>Musim</th><th class="left">Klub</th><th>Main</th><th>Gol</th><th>Ast</th><th>CS</th><th>🟨/🟥</th><th>Rating</th></tr>
            </thead>
            <tbody>
              {#each careerHistory as row}
                <tr>
                  <td>M{row.season}</td><td class="left name">{row.club_name}</td>
                  <td>{row.matches}</td><td class="val">{row.goals}</td><td>{row.assists}</td>
                  <td>{row.clean_sheets}</td><td>{row.yellow_cards}/{row.red_cards}</td>
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
  .board-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.65rem; }
  .toggle { background: none; border: none; color: var(--text2); font-family: inherit; font-size: 0.78rem; cursor: pointer; padding: 0; letter-spacing: 0.02em; }
  .toggle:hover { color: var(--text); }
  .tabs { display: flex; gap: 0.35rem; }
  .tab-btn { background: var(--surface); border: 1px solid var(--border); color: var(--text2); font-family: inherit; font-size: 0.72rem; padding: 0.2rem 0.6rem; border-radius: var(--radius); cursor: pointer; }
  .tab-btn:hover { color: var(--text); border-color: var(--border2); }
  .tab-btn.active { color: var(--green); border-color: var(--green); background: var(--green-bg); }

  /* Profile */
  .profile-section { display: flex; flex-direction: column; gap: 1rem; }
  .profile-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .profile-name { display: flex; flex-direction: column; gap: 0.2rem; }
  .profile-name h3 { margin: 0; font-size: 1.1rem; }
  .profile-pos { font-size: 0.8rem; color: var(--text3); }
  .profile-nat { font-size: 0.78rem; color: var(--text3); }
  .ovr-badge { background: var(--accent); border-radius: 8px; padding: 0.5rem 0.9rem; text-align: center; }
  .ovr-val { display: block; font-size: 1.6rem; font-weight: 800; color: white; line-height: 1; }
  .ovr-lbl { font-size: 0.65rem; color: rgba(255,255,255,0.75); text-transform: uppercase; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .stat-cell { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem; text-align: center; }
  .stat-cell.trophy { border-color: var(--amber, #f59e0b); }
  .stat-val { display: block; font-size: 1.2rem; font-weight: 700; color: var(--text); }
  .stat-lbl { font-size: 0.68rem; color: var(--text3); }
  .attr-section h4 { margin: 0 0 0.5rem; font-size: 0.7rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; }
  .attr-bars { display: flex; flex-direction: column; gap: 0.3rem; }
  .attr-row { display: grid; grid-template-columns: 80px 1fr 28px; gap: 0.4rem; align-items: center; font-size: 0.78rem; }
  .attr-name { color: var(--text2); }
  .bar-bg { background: var(--surface2); border-radius: 3px; height: 6px; overflow: hidden; }
  .bar-fill { background: var(--accent); height: 100%; border-radius: 3px; transition: width 0.3s; }
  .attr-num { color: var(--text); text-align: right; font-weight: 600; }

  /* Leaders / History */
  .leaders-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
  .leader-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.65rem 0.75rem; }
  h4 { margin: 0 0 0.45rem 0; font-size: 0.68rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
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
  .history-section table { width: 100%; }
</style>
