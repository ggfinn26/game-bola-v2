# CHECKPOINT.md

Last updated: 2026-10-18 (session 5)

## Status: Complete production — all PRD & documentation features implemented & verified

---

## Done

### Design & Documentation

- [x] PRD.md — full requirements, all systems
- [x] GAME-ENGINE.md — match sim formulas, PA dynamics, world tick
- [x] CLAUDE.md — conventions, field names, design decisions
- [x] AGENTS.md — schema reference, event pattern, trait list
- [x] LEGAL-SYSTEM.md — 3 resolution paths, sentencing, reputation, media exposure
- [x] MULTI-MODE-WORLD.md — shared state, ego switching, cross-mode events, legacy score
- [x] SLOT-LIGA-BANKRUPTCY.md — slot market, bankruptcy sequence, loan shark, agent bankruptcy
- [x] ATTR-REDESIGN.md — v3 attribute system (20 outfield + 5 GK), zone formulas, wheel calibration fix
- [x] NAME-GENERATION.md — name pool comparison across 3 reference games

### Reference Games Analyzed

- [x] Football Agent — player schema, event structure (32 events), agent mechanics, `pla_names` SQLite name pool
- [x] Footballer Career — wheel engine, injury types, social media system, `isimHavuzu` name pool
- [x] My Legacy — life sim (611 events, 25 categories, per career phase), `NAMES_BY_COUNTRY` + LCG fallback pool

### Implementation — Core Engine

- [x] Tech stack: Svelte 5 + TypeScript + Vite + sql.js + Web Worker
- [x] DB schema v3 (`db.ts`) — semua tabel inti, attrs v3 (20+5)
- [x] Type definitions v3 (`types/index.ts`) — Player v3, EventEffects shorthand names
- [x] Match engine (`match.ts`) — Full Sim (Poisson xG), Tonton Match (wheel), zone rating per posisi, wheel calibration fix, goal attribution v3
- [x] PA/CA engine (`pa.ts`) — per-season recalc, age multipliers, prison/inactivity decay, proxy stats per posisi
- [x] World state (`world.ts`) — day/season tick, legacy score, career phase
- [x] Web Worker (`worker.ts`) — message bus, semua engine off main thread
- [x] World generation (`worldgen.ts`) — 18 klub BRI Liga 1 + 18 klub Pegadaian Liga 2, ~820 pemain prosedural seeded LCG, distribusi atribut per posisi
- [x] Fixture generation — double round-robin circle method, day-based scheduling untuk Liga 1 & Liga 2
- [x] Scheduler (`scheduler.ts`) — nextEventDay, processMatchDay, getUpcoming, getSquad, stamina recovery harian per physio_level, penalti form_factor saat stamina < 0.5
- [x] Piramida Liga 1 & Liga 2 (`scheduler.ts` + `LeagueTable.svelte`) — simulasi paralel 2 divisi, promosi & degradasi otomatis 3 klub tiap akhir musim (+bonus promosi Rp 3M & reputasi), tab pemilih klasemen Liga 1 / Liga 2

### Implementation — Gameplay Systems

- [x] Save/Load (`savegame.ts`) — IndexedDB persist + export JSON
- [x] Card accumulation & suspension otomatis
- [x] Injury system — 5 tier, named injuries, injury_prone + trait modifier
- [x] Trait mechanics (subset, dalam scheduler): `injury_magnet` (×1.6 injury prob), `natural_fitness` (×0.6 prob, stamina cost −0.08), `hot_headed` (card weight ×1.8), `clean_cut`/`composed` (card weight ×0.6)
- [x] Season rollover & PA/CA recalculation
- [x] Transfer system (`transfers.ts` + `TransferModal.svelte`)
- [x] Awards & career stats (`awards.ts` + `StatsBoard.svelte`) — top scorer, MVP, best young U-21, archive per season
- [x] Competition config system — `StageConfig`, `ForeignRuleSet`, `CardRules`, `AwardDefinition`
- [x] Multi-stage fixture generation (`stages.ts`) — Championship Series knockout, 4 Besar
- [x] Format proposal & voting mechanic — pengajuan proposal, vote 18 klub, threshold, auto-apply ke `competition_configs`
- [x] Life sim events (`events.ts`) — 30 events, 15 kategori, per career phase + trait gate, trait mutation via intensity
- [x] Legal system engine (`legal.ts`) — bribe per `bribability`, lawyer Skill 3/6/9/10, surrender; sentencing per case type, prison decay, repeat offender multiplier
- [x] Academy regen — lulusan muda 15–17 tahun dihasilkan per musim dari `academy_level` tiap klub

### Implementation — Game Modes

- [x] Mode Pemain (`CareerLoop.svelte`) — profil pemain v3 attrs, stat musim, kontrak, event system
- [x] Mode Manajer (`ManagerLoop.svelte`) — formasi & taktik, starting XI manual, bursa transfer berbayar, intervensi taktik + 3 sub saat Tonton Match, staf pelatih & medis Lv.1–5
- [x] Mode Agen (`agent.ts` + `AgentLoop.svelte`) — scouting + judge_ca/judge_pa uncertainty, rekrut/lepas klien, upgrade kantor, rumor media, deal negosiasi, kebangkrutan agensi
- [x] Mode Pemilik Klub (`owner.ts` + `OwnerLoop.svelte`) — kas & gaji, pinjaman bank & rentenir, suntik modal/dividen, upgrade fasilitas/akademi/stadion, sponsor, jual/beli klub, bursa slot liga, kebangkrutan 3x gagal bayar

---

## Belum Diimplementasi

### Gameplay Gaps (ada di doc, 0 kode)

- [x] **Trait mechanics lanjutan** — semua 25 trait kini aktif di `pa.ts`, `transfers.ts`, `events.ts`, `scheduler.ts`, dan `world_ai.ts`, termasuk pasangan eksklusif `wonderkid`/`late_bloomer` di `EXCLUSIVE_TRAITS`.
- [x] **Career milestone events** (`events.ts`) — gol ke-100, ke-200; match ke-100, ke-200, ke-300; serta event "bench warmer" (`milestone_bench_warmer`) saat minim menit bermain. PRD §4.4
- [x] **Commentary pool depth** (`match.ts`) — 10 variasi bahasa Indonesia per outcome (`goal`, `chance_saved`, `chance_missed`, `tackle`, `foul`, `quiet`, `yellow_card`, `red_card`), dijamin tidak mengulang kalimat yang sama berturut-turut. GAME-ENGINE.md §2.3
- [x] **Tarkam/amatir match & Fixture clash detection** (`world_ai.ts` + `CareerLoop.svelte`) — fitur _Main Tarkam_ untuk amplop tambahan Rp 3.5–8jt dengan deteksi bentrok jadwal (`checkFixtureClash`) bila dimainkan H-3 laga resmi klub. PRD §4.3 & GAME-ENGINE.md §4.3
- [x] **Child/ego transition (Dinasti)** (`world_ai.ts` + `CareerLoop.svelte`) — saat pemain berusia ≥28 tahun atau pensiun, bisa memilih _Pensiun & Lanjut sebagai Anak (Dinasti)_ menggunakan `childStartingBonus()` untuk melahirkan regen 16 tahun Generasi ke-(N+1). MULTI-MODE-WORLD.md §3
- [x] **Cross-mode world interactions & Background AI** (`world_ai.ts`) — efek lintas-mode (pemain ber-agen di klub bermoral rendah otomatis masuk daftar transfer, klub krisis finansial melego pemain bintang) serta transfer AI otomatis tiap 28 hari. MULTI-MODE-WORLD.md §5 & §6

### Doc-Code Mismatches (disinkronkan)

- [x] **AGENTS.md schema** — diupdate ke skema v3 (20 atribut outfield + 5 atribut GK)
- [x] **GAME-ENGINE.md §1, §2.1, §3.1** — rumus rating zona, atribusi gol, dan proxy stats PA diupdate ke atribut v3
- [x] **`wonderkid` trait** — ditambahkan ke `AGENTS.md` dan `EXCLUSIVE_TRAITS` (`wonderkid/late_bloomer`)

### Phase 2+ Features (ekspansi masa depan)

- [x] **Piala Indonesia** (`cup.ts` + `worldgen.ts` + `worker.ts` + `CareerLoop.svelte`) — 32 klub (Liga 1 ×18 + Liga 2 top 14), bracket seeded single-elimination, 5 babak (R32→R16→QF→SF→Final), auto-progression setelah tiap babak selesai, cup winner dapat trophy, bracket viewer di CareerLoop. League ID 10.
- [x] **Liga 3 Indonesia** (`indonesia.ts` + `worldgen.ts` + `scheduler.ts` + `LeagueTable.svelte`) — 18 klub (IDs 53-70, rep 19-35), league ID 5, promosi/degradasi 3 klub Liga 2↔Liga 3 tiap musim, fixtures double round-robin, tab Liga 3 di klasemen, juara dapat trophy.
- [x] **Reputation gates** (`types/index.ts` + `events.ts` + `transfers.ts`) — `requires_overall_min/max` di GameEvent condition; national_team (≥55/48), endorsement (≥52/38) kini gate by overall; transfer market filter bidireksional (club.rep kompatibel dengan player.overall ±range).
- [x] **Foreign transfers** (`transfers.ts`) — pemain overall ≥55 dapat tawaran dari Malaysia (L3) & Thailand (L4) dengan +20% wage premium; pool filter bidireksional by overall+rep.
- [x] **Timnas lightweight** (`timnas.ts`) — squad 23 WNI terbaik (overall ≥55), dirolling tiap 90 hari, play vs 8 lawan ASEAN, career_trophies++ setelah 3 menang berturut, stageBanner notif call-up.
- [x] **Naturalisasi** (`timnas.ts` + `worker.ts` + `CareerLoop.svelte`) — pemain asing di liga Indonesia (overall ≥40, kontrak ≥90 hari) bisa naturalisasi → nationality=1 → eligible Timnas.
- [x] **Nationality fix** (`worldgen.ts`) — Malaysia clubs nationality=2, Thailand=3 (sebelumnya semua nationality=1).
- [x] **Multiple save slots** (`savegame.ts` + `App.svelte`) — 3 slot independen, title screen menampilkan slot cards dengan info pemain/musim, tombol lanjut/hapus/new game per slot.
- [x] **Career dashboard** (`StatsBoard.svelte`) — tab Profil baru: OVR badge, 8 stat career (matches, goals, assists, trophies, CA, PA, avg rating), attribute bars 8 atribut utama, nationality display.
- [x] **AFC Champions League** (F) — `afc.ts` + `worldgen.ts` + `worker.ts` + `CareerLoop.svelte`. 8 klub (top 4 Liga 1 + top 2 MSL + top 2 Thai), 2 grup × 4 tim, fase grup single-RR mulai hari 60, lanjut QF→SF→Final auto-progress, grup standings live, hadiah Rp 200M + trophy, bracket viewer di CareerLoop. League ID 20.
- [x] **Liga U-21** (I) — `scheduler.ts` + `worldgen.ts` + `worker.ts` + `CareerLoop.svelte`. 18 klub Liga 1, pemain ≤21 otomatis masuk U-21 squad, double round-robin mulai hari 11 (offset 4 hari dari Liga 1), `getU21Squad` dengan age filter, standings computed dari match_results (tidak campur Liga 1), kolom hijau di CareerLoop, ego eligible indicator. League ID 30.
- [x] **Timnas kompetisi penuh** (H) (`timnas.ts` + `worker.ts` + `CareerLoop.svelte`) — siklus kompetisi internasional berjenjang 4 turnamen: 1) Kualifikasi Piala Asia (fase grup 4 laga vs tim ASEAN/Asia tengah), 2) Putaran Final Piala Asia / AFC Asian Cup (grup 3 laga lanjut knockout QF/SF/Final vs raksasa Asia, trofi + hadiah Rp 500M), 3) Kualifikasi Piala Dunia Zona Asia (putaran ketiga 5 laga vs Jepang, Arab Saudi, Australia, dll), 4) Putaran Final Piala Dunia FIFA (grup 3 laga lanjut 16 besar→QF→SF→Final, trofi Piala Dunia + bonus Rp 2.5 Milyar). Didukung atribusi gol ego player berdasarkan posisi/atribut. PRD §4.3
- [x] **Full 5-tier Tarkan pyramid** (`tarkan.ts` + `worldgen.ts` + `worker.ts` + `CareerLoop.svelte`) — 5 divisi (101-105), 24 klub per divisi (IDs 1001-1120), fixtures single round-robin per musim, enroll/unenroll bebas, play match (amplop + form + cedera), background AI sim untuk klub non-ego, klasemen live, prize money akhir musim Rp 4–50M. PRD §4.3
- [x] **Piramida Sepak Bola Inggris Lengkap (Full 5-Tier Pyramid: Premier League [11], EFL Championship [17], League One [18], League Two [19], National League [21])** (`indonesia.ts` + `worldgen.ts` + `scheduler.ts` + `transfers.ts` + `LeagueTable.svelte` + `tests/check_leagues.ts`) —
  - 40 klub Inggris berjenjang (IDs 103-110, 151-182): Man City, Arsenal, Liverpool, Man Utd, Chelsea, Spurs, Newcastle, Aston Villa (EPL); Leicester, Leeds, Southampton, Ipswich, Sunderland, Norwich, Watford, West Brom (Championship); Portsmouth, Derby, Bolton, Peterborough, Barnsley, Oxford, Reading, Blackpool (League One); Wrexham, Notts County, Bradford, Salford, Mansfield, MK Dons, Barrow, Crewe (League Two); Chesterfield, Barnet, Bromley, Altrincham, Oldham, Southend, Eastleigh, Solihull (National League).
  - Promosi & degradasi otomatis 2 klub per musim di setiap batas tier (11 ↔ 17 ↔ 18 ↔ 19 ↔ 21) di `rolloverSeason` dengan bonus kas berjenjang (Rp 4M s/d Rp 50M) dan penyesuaian reputasi.
  - Transfer market: foreign wage bonus dan eligibility thresholds berjenjang dari National League s/d Premier League.
- [x] **7 Liga Top Eropa hingga Divisi 2 & 3 + Turki** (`indonesia.ts` + `worldgen.ts` + `scheduler.ts` + `transfers.ts` + `LeagueTable.svelte`) —
  - Spanyol: La Liga (12), Segunda División (22), Primera Federación (23).
  - Italia: Serie A (13), Serie B (24), Serie C (25).
  - Jerman: Bundesliga (14), 2. Bundesliga (26), 3. Liga (27).
  - Prancis: Ligue 1 (28), Ligue 2 (29).
  - Belanda: Eredivisie (15), Eerste Divisie (32).
  - Portugal: Primeira Liga (33), Liga Portugal 2 (34).
  - Turki: Trendyol Süper Lig (35), Trendyol 1. Lig (36).
  - Name pool baru untuk Prancis (14), Portugal (15), dan Turki (16) di `NATION_NAMES`.
  - Promosi & degradasi otomatis 2 klub per musim di semua liga bertingkat Eropa.
- [x] **European Sunday League (Liga Amatir Eropa: Divisi 106 & 107)** (`tarkan.ts` + `worldgen.ts` + `CareerLoop.svelte`) —
  - Sunday League North (106) & South (107) dengan masing-masing 12 klub (total 24 klub, IDs 1201-1224).
  - Match fee / amplop amatir Rp 5M - 15M (€300 - €1.000) per pertandingan.
  - Bebas enroll/unenroll, fixtures 11 putaran per musim, hadiah akhir musim Rp 15M - 60M.
- [x] **Piramida Kompetisi Usia Muda Lengkap (U-15, U-18, U-21)** (`worldgen.ts` + `scheduler.ts` + `worker.ts` + `CareerLoop.svelte` + `App.svelte`) —
  - 6 liga usia muda: Elite Pro Academy U-15 (45) & U-18 (40) & U-21 (30) untuk Indonesia; Premier League U-15 (46) & U-18 (41) & U-21 (31) untuk Inggris.
  - Skuad reservis dinamis via `getU21Squad` dengan filter batas usia (≤15, ≤18, ≤21), simulasi match day paralel.
  - UI tab pemilih U-15 / U-18 / U-21 di `CareerLoop.svelte` dengan indikator eligibility ego player (pemain 15 tahun eligible di ketiga kelompok umur).
  - Regenerasi fixtures otomatis tiap musim di `rolloverSeason`.
- **Total Kompilasi Dunia:** 32 liga profesional (286 klub) + 7 liga amatir/tarkan/sunday (144 klub) = **430 klub**, 6 liga usia muda, ~7.500 pemain aktif. Diverifikasi via `tests/check_leagues.ts`, `npm run check`, `npm run build` (100% pass, 0 error, 0 warning).



