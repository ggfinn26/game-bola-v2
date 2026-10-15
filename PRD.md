# PRD: Football Life Simulator (Codename: GAME-BOLA)

**Versi:** 0.1 (Draft)
**Platform:** Web Browser
**Status:** Pre-production
**Tipe Proyek:** Personal / Solo

---

## 1. Vision & Problem Statement

### Visi

Simulasi kehidupan sepak bola komprehensif di mana pemain bisa menjalani karir dari berbagai sudut pandang — sebagai pemain, manajer, agen, atau pemilik klub — dalam satu dunia simulasi yang konsisten, realistis, dan saling terhubung.

### Masalah yang Diselesaikan

Game football management yang ada (Football Manager, FIFA Career Mode) hanya menawarkan **satu perspektif** sekaligus. Tidak ada game yang memungkinkan transisi antar perspektif, life simulation mendalam, atau simulasi ekosistem sepak bola dari level grassroots sampai elite dalam satu platform.

---

## 2. Target User

**Primary:** Diri sendiri (solo player, personal project)
**Secondary (future):** Pemain FM/FIFA Career Mode yang mau experience lebih dalam

---

## 3. Game Modes (Empat Perspektif)

### 3.1 Mode Pemain

- Mulai usia minimal 15 tahun
- Match: dua opsi — **Full Sim** (kalkulasi otomatis) atau **Tonton Match** (lihat jalannya pertandingan, detail per mode di §4.11)
- Atribut fisik, teknis, mental — semua dinamis
- Bisa kena kasus hukum (pajak, pelecehan) — **hanya jika pemain memilih action yang berisiko**, bukan random
- Bisa pensiun dini (very rare event, tergantung `injury_prone`)
- Saat pensiun/meninggal: bisa transisi ke mode lain atau ke anak

### 3.2 Mode Manajer

- Taktik & formasi (referensi: Football Manager engine)
- Rekrut staff: physio, dokter, pelatih GK, asisten, set piece coach, dll
- Bisa mulai dari akademi → non-pro → pro → timnas
- Pemain bisa diculik mafia (contoh random event)
- Hubungan dengan media berpengaruh ke reputasi

### 3.3 Mode Agen

- Scouting pemain (skill `judge_potential` & `judge_current_ability` berpengaruh)
- Rekrut klien (max klien tergantung ukuran kantor)
- Bisa berkomplot dengan media (rumor transfer palsu)
  - Berhasil: keuntungan negosiasi
  - Ketahuan: reputasi hancur, penalti keuangan
- Bisa bangkrut

### 3.4 Mode Pemilik Tim

- Beli/jual klub
- Manajemen keuangan: pinjam bank, bayar gaji, sponsorship
- Gagal bayar cicilan bank → bangkrut → slot liga bisa dijual/diswap
- Sistem slot liga: klub non-pro bisa beli slot dari klub bangkrut di level bawahnya

---

## 4. Sistem Inti (Core Systems)

### 4.1 World Simulation Engine

Semua mode berjalan dalam satu dunia simulasi yang sama. Keputusan di mode agen mempengaruhi transfer market mode manajer. Ini adalah **sistem paling kritikal** untuk dibangun pertama.

**Komponen:**

- Tick-based time progression (per hari / per minggu)
- Global transfer market
- Global reputation system (pemain, klub, agen, pemilik)
- Financial system (gaji, kontrak, pinjaman, bangkrut)

### 4.2 Player Attribute System

**Player Attributes (all English):**

| Category          | Field (DB)                                              | Example values                                       |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Aggregate         | `overall`, `ca`, `pa`                                   | 1–20 scale                                           |
| Technical         | `technical`                                             | Passing, shooting, dribbling                         |
| Physical          | `physical`, `speed`, `stamina`                          | Strength, agility; speed separate; stamina float 0–1 |
| Attacking         | `attacking`                                             | Finishing, crossing, off-ball                        |
| Defending         | `defending`                                             | Tackling, marking, positioning                       |
| Mental            | `mental`, `traits` (JSON array)                         | Composure, aggression, determination                 |
| Match stats       | `form` (float), `matches`, `goals`, `assists`, `rating` | Per season + career                                  |
| Physical personal | `weight`, `height`, `foot`                              | Realism                                              |
| Status            | `injured`, `retired`, `free_agent`                      | Boolean flags                                        |
| Discipline        | `yellow_cards`, `red_cards`                             | Per season                                           |

Referensi: skema dari Football Agent (`names.db`, tabel `Players`, field names di-translate ke English).

**Dinamika CA/PA:**

- `CA` (Current Ability): Kemampuan sekarang, bisa naik/turun
- `PA` (Potential Ability): **Dinamis** — berubah berdasarkan **form** + **statistik per posisi**
- PA **tidak pernah di bawah CA**
- Memungkinkan pemain lower league jadi bintang (referensi: Kanté, Jamie Vardy)
- Pemain tua bisa makin gacor jika mental attribute tinggi

**Formula PA Dinamis (prinsip):**

- Input: form terkini (N pertandingan terakhir) + statistik proxy per posisi
- PA naik jika performa konsisten melampaui ekspektasi CA
- PA turun jika cedera panjang, inaktivitas, atau penjara
- Batas bawah: PA ≥ CA (selalu)

**Statistik Proxy per Posisi untuk PA:**

| Posisi                       | Statistik utama                                             |
| ---------------------------- | ----------------------------------------------------------- |
| Kiper (`GK`)                 | Clean sheets per season, save rate                          |
| Bek (`CB`, `FB`)             | Tackle success rate, interceptions per 90, aerial duels won |
| Gelandang (`CM`, `DM`, `AM`) | Pass success rate, passes per 90, assists                   |
| Winger (`LW`, `RW`)          | Goals + assists per 90                                      |
| Striker (`ST`)               | Goals per 90, assists                                       |

**Mental Attribute Training:**

- Bisa dilatih via kelas/les (yoga → kurangi `hot_headed` severity)
- Terpengaruh event: pilihan saat konflik mempengaruhi traits

**Traits System:**

Format: `traits` = JSON array, max **5 traits per pemain**. Set saat generate, bisa berubah lewat events. Traits dalam pasangan berlawanan — tidak bisa punya keduanya.

| #   | Trait              | Opposite           | Efek mekanis                                                                         |
| --- | ------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| 1   | `professional`     | `lazy`             | Training quality +10%, bad lifestyle events −20%                                     |
| 2   | `lazy`             | `professional`     | Training quality −15%, stamina recovery −10%                                         |
| 3   | `hot_headed`       | `composed`         | Yellow cards +20%, red cards +15%, conflict events +25%                              |
| 4   | `composed`         | `hot_headed`       | Cards −15%, pressure events handled better, `mental` +1 display                      |
| 5   | `temperamental`    | —                  | Form variance ×1.5 (peaks higher, drops harder)                                      |
| 6   | `ambitious`        | `content`          | PA delta +10% saat overperform, transfer request lebih sering jika bench             |
| 7   | `content`          | `ambitious`        | Transfer request −40%, PA growth −5% tapi stabil                                     |
| 8   | `extrovert`        | `introvert`        | Social/party events +30%, team morale contribution +3                                |
| 9   | `introvert`        | `extrovert`        | Social events −30%, training focus bonus (+5% CA growth)                             |
| 10  | `media_friendly`   | `controversial`    | Scandal damage −30%, positive media events +20%                                      |
| 11  | `controversial`    | `media_friendly`   | Media events +40%, scandal damage +30%, follower growth +25%                         |
| 12  | `greedy`           | `generous`         | Rejects contract jika bukan tertinggi, money scandal events +20%                     |
| 13  | `generous`         | `greedy`           | Community events +30%, salary demands kadang lebih rendah                            |
| 14  | `loyal`            | `mercenary`        | Transfer request −50%, bertahan di klub meski tawaran lebih baik                     |
| 15  | `mercenary`        | `loyal`            | Transfer request +50%, selalu kejar offer tertinggi                                  |
| 16  | `determination`    | `fragile_mentally` | PA tidak turun saat cedera (sekali per karir), bounce back dari bad form lebih cepat |
| 17  | `fragile_mentally` | `determination`    | Confidence crisis events +40%, form drops harder setelah hasil buruk                 |
| 18  | `leader`           | `disruptive`       | Team morale +5 saat kapten, young players develop faster di tim yang sama            |
| 19  | `disruptive`       | `leader`           | Locker room conflict events +30%, team morale −3 saat unhappy                        |
| 20  | `quick_learner`    | —                  | CA growth rate +15% saat main rutin                                                  |
| 21  | `late_bloomer`     | —                  | PA ceiling bisa naik meski usia 28+, age penalty dihapus                             |
| 22  | `natural_fitness`  | `injury_magnet`    | Stamina decay −0.05/match, recovery +0.02/hari                                       |
| 23  | `injury_magnet`    | `natural_fitness`  | `injury_prone` +2, absen lebih lama per cedera                                       |
| 24  | `risk_taker`       | `clean_cut`        | Legal events +20%, investment gamble events +30%, juga bisa reward lebih besar       |
| 25  | `clean_cut`        | `risk_taker`       | Bad lifestyle events −40%, sponsor prestige events +25%                              |

**Catatan implementasi:**

- Trait `late_bloomer` dan `wonderkid` **tidak bisa bersamaan**
- Trait `leader` + `professional` + `determination` = "Model Professional" archetype (display label saja, bukan mechanic tersendiri)

**Trait Dynamics:**

Traits bersifat **partially dynamic** — berubah hanya lewat jalur eksplisit, bukan random.

Setiap trait punya hidden field `intensity` (1–10). Perubahan menggerakkan intensity:

- Intensity turun ke 0 → trait hilang dari array
- Intensity di arah berlawanan cukup tinggi → trait lawan muncul

**Tiga jalur perubahan:**

| Jalur            | Mekanisme                                                                                                                                                       | Kecepatan             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Event choices    | Pilihan di event konflik/sosial/krisis terakumulasi. 3+ pilihan konsisten arah sama dalam satu season = intensity ±2                                            | Lambat (multi-season) |
| Training program | Yoga, anger management, leadership course, dll. Satu program = intensity ±3 per season                                                                          | Sedang                |
| Career phase     | Beberapa traits berubah otomatis saat usia tertentu. `temperamental` → chance jadi `composed` setelah usia 28. `ambitious` → bisa jadi `content` di late career | Otomatis              |

**Traits yang TIDAK bisa berubah (permanen):**

- `natural_fitness`, `injury_magnet` — bawaan biologis
- `late_bloomer`, `wonderkid` — set saat generate
- `quick_learner` — bawaan, tidak bisa di-acquire

### 4.3 Competition System

**Struktur:**

- Full pyramid dari akademi → tarkan/amatir → non-league → semi-pro → pro → timnas
- Database awal: **Indonesia** (lengkap semua level)
- Kompetisi internasional: level timnas Asia & dunia, level klub Asia (ACL, dll)
- Kompetisi akademi: level nasional & level klub
- Format mengikuti aturan dunia nyata di awal, bisa berubah in-game
- Negara lain dapat ditambah belakangan

**Scope Database Awal:**

| Level         | Cakupan                                                               |
| ------------- | --------------------------------------------------------------------- |
| Tarkan/Amatir | **5 kompetisi pyramid fantasy** (non-resmi), masing-masing 24 tim     |
| Domestik      | BRI Liga 1, 2, 3 + Piala Indonesia                                    |
| Akademi       | Liga 1 U-18, U-16, U-13 level klub & nasional                         |
| Asia Klub     | AFC Champions League Elite, AFC Challenge League                      |
| Asia Timnas   | Kualifikasi Piala Asia, Piala Asia, Kualifikasi Piala Dunia zona Asia |
| Dunia Timnas  | Piala Dunia                                                           |

**Aturan Tarkan vs Pro:**

| Aturan                     | Tarkan                          | Pro League                                    |
| -------------------------- | ------------------------------- | --------------------------------------------- |
| Transfer window            | Bebas pindah kapan saja         | Window buka/tutup terjadwal                   |
| Kontrak                    | Tidak perlu kontrak             | Wajib kontrak, min usia 16                    |
| Pemain akademi boleh main? | Ya — asal fixture tidak bentrok | Ya — asal sudah tanda kontrak pro             |
| Pemain bisa main dua liga? | Ya (tarkan + akademi sekaligus) | Ya (tarkan + pro, asal fixture tidak bentrok) |

**Reward System:**

- Realistic prize money per level
- Awards: POTY, BOTY, Golden Boot, Golden Glove, Best Young Player, dll — per level liga
- Sponsorship deals per pemain & klub

### 4.4 Random Event System

**Prinsip:**

- Events harus **masuk akal kontekstual** — tidak murni absurd
- Chance trigger tergantung atribut mental pemain/karakter

**Struktur Event (referensi: Footballer Career `fa_kariyer_olaylari.json`):**

Tiap event punya:

- `id` — identifier unik
- `kosul` (kondisi) — kapan event bisa trigger: tipe karir, olay (kejadian), range nilai (misal: career goals ≥ 100)
- `ton` — nada event: `olumlu` (positif) / `elestiri` (kritik) / `tarafsiz` (netral) / `mizah` (humor)
- `rol` — siapa yang bereaksi: fan, kritikus, media, netral, rival
- `oncelik` — prioritas tampil (1–5)
- `enFazla` — max berapa kali event ini muncul per karir
- `metinler` — pool narasi (dipilih random dari daftar)

**Kategori Event:**

| Tipe      | Contoh                                           | Chance        |
| --------- | ------------------------------------------------ | ------------- |
| Common    | Konflik di latihan, late to training             | Tinggi        |
| Uncommon  | Wartawan nguntit, merokok difoto, poor form      | Sedang        |
| Rare      | Keluarga meninggal, tawaran match fixing, doping | Rendah        |
| Very Rare | Pensiun dini karena cedera, diculik              | Sangat rendah |

**Career Milestone Events (kondisional, bukan random):**

Trigger otomatis saat kondisi terpenuhi:

- Gol ke-100, ke-200 karir
- Match ke-100, ke-200, ke-300 karir
- Nilai pasar meledak / turun drastis
- Bermain < threshold menit → "bench warmer" event
- Pensiun → pool narasi berbeda berdasarkan stats karir

**Social Media Event System (referensi: folder `sosyal_medya/`):**

Footballer Career punya sistem sosmed terstruktur — reaksi fans/media per event dengan tone berbeda per role. Adopt pattern ini: setiap kejadian penting generate "post" dari akun fans/media/rival dengan narasi berbeda tergantung konteks.

### 4.5 Life Simulation System

**Referensi: My Legacy Football Career — 611 event IDs, 25 kategori, per career phase.**

Event life sim berstruktur per fase karir:

| Fase       | Rentang usia approx |
| ---------- | ------------------- |
| `youth`    | 15–18               |
| `pro_step` | 18–23               |
| `rise`     | 23–27               |
| `prime`    | 27–32               |
| `late`     | 32+                 |

Tidak semua event tersedia di semua fase. Contoh: `education_exam_conflict` hanya muncul di `youth`/`pro_step`. `legacy_retirement_farewell_tour` hanya di `late`.

**25 Kategori Event Life Sim:**

| Kategori               | Contoh Event                                                                                                     | Fase            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------- |
| `partner`              | Kecemburuan foto sosmed, jarak karir vs hubungan, diskusi punya anak, liburan bersama                            | Semua           |
| `family`               | Tekanan keluarga, kebanggaan orang tua, tanggung jawab saudara, bayar hutang keluarga, kematian anggota keluarga | Semua           |
| `education`            | Risiko dropout, konflik ujian vs latihan, disiplin belajar                                                       | Youth, pro_step |
| `psychology`           | Burnout, krisis kepercayaan diri, ketakutan cedera kambuh, kecemasan media                                       | Semua           |
| `social`               | Risiko nightclub, teman masa kecil yang salah jalan, hazing rookie, team bonding                                 | Semua           |
| `debt_credit`          | Tawaran loan shark, tekanan bank, peringatan hutang, iming-iming investasi scam                                  | Semua           |
| `scandal_crisis`       | Rumor skandal, krisis PR, sponsor menarik diri, penjelasan ke klub                                               | Semua           |
| `rivalry`              | Mantan klub, mantan pelatih, perbandingan media, rival posisi, ancaman bakat muda                                | Semua           |
| `mentor`               | Bimbingan pelatih, konflik mentor, sesi training mentor, nasihat kapten senior                                   | Semua           |
| `team_dynamics`        | Barrier bahasa, perkelahian locker room, makan malam tim, bantu rekan                                            | Semua           |
| `captaincy`            | Konflik kapten, tekanan ban kapten, pidato locker room                                                           | Pro_step+       |
| `legacy_retirement`    | Sinyal pensiun, farewell tour, final season, legacy award, jalur jadi pelatih                                    | Late only       |
| `community`            | Donasi fasilitas, sekolah sepakbola, award lokal                                                                 | Prime+          |
| `sponsor`              | Brand lokal, deal prestisius, konflik post sponsor, skandal sponsor                                              | Rise+           |
| `media_social`         | Fan backlash, podcast storm, press gaffe, viral post                                                             | Semua           |
| `match_performance`    | Hat trick chance, own goal crisis, kejar rekor, super sub moment                                                 | Semua           |
| `training_development` | Fitness test, program individual, preseason camp, analisis video                                                 | Semua           |
| `transfer`             | Transfer request, deadline bid, release clause, risiko pindah luar negeri                                        | Semua           |
| `contract`             | Negosiasi gaji, bonus struktur, image rights, relegation clause                                                  | Pro_step+       |
| `free_agent`           | Tawaran agen, tekanan finansial tanpa klub, trial, latihan mandiri                                               | Semua           |
| `finance`              | Budget control, biaya keluarga, tekanan investasi, pengeluaran prestise                                          | Semua           |
| `fan_derby`            | Atmosfer derby, status legenda klub, spanduk fans                                                                | Rise+           |
| `club`                 | Board meeting, visi klub, krisis finansial klub, election year                                                   | Prime+          |
| `injury_rehab`         | Chronic fear, early return risk, private doctor, rehab plan                                                      | Semua           |
| `premium_derby`        | (events premium — dapat ditambah belakangan)                                                                     | Semua           |

**Skenario Life Sim Utama:**

- Kencan → menikah → diskusi punya anak → punya anak
- Partner cemburu sosmed → pilihan: klarifikasi / cuek / pisah
- Teman masa kecil yang "salah jalan" → pilihan: terlibat / bantu / jauhi
- Investor scam: "invest all savings, it'll fly next week" → pilihan berisiko
- Loan shark saat krisis keuangan → pilihan: ambil / tolak
- Keluarga minta ikut campur keputusan klub → family pressure
- Pensiun → coaching path / legacy award / farewell match

**Core Life State:**

- Anak bisa melanjutkan karir (pilihan saat ego utama pensiun/meninggal)
- Kematian: bagian dari siklus hidup, bukan game over
- Transisi mode: bisa pindah mode saat pensiun atau meninggal
- **World state terus berjalan** saat transisi ke anak — waktu tidak di-pause, dunia tidak menunggu

### 4.6 Legal System

**Aktor:**

- Pengacara: bisa disewa, punya atribut (`skill_level`, berpengaruh ke harga & win rate)
- Polisi: punya atribut `bribability` (tingkat kemudahan disuap)

**Kasus Hukum:**

- Penggelapan pajak: trigger saat pemain **memilih** tidak bayar saat jatuh tempo
- Pelecehan seksual: trigger dari pilihan saat interaksi sosial
- Kasus lain: dikembangkan per mode

**Mekanisme Hadapi Kasus (Active Mechanic — diekspos ke pemain):**

Saat terkena kasus, pemain disajikan pilihan eksplisit:

| Pilihan                | Deskripsi                                     | Penentu Sukses                                     |
| ---------------------- | --------------------------------------------- | -------------------------------------------------- |
| Suap polisi            | Bayar sejumlah uang untuk menghilangkan kasus | `bribability` polisi + jumlah uang yang ditawarkan |
| Lawan dengan pengacara | Hire pengacara, ikuti proses hukum            | `skill_level` pengacara + kekuatan bukti           |
| Pasrah                 | Tidak melakukan apa-apa                       | — langsung ke sentencing                           |

- Polisi berbeda punya `bribability` berbeda — beberapa tidak bisa disuap sama sekali
- Pengacara mahal = `skill_level` tinggi = chance menang lebih besar
- Keduanya bisa gagal → tetap dipenjara

**Konsekuensi Dipenjara:**

- Durasi: sesuai kasus
- Selama dipenjara: atribut turun (tidak aktif)
- Setelah bebas: bisa kembali bermain, tapi dengan penalti atribut

### 4.7 Injury System

**50+ named injury types** — dikelompokkan per severity (referensi: Footballer Career `sakatlik` dict):

| Tier               | Contoh                                         | Lama absen |
| ------------------ | ---------------------------------------------- | ---------- |
| Minor              | Muscle fatigue, blister, mild sprain           | 1–3 hari   |
| Mild               | Calf strain, hamstring strain, ankle sprain    | 1–3 minggu |
| Moderate           | Partial tear (hamstring/quad/calf), MCL strain | 1–2 bulan  |
| Serious            | Meniscus tear, fracture, dislocation           | 2–6 bulan  |
| Career-threatening | ACL rupture (very rare)                        | 6–12 bulan |

`injury_prone` attribute pemain mempengaruhi frekuensi trigger. Cedera career-threatening = very rare event (lihat §4.4).

### 4.8 Media & Social System

**Referensi: Footballer Career `sosyal_medya/` folder — sistem paling lengkap di antara game yang dianalisis.**

Setiap kejadian penting generate reaksi dari berbagai "akun":

| Role         | Karakter                       |
| ------------ | ------------------------------ |
| `taraftar`   | Fan klub — bias positif        |
| `hayran`     | Fan pemain — sangat positif    |
| `elestirmen` | Kritikus/pundit — bias negatif |
| `tarafsiz`   | Jurnalis/analis — netral       |
| `alayci`     | Akun humor — tone mizah        |

Tiap reaksi punya kondisi trigger, tone, dan pool narasi berbeda. Contoh: pemain dapat kartu merah → `elestirmen` posting kritik, `alayci` posting meme, `taraftar` bisa keduanya tergantung konteks.

**Kategori reaksi media (dari sosyal_medya files):**

- Performa per posisi: striker/gelandang/bek/kiper dinilai berbeda
- Cedera, kartu, pindah klub, pensiun, award, timnas, age milestones
- Transfer rumor, kontrak baru
- Career milestone (gol ke-100, dll)

Media bisa menguntit pemain → foto aktivitas bocor → Agen bisa berkomplot dengan media (rumor palsu). `media_handling` attribute mempengaruhi damage control.

### 4.8 Financial System

| Fitur         | Deskripsi                                      |
| ------------- | ---------------------------------------------- |
| Pinjaman Bank | Tersedia untuk klub & agen                     |
| Cicilan       | Gagal bayar X bulan → bangkrut                 |
| Sponsorship   | Per klub, per pemain (endorsement)             |
| Slot Liga     | Bisa diperjualbelikan saat bangkrut            |
| Pendapatan    | Match day, TV rights, merchandise, prize money |

### 4.9 Akademi System

- Setiap klub bisa punya akademi
- Generate pemain muda dengan CA/PA awal
- Bisa dikembangkan: fasilitas akademi berpengaruh ke kualitas pemain yang dihasilkan

### 4.11 Match Simulation System

Dua mode tampilan match, tersedia berbeda per perspektif:

**Full Sim (kalkulasi otomatis):**

Referensi dari ketiga game:

- **Football Agent**: sim pakai `Overall` + `Potential` per tim — aggregate rating → win probability
- **Footballer Career**: full sim = **wheel engine yang sama**, dijalankan background tanpa animasi. "Other matches are played in the background with the same engine." Team Strength ratio = ukuran slice di Team wheel.
- **My Legacy**: pakai `overall rating` yang terdiri dari pace, finishing, passing, defending, physicality, vision, composure per pemain

**Formula Full Sim (adopted):**

1. Hitung `team_strength` tiap tim = weighted sum atribut 11 pemain (bobot per posisi)
2. `win_prob_A = team_strength_A / (team_strength_A + team_strength_B)` × home factor × form factor × morale factor
3. Skor disampling dari distribusi Poisson berdasarkan expected goals (`xG`) per tim
4. Stats sekunder (shots, corners, cards) disampling dari distribusi yang korelasi dengan xG

Output: skor final + statistik match (shots, possession, xG, corners, cards)
Selesai instan — pemain skip langsung ke hasil

**Tonton Match (text commentary + weighted probability engine):**

Referensi: Footballer Career menggunakan **Wheel System** — setiap kejadian match diselesaikan lewat serangkaian "roda probabilitas" berurutan. Untuk game text-based, ini diterjemahkan jadi weighted random selection:

1. **Minute wheel** → kapan event terjadi (distribusi probabilistik per 90 menit)
2. **Team wheel** → tim mana yang mendapat event (bobot = kekuatan relatif)
3. **Event wheel** → jenis event: GOAL / CORNER / FREEKICK / PENALTY / FOUL / DEFENSE / COUNTER / OUT / KEEPER / POST / OFFSIDE / CARD / REBOUND
4. Jika GOAL → **Post-match goal/assist wheel** per pemain (bobot = rating + posisi + form)
5. Jika CARD → **Card wheel** → NONE / YELLOW / 2ND YELLOW / RED / RED(VAR)
6. VAR bisa membalik keputusan (PENALTY VAR, CARD VAR)

Atribut pemain mempengaruhi bobot tiap roda. Contoh: pemain dengan `att` tinggi = slice GOAL lebih besar di event wheel ketika tim mereka menyerang.

Commentary text: pool narasi per event type (referensi: 9 variasi per tipe, dipilih random)

Event muncul: gol, kartu, peluang, cedera, substitusi. **Tidak ada player control** — semua mode menonton wheel berjalan, hanya Manajer yang bisa intervensi taktik/subs mid-match.

**Ketersediaan per Mode:**

| Mode    | Full Sim | Tonton Match   | Intervensi        |
| ------- | -------- | -------------- | ----------------- |
| Pemain  | Ya       | Ya (wheel POV) | Tidak             |
| Manajer | Ya       | Ya             | Ya (taktik, subs) |
| Agen    | Ya       | Ya (read-only) | Tidak             |
| Pemilik | Ya       | Ya (read-only) | Tidak             |

---

### 4.10 Staff System

| Posisi Staff    | Efek                      |
| --------------- | ------------------------- |
| Physio          | Recovery speed pemain     |
| Club Doctor     | Akurasi diagnosis cedera  |
| GK Coach        | Development kiper         |
| Set Piece Coach | Efektivitas set piece     |
| Asisten Manajer | Kualitas laporan scouting |
| General Coach   | Overall training quality  |

---

## 5. Presentasi & Visual

### Format Utama: Text-Based

Game sepenuhnya text-based. Tidak ada animasi match, 3D, atau gameplay visual.

### Aset Visual (terbatas)

| Aset          | Keterangan                              |
| ------------- | --------------------------------------- |
| Wajah pemain  | Avatar/foto karakter, bukan animasi     |
| Jersey        | Gambar statis kit per klub              |
| Logo klub     | Icon/badge per klub                     |
| Piala & award | Gambar statis untuk display achievement |

Semua aset bersifat **dekoratif**, bukan fungsional gameplay.

---

## 6. Technical Considerations (Web Browser)

### Stack Awal yang Direkomendasikan

| Layer     | Opsi                                                          |
| --------- | ------------------------------------------------------------- |
| Game Loop | JavaScript + Web Workers (simulasi berjalan background)       |
| UI        | HTML/CSS + framework ringan (Svelte atau vanilla JS)          |
| Data      | IndexedDB (local save, no server needed untuk solo)           |
| Simulasi  | Pure JS engine, tick-based                                    |
| Aset      | Static image files (SVG/PNG untuk jersey, logo, wajah, piala) |

### Constraint Web Browser

- Simulasi berat (full world tick) harus dijalankan di Web Worker agar UI tidak freeze
- Save state harus bisa di-export (JSON) untuk backup
- Tidak perlu network untuk versi solo
- Aset visual minimal → load time ringan

---

## 6. Scope & Phasing

### ⚠️ Scope Warning

Game ini adalah proyek sangat ambisius. Rekomendasi: bangun dalam fase.

### Phase 1 — MVP Core (Foundation)

**Goal:** Satu mode bisa dimainkan end-to-end

- [ ] World simulation engine (tick-based)
- [ ] Satu negara, satu liga (3-4 level)
- [ ] Mode Pemain: basic career (kontrak, main, atribut naik/turun)
- [ ] Kompetisi sederhana (league format)
- [ ] Save/Load

### Phase 2 — Manager Mode

- [ ] Taktik & formasi
- [ ] Transfer market
- [ ] Staff system (subset)
- [ ] Basic random events

### Phase 3 — Agent Mode

- [ ] Scouting system
- [ ] Kantor & klien management
- [ ] Negosiasi kontrak

### Phase 4 — Owner Mode + Financial

- [ ] Beli/jual klub
- [ ] Bank loan system
- [ ] Slot liga mechanism
- [ ] Bankruptcy

### Phase 5 — Life Sim & Events

- [ ] Kehidupan personal (nikah, anak, legasi)
- [ ] Legal system
- [ ] Media system
- [ ] Full random event library

### Phase 6 — Multi-country & Polish

- [ ] Tambah negara & liga
- [ ] Dynamic competition format
- [ ] Full award system

---

## 7. Out of Scope (untuk sekarang)

- Multiplayer
- 3D/visual match engine — game ini text-based, wheel system adalah probabilitas bukan visual
- Mobile app
- Server/backend (versi solo dulu)
- Real player data/lisensi

---

## 8. Keputusan Desain yang Sudah Resolved

| #   | Pertanyaan                               | Keputusan                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | "Wheels weighted" match sim itu apa?     | Wheel = weighted probability engine: Minute→Team→Event→Outcome. Detail §4.11               |
| 1b  | Full Sim caranya?                        | Same wheel engine, background, pakai Poisson xG. Detail §4.11                              |
| 1c  | Player control saat Tonton Match?        | **Tidak ada** — semua mode menonton wheel. Hanya Manajer bisa intervensi taktik/subs       |
| 2   | Database negara awal?                    | Indonesia + Asia & dunia. Detail §4.3                                                      |
| 2b  | Tarkan database scope?                   | 5 kompetisi pyramid fantasy, masing-masing 24 tim. Detail §4.3 & §10                       |
| 3   | Formula PA dinamis?                      | Form + statistik proxy per posisi. Detail §4.2                                             |
| 3b  | Statistik proxy per posisi?              | GK: clean sheets; DEF: tackle/interception/aerial; MID: pass rate+assist; ST/W: gol+assist |
| 4   | Bribery mechanic: aktif atau background? | **Aktif** — suap / pengacara / pasrah. Detail §4.6                                         |
| 5   | World state saat transisi ke anak?       | **Terus berjalan** — tidak di-pause                                                        |

## 9. Open Questions (perlu keputusan sebelum build)

1. **Bobot atribut Full Sim:** Formula `team_strength` sudah ada prinsipnya (§4.11), tapi bobot spesifik per posisi belum ditetapkan — perlu Game Engine doc tersendiri.

---

## 10. Sistem Desain dari Nol (tidak ada referensi game)

Sistem berikut **tidak ditemukan** di ketiga game referensi. Perlu doc desain tersendiri sebelum implementasi. Bukan open question — sudah tahu mau apa, perlu dirancang mekaniknya.

| Sistem                       | Yang perlu dirancang                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legal System**             | Formula chance suap per `bribability` polisi + uang; chance menang pengacara per `skill_level`; tabel kasus per mode; konsekuensi + durasi penjara                  |
| **Multi-mode World**         | Shared world state antara 4 mode; bagaimana keputusan satu mode mempengaruhi mode lain; event yang cross-mode (contoh: pemain lo sebagai manajer dibidik agen lain) |
| **Dynamic PA Formula**       | Formula matematis: form + statistik per posisi → delta PA per tick; decay rate saat inaktif/penjara; ceiling logic (PA ≥ CA selalu)                                 |
| **Slot Liga & Bankruptcy**   | Mekanisme swap slot saat bangkrut; siapa yang bisa beli slot; harga slot per level liga; cooldown setelah swap                                                      |
| ~~**Tarkan/Amatir League**~~ | ✅ Resolved — lihat §4.3 dan §8 (2b)                                                                                                                                |

---

## 11. Success Criteria (Personal)

Karena ini personal project, sukses = game bisa dimainkan penuh satu siklus karir pemain dari usia 15 sampai pensiun/meninggal, dengan semua keputusan terasa punya konsekuensi yang masuk akal.

---

_Dokumen ini hidup — update saat ada keputusan desain baru._
