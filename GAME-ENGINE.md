# Game Engine Doc

**Versi:** 0.1
**Scope:** Match simulation (Full Sim + Wheel/Tonton), Dynamic PA, World tick
**Status:** Draft — angka bobot placeholder, perlu playtesting

---

## 1. Match Simulation: Full Sim

### 1.1 Hitung Rating per Zona

Pisah 11 pemain ke tiga zona (`attack`: ST, LW, RW, AM; `mid`: CM, DM; `defense`: CB, LB, RB, GK). Skor kontribusi tiap pemain dihitung per posisi menggunakan atribut v3 (skala 1–100):

**Attack (`playerAttackContrib`):**

```
ST:
  finishing × 0.35 + heading × 0.15 + strength × 0.10
  + composure × 0.15 + off_the_ball × 0.15 + technique × 0.10

LW / RW:
  dribbling × 0.30 + pace × 0.25 + crossing × 0.20
  + technique × 0.15 + agility × 0.10

AM:
  passing × 0.25 + vision × 0.25 + finishing × 0.20
  + anticipation × 0.15 + decisions × 0.15
```

**Midfield (`playerMidfieldContrib`):**

```
CM:
  passing × 0.25 + vision × 0.20 + decisions × 0.20
  + work_rate × 0.15 + technique × 0.10 + positioning × 0.10

DM:
  positioning × 0.25 + decisions × 0.20 + tackling × 0.20
  + work_rate × 0.15 + strength × 0.10 + anticipation × 0.10
```

**Defense (`playerDefenseContrib`):**

```
CB:
  positioning × 0.25 + heading × 0.20 + tackling × 0.20
  + strength × 0.15 + anticipation × 0.10 + decisions × 0.10

LB / RB:
  positioning × 0.20 + pace × 0.20 + tackling × 0.15
  + crossing × 0.15 + work_rate × 0.15 + strength × 0.15

GK:
  reflexes × 0.35 + handling × 0.25 + gk_positioning × 0.20
  + one_on_ones × 0.15 + command × 0.05
```

**Agregasi Zona:**

```
attack_rating   = mean(playerZoneScore(p) for p in attack_zone)
midfield_rating = mean(playerZoneScore(p) for p in mid_zone)
defense_rating  = (gk_rating + mean(playerZoneScore(p) for p in outfield_defense)) / 2
```

### 1.2 Hitung xG per Tim

`xG` = expected goals — berapa gol yang "wajar" dihasilkan tim ini melawan tim itu.

```
mid_advantage_A = midfield_A / (midfield_A + midfield_B)  # 0–1

xG_A = base_xG
     × (attack_A / defense_B)^0.6
     × mid_advantage_A^0.3
     × home_factor_A
     × form_factor_A
     × morale_factor_A
     × stamina_factor_A
```

**Konstanta:**

```
base_xG       = 1.2      # rata-rata gol per tim per match di level pro
home_factor   = 1.15     # keunggulan kandang
away_factor   = 1.0 / home_factor
```

**Form factor** (dari field `form` pemain, float 0–1, rata-rata 11 pemain):

```
form_factor = 0.85 + (mean_form × 0.30)
# range: 0.85 (form = 0) → 1.15 (form = 1.0)
```

**Morale factor** (dari `club_morale`, 0–100):

```
morale_factor = 0.90 + (club_morale / 100 * 0.20)
# range: 0.90 → 1.10
```

**Stamina factor** (dari `stamina` rata-rata 11 pemain, float 0–1):

```
stamina_factor = 0.80 + (mean_stamina × 0.25)
# range: 0.80 → 1.05
```

### 1.3 Skor dari Poisson

Skor tiap tim disampling **independen** dari distribusi Poisson:

```
goals_A ~ Poisson(xG_A)
goals_B ~ Poisson(xG_B)
```

> **Kenapa Poisson?** Gol sepakbola adalah rare discrete event dalam window waktu tetap (90 menit) — ini persis definisi Poisson. Dipakai di semua model prediksi skor profesional (FiveThirtyEight, Football-Data.co.uk).

### 1.4 Statistik Sekunder

Digenerate dari xG sebagai proxy:

```
shots_on_target_A  = round(xG_A × 3.5 + noise(±1))
total_shots_A      = round(shots_on_target_A × 2.8 + noise(±2))
corners_A          = round(xG_A × 4.0 + noise(±2))
possession_A       = 40 + (midfield_A / (midfield_A + midfield_B) × 20)
                   # range: 40–60%
yellow_cards_A     = Poisson(0.35 × aggression_factor_A)
red_cards_A        = Bernoulli(0.04)   # ~4% chance per match
```

`noise(±n)` = uniform random integer dalam range `-n` sampai `+n`.

---

## 2. Match Simulation: Wheel / Tonton Match

Wheel engine = **sama persis** dengan Full Sim dari sisi probabilitas. Bedanya: hasilnya ditampilkan step-by-step dengan commentary, bukan langsung skor akhir.

### 2.1 Sequence per Attack

Tiap "serangan" diproses lewat chain berikut:

```
1. MINUTE WHEEL
   → Kapan event terjadi: distribusi tidak uniform, lebih banyak event di menit 30-45 dan 75-90

2. TEAM WHEEL
   → Siapa yang menyerang
   → slice_A = team_strength_A / (team_strength_A + team_strength_B)
   → team_strength = attack_rating × 0.5 + midfield_rating × 0.3 + defense_rating × 0.2

3. EVENT WHEEL
   → Hasil serangan. Slice sizes berdasarkan attack_rating tim penyerang vs defense_rating tim bertahan:
```

| Event                   | Base chance | Modifier                 |
| ----------------------- | ----------- | ------------------------ |
| GOAL                    | 8%          | × (attack/defense ratio) |
| SHOT ON TARGET / KEEPER | 12%         | × attack_rating          |
| CORNER                  | 10%         | flat                     |
| FREEKICK                | 8%          | flat                     |
| PENALTY                 | 2%          | flat                     |
| FOUL / CARD             | 8%          | × aggression             |
| DEFENSE / CLEARED       | 20%         | × defense_rating         |
| COUNTER ATTACK          | 10%         | × speed_rating lawan     |
| OUT / OFFSIDE           | 12%         | flat                     |
| POST / WOODWORK         | 3%          | flat                     |
| REBOUND                 | 7%          | dari shot sebelumnya     |

```
4. JIKA GOAL → GOAL ATTRIBUTION WHEEL
   → Siapa yang cetak gol / assist
   → slice per pemain = p.finishing × position_weight × p.form × (0.80 + p.composure / 500)
   → posisi_weight: ST=1.0, LW/RW=0.8, AM=0.6, CM=0.3, lainnya=0.1, GK=0.0

5. JIKA CARD → CARD WHEEL
   → NONE: 60%, YELLOW: 32%, 2ND YELLOW→RED: 5%, RED: 3%
   → VAR review: 15% chance untuk RED + PENALTY events
```

### 2.2 Jumlah Attack per Match

```
total_attacks = Poisson(28)   # rata-rata 28 "sequence" per 90 menit
```

> Catatan: tidak semua attack menghasilkan shot. Kebanyakan berakhir DEFENSE/CLEARED/OUT.

### 2.3 Commentary Pool

Per event type, ada pool 8–12 variasi narasi. Dipilih random, tidak repeat berturut-turut.

Format string: `"{tim} {aksi} di menit {m}. {detail}."`

Variables tersedia: `{t}` (tim), `{m}` (menit), `{s}` (skor), `{p}` (nama pemain), `{a}` (nama asist).

---

## 3. Dynamic PA Formula

**Skala:** CA, PA, PA_ceiling, dan semua attribute individual = **0–100**.

### 3.1 PA Tick

PA dihitung ulang **sekali per season** (bukan per match) untuk menghindari noise.

```
performance_score = weighted_avg(
    stat_proxy_nilai,     # lihat tabel di bawah
    weight = 0.50
) + form_akhir_season × 0.30
  + games_played_ratio × 0.20
  # games_played_ratio = matches_played / total_matches (0–1)
```

**Statistik proxy per posisi** (menggunakan field v3 yang tersedia di Player type):

| Posisi | Proxy stats                        | Weight          |
| ------ | ---------------------------------- | --------------- |
| GK     | clean_sheets (0–15), rating (0–10) | 50% / 50%       |
| CB     | positioning, tackling, heading     | 40% / 30% / 30% |
| LB, RB | positioning, pace, assists         | 35% / 35% / 30% |
| DM     | positioning, tackling, decisions   | 40% / 35% / 25% |
| CM     | passing, vision, assists           | 40% / 30% / 30% |
| AM     | vision, passing, assists           | 35% / 35% / 30% |
| LW, RW | dribbling, pace, goals             | 40% / 35% / 25% |
| ST     | finishing, goals, off_the_ball     | 55% / 30% / 15% |

Attribute dinormalisasi ke 0–1 dengan range `[5, 100]`. Goals/assists range `[0, 30]`.

`performance_score` range: 0.0 – 1.0.

### 3.2 Delta PA

```
expected_perf = CA / PA_current   # 0–1, makin tinggi makin "sesuai ekspektasi"

delta_PA =
  IF performance_score > expected_perf + 0.10:
    +rand(5, 15)   # overperform → PA naik
  ELIF performance_score < expected_perf - 0.15:
    -rand(5, 10)   # underperform parah → PA turun
  ELSE:
    0              # sesuai ekspektasi → PA stabil
```

### 3.3 Batas & Modifikasi

```
# Age modifier hanya berlaku untuk performance delta (bukan decay)
delta_PA *= age_multiplier

PA_new = clamp(PA_current + delta_PA, CA, PA_ceiling)

# Decay inaktif — diterapkan setelah clamp, independent dari age mult
IF games_played < 5 dalam season:
  PA_new = max(CA, PA_new - rand(10, 25))

# Decay penjara — diterapkan paling akhir
IF in_prison:
  PA_new = max(CA, PA_new - rand(15, 40))
```

**PA_ceiling per pemain:**

Ditetapkan saat generate pemain berdasarkan usia. Naik via event `late_bloomer`.

| Usia saat generate | Ceiling multiplier dari CA |
| ------------------ | -------------------------- |
| ≤ 18               | CA × 1.80                  |
| 19–21              | CA × 1.60                  |
| 22–25              | CA × 1.40                  |
| 26–29              | CA × 1.25                  |
| 30+                | CA × 1.12                  |

**Efek usia pada delta PA:**

| Rentang usia | Modifier delta PA                           |
| ------------ | ------------------------------------------- |
| 15–20        | ×1.5 (lebih cepat naik, lebih cepat turun)  |
| 21–27        | ×1.0 (normal)                               |
| 28–31        | ×0.5 (lebih susah naik)                     |
| 32+          | ×0.3 (hampir tidak naik, lebih mudah turun) |

> **Late bloomer exception:** Event `late_bloomer` apply ×1.2 multiplier ke delta PA meski usia 28+, dan tidak bisa PA drop (delta dikunci ≥ 0). Ini simulate Kanté, Vardy, dll.

### 3.4 CA Update

CA naik/turun berdasarkan training + match time, **bukan** performance score:

```
# Naik jika sering main + training bagus
IF games_played_ratio > 0.6 AND training_quality > 60:
  CA += rand(0, 10)   # +quick_learner bonus: +1–2 extra

# Turun otomatis di atas usia 30
IF age > 30:
  CA -= rand(0, 5)   # per season

# Hard cap
CA = clamp(CA, 1, PA_current)
```

---

## 4. World Tick

### 4.1 Tick Unit

Satu **tick = satu hari** in-game. Beberapa proses jalan per tick, beberapa per minggu/musim.

| Proses                        | Frekuensi                            |
| ----------------------------- | ------------------------------------ |
| Match schedule check          | Per tick                             |
| Injury duration countdown     | Per tick                             |
| Contract expiry countdown     | Per tick                             |
| Stamina recovery              | Per tick (non-matchday)              |
| Transfer window check         | Per tick                             |
| Tarkan transfer (open always) | Per tick                             |
| News/media feed update        | Per minggu                           |
| Form update                   | Per 5 match                          |
| PA/CA recalculation           | Per season                           |
| Random event roll             | Per minggu (dengan chance per event) |
| Loan shark / bank payment     | Per bulan (26 tick)                  |

### 4.2 Stamina Recovery

```
# Per hari non-matchday:
stamina += recovery_rate

# recovery_rate ditentukan physio staff level:
recovery_rate = 0.05 + (physio_level / 10 × 0.05)
# range: 0.05/hari (no physio) → 0.10/hari (physio level 10)

# Matchday cost:
stamina -= 0.20 + (minutes_played / 90 × 0.10)
# 90 menit = -0.30, 45 menit = -0.25

# Stamina floor sebelum match mempengaruhi form factor:
IF stamina < 0.5: form_factor × 0.90
IF stamina < 0.3: form_factor × 0.75
```

### 4.3 Fixture Clash Detection

Untuk pemain yang main di dua liga (tarkan + pro, atau tarkan + akademi):

```
clash = any(tarkan_match_date == pro_match_date
            OR abs(tarkan_match_date - pro_match_date) <= 1)

IF clash:
  → player harus pilih salah satu
  → atau auto-skip tarkan (tergantung setting)
```

---

## 5. Open Items (butuh playtesting)

| Parameter                      | Nilai sekarang | Catatan                                              |
| ------------------------------ | -------------- | ---------------------------------------------------- |
| `base_xG`                      | 1.2            | Sesuaikan per level liga (tarkan < pro)              |
| `home_factor`                  | 1.15           | Tarkan mungkin lebih besar (home crowd effect lokal) |
| `total_attacks` Poisson lambda | 28             | Bisa beda per taktik (defensive = lebih sedikit)     |
| PA ceiling generasi awal       | TBD            | Perlu decide distribusi PA saat world gen            |
| `base_xG` tarkan               | ~0.9           | Lebih rendah dari pro, lebih banyak gol imbang tipis |
| Recovery rate tanpa physio     | 0.05/hari      | = butuh 20 hari recovery stamina penuh               |

---

_Engine doc ini hidup — update tiap ada keputusan formula baru._
