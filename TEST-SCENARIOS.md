# TEST-SCENARIOS.md — Game Bola

Skenario pengujian berdasarkan PRD, GAME-ENGINE.md, dan LEGAL-SYSTEM.md.

**Coverage status:**

- ✅ Sudah ada test: liga/promosi degradasi (`check_leagues`), transisi pensiun (`check_retirement`)
- 🔲 Belum ada test: semua skenario di dokumen ini

---

## TS-01 — Match Engine

### TS-01-A: Full Sim menghasilkan skor yang masuk akal

**Ref:** PRD §4.11, GAME-ENGINE.md §2.1

```
Setup:
  Tim A: 11 pemain overall rata-rata 75 (favorit)
  Tim B: 11 pemain overall rata-rata 45 (underdog)
  Home: Tim A

Steps:
  1. Jalankan simulateFullMatch(A, B, isHome=true)

Expect:
  - Skor tidak negatif, tidak melebihi 15 per tim
  - Win rate Tim A dalam 1000 simulasi: 65%–85%
  - xG total per match: 0.5–5.0 (Poisson tidak meledak)
  - stats.shots, stats.corners tidak null
```

### TS-01-B: Tonton Match — commentary tidak berulang berturut-turut

**Ref:** GAME-ENGINE.md §2.3

```
Setup:
  Match berjalan sampai 90 menit via wheel ticks

Steps:
  Kumpulkan semua commentary text yang dihasilkan

Expect:
  - Tidak ada kalimat yang sama 2x berturut-turut
  - Semua 8 event type (goal, chance_saved, chance_missed, tackle,
    foul, quiet, yellow_card, red_card) muncul setidaknya 1x
    dalam 50 match
  - Goal attribution selalu ada scorer_id valid
```

### TS-01-C: Trait `hot_headed` menaikkan probabilitas kartu

**Ref:** PRD §4.2 Traits, AGENTS.md

```
Setup:
  Pemain A: traits = ["hot_headed"]
  Pemain B: identik tapi traits = []
  Jalankan masing-masing 200 match

Expect:
  Rata-rata yellow_cards A > rata-rata yellow_cards B × 1.4
```

### TS-01-D: Stamina rendah menurunkan zone score

**Ref:** GAME-ENGINE.md §2.1

```
Setup:
  Pemain sama, main 2 kondisi berbeda:
    Kondisi 1: stamina = 1.0
    Kondisi 2: stamina = 0.3

Expect:
  Rating Kondisi 2 < Rating Kondisi 1 × 0.85
```

---

## TS-02 — PA/CA Engine

### TS-02-A: PA tidak pernah di bawah CA

**Ref:** PRD §4.2

```
Setup:
  1000 pemain acak dari dunia gen (seed 42)

Steps:
  Jalankan tickPA() untuk semua pemain
  Cek semua baris di DB

Expect:
  Tidak ada pemain dengan pa < ca
```

### TS-02-B: Performa konsisten menaikkan PA

**Ref:** PRD §4.2, GAME-ENGINE.md §3.1

```
Setup:
  Pemain ST: ca=60, pa=65, form=0.9, goals=20, career_matches=35

Steps:
  Jalankan recalcPA(playerId) 3x musim berturut

Expect:
  PA setelah musim ke-3 > PA awal
```

### TS-02-C: Penjara menurunkan CA

**Ref:** PRD §4.6, LEGAL-SYSTEM.md §4

```
Setup:
  Pemain ca=72, pa=78
  Set imprisoned = 1, prison_days_remaining = 180

Steps:
  Tick 180 hari (simulasi penjara penuh)

Expect:
  ca_after < 72 (decay aktif)
  pa setelah bebas: pa >= ca_after (invariant tetap terjaga)
```

### TS-02-D: `late_bloomer` tidak kena age penalty setelah 28

**Ref:** PRD §4.2 Traits

```
Setup:
  Pemain A: age=30, traits=["late_bloomer"], ca=65
  Pemain B: age=30, traits=[], ca=65 (identik)

Steps:
  Jalankan recalcPA() untuk keduanya

Expect:
  PA growth delta A >= PA growth delta B
  PA A tidak turun karena usia (age_penalty = 0 untuk late_bloomer)
```

### TS-02-E: `wonderkid` dan `late_bloomer` tidak bisa bersamaan

**Ref:** PRD §4.2

```
Setup:
  Buat pemain dengan traits = ["wonderkid", "late_bloomer"]

Expect:
  generateWorld() atau applyTraits() throw / auto-remove salah satu
  DB final tidak pernah punya pemain dengan kedua trait bersamaan
```

---

## TS-03 — Legal System

### TS-03-A: Suap berhasil pada pejabat korup (bribability tinggi)

**Ref:** LEGAL-SYSTEM.md §3 Path A

```
Setup:
  Case: drink_driving (severity=2)
  Officer bribability = 0.70 (Tier: Polisi Kabupaten)
  money_offered = case_value (100%)
  media_exposure = false

Formula:
  success_chance = 0.70 + 0.30 - 0.20 - 0 = 0.80

Steps:
  resolveBribe(caseId, money_offered=case_value)

Expect:
  Dalam 1000 simulasi, success rate: 75%–85% (sekitar 0.80)
  Saat sukses: case_status = "dismissed", imprisoned = 0
  Uang berkurang sebesar money_offered
```

### TS-03-B: Suap gagal pada pejabat tidak korup

**Ref:** LEGAL-SYSTEM.md §3 Path A

```
Setup:
  Case: match_fixing (severity=5)
  Officer bribability = 0.0 (Tier: KPK)
  media_exposure = true

Formula:
  success_chance = 0 + capped_bonus - 0.50 - 0.20 = max 0.10

Expect:
  Dalam 100 simulasi, success rate < 15%
  Uang tetap berkurang saat gagal (biaya percobaan suap)
```

### TS-03-C: Pengacara skill 10 vs pasrah — perbedaan outcome

**Ref:** LEGAL-SYSTEM.md §3 Path B vs Path C

```
Setup:
  Case: tax_evasion (severity=3)
  Pemain A: hire lawyer skill=10
  Pemain B: surrender (pasrah)

Expect:
  A.win_rate jauh lebih tinggi dari B (0% menang saat pasrah)
  Saat B kalah: langsung ke sentencing
  Durasi penjara A (jika kalah) bisa lebih pendek dari B karena mitigation
```

### TS-03-D: Repeat offender mendapat hukuman lebih berat

**Ref:** LEGAL-SYSTEM.md §4

```
Setup:
  Pemain dengan prior_offense_count = 2
  Case baru: drink_driving

Steps:
  Jalankan sentencing()

Expect:
  prison_days >= base_max_days × 1.3 (repeat offender multiplier)
```

### TS-03-E: Reputasi hancur setelah kasus high-exposure

**Ref:** LEGAL-SYSTEM.md §4

```
Setup:
  Case: match_fixing (media_exposure=100)
  Kalah di pengadilan

Expect:
  reputation turun ≥ 20 poin
  sponsor deals dihapus dari DB
```

---

## TS-04 — Transfer System

### TS-04-A: Pemain overall rendah tidak dapat tawaran Eropa

**Ref:** transfers.ts leagueIds logic, PRD §4.3

```
Setup:
  Pemain overall=40

Steps:
  generateTransferOffers(playerId)

Expect:
  Semua offers hanya dari league_id IN [1,2,5,21] (Liga 1–3 + Piala Indonesia)
  Tidak ada tawaran dari Premier League (11) atau La Liga (12)
```

### TS-04-B: Pemain overall ≥80 mendapat tawaran Premier League

**Ref:** transfers.ts

```
Setup:
  Pemain overall=82

Steps:
  generateTransferOffers(playerId)

Expect:
  Ada minimal 1 offer dari league_id=11 (Premier League)
  Wage offer dari EPL ≥ current wage × 2.8 (foreign wage bonus)
```

### TS-04-C: Trait `mercenary` mendongkrak wage demand

**Ref:** PRD §4.2 Traits

```
Setup:
  Pemain A: traits=["mercenary"], overall=65, wage=20M
  Pemain B: identik, traits=[]

Steps:
  generateTransferOffers() keduanya

Expect:
  Semua wage offer A ≥ wage offer B × 1.15 (mercenary ×1.2 modifier)
```

### TS-04-D: Trait `loyal` mengurangi transfer request

**Ref:** PRD §4.2 Traits

```
Setup:
  Pemain dengan traits=["loyal"], bench=true (menit bermain <5%)

Steps:
  Simulasi 10 musim

Expect:
  Frekuensi transfer request ≤ 50% dari pemain identik tanpa "loyal"
```

---

## TS-05 — Events System

### TS-05-A: Event phase gate — `legacy_retirement_farewell_tour` hanya di `late`

**Ref:** PRD §4.5, events.ts

```
Setup:
  Pemain age=22 (phase=youth/pro_step)

Steps:
  getEligibleEvents(playerId)

Expect:
  "legacy_retirement_farewell_tour" tidak ada di result
  Ulangi dengan age=35 (phase=late): event ada di result
```

### TS-05-B: Career milestone — gol ke-100 trigger event

**Ref:** PRD §4.4

```
Setup:
  Pemain career_goals=99

Steps:
  Tambah 1 gol → career_goals=100
  Jalankan checkMilestoneEvents(playerId)

Expect:
  Event dengan id "milestone_100_goals" (atau equivalent) di-queue
  Event tidak trigger lagi di gol ke-101
```

### TS-05-C: Trait gate — `training_extra_finishing` tidak muncul untuk `lazy`

**Ref:** events.ts condition `excludes_trait`

```
Setup:
  Pemain traits=["lazy"]

Steps:
  getEligibleEvents(playerId)

Expect:
  "training_extra_finishing" tidak ada di result
  Pemain tanpa "lazy": event muncul
```

### TS-05-D: Pilihan event akumulasi trait intensity

**Ref:** PRD §4.2 Trait Dynamics

```
Setup:
  Pemain traits=[], trait_intensities={}

Steps:
  Apply choice "focus_match" dari event "education_exam_conflict" 3x

Expect:
  Setelah 3x: trait_intensity["ambitious"] >= 6
  Jika intensity mencapai 10: "ambitious" muncul di traits array
```

### TS-05-E: Bench warmer event saat menit bermain minim

**Ref:** PRD §4.4

```
Setup:
  Pemain minutes_played musim ini = 45 (dari maksimal ~3420)

Steps:
  checkMilestoneEvents(playerId) akhir musim

Expect:
  Event "milestone_bench_warmer" di-trigger
```

---

## TS-06 — Injury System

### TS-06-A: Tier cedera sesuai expected range absen

**Ref:** PRD §4.7

```
Setup:
  Buat cedera "muscle_fatigue" (Minor tier)
  Buat cedera "acl_rupture" (Career-threatening tier)

Expect:
  muscle_fatigue: injured_days IN [1, 3]
  acl_rupture: injured_days IN [180, 365]
```

### TS-06-B: `injury_magnet` meningkatkan frekuensi cedera

**Ref:** PRD §4.2 Traits, scheduler.ts

```
Setup:
  Pemain A: traits=["injury_magnet"]
  Pemain B: identik, traits=[]
  Simulasi 100 musim (via scheduler tick)

Expect:
  Total cedera A ≥ total cedera B × 1.5
```

### TS-06-C: `natural_fitness` mengurangi stamina cost

**Ref:** PRD §4.2 Traits, scheduler.ts

```
Setup:
  Pemain A: traits=["natural_fitness"]
  Pemain B: identik, traits=[]
  Keduanya main match yang sama

Expect:
  Stamina A setelah match > Stamina B setelah match
  Daily recovery A > daily recovery B
```

---

## TS-07 — Kompetisi: Cup, AFC, Timnas

### TS-07-A: Piala Indonesia — bracket 32 tim maju sampai final

**Ref:** CHECKPOINT.md (cup.ts)

```
Setup:
  generateWorld(42)
  Simulasi seluruh Piala Indonesia (5 babak)

Steps:
  Tick sampai semua babak selesai
  Cek match_results WHERE league_id=10

Expect:
  R32: 16 match, R16: 8 match, QF: 4 match, SF: 2 match, Final: 1
  Total: 31 match
  Ada 1 pemenang dengan trophy=1 di career_trophies
```

### TS-07-B: AFC Champions League — grup selesai, lanjut knockout

**Ref:** CHECKPOINT.md (afc.ts)

```
Steps:
  Jalankan AFC fase grup (mulai hari 60)
  Verifikasi 8 klub terbagi 2 grup × 4 tim
  Single round-robin per grup: 6 match per grup
  Top 2 per grup lanjut QF

Expect:
  Total fase grup: 12 match (league_id=20)
  QF: 2 match, SF: 2 match, Final: 1 match
  Pemenang dapat trophy + kas += 200_000_000
```

### TS-07-C: Naturalisasi — pemain asing jadi eligible Timnas

**Ref:** CHECKPOINT.md (timnas.ts)

```
Setup:
  Pemain asing nationality=2 (Malaysia), overall=65
  kontrak >= 90 hari di klub Liga 1

Steps:
  naturalizePlayer(playerId)

Expect:
  nationality berubah dari 2 menjadi 1
  Pemain masuk pool Timnas Indonesia
  Tidak bisa di-naturalisasi lagi (idempotent)
```

### TS-07-D: Timnas squad — 23 pemain WNI terbaik

**Ref:** timnas.ts

```
Steps:
  generateTimnasSquad()

Expect:
  Semua pemain nationality=1
  Semua overall >= 55 (threshold PRD)
  Jumlah tepat 23 pemain
  Squad di-refresh setiap 90 hari
```

---

## TS-08 — Tarkan System

### TS-08-A: Fixture clash terdeteksi H-3 laga resmi

**Ref:** PRD §4.3, CLAUDE.md (Tarkan: fixture clash check)

```
Setup:
  Pemain signed di Liga 1
  Liga 1 match day = hari 10
  Tawaran Tarkan = hari 8 (H-2 dari Liga 1)

Steps:
  checkFixtureClash(playerId, tarkanMatchDay=8)

Expect:
  Clash terdeteksi (H-2 < H-3 threshold)
  Tidak bisa main Tarkan (return false / error)
```

### TS-08-B: Tarkan tidak clash — pemain terima amplop

**Ref:** PRD §4.3

```
Setup:
  Pemain tanpa laga resmi dalam 7 hari ke depan

Steps:
  playTarkanMatch(playerId, divisionId=101)

Expect:
  cash bertambah antara 3_500_000 – 8_000_000
  form terpengaruh (naik/turun tergantung hasil)
  Potensi cedera via injury roll normal
```

### TS-08-C: Enroll/unenroll Tarkan bebas kapan saja

**Ref:** PRD §4.3 Aturan Tarkan

```
Steps:
  enrollTarkan(playerId, divisionId=102)
  Pastikan terdaftar di fixtures division 102
  unenrollTarkan(playerId, divisionId=102)

Expect:
  Setelah unenroll: tidak ada assignment fixture baru
  Match yang sudah selesai tidak di-rollback
```

---

## TS-09 — Owner & Financial System

### TS-09-A: Kebangkrutan setelah 3x gagal bayar cicilan

**Ref:** PRD §3.4, SLOT-LIGA-BANKRUPTCY.md

```
Setup:
  Klub dengan cash = 0
  Cicilan bank = 100_000_000 per bulan

Steps:
  Tick 3 bulan gagal bayar berturut

Expect:
  is_bankrupt = 1 setelah kegagalan ke-3
  Slot liga klub tersedia di pasar (slot_available = 1)
  Pemain klub jadi free_agent = 1
```

### TS-09-B: Slot liga bisa dibeli klub lain setelah kebangkrutan

**Ref:** SLOT-LIGA-BANKRUPTCY.md

```
Setup:
  Klub A bankrupt di Liga 2
  Klub B (non-pro, punya uang cukup)

Steps:
  buyLeagueSlot(buyerClubId=B, bankruptClubId=A)

Expect:
  Klub B masuk Liga 2 (league_id=2)
  Klub A dihapus dari liga
  Kas Klub B berkurang sesuai harga slot
```

### TS-09-C: Suntik modal dari pemilik memperbaiki kas klub

```
Setup:
  Klub cash = -50_000_000 (defisit)

Steps:
  ownerInjectCapital(clubId, amount=200_000_000)

Expect:
  cash_after = 150_000_000
  owner_personal_cash berkurang 200_000_000
```

---

## TS-10 — Agent System

### TS-10-A: `judge_ca` uncertainty sesuai office level

**Ref:** PRD §3.3, agent.ts

```
Setup:
  Agen office_level=1 (akurasi rendah)
  Agen office_level=5 (akurasi tinggi)
  Target pemain real_ca=70

Expect:
  Level 1: reported_ca ± 10–15 dari real_ca
  Level 5: reported_ca ± 2–4 dari real_ca
```

### TS-10-B: Rumor media gagal → kasus legal `media_collusion`

**Ref:** LEGAL-SYSTEM.md §2.3

```
Setup:
  Agen dengan reputation=20 (rendah)
  Spread transfer rumor palsu

Steps:
  spreadFakeRumor(agentId, targetPlayerId)
  Simulate rumor_exposed = true

Expect:
  Legal case "media_collusion" terbuka
  Reputasi agen turun ≥ 15 poin
  Denda finansial dikenakan
```

### TS-10-C: Kebangkrutan agen setelah klien habis + kas minus

**Ref:** PRD §3.3

```
Setup:
  Agen cash = 0
  Semua klien lepas kontrak (0 klien)
  Monthly overhead = 5_000_000

Steps:
  Tick 3 bulan tanpa pemasukan

Expect:
  agent_bankrupt = 1
  Agen tidak bisa rekrut klien baru
```

---

## TS-11 — World AI & Cross-Mode

### TS-11-A: AI transfer otomatis tiap 28 hari

**Ref:** MULTI-MODE-WORLD.md §6, world_ai.ts

```
Steps:
  Tick 28 hari dari world_gen
  Cek transfer_log (atau match_results / player club changes)

Expect:
  Minimal 1 transfer AI terjadi dalam 28 hari pertama
  Pemain yang ditransfer punya club baru yang berbeda
```

### TS-11-B: Klub krisis finansial melego pemain bintang

**Ref:** MULTI-MODE-WORLD.md §5

```
Setup:
  Klub dengan cash < -wage_bill × 3
  Ada pemain overall≥70 di klub tersebut

Steps:
  runWorldAI(tick)

Expect:
  Pemain ≥70 overall masuk transfer list (is_transfer_listed=1)
  Harga jual < market value normal (distress sale)
```

### TS-11-C: Pemain ber-agen + klub morale rendah → masuk transfer list

**Ref:** MULTI-MODE-WORLD.md §5

```
Setup:
  Pemain dengan agent_id != null
  club_morale klub < 40

Steps:
  runCrossModeEffects()

Expect:
  is_transfer_listed = 1 untuk pemain tersebut
```

---

## TS-12 — Save System

### TS-12-A: 3 slot independen — data tidak overlap

**Ref:** CHECKPOINT.md (savegame.ts + App.svelte)

```
Steps:
  Save ke slot 1: pemain "Budi", musim 3
  Save ke slot 2: pemain "Dedi", musim 1
  Load slot 1

Expect:
  Loaded state: nama="Budi", musim=3
  Slot 2 tidak terpengaruh
```

### TS-12-B: Export JSON — import kembali state identik

**Ref:** savegame.ts

```
Steps:
  Save game state
  exportSave(slotId) → JSON string
  Reset DB
  importSave(jsonString)

Expect:
  Semua tabel identik dengan state sebelum export
  Termasuk: players, clubs, match_results, world_state
```

---

## TS-13 — Dinasti (Child/Ego Transition)

### TS-13-A: Anak lahir dengan bonus dari orang tua

**Ref:** MULTI-MODE-WORLD.md §3, CHECKPOINT.md

```
Setup:
  Pemain ego berusia 28+
  career_trophies=3, career_goals=80

Steps:
  Pilih opsi "Pensiun & Lanjut sebagai Anak"

Expect:
  Anak baru: age=16, generation=parent.generation+1
  Bonus atribut: setidaknya 1 atribut ≥ parent average × 0.6
  World state tidak di-pause (hari terus berjalan)
  Pemain lama marked retired=1
```

### TS-13-B: World terus berjalan selama transisi

**Ref:** PRD §4.5, MULTI-MODE-WORLD.md §3

```
Setup:
  Catat world_state.day sebelum transisi

Steps:
  Trigger ego transition ke anak
  Load anak sebagai ego baru

Expect:
  world_state.day setelah transisi = sebelum + 0 (atau minimal +1 untuk proses)
  Bukan 0 atau reset
  Match hasil AI di liga lain tetap ada di DB
```

---

## Prioritas Implementasi Test

| Prioritas | Grup      | Alasan                                                |
| --------- | --------- | ----------------------------------------------------- |
| P1        | TS-02-A   | PA invariant (pa >= ca) — bug fatal jika dilanggar    |
| P1        | TS-03-A/B | Legal core path — mekanik unik game ini               |
| P1        | TS-04-A/B | Transfer gate — gate salah = semua pemain ke EPL      |
| P2        | TS-01-A   | Match engine sanity — distribusi Poisson wajar        |
| P2        | TS-06-B/C | Trait injury modifier — langsung ke gameplay          |
| P2        | TS-07-A   | Cup bracket — fitur terbaru, belum ada test           |
| P3        | TS-11-A   | World AI — sulit ditest tapi kritikal untuk immersion |
| P3        | TS-12-A/B | Save slots — UX-critical                              |
| P4        | TS-13     | Dinasti — late-game, low bug risk saat ini            |
