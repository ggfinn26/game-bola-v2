# ATTR-REDESIGN.md — Attribute System v3 + Bug Log

**Status:** Implemented (2026-10-17).
**Scope:** DB schema, worldgen, match engine, PA engine, UI display.

---

## Motivasi

Sistem saat ini pakai 7 atribut (`attacking`, `defending`, `technical`, `mental`, `physical`, `speed`, `goalkeeping`). Terlalu kasar:

- ST cepat vs ST jago finishing → tidak bisa dibedakan
- Heading, crossing, tackling, vision, anticipation, off the ball → tidak ada
- GK hanya 1 angka → tidak bisa bedakan shot-stopper vs sweeper-keeper

Target: **v3 — 20 outfield + 5 GK-specific**, mendekati FM tanpa overhead 35 atribut penuh.

|                             | v1 (sekarang) | v2 (dibuang) | v3 (target) | FM  |
| --------------------------- | ------------- | ------------ | ----------- | --- |
| Total attr outfield         | 7             | 15           | 20          | 28  |
| GK-specific                 | 0             | 4            | 5           | 12  |
| Tackling terpisah           | ❌            | ❌           | ✅          | ✅  |
| Off the ball / anticipation | ❌            | ❌           | ✅          | ✅  |
| Work rate / pressing        | ❌            | ❌           | ✅          | ✅  |
| Long shots                  | ❌            | ❌           | ✅          | ✅  |
| Technique / first touch     | ❌            | ❌           | ✅          | ✅  |
| Jumping (aerial)            | ❌            | ❌           | ✅          | ✅  |

---

## Atribut v3

Semua skala **1–100** kecuali `stamina` (float 0.0–1.0, existing) dan `form` (float 0.0–1.0, existing).

### Technical (8)

| Field        | Deskripsi                               | Menggantikan                       |
| ------------ | --------------------------------------- | ---------------------------------- |
| `finishing`  | Akurasi tembakan, konversi peluang      | sebagian `attacking`               |
| `passing`    | Umpan pendek & panjang                  | sebagian `technical`               |
| `dribbling`  | Melewati lawan, ball retention          | sebagian `technical` + `attacking` |
| `heading`    | Duel udara — menyerang & bertahan       | _(baru)_                           |
| `crossing`   | Umpan silang dari sisi lapangan         | _(baru)_                           |
| `tackling`   | Merebut bola, tekel                     | sebagian `defending`               |
| `technique`  | First touch, kontrol bola bawah tekanan | sebagian `technical`               |
| `long_shots` | Tembakan jarak jauh                     | _(baru)_                           |

### Mental (7)

| Field          | Deskripsi                             | Menggantikan                    |
| -------------- | ------------------------------------- | ------------------------------- |
| `decisions`    | Pilihan terbaik di bawah tekanan      | sebagian `mental`               |
| `composure`    | Ketenangan di situasi penting         | sebagian `mental`               |
| `positioning`  | Posisi di lapangan, membaca permainan | sebagian `defending` + `mental` |
| `vision`       | Melihat peluang, through ball         | _(baru)_                        |
| `anticipation` | Membaca permainan sebelum terjadi     | _(baru)_                        |
| `off_the_ball` | Pergerakan tanpa bola, mencari ruang  | _(baru)_                        |
| `work_rate`    | Intensitas pressing, tracking back    | _(baru)_                        |

### Physical (5)

| Field      | Deskripsi                             | Menggantikan |
| ---------- | ------------------------------------- | ------------ |
| `pace`     | Kecepatan lari + akselerasi           | `speed`      |
| `strength` | Duel fisik, kontestasi bola           | `physical`   |
| `agility`  | Kegesitan, perubahan arah, balance    | _(baru)_     |
| `jumping`  | Lompatan — aerial duel & GK reach     | _(baru)_     |
| `stamina`  | Ketahanan fisik (float 0–1, existing) | `stamina`    |

### GK-Specific (5) — hanya relevan untuk GK

| Field            | Deskripsi                               | Menggantikan           |
| ---------------- | --------------------------------------- | ---------------------- |
| `reflexes`       | Reaksi penyelamatan                     | sebagian `goalkeeping` |
| `handling`       | Menangkap / membuang bola               | sebagian `goalkeeping` |
| `gk_positioning` | Penempatan sudut, memotong umpan silang | _(baru)_               |
| `one_on_ones`    | Situasi 1v1 kiper vs striker            | _(baru)_               |
| `command`        | Keluar gawang, command of area          | _(baru)_               |

GK tetap dapat atribut outfield yang relevan: `decisions`, `composure`, `anticipation`, `agility`, `jumping`, `strength`, `pace` (limited).

### Dihapus dari schema

`attacking`, `defending`, `technical`, `mental`, `physical`, `speed`, `goalkeeping`

### Tetap ada

`form` (float 0–1), `ca`, `pa`, `pa_ceiling`, `overall`.

---

## Mapping FM → v3

| FM Attribute            | v3 Field         |
| ----------------------- | ---------------- |
| Finishing               | `finishing`      |
| Dribbling               | `dribbling`      |
| Technique               | `technique`      |
| Heading                 | `heading`        |
| Crossing                | `crossing`       |
| Passing                 | `passing`        |
| Long Shots              | `long_shots`     |
| Tackling                | `tackling`       |
| Pace / Acceleration     | `pace`           |
| Strength                | `strength`       |
| Agility / Balance       | `agility`        |
| Jumping Reach           | `jumping`        |
| Stamina                 | `stamina`        |
| Off The Ball            | `off_the_ball`   |
| Positioning (att + def) | `positioning`    |
| Decisions               | `decisions`      |
| Composure               | `composure`      |
| Vision                  | `vision`         |
| Anticipation            | `anticipation`   |
| Work Rate               | `work_rate`      |
| Reflexes                | `reflexes`       |
| Handling                | `handling`       |
| One on Ones             | `one_on_ones`    |
| GK Positioning          | `gk_positioning` |
| Command of Area         | `command`        |

FM attrs tidak dipetakan (terlalu granular): Corners, Free Kick Taking, Penalty Taking, Long Throws,
Marking, Aggression, Bravery, Concentration, Determination, Flair, Leadership, Teamwork,
Natural Fitness, Communication, Eccentricity, Kicking, Rushing Out, Aerial Reach.

---

## Zone Rating Formulas (v3)

Per-posisi, bukan per-zone tunggal. Implementasi: switch pada `p.position` sebelum merata-rata squad.

### Attack

```text
ST / CF:
  finishing×0.35 + heading×0.15 + strength×0.10
  + composure×0.15 + off_the_ball×0.15 + technique×0.10

LW / RW:
  dribbling×0.30 + pace×0.25 + crossing×0.20
  + technique×0.15 + agility×0.10

AM:
  passing×0.25 + vision×0.25 + finishing×0.20
  + anticipation×0.15 + decisions×0.15
```

Semua bobot per posisi sum = 1.0.

### Mid

```text
CM:
  passing×0.25 + vision×0.20 + decisions×0.20
  + work_rate×0.15 + technique×0.10 + positioning×0.10

DM:
  positioning×0.25 + decisions×0.20 + tackling×0.20
  + work_rate×0.15 + strength×0.10 + anticipation×0.10
```

### Defense

```text
CB:
  positioning×0.25 + heading×0.20 + tackling×0.20
  + strength×0.15 + anticipation×0.10 + decisions×0.10

LB / RB:
  positioning×0.20 + pace×0.20 + tackling×0.15
  + crossing×0.15 + work_rate×0.15 + strength×0.15
```

### GK

```text
reflexes×0.35 + handling×0.25 + gk_positioning×0.20
+ one_on_ones×0.15 + command×0.05
```

Defense zone final = `(gkRating + mean(outfieldDefRatings)) / 2` — sama seperti sekarang.

---

## Goal Attribution (v3)

**Sekarang:** `attacking × POSITION_WEIGHT × form`

**v3:**

```text
weight = finishing × POSITION_WEIGHT × form × composure_mod

composure_mod = 0.80 + composure / 500   →  range 0.80–1.00
```

Composure tinggi memberi edge di situasi penting. Long shots masuk via POSITION_WEIGHT yang lebih rendah untuk CM/AM tapi `finishing` tetap dipakai.

POSITION_WEIGHT tidak berubah:

```text
ST: 1.0 | LW/RW: 0.8 | AM: 0.6 | CM: 0.3 | DM/CB/LB/RB: 0.1 | GK: 0.0
```

---

## Wheel Calibration Fix (Bug #1)

Formula GOAL weight yang mathematically correct:

```text
goalConversionTarget = teamXG / expectedTeamAttacks

nonGoalTotal = SAVE_raw + DEFENSE_raw + OUT_raw + ...

goalRaw = goalConversionTarget × nonGoalTotal / (1 − goalConversionTarget)
```

Menggantikan `(teamXG / expectedTeamAttacks) × 100` yang salah karena tidak
memperhitungkan kompetisi dengan total bobot non-GOAL.

Kurangi raw non-GOAL yang terlalu dominan:

| Slice    | Sekarang              | v3                    |
| -------- | --------------------- | --------------------- |
| SAVE     | `13 × (attRating/10)` | `6 × (attRating/10)`  |
| DEFENSE  | `22 × (defRating/10)` | `10 × (defRating/10)` |
| OUT      | 13                    | 8                     |
| CORNER   | 10                    | 6                     |
| COUNTER  | 9                     | 5                     |
| FOUL     | 8                     | 5                     |
| FREEKICK | 7                     | 4                     |
| WOODWORK | 3                     | 2                     |
| PENALTY  | 2                     | 1                     |

Setelah non-GOAL dikurangi, `goalRaw` dihitung via formula di atas → wheel output converges ke xG.

---

## PA/CA Engine (v3)

```text
// Outfield (20 attrs)
ca_outfield = mean(
  finishing, passing, dribbling, heading, crossing,
  tackling, technique, long_shots,
  decisions, composure, positioning, vision,
  anticipation, off_the_ball, work_rate,
  pace, strength, agility, jumping
) × position_scale

// GK (5 GK-specific + 7 shared outfield)
ca_gk = mean(
  reflexes, handling, gk_positioning, one_on_ones, command,
  decisions, composure, anticipation, positioning,
  agility, jumping, strength
) × gk_scale
```

`position_scale` per posisi untuk tidak mendiskriminasi posisi yang atribut tertentu-nya naturally lebih rendah (misal GK tidak diharapkan punya finishing tinggi).

Detail recalc (umur, form, prison decay) tidak berubah dari `pa.ts`.

---

## DB Schema Changes

**Hapus dari `players`:**
`attacking`, `defending`, `technical`, `mental`, `physical`, `speed`, `goalkeeping`

**Tambah ke `players`:**

```sql
-- Technical
finishing     INTEGER DEFAULT 1,
passing       INTEGER DEFAULT 1,
dribbling     INTEGER DEFAULT 1,
heading       INTEGER DEFAULT 1,
crossing      INTEGER DEFAULT 1,
tackling      INTEGER DEFAULT 1,
technique     INTEGER DEFAULT 1,
long_shots    INTEGER DEFAULT 1,
-- Mental
decisions     INTEGER DEFAULT 1,
composure     INTEGER DEFAULT 1,
positioning   INTEGER DEFAULT 1,
vision        INTEGER DEFAULT 1,
anticipation  INTEGER DEFAULT 1,
off_the_ball  INTEGER DEFAULT 1,
work_rate     INTEGER DEFAULT 1,
-- Physical
pace          INTEGER DEFAULT 1,
strength      INTEGER DEFAULT 1,
agility       INTEGER DEFAULT 1,
jumping       INTEGER DEFAULT 1,
-- GK-specific
reflexes      INTEGER DEFAULT 0,
handling      INTEGER DEFAULT 0,
gk_positioning INTEGER DEFAULT 0,
one_on_ones   INTEGER DEFAULT 0,
command       INTEGER DEFAULT 0,
```

`stamina` (float), `form` (float), `ca`, `pa`, `pa_ceiling`, `overall` — tidak berubah.

---

## Worldgen Changes

`genPlayer()` generate 20 outfield attrs per pemain berdasarkan posisi dan reputasi klub.
GK generate 5 GK attrs tambahan, outfield technical (finishing dll) di-set sangat rendah.

### Distribusi per posisi

| Posisi  | Primer (×1.4 base)      | Sekunder (×1.1 base)                 | Sisanya |
| ------- | ----------------------- | ------------------------------------ | ------- |
| ST      | finishing, off_the_ball | heading, composure, strength         | base    |
| LW / RW | pace, dribbling         | crossing, agility, technique         | base    |
| AM      | vision, passing         | finishing, decisions, technique      | base    |
| CM      | passing, decisions      | vision, work_rate, technique         | base    |
| DM      | positioning, tackling   | decisions, work_rate, strength       | base    |
| CB      | heading, positioning    | tackling, strength, anticipation     | base    |
| LB / RB | pace, positioning       | crossing, tackling, work_rate        | base    |
| GK      | reflexes, handling      | gk_positioning, one_on_ones, command | base    |

`base` = `(clubRep / 100) × 40 + rand(±10)`, primer = base × 1.4, sekunder = base × 1.1.

---

## Bug Log (dari review sesi 2026-10-17)

### Bug #1 — Wheel goals sistematis lebih rendah dari xG model ⚠️ SERIUS

**Lokasi:** `match.ts` → `wheelSim()`, bobot event slice

**Masalah:**

```text
SAVE    raw = 13 × (attRating/10)  →  avg ~65
DEFENSE raw = 22 × (defRating/10)  →  avg ~110
GOAL    raw ≈ 5–12
Total ≈ 239  →  GOAL share ≈ 5%  →  expected goals ≈ 0.55 (target: 1.2)
```

**Fix:** Formula `goalConversionTarget` di atas + kurangi bobot non-GOAL (tabel di § Wheel Calibration).

---

### Bug #2 — Goal attribution tidak pakai `speed` / `mental` / `physical`

**Lokasi:** `match.ts` → `attributeGoal()`

**Masalah:** Striker pace 90 vs pace 50 → probabilitas gol identik. Composure tidak berperan.

**Fix v1 (minimal, sebelum redesign):**

```ts
const weights = players.map(
  (p) => (p.attacking * 0.8 + p.speed * 0.2) * (GOAL_POSITION_WEIGHT[p.position] ?? 0.1) * p.form,
);
```

**Fix v3 (setelah redesign):** `finishing × composure_mod × POSITION_WEIGHT × form`.

---

### Bug #3 — `speed` undervalued di attack zone (10%)

**Lokasi:** `match.ts` → `zoneRating()` cabang attack

**Masalah:**

```ts
return mean(zp, "attacking") * 0.6 + mean(zp, "technical") * 0.3 + mean(zp, "speed") * 0.1;
// Beda pace 40 poin → hanya 4 poin beda di zone rating
```

**Fix v1:** Naikkan speed ke 0.2, turunkan technical ke 0.2.

**Fix v3:** Formula per posisi — LW/RW dapat `pace×0.25`.

---

### Bug #4 — `physical` tidak masuk attack sama sekali

**Lokasi:** `match.ts` → `zoneRating()` cabang attack

**Masalah:** Heading dari corner, hold-up play ST besar vs kecil → tidak ada perbedaan di attack.

**Fix v1:**

```ts
return (
  mean(zp, "attacking") * 0.55 + mean(zp, "technical") * 0.2 + mean(zp, "speed") * 0.15 + mean(zp, "physical") * 0.1
);
```

**Fix v3:** `heading×0.15` + `strength×0.10` eksplisit di formula ST.

---

## Implementation Order (saat siap)

1. `types/index.ts` — update interface `Player` (hapus 7 lama, tambah 20+5)
2. `db.ts` — schema baru
3. `worldgen.ts` — `genPlayer()` per posisi
4. `match.ts` — zone rating v3 per posisi, wheel calibration fix, goal attribution v3
5. `pa.ts` — CA formula v3
6. `scheduler.ts` — semua query & display yang pakai atribut lama
7. UI — panel atribut pemain diupdate

Bug #1–#4 bisa di-patch ke v1 dulu tanpa menunggu full redesign (tidak ubah schema).
