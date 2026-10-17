# CHECKPOINT.md

Last updated: 2026-10-17 (session 3)

## Status: Pre-production — Design phase complete

---

## Done

### Design & Documentation

- [x] PRD.md — full requirements, all systems documented
- [x] GAME-ENGINE.md — match sim formulas, PA dynamics, world tick
- [x] CLAUDE.md — project conventions, field names, design decisions
- [x] AGENTS.md — schema reference, event pattern, trait list

### Design Decisions Finalized

- [x] Four game modes: Player, Manager, Agent, Club Owner
- [x] Match sim: Poisson xG + weighted probability wheel engine
- [x] Full Sim = same wheel engine, background, instant result
- [x] Tonton Match = wheel displayed step-by-step, text commentary
- [x] PA: dynamic per-season, form + position proxy stats, PA >= CA
- [x] Traits: 25 traits, JSON array, max 5 per player, partially mutable
- [x] Database scope: Indonesia full pyramid + Asia/World competitions
- [x] Tarkan: 5 fantasy competitions x 24 teams, open transfer window always
- [x] Legal system: active mechanic — bribe / lawyer / surrender
- [x] World state: continuous, no pause on mode/legacy transition
- [x] Life sim events: 25 categories, per career phase (youth→late)
- [x] Social media system: role-based reactions (fan/critic/media/humor)
- [x] Injury system: 50+ named types, 5 severity tiers
- [x] Field names: English only

### Reference Games Analyzed

- [x] Football Agent — player schema, event structure (32 events), agent mechanics, `pla_names` SQLite name pool
- [x] Footballer Career — wheel engine, injury types, social media system, `isimHavuzu` name pool
- [x] My Legacy — life sim (611 events, 25 categories, per career phase), `NAMES_BY_COUNTRY` + LCG fallback pool
- [x] Name Generation doc — `NAME-GENERATION.md` (comparison, schemas, bytecode decompilation, takeaways)

---

## Not Started

### Systems Still Needing Design Docs (PRD §10)

- [x] Legal System doc — `LEGAL-SYSTEM.md` (triggers, 3 paths, sentencing, reputation, media exposure)
- [x] Multi-mode World doc — `MULTI-MODE-WORLD.md` (shared state, ego switching, cross-mode events, legacy score)
- [x] Slot Liga & Bankruptcy doc — `SLOT-LIGA-BANKRUPTCY.md` (slot market, bankruptcy sequence, loan shark, agent bankruptcy)
- [x] Dynamic PA Formula doc — validated & fixed: skala 0–100, pa_ceiling per pemain, prison/inactivity decay order fixed, delta magnitudes scaled ×5

### Implementation

- [x] Tech stack: Svelte 5 + TypeScript + Vite + sql.js + Web Worker
- [x] Project scaffold — `game/` directory, Vite WASM config, build passes clean
- [x] Type definitions — `src/types/index.ts` (Player, Club, League, Match, Event, WorldState)
- [x] DB schema — `src/engine/db.ts` (all core tables via sql.js SQLite)
- [x] Match engine — `src/engine/match.ts` (Full Sim, Poisson xG, goal attribution)
- [x] PA/CA engine — `src/engine/pa.ts` (per-season recalc, age multipliers, trait modifiers)
- [x] World state — `src/engine/world.ts` (day/season tick, legacy score, career phase)
- [x] Web Worker — `src/engine/worker.ts` (message bus, engine runs off main thread)
- [x] App shell — `src/App.svelte` (worker init, new game, world state display)
- [x] World generation — `src/engine/worldgen.ts` (18 klub Liga 1 + ~430 pemain prosedural, seeded LCG)
- [x] Static data Indonesia — `src/data/indonesia.ts` (klub, nama, posisi distribusi)
- [x] Phase 1 MVP shell — title screen → new game → career loop (advance day/week/month)
- [x] Fixture generation — double round-robin circle method, day-based scheduling (`worldgen.ts`)
- [x] Scheduler — `nextEventDay`, `processMatchDay`, `getUpcoming`, `getSquad` (`scheduler.ts`)
- [x] Worker — `ADVANCE_TO_NEXT_EVENT` + `GET_UPCOMING` messages
- [x] Career loop UI — event-driven advance ("Lanjut ke Pekan N"), shows result + next match
- [x] Competition config system — `StageConfig[]`, `ForeignRuleSet`, `CardRules`, `AwardDefinition` di `types/index.ts`
- [x] DB schema — `competition_configs`, `card_accumulation`, `format_proposals`, `format_votes`; update `match_results` (stage_id, group_num), `leagues` (active_config_id), `player_stats` (competition_id)
- [x] Default Liga 1 config di-insert ke DB saat worldgen (`insertLiga1Config`)
- [x] League table + standings UI (`LeagueTable.svelte`, `getStandings`)
- [x] Player Ego & Profil Pemain — `createEgoPlayer` ke DB, `getPlayer`, update stat pemain (`matches`, `goals`, `assists`, `rating`, `form`, `legacy_score`) tiap matchday, dan panel profil/kontrak di `CareerLoop.svelte`
- [x] Tonton Match (step-by-step wheel display — `wheelSim` di `match.ts` + `MatchWheel.svelte`)
- [x] Card accumulation & Injury system (`card_accumulation` + skorsing otomatis, 5 tier cedera `rollMatchInjury` + `healInjuries` di `scheduler.ts`)
- [x] Event system implementation (`events.ts` + `EventModal.svelte` — condition gating per career phase/trait, social reactions, trait mutation & intensity)
- [x] Season Rollover & Dynamic PA/CA (`rolloverSeason` di `scheduler.ts` — trofi juara, arsip `player_stats`, rekalkulasi PA/CA & atribut via `recalcPACA`, umur +1, reset klasemen & generate jadwal musim baru)
- [x] Bursa Transfer & Kontrak Pemain (`transfers.ts` + `TransferModal.svelte` — tawaran perpanjangan & pindah klub berbasis OVR/form/reputasi, otomatis terbuka di akhir musim atau via tombol manual)
- [x] Riwayat Karir & Statistik Liga (`awards.ts` + `StatsBoard.svelte` — Top Skor, Top Assist, Rating Terbaik, arsip `player_stats` per musim, serta penghargaan akhir musim Sepatu Emas, MVP, & Pemain Muda Terbaik U-21)
- [x] Multi-stage fixture generation (`stages.ts` — baca `StageConfig`, dukung `group_count > 1`, plus mode Championship Series Knockout Semifinal & Final 4 Besar)
- [x] Mode Manajer (`ManagerLoop.svelte` + `ManagerTransferModal.svelte` — rekrut Free Agent, lepas pemain, pantau skuad & tonton match)
- [x] Mode Agen (`agent.ts` + `AgentLoop.svelte` — scouting dengan ketidakpastian `judge_ca`/`judge_pa`, manajemen klien & upgrade kantor, negosiasi komisi 15%, komplotan rumor media, dan kebangkrutan agensi)
- [x] Mode Pemilik Klub (`owner.ts` + `OwnerLoop.svelte` — manajemen kas & gaji klub, pinjaman bank berbunga sesuai skor kredit, suntik modal/dividen, negosiasi sponsor, upgrade fasilitas/akademi/stadion, sistem kebangkrutan 3x gagal bayar, serta jual/beli klub & Bursa Slot Liga)
- [ ] Format proposal + voting mechanic

---

## Open Questions (1 remaining)

1. **Full Sim attribute weights** — principle in GAME-ENGINE.md §1, specific weights need playtesting

---

## Suggested Next Steps (in order)

1. **Legal System doc** — smallest design surface, unblocks event writing for Player mode
2. **Tech stack decision** — needed before any code
3. **Phase 1 scope lock** — decide exact MVP feature set before building
4. **World gen spec** — how to generate Indonesia league + player pool
