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

- [x] Football Agent — player schema, event structure (32 events), agent mechanics
- [x] Footballer Career — wheel engine, injury types, social media system
- [x] My Legacy — life sim (611 events, 25 categories, per career phase)

---

## Not Started

### Systems Still Needing Design Docs (PRD §10)

- [x] Legal System doc — `LEGAL-SYSTEM.md` (triggers, 3 paths, sentencing, reputation, media exposure)
- [x] Multi-mode World doc — `MULTI-MODE-WORLD.md` (shared state, ego switching, cross-mode events, legacy score)
- [x] Slot Liga & Bankruptcy doc — `SLOT-LIGA-BANKRUPTCY.md` (slot market, bankruptcy sequence, loan shark, agent bankruptcy)
- [ ] Dynamic PA Formula doc — detailed delta formula (outlined in GAME-ENGINE.md §3, needs validation)

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
- [ ] Event system implementation
- [ ] League table + standings UI
- [ ] Tonton Match (step-by-step wheel display)
- [ ] Card accumulation logic (query card_accumulation, apply suspension)
- [ ] Multi-stage fixture generation (baca StageConfig, handle group_count > 1)
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
