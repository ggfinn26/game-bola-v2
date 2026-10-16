<script lang="ts">
  import type { Position } from "../../types/index.js";

  interface Props {
    clubs: [number, string, number][]; // [id, name, reputation]
    onstart: (p: { name: string; position: Position; age: number; clubId: number }) => void;
  }

  let { clubs, onstart }: Props = $props();

  const POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];

  let name = $state("Rizky Pratama");
  let position = $state<Position>("ST");
  let age = $state(17);
  let clubId = $state<number>(0);
  $effect(() => { if (clubId === 0 && clubs.length > 0) clubId = clubs[0][0]; });

  function submit() {
    if (!name.trim()) return;
    onstart({ name: name.trim(), position, age, clubId });
  }
</script>

<div class="new-game">
  <h2>Buat Karakter</h2>

  <label>
    Nama
    <input bind:value={name} maxlength={40} placeholder="Nama pemain..." />
  </label>

  <label>
    Posisi
    <select bind:value={position}>
      {#each POSITIONS as pos}
        <option value={pos}>{pos}</option>
      {/each}
    </select>
  </label>

  <label>
    Umur Mulai
    <input type="range" min={15} max={20} bind:value={age} />
    <span>{age} tahun</span>
  </label>

  <label>
    Klub Awal
    <select bind:value={clubId}>
      {#each clubs as [id, cname, rep]}
        <option value={id}>{cname} (rep {rep})</option>
      {/each}
    </select>
  </label>

  <button onclick={submit}>Mulai Karir</button>
</div>

<style>
  .new-game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 400px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #888;
  }
  input, select {
    background: #1a1a1a;
    border: 1px solid #333;
    color: #eee;
    padding: 0.4rem 0.6rem;
    font-family: monospace;
    font-size: 1rem;
  }
  button {
    margin-top: 0.5rem;
    padding: 0.6rem 1.2rem;
    background: #2a6;
    color: #fff;
    border: none;
    cursor: pointer;
    font-family: monospace;
    font-size: 1rem;
  }
</style>
