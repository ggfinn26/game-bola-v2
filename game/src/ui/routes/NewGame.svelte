<script lang="ts">
  import type { Position } from "../../types/index.js";

  interface Appearance {
    skin: string;
    hairColor: string;
    eyeColor: string;
    hair: string;
    beard: string;
    eyes: string;
    nose: string;
  }

  interface Props {
    clubs: [number, string, number, number][]; // [id, name, rep, league_id]
    leagues: [number, string][];               // [id, name]
    mode?: "player" | "manager" | "agent" | "owner";
    onstart: (p: { name: string; position: Position; age: number; clubId: number; appearance: string }) => void;
  }

  let { clubs, leagues, mode = "player", onstart }: Props = $props();

  const POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"];

  const SKINS = ["#fce0c8","#f6d1b3","#ecc096","#e5b589","#d99b66","#c2804c","#a86c3d","#8c532b","#6b3d1e","#422310"];
  const HAIR_COLORS = ["#141210","#2b221b","#4a2e1b","#73482b","#9c4322","#c67d38","#e0bc56","#ede6d6","#8e959c","#c92a2a","#228be6"];
  const EYE_COLORS = ["#1e1610","#54361d","#8a6228","#2e6f40","#286299","#647280"];

  const HAIR_OPTS = [
    ["bald","Gundul"],["buzz","Cepak"],["fade","Crew Fade"],["sidepart","Belah Samping"],
    ["curtains","Belah Tengah"],["pompadour","Pompadour"],["spiky","Jabrik"],["curly","Ikal Pendek"],
    ["afro","Kribo"],["mohawk","Mohawk"],["manbun","Man Bun"],["mullet","Mullet"],
    ["long","Gondrong"],["dreads","Gimbal"],
  ] as const;

  const BEARD_OPTS = [
    ["none","Polos"],["stubble","Stubble"],["mustache","Kumis Tipis"],["chevron","Kumis Tebal"],
    ["goatee","Goatee"],["vandyke","Van Dyke"],["chinstrap","Chinstrap"],["boxed","Boxed"],
    ["full","Lebat"],["mutton","Cambang"],
  ] as const;

  const EYES_OPTS = [
    ["normal","Normal"],["fierce","Tajam"],["narrow","Fokus"],["chill","Santai"],
    ["wide","Lebar"],["monolid","Sipit"],["tired","Lelah"],["bushy","Alis Tebal"],
  ] as const;

  const NOSE_OPTS = [
    ["normal","Normal"],["button","Kecil"],["pointed","Mancung"],["wide","Lebar"],
    ["hooked","Aquiline"],["bulbous","Bulat"],["flat","Datar"],["crooked","Plester"],
  ] as const;

  // Form state
  let name = $state("Rizky Pratama");
  let position = $state<Position>("ST");
  let age = $state(17);
  let leagueId = $state<number>(0);
  $effect.pre(() => { if (leagueId === 0 && leagues.length > 0) leagueId = leagues[0][0]; });
  let clubId = $state<number>(0);

  // Avatar state
  let ap = $state<Appearance>({
    skin: "#d99b66",
    hairColor: "#141210",
    eyeColor: "#1e1610",
    hair: "sidepart",
    beard: "none",
    eyes: "normal",
    nose: "normal",
  });

  // Filtered clubs by selected league
  const filteredClubs = $derived(clubs.filter((c) => c[3] === leagueId));

  // Auto-select first club when league changes
  $effect(() => {
    const first = filteredClubs[0];
    if (first) clubId = first[0];
  });

  function randomize() {
    ap = {
      skin: SKINS[Math.floor(Math.random() * SKINS.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      eyeColor: EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)],
      hair: HAIR_OPTS[Math.floor(Math.random() * HAIR_OPTS.length)][0],
      beard: BEARD_OPTS[Math.floor(Math.random() * BEARD_OPTS.length)][0],
      eyes: EYES_OPTS[Math.floor(Math.random() * EYES_OPTS.length)][0],
      nose: NOSE_OPTS[Math.floor(Math.random() * NOSE_OPTS.length)][0],
    };
  }

  function submit() {
    if (!name.trim()) return;
    if (mode === "agent") {
      onstart({ name: name.trim(), position: "CM", age: 32, clubId: 1, appearance: "" });
      return;
    }
    if (clubId === 0) return;
    if (mode === "manager" || mode === "owner") {
      onstart({ name: name.trim(), position: "CM", age: 42, clubId, appearance: "" });
    } else {
      onstart({ name: name.trim(), position, age, clubId, appearance: JSON.stringify(ap) });
    }
  }
</script>

<div class="builder" class:manager-mode={mode !== "player"}>
  <!-- LEFT: Avatar preview + colors — hidden in manager/agent mode -->
  <div class="left-col" class:hidden={mode !== "player"}>
    <div class="panel-header">
      <span>Wajah Pemain</span>
      <button class="btn-random" onclick={randomize} type="button">Acak</button>
    </div>

    <div class="stage">
      <div
        class="player-avatar"
        data-hair={ap.hair}
        data-beard={ap.beard}
        data-eyes={ap.eyes}
        data-nose={ap.nose}
        style="--skin:{ap.skin};--hair-color:{ap.hairColor};--eye-color:{ap.eyeColor}"
      >
        <div class="hair-back"></div>
        <div class="shoulders"></div>
        <div class="neck"></div>
        <div class="ears"></div>
        <div class="head">
          <div class="brows"></div>
          <div class="eyes-wrap">
            <div class="eye"></div>
            <div class="eye"></div>
          </div>
          <div class="nose-el"></div>
          <div class="mouth"></div>
          <div class="beard-el"></div>
        </div>
        <div class="hair-front"></div>
      </div>
    </div>

    <div class="ctrl-group">
      <span class="lbl">Warna Kulit</span>
      <div class="swatches">
        {#each SKINS as c}
          <button
            class="swatch"
            style="--c:{c}"
            aria-pressed={ap.skin === c}
            onclick={() => (ap = { ...ap, skin: c })}
            title={c}
          ></button>
        {/each}
      </div>
    </div>

    <div class="ctrl-group">
      <span class="lbl">Warna Rambut & Jenggot</span>
      <div class="swatches">
        {#each HAIR_COLORS as c}
          <button
            class="swatch"
            style="--c:{c}"
            aria-pressed={ap.hairColor === c}
            onclick={() => (ap = { ...ap, hairColor: c })}
            title={c}
          ></button>
        {/each}
      </div>
    </div>

    <div class="ctrl-group">
      <span class="lbl">Warna Mata</span>
      <div class="swatches">
        {#each EYE_COLORS as c}
          <button
            class="swatch"
            style="--c:{c}"
            aria-pressed={ap.eyeColor === c}
            onclick={() => (ap = { ...ap, eyeColor: c })}
            title={c}
          ></button>
        {/each}
      </div>
    </div>
  </div>

  <!-- RIGHT: Info karir + penampilan options -->
  <div class="right-col">
    <div class="panel-header">
      <span>{mode === "manager" ? "Info Manajer" : mode === "agent" ? "Info Agensi Pemain" : mode === "owner" ? "Info Pemilik Klub" : "Info Karir"}</span>
    </div>

    <label>
      {mode === "manager" ? "Nama Manajer" : mode === "agent" ? "Nama Agen" : mode === "owner" ? "Nama Pemilik / Investor" : "Nama"}
      <input
        bind:value={name}
        maxlength={40}
        placeholder={mode === "manager" ? "Nama manajer..." : mode === "agent" ? "Nama agen..." : mode === "owner" ? "Nama pemilik..." : "Nama pemain..."}
      />
    </label>

    {#if mode === "player"}
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
      <div class="range-row">
        <input type="range" min={15} max={20} bind:value={age} />
        <span class="age-val">{age} th</span>
      </div>
    </label>
    {/if}

    {#if mode !== "agent"}
      {#if leagues.length > 1}
        <label>
          Liga
          <select bind:value={leagueId}>
            {#each leagues as [lid, lname]}
              <option value={lid}>{lname}</option>
            {/each}
          </select>
        </label>
      {/if}

      <label>
        {mode === "manager" ? "Klub yang Dilatih" : mode === "owner" ? "Klub yang Diakuisisi" : "Klub Awal"}
        <select bind:value={clubId}>
          {#each filteredClubs as [id, cname, rep]}
            <option value={id}>{cname} <span class="rep">({rep})</span></option>
          {/each}
        </select>
      </label>
    {/if}

    {#if mode === "player"}
    <div class="divider"></div>
    <div class="panel-header"><span>Penampilan</span></div>
    {/if}

    {#if mode === "player"}
    <div class="ctrl-group">
      <span class="lbl">Rambut</span>
      <div class="opt-grid">
        {#each HAIR_OPTS as [val, label]}
          <button class="btn-opt" aria-pressed={ap.hair === val} onclick={() => (ap = { ...ap, hair: val })}>{label}</button>
        {/each}
      </div>
    </div>

    <div class="ctrl-group">
      <span class="lbl">Jenggot & Kumis</span>
      <div class="opt-grid">
        {#each BEARD_OPTS as [val, label]}
          <button class="btn-opt" aria-pressed={ap.beard === val} onclick={() => (ap = { ...ap, beard: val })}>{label}</button>
        {/each}
      </div>
    </div>


    <div class="ctrl-group">
      <span class="lbl">Mata & Alis</span>
      <div class="opt-grid">
        {#each EYES_OPTS as [val, label]}
          <button class="btn-opt" aria-pressed={ap.eyes === val} onclick={() => (ap = { ...ap, eyes: val })}>{label}</button>
        {/each}
      </div>
    </div>

    <div class="ctrl-group">
      <span class="lbl">Hidung</span>
      <div class="opt-grid">
        {#each NOSE_OPTS as [val, label]}
          <button class="btn-opt" aria-pressed={ap.nose === val} onclick={() => (ap = { ...ap, nose: val })}>{label}</button>
        {/each}
      </div>
    </div>
    {/if}

    <button class="btn-start" onclick={submit}>
      {mode === "manager" ? "Mulai Karir Manajer" : mode === "agent" ? "Mulai Karir Agen" : mode === "owner" ? "Mulai Sebagai Pemilik Klub" : "Mulai Karir"}
    </button>
  </div>
</div>

<style>
  .builder {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 1.25rem;
    margin-top: 1.5rem;
    align-items: start;
  }
  .builder.manager-mode {
    grid-template-columns: 1fr;
    max-width: 480px;
    margin-left: auto;
    margin-right: auto;
  }
  .left-col.hidden { display: none; }
  @media (max-width: 680px) {
    .builder { grid-template-columns: 1fr; }
  }

  .left-col {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    position: sticky;
    top: 1rem;
  }

  .right-col {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-height: 90vh;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem;
  }

  .btn-random {
    background: var(--surface2);
    color: var(--text2);
    border: 1px solid var(--border2);
    padding: 0.25rem 0.6rem;
    font-family: inherit;
    font-size: 0.74rem;
    cursor: pointer;
    border-radius: var(--radius);
    transition: color 0.12s, border-color 0.12s;
  }
  .btn-random:hover { color: var(--green); border-color: var(--green); }

  /* ── Avatar Stage ── */
  .stage {
    background: radial-gradient(circle at 50% 35%, #1a2d1e 0%, #0a120c 100%);
    border: 1px solid var(--border);
    height: 230px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--radius);
  }

  /* ── CSS Avatar (ported from tes/index.html) ── */
  .player-avatar {
    --skin: #d99b66;
    --skin-shadow: color-mix(in srgb, var(--skin) 78%, #1a0800 22%);
    --skin-deep: color-mix(in srgb, var(--skin) 62%, #1a0800 38%);
    --skin-light: color-mix(in srgb, var(--skin) 88%, #ffffff 12%);
    --hair-color: #1c1815;
    --hair-hi: color-mix(in srgb, var(--hair-color) 82%, #ffffff 18%);
    --eye-color: #2b1d12;
    --jersey: #1a7a3c;
    position: relative;
    width: 160px;
    height: 220px;
  }

  .shoulders {
    position: absolute; bottom: 0; left: 16px;
    width: 128px; height: 48px;
    background: var(--jersey);
    border-radius: 38px 38px 0 0;
    box-shadow: inset 0 -6px 0 rgba(0,0,0,0.25);
    z-index: 2;
  }
  .shoulders::before {
    content: ""; position: absolute; top: 0; left: 42px;
    width: 44px; height: 14px;
    background: #eee; border-radius: 0 0 22px 22px;
  }
  .neck {
    position: absolute; bottom: 38px; left: 60px;
    width: 40px; height: 32px;
    background: var(--skin-shadow);
    border-radius: 0 0 14px 14px; z-index: 2;
  }
  .hair-back {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; z-index: 1; pointer-events: none;
  }
  .ears {
    position: absolute; top: 84px; left: 24px;
    width: 112px; height: 28px;
    display: flex; justify-content: space-between; z-index: 2;
  }
  .ears::before, .ears::after {
    content: ""; width: 15px; height: 28px;
    background: var(--skin-shadow); border-radius: 8px;
    box-shadow: inset 0 0 0 3px var(--skin);
  }
  .head {
    position: absolute; top: 44px; left: 34px;
    width: 92px; height: 114px;
    background: var(--skin);
    border-radius: 42px 42px 46px 46px;
    box-shadow: inset -6px -6px 0 var(--skin-shadow), inset 4px 4px 0 var(--skin-light);
    z-index: 3;
  }
  .brows {
    position: absolute; top: 36px; left: 16px;
    width: 60px; display: flex; justify-content: space-between; z-index: 5;
  }
  .brows::before, .brows::after {
    content: ""; width: 22px; height: 5px;
    background: var(--hair-color); border-radius: 3px; transition: transform 0.15s ease;
  }
  .eyes-wrap {
    position: absolute; top: 46px; left: 18px;
    width: 56px; height: 16px;
    display: flex; justify-content: space-between; align-items: center; z-index: 4;
  }
  .eye {
    position: relative; width: 18px; height: 12px;
    background: #f5f5f5; border-radius: 50%; overflow: hidden;
    box-shadow: 0 1px 0 var(--skin-shadow);
  }
  .eye::before {
    content: ""; position: absolute; top: 1px; left: 4px;
    width: 10px; height: 10px;
    background: var(--eye-color); border-radius: 50%;
    box-shadow: inset 2px 2px 0 rgba(255,255,255,0.85);
  }
  .nose-el { position: absolute; z-index: 5; }
  .mouth {
    position: absolute; top: 84px; left: 34px;
    width: 24px; height: 7px;
    background: #6e2a23; border-radius: 2px 2px 10px 10px; z-index: 4;
  }
  .mouth::after {
    content: ""; position: absolute; top: 0; left: 4px;
    width: 16px; height: 2px; background: #eee;
  }
  .beard-el {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; pointer-events: none; z-index: 5;
  }
  .hair-front {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%; pointer-events: none; z-index: 6;
  }

  /* Eyes variants */
  :global(.player-avatar[data-eyes="fierce"] .brows::before) { transform: rotate(12deg) translateY(2px); }
  :global(.player-avatar[data-eyes="fierce"] .brows::after) { transform: rotate(-12deg) translateY(2px); }
  :global(.player-avatar[data-eyes="fierce"] .eye) { height: 10px; border-radius: 2px 2px 10px 10px; border-top: 2px solid var(--skin-deep); }
  :global(.player-avatar[data-eyes="narrow"] .eye) { height: 7px; border-radius: 3px; border-top: 2px solid var(--skin-deep); }
  :global(.player-avatar[data-eyes="narrow"] .eye::before) { top: -1px; }
  :global(.player-avatar[data-eyes="chill"] .brows::before) { transform: rotate(-6deg); }
  :global(.player-avatar[data-eyes="chill"] .brows::after) { transform: rotate(6deg); }
  :global(.player-avatar[data-eyes="chill"] .eye) { height: 11px; box-shadow: inset 0 5px 0 var(--skin-shadow); }
  :global(.player-avatar[data-eyes="wide"] .brows) { top: 33px; }
  :global(.player-avatar[data-eyes="wide"] .eye) { width: 19px; height: 15px; border-radius: 50%; }
  :global(.player-avatar[data-eyes="wide"] .eye::before) { top: 2px; left: 4.5px; }
  :global(.player-avatar[data-eyes="monolid"] .eye) { height: 6px; border-radius: 6px 6px 2px 2px; }
  :global(.player-avatar[data-eyes="monolid"] .eye::before) { top: -2px; }
  :global(.player-avatar[data-eyes="tired"] .eye) { height: 10px; box-shadow: 0 3px 0 var(--skin-deep), inset 0 4px 0 var(--skin-shadow); }
  :global(.player-avatar[data-eyes="bushy"] .brows) { top: 34px; }
  :global(.player-avatar[data-eyes="bushy"] .brows::before), :global(.player-avatar[data-eyes="bushy"] .brows::after) { height: 8px; width: 24px; border-radius: 2px; }

  /* Nose variants */
  :global(.player-avatar[data-nose="normal"] .nose-el) { top: 54px; left: 40px; width: 12px; height: 20px; background: var(--skin-shadow); border-radius: 4px 4px 8px 8px; }
  :global(.player-avatar[data-nose="button"] .nose-el) { top: 59px; left: 40px; width: 12px; height: 12px; background: var(--skin-shadow); border-radius: 50%; }
  :global(.player-avatar[data-nose="pointed"] .nose-el) { top: 50px; left: 41px; width: 10px; height: 24px; background: var(--skin-shadow); clip-path: polygon(50% 0%, 100% 85%, 50% 100%, 0% 85%); }
  :global(.player-avatar[data-nose="wide"] .nose-el) { top: 55px; left: 35px; width: 22px; height: 18px; background: var(--skin-shadow); border-radius: 8px 8px 10px 10px; }
  :global(.player-avatar[data-nose="wide"] .nose-el::after) { content: ""; position: absolute; bottom: 2px; left: 3px; width: 16px; height: 4px; background: var(--skin-deep); border-radius: 4px; }
  :global(.player-avatar[data-nose="hooked"] .nose-el) { top: 51px; left: 40px; width: 13px; height: 23px; background: var(--skin-shadow); border-radius: 2px 10px 4px 10px; transform: rotate(-4deg); }
  :global(.player-avatar[data-nose="bulbous"] .nose-el) { top: 52px; left: 42px; width: 8px; height: 18px; background: var(--skin-shadow); border-radius: 4px; }
  :global(.player-avatar[data-nose="bulbous"] .nose-el::after) { content: ""; position: absolute; bottom: -4px; left: -5px; width: 18px; height: 14px; background: var(--skin-shadow); border-radius: 50%; }
  :global(.player-avatar[data-nose="flat"] .nose-el) { top: 58px; left: 37px; width: 18px; height: 14px; background: var(--skin-shadow); border-radius: 3px 3px 9px 9px; }
  :global(.player-avatar[data-nose="crooked"] .nose-el) { top: 52px; left: 40px; width: 11px; height: 22px; background: var(--skin-shadow); border-radius: 4px; transform: skewX(11deg); }
  :global(.player-avatar[data-nose="crooked"] .nose-el::before) { content: ""; position: absolute; top: 6px; left: -4px; width: 19px; height: 5px; background: #f0e6d2; border-radius: 2px; transform: skewX(-11deg); }

  /* Beard variants */
  :global(.player-avatar[data-beard="none"] .beard-el) { display: none; }
  :global(.player-avatar[data-beard="stubble"] .beard-el::before) { content: ""; position: absolute; bottom: 0; left: 0; width: 92px; height: 48px; background: var(--hair-color); opacity: 0.25; border-radius: 12px 12px 46px 46px; }
  :global(.player-avatar[data-beard="mustache"] .beard-el::before) { content: ""; position: absolute; top: 76px; left: 26px; width: 40px; height: 8px; background: var(--hair-color); border-radius: 8px 8px 2px 2px; }
  :global(.player-avatar[data-beard="chevron"] .beard-el::before) { content: ""; position: absolute; top: 74px; left: 22px; width: 48px; height: 13px; background: var(--hair-color); border-radius: 12px 12px 4px 4px; clip-path: polygon(0 25%, 20% 0, 80% 0, 100% 25%, 100% 100%, 75% 75%, 25% 75%, 0 100%); }
  :global(.player-avatar[data-beard="goatee"] .beard-el::before) { content: ""; position: absolute; top: 76px; left: 28px; width: 36px; height: 6px; background: var(--hair-color); border-radius: 6px; }
  :global(.player-avatar[data-beard="goatee"] .beard-el::after) { content: ""; position: absolute; bottom: -2px; left: 31px; width: 30px; height: 20px; background: var(--hair-color); border-radius: 6px 6px 18px 18px; }
  :global(.player-avatar[data-beard="vandyke"] .beard-el::before) { content: ""; position: absolute; top: 75px; left: 24px; width: 44px; height: 7px; background: var(--hair-color); border-radius: 8px; }
  :global(.player-avatar[data-beard="vandyke"] .beard-el::after) { content: ""; position: absolute; bottom: -6px; left: 34px; width: 24px; height: 24px; background: var(--hair-color); clip-path: polygon(0 0, 100% 0, 50% 100%); }
  :global(.player-avatar[data-beard="chinstrap"] .beard-el::before) { content: ""; position: absolute; bottom: 0; left: 0; width: 92px; height: 60px; border: 7px solid var(--hair-color); border-top: none; border-radius: 0 0 46px 46px; }
  :global(.player-avatar[data-beard="boxed"] .beard-el::before) { content: ""; position: absolute; bottom: -2px; left: 0; width: 92px; height: 48px; background: var(--hair-color); border-radius: 10px 10px 46px 46px; clip-path: polygon(0 0, 18% 0, 22% 45%, 78% 45%, 82% 0, 100% 0, 100% 100%, 0 100%); }
  :global(.player-avatar[data-beard="boxed"] .beard-el::after) { content: ""; position: absolute; top: 76px; left: 25px; width: 42px; height: 8px; background: var(--hair-color); border-radius: 6px; }
  :global(.player-avatar[data-beard="full"] .beard-el::before) { content: ""; position: absolute; bottom: -10px; left: -3px; width: 98px; height: 60px; background: var(--hair-color); border-radius: 16px 16px 50px 50px; clip-path: polygon(0 0, 18% 0, 25% 32%, 75% 32%, 82% 0, 100% 0, 100% 100%, 0 100%); }
  :global(.player-avatar[data-beard="full"] .beard-el::after) { content: ""; position: absolute; top: 75px; left: 22px; width: 48px; height: 10px; background: var(--hair-color); border-radius: 8px; }
  :global(.player-avatar[data-beard="mutton"] .beard-el::before) { content: ""; position: absolute; top: 44px; left: -2px; width: 96px; height: 54px; background: var(--hair-color); border-radius: 12px 12px 30px 30px; clip-path: polygon(0 0, 22% 0, 26% 100%, 0 100%, 0 0, 78% 0, 74% 100%, 100% 100%, 100% 0); }
  :global(.player-avatar[data-beard="mutton"] .beard-el::after) { content: ""; position: absolute; top: 75px; left: 22px; width: 48px; height: 9px; background: var(--hair-color); border-radius: 6px; }

  /* Hair variants */
  :global(.player-avatar[data-hair="bald"] .hair-front), :global(.player-avatar[data-hair="bald"] .hair-back) { display: none; }
  :global(.player-avatar[data-hair="buzz"] .hair-front::before) { content: ""; position: absolute; top: 38px; left: 33px; width: 94px; height: 42px; background: var(--hair-color); border-radius: 44px 44px 8px 8px; }
  :global(.player-avatar[data-hair="fade"] .hair-front::before) { content: ""; position: absolute; top: 32px; left: 38px; width: 84px; height: 30px; background: var(--hair-color); border-radius: 26px 26px 6px 6px; box-shadow: 0 8px 0 -2px color-mix(in srgb, var(--hair-color) 50%, transparent); }
  :global(.player-avatar[data-hair="sidepart"] .hair-front::before) { content: ""; position: absolute; top: 28px; left: 30px; width: 100px; height: 46px; background: var(--hair-color); border-radius: 46px 46px 12px 4px; }
  :global(.player-avatar[data-hair="sidepart"] .hair-front::after) { content: ""; position: absolute; top: 40px; left: 34px; width: 64px; height: 22px; background: var(--hair-hi); border-radius: 0 0 36px 6px; }
  :global(.player-avatar[data-hair="pompadour"] .hair-front::before) { content: ""; position: absolute; top: 16px; left: 30px; width: 102px; height: 52px; background: linear-gradient(160deg, var(--hair-hi), var(--hair-color) 65%); border-radius: 40px 56px 14px 10px; transform: rotate(-3deg); }
  :global(.player-avatar[data-hair="spiky"] .hair-front::before) { content: ""; position: absolute; top: 14px; left: 28px; width: 104px; height: 54px; background: var(--hair-color); clip-path: polygon(4% 100%, 0% 55%, 16% 72%, 22% 18%, 38% 60%, 50% 4%, 62% 58%, 78% 16%, 84% 70%, 100% 50%, 96% 100%); }
  :global(.player-avatar[data-hair="curly"] .hair-front::before) { content: ""; position: absolute; top: 24px; left: 28px; width: 104px; height: 48px; background: var(--hair-color); border-radius: 30px; box-shadow: -6px 8px 0 -4px var(--hair-color), 6px 8px 0 -4px var(--hair-color), 0 -6px 0 -2px var(--hair-hi); }
  :global(.player-avatar[data-hair="afro"] .hair-back::before) { content: ""; position: absolute; top: 4px; left: 10px; width: 140px; height: 112px; background: var(--hair-color); border-radius: 70px; }
  :global(.player-avatar[data-hair="afro"] .hair-front::before) { content: ""; position: absolute; top: 16px; left: 22px; width: 116px; height: 52px; background: var(--hair-color); border-radius: 50px 50px 18px 18px; }
  :global(.player-avatar[data-hair="mohawk"] .hair-front::before) { content: ""; position: absolute; top: 8px; left: 62px; width: 36px; height: 60px; background: linear-gradient(to top, var(--hair-color), var(--hair-hi)); border-radius: 18px 18px 6px 6px; }
  :global(.player-avatar[data-hair="manbun"] .hair-back::before) { content: ""; position: absolute; top: 6px; left: 58px; width: 44px; height: 36px; background: var(--hair-color); border-radius: 50%; }
  :global(.player-avatar[data-hair="manbun"] .hair-front::before) { content: ""; position: absolute; top: 34px; left: 32px; width: 96px; height: 38px; background: var(--hair-color); border-radius: 44px 44px 6px 6px; }
  :global(.player-avatar[data-hair="mullet"] .hair-back::before) { content: ""; position: absolute; top: 72px; left: 22px; width: 116px; height: 88px; background: var(--hair-color); border-radius: 12px 12px 28px 28px; clip-path: polygon(8% 0, 92% 0, 100% 100%, 0% 100%); }
  :global(.player-avatar[data-hair="mullet"] .hair-front::before) { content: ""; position: absolute; top: 24px; left: 30px; width: 100px; height: 46px; background: var(--hair-color); border-radius: 40px 40px 12px 12px; }
  :global(.player-avatar[data-hair="long"] .hair-back::before) { content: ""; position: absolute; top: 38px; left: 20px; width: 120px; height: 132px; background: var(--hair-color); border-radius: 54px 54px 18px 18px; }
  :global(.player-avatar[data-hair="long"] .hair-front::before) { content: ""; position: absolute; top: 28px; left: 28px; width: 104px; height: 42px; background: var(--hair-color); border-radius: 48px 48px 8px 8px; }
  :global(.player-avatar[data-hair="long"] .hair-front::after) { content: ""; position: absolute; top: 52px; left: 28px; width: 104px; height: 9px; background: #eee; border-radius: 4px; }
  :global(.player-avatar[data-hair="dreads"] .hair-back::before) { content: ""; position: absolute; top: 44px; left: 16px; width: 128px; height: 134px; background: repeating-linear-gradient(90deg, var(--hair-color) 0px, var(--hair-color) 12px, #111 12px, #111 15px); border-radius: 48px 48px 14px 14px; }
  :global(.player-avatar[data-hair="dreads"] .hair-front::before) { content: ""; position: absolute; top: 26px; left: 26px; width: 108px; height: 48px; background: repeating-linear-gradient(90deg, var(--hair-color) 0px, var(--hair-color) 11px, var(--hair-hi) 11px, var(--hair-hi) 14px); border-radius: 42px 42px 10px 10px; }
  :global(.player-avatar[data-hair="curtains"] .hair-front::before) { content: ""; position: absolute; top: 26px; left: 26px; width: 56px; height: 64px; background: var(--hair-color); border-radius: 42px 10px 36px 8px; }
  :global(.player-avatar[data-hair="curtains"] .hair-front::after) { content: ""; position: absolute; top: 26px; right: 26px; width: 56px; height: 64px; background: var(--hair-color); border-radius: 10px 42px 8px 36px; }

  /* ── Form Controls ── */
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--text2);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  input, select {
    background: var(--surface2);
    border: 1px solid var(--border2);
    color: var(--text);
    padding: 0.5rem 0.7rem;
    font-family: inherit;
    font-size: 0.9rem;
    border-radius: var(--radius);
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus { border-color: var(--green); outline: none; }
  select option { background: var(--surface2); color: var(--text); }
  input[type="range"] {
    flex: 1; padding: 0; border: none; background: none;
    accent-color: var(--green); cursor: pointer;
  }
  .range-row { display: flex; align-items: center; gap: 0.6rem; }
  .age-val { color: var(--green); font-weight: bold; font-size: 0.95rem; min-width: 3rem; }

  .divider { border-top: 1px solid var(--border); margin: 0.2rem 0; }

  .ctrl-group { display: flex; flex-direction: column; gap: 0.35rem; }
  .lbl {
    font-size: 0.72rem; color: var(--text2);
    text-transform: uppercase; letter-spacing: 0.05em;
  }

  .swatches { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .swatch {
    width: 26px; height: 26px;
    border: 2px solid var(--border2);
    cursor: pointer; background: var(--c);
    border-radius: 3px; padding: 0;
    transition: border-color 0.12s, outline 0.12s;
  }
  .swatch[aria-pressed="true"] { border-color: #fff; outline: 2px solid var(--green); }

  .opt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.3rem;
  }
  .btn-opt {
    background: var(--surface2); color: var(--text2);
    border: 1px solid var(--border); padding: 0.38rem 0.5rem;
    font-family: inherit; font-size: 0.76rem; cursor: pointer;
    text-align: left; border-radius: var(--radius);
    transition: color 0.1s, border-color 0.1s;
  }
  .btn-opt:hover { color: var(--text); border-color: var(--border2); }
  .btn-opt[aria-pressed="true"] { background: var(--green-bg); color: var(--green); border-color: var(--green); }

  .btn-start {
    margin-top: 0.5rem; padding: 0.7rem 1.5rem;
    background: var(--green); color: #000;
    border: none; cursor: pointer;
    font-family: inherit; font-size: 0.95rem; font-weight: bold;
    border-radius: var(--radius); transition: opacity 0.15s; width: 100%;
  }
  .btn-start:hover { opacity: 0.88; }
</style>
