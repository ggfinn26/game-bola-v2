<script lang="ts">
  import type { GameEvent } from "../../types/index.js";

  interface Props {
    event: GameEvent;
    onchoose: (eventId: string, choiceId: string) => void;
  }

  let { event, onchoose }: Props = $props();

  const toneColor: Record<string, string> = {
    positive: "var(--green)",
    critical: "var(--red)",
    neutral: "var(--blue)",
    humor:   "var(--amber)",
  };
</script>

<div class="event-card" style="border-color:{toneColor[event.tone] ?? '#39d'}">
  <div class="event-header">
    <span class="cat-badge" style="background:{toneColor[event.tone] ?? '#39d'}">{event.category}</span>
    <h3>{event.title}</h3>
  </div>

  <p class="desc">{event.description}</p>

  {#if event.social_reactions && event.social_reactions.length > 0}
    <div class="social-box">
      <div class="social-title">📱 Reaksi Media Sosial</div>
      {#each event.social_reactions as s}
        <div class="social-post">
          <span class="handle">{s.handle}</span>
          <span class="role-tag">[{s.role}]</span>:
          <span class="post-text">"{s.text}"</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="choices">
    {#each event.choices as c}
      <button onclick={() => onchoose(event.id, c.id)}>
        ▸ {c.text}
      </button>
    {/each}
  </div>
</div>

<style>
  .event-card {
    border: 1px solid var(--border2);
    border-top: 2px solid;
    background: var(--surface);
    padding: 1.1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    border-radius: var(--radius);
  }
  .event-header {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .cat-badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.5rem;
    color: #000;
    font-weight: bold;
    border-radius: 2px;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text);
    font-weight: bold;
  }
  .desc {
    margin: 0;
    font-size: 0.87rem;
    line-height: 1.55;
    color: var(--text2);
  }
  .social-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-left: 2px solid var(--border2);
    padding: 0.6rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.8rem;
    border-radius: var(--radius);
  }
  .social-title {
    color: var(--text3);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.1rem;
  }
  .handle { color: var(--blue); font-weight: bold; }
  .role-tag { color: var(--text3); font-size: 0.72rem; }
  .post-text { color: var(--text2); }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-top: 0.1rem;
  }
  .choices button {
    text-align: left;
    padding: 0.65rem 1rem;
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.87rem;
    border-radius: var(--radius);
    transition: all 0.15s;
    line-height: 1.4;
  }
  .choices button:hover {
    background: var(--green-bg);
    border-color: var(--green);
    color: var(--green);
  }
</style>
