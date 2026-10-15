<script lang="ts">
  import { onMount } from 'svelte'
  import type { WorldState } from './types/index.js'

  let status = $state<'loading' | 'ready' | 'error'>('loading')
  let world = $state<WorldState | null>(null)
  let worker: Worker

  onMount(() => {
    worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'READY') {
        status = 'ready'
      } else if (msg.type === 'WORLD_STATE') {
        world = msg.state
      } else if (msg.type === 'ERROR') {
        status = 'error'
        console.error('Worker error:', msg.message)
      }
    }

    worker.onerror = (err) => {
      status = 'error'
      console.error('Worker crash:', err)
    }

    worker.postMessage({ type: 'INIT' })

    return () => worker.terminate()
  })

  function startNewGame() {
    worker.postMessage({ type: 'NEW_GAME', mode: 'player', characterId: 1, startAge: 15 })
  }
</script>

<main>
  {#if status === 'loading'}
    <p>Loading engine…</p>
  {:else if status === 'error'}
    <p>Engine failed to load. Check console.</p>
  {:else if !world}
    <h1>Football Life Simulator</h1>
    <button onclick={startNewGame}>New Game</button>
  {:else}
    <h1>Football Life Simulator</h1>
    <p>Day {world.current_day} · Season {world.season} · Mode: {world.ego.mode}</p>
    <p>Age: {world.ego.age} · {world.ego.alive ? 'Alive' : 'Dead'}</p>
  {/if}
</main>

<style>
  main {
    font-family: monospace;
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
  }
</style>
