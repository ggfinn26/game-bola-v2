# CLAUDE.md — Game Bola Project

## Project

Text-based football life simulator. Web browser. Solo personal project.
Working directory: `/Users/rismaniswaty/Downloads/GAME-BOLA/`

## Key Docs

- `PRD.md` — full product requirements, all game systems
- `GAME-ENGINE.md` — match sim formulas, PA dynamics, world tick
- `CHECKPOINT.md` — current progress & next steps
- `penjelasan-permainan.md` — original game description (reference only)

## Language

- All field names, code, doc headers: **English**
- Conversation & explanations: **Bahasa Indonesia**
- Player-facing UI text: **Bahasa Indonesia** (TBD)

## Field Name Convention (DB schema)

Turkish-derived names from reference game are retired. Use:
`attacking`, `defending`, `technical`, `mental`, `physical`, `speed`, `goalkeeping`
`stamina`, `form`, `traits`, `injured`, `retired`, `free_agent`
`matches`, `goals`, `assists`, `rating`, `club_morale`

## Core Design Decisions (do not re-litigate)

- Match sim: Poisson xG + wheel probability engine — same engine for Full Sim (background) and Tonton Match (displayed)
- PA: dynamic, per-season, form + position proxy stats. PA ≥ CA always
- Traits: JSON array, max 5 per player, partially dynamic via events/training
- Tarkan: open transfer window always, no contract needed, fixture clash check required
- World state: continuous tick, does not pause on mode/legacy transition
- Bribery: active player choice (bribe / lawyer / surrender)
- No player control during Tonton Match — wheel runs, only Manager can intervene

## Reference Games Analyzed

| Game              | APK location                 | Key mechanic extracted                                        |
| ----------------- | ---------------------------- | ------------------------------------------------------------- |
| Football Agent    | `football_agent_decoded/`    | Player schema, event structure, agent office                  |
| Footballer Career | `footballer_career_decoded/` | Wheel engine, injury types, social media system               |
| My Legacy         | `my_legacy_decoded/`         | Life sim events (611 events, 25 categories, per career phase) |
