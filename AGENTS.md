# AGENTS.md — Game Bola Project

## Project Context

Text-based football life simulator. Web browser, solo player.
Four game modes sharing one world: Player, Manager, Agent, Club Owner.

## Docs to Read Before Starting Any Task

1. `CLAUDE.md` — conventions, field names, design decisions already made
2. `CHECKPOINT.md` — current progress, what's done, what's next
3. `PRD.md` — full requirements (read relevant section only, not entire file)
4. `GAME-ENGINE.md` — formulas (read only if task touches match sim or PA)

## Design Decisions — Do Not Override

These are finalized. Do not suggest alternatives unless explicitly asked.

- Match sim engine: Poisson xG + weighted probability wheel
- PA system: dynamic, per-season recalculation, PA ≥ CA always
- Traits: JSON array `["trait_name"]`, max 5, partially mutable
- Transfer window: pro = scheduled; tarkan = always open
- No player control during match — wheel only, Manager intervenes via tactics/subs
- Field names: English only (see CLAUDE.md for full mapping)

## Schema Reference

### Players table (core fields)

```
id, name, nationality, club, position, secondary_position
age, height, weight, foot
ca, pa, overall
attacking, defending, technical, mental, physical, speed, goalkeeping
stamina, form, injury_prone
traits (JSON array, max 5)
injured, injury_duration, injury_type
retired, free_agent, on_transfer_list, transfer_ban
matches, goals, assists, rating
yellow_cards, red_cards
club_loyalty, agent_id
```

### Positions

```
GK=1, CB=2, LB=3, RB=4, DM=5, CM=6, AM=7, LW=8, RW=9, ST=10
```

### Career phases (for event gating)

```
youth (15-18), pro_step (18-23), rise (23-27), prime (27-32), late (32+)
```

## Event System Pattern

Based on My Legacy reference. Each event has:

```json
{
  "id": "event_id",
  "category": "family | partner | psychology | ...",
  "condition": { "phase": ["youth"], "requires": ["trait"], "excludes": ["trait"] },
  "tone": "positive | critical | neutral | humor",
  "roles": ["fan", "critic", "media", "neutral"],
  "priority": 1-5,
  "max_occurrences": null,
  "choices": [
    { "id": "choice_a", "text": "...", "effects": { "trait_intensity": {"hot_headed": -1} } },
    { "id": "choice_b", "text": "...", "effects": { "money": -5000 } }
  ]
}
```

## Trait Names (valid values for `traits` array)

```
professional, lazy, hot_headed, composed, temperamental,
ambitious, content, extrovert, introvert,
media_friendly, controversial, greedy, generous,
loyal, mercenary, determination, fragile_mentally,
leader, disruptive, quick_learner, late_bloomer,
natural_fitness, injury_magnet, risk_taker, clean_cut
```

Mutually exclusive pairs: professional/lazy, hot_headed/composed, ambitious/content,
extrovert/introvert, media_friendly/controversial, greedy/generous, loyal/mercenary,
determination/fragile_mentally, leader/disruptive, natural_fitness/injury_magnet,
risk_taker/clean_cut

## Injury Types (severity tiers)

- Minor (1-3 days): muscle_fatigue, blister, mild_sprain
- Mild (1-3 weeks): calf_strain, hamstring_strain, ankle_sprain
- Moderate (1-2 months): partial_tear, mcl_strain
- Serious (2-6 months): meniscus_tear, fracture, dislocation
- Career-threatening (6-12 months): acl_rupture (very rare)
