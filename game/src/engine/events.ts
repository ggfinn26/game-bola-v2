import { getDB } from "./db.js";
import { getPlayer } from "./scheduler.js";
import { careerPhase } from "./world.js";
import type { GameEvent, Player, Trait } from "../types/index.js";

// Mutually exclusive trait pairs per AGENTS.md
const EXCLUSIVE_TRAITS: Partial<Record<Trait, Trait>> = {
  professional: "lazy",
  lazy: "professional",
  hot_headed: "composed",
  composed: "hot_headed",
  ambitious: "content",
  content: "ambitious",
  extrovert: "introvert",
  introvert: "extrovert",
  media_friendly: "controversial",
  controversial: "media_friendly",
  greedy: "generous",
  generous: "greedy",
  loyal: "mercenary",
  mercenary: "loyal",
  determination: "fragile_mentally",
  fragile_mentally: "determination",
  leader: "disruptive",
  disruptive: "leader",
  natural_fitness: "injury_magnet",
  injury_magnet: "natural_fitness",
  risk_taker: "clean_cut",
  clean_cut: "risk_taker",
};

export const EVENTS: GameEvent[] = [
  {
    id: "education_exam_conflict",
    category: "education",
    title: "Bentrok Ujian & Laga Tandang",
    description:
      "Jadwal ujian akhir bertepatan dengan keberangkatan tim untuk laga tandang pekan ini. Pihak sekolah/kampus meminta kehadiranmu, sementara pelatih berharap kamu ikut rombongan tim.",
    condition: { phase: ["youth", "pro_step"] },
    tone: "neutral",
    priority: 3,
    max_occurrences: 2,
    social_reactions: [
      {
        role: "fan",
        handle: "@ TribunGaruda",
        text: "Pemain muda kita masih harus bagi waktu sama ujian sekolah, salut!",
      },
      {
        role: "critic",
        handle: "@ PengamatBolaID",
        text: "Klub harusnya kasih tutor privat biar fokusnya nggak terbelah.",
      },
    ],
    choices: [
      {
        id: "focus_match",
        text: "Ikut rombongan tim, minta ujian susulan",
        effects: { form: 0.08, trait_intensity: { ambitious: 2, professional: 1 } },
      },
      {
        id: "take_exam",
        text: "Izin ke pelatih demi ikut ujian tepat waktu",
        effects: { mental_boost: 1, form: -0.05, trait_intensity: { clean_cut: 2 } },
      },
    ],
  },
  {
    id: "training_extra_finishing",
    category: "training_development",
    title: "Sesi Latihan Tambahan Sore Hari",
    description:
      "Asisten pelatih menawarkan porsi latihan ekstra 45 menit setelah sesi reguler selesai. Cuaca cukup terik dan ototmu mulai terasa berat.",
    condition: { excludes_trait: ["lazy"] },
    tone: "positive",
    priority: 4,
    max_occurrences: null,
    social_reactions: [
      {
        role: "media",
        handle: "@ LiputanLatihan",
        text: "Terlihat masih bertahan di lapangan latihan saat pemain lain sudah masuk ruang ganti.",
      },
    ],
    choices: [
      {
        id: "push_hard",
        text: "Ambil porsi penuh sampai malam",
        effects: { tech_boost: 1, stamina: -0.12, form: 0.06, trait_intensity: { professional: 2, determination: 1 } },
      },
      {
        id: "rest_smart",
        text: "Cukup peregangan ringan lalu istirahat",
        effects: { stamina: 0.08, trait_intensity: { composed: 1 } },
      },
    ],
  },
  {
    id: "social_nightclub_invite",
    category: "social",
    title: "Ajakan Nongkrong Larut Malam",
    description:
      "Teman masa kecilmu mengajak keluar makan malam dan nongkrong sampai larut di pusat kota dua hari sebelum pertandingan.",
    condition: { phase: ["youth", "pro_step", "rise"] },
    tone: "critical",
    priority: 3,
    max_occurrences: null,
    social_reactions: [
      { role: "fan", handle: "@ MafiaTribun", text: "Jangan sampai bintang muda kita kena sindrom star syndrome!" },
      { role: "media", handle: "@ GosipLapangan", text: "Disiplin di luar lapangan bakal jadi penentu karir panjang." },
    ],
    choices: [
      {
        id: "decline_stay_home",
        text: "Tolak halus, tidur tepat waktu",
        effects: { form: 0.06, stamina: 0.05, trait_intensity: { professional: 2, clean_cut: 1 } },
      },
      {
        id: "go_out_party",
        text: "Ikut nongkrong buat lepas penat",
        effects: { stamina: -0.15, form: -0.06, trait_intensity: { lazy: 2, risk_taker: 1 } },
      },
    ],
  },
  {
    id: "partner_social_jealousy",
    category: "partner",
    title: "Drama Komentar Media Sosial",
    description:
      "Pasanganmu kesal karena akun selebgram lokal sering meninggalkan komentar genit di unggahan selebrasi golmu.",
    condition: {},
    tone: "humor",
    priority: 2,
    max_occurrences: 3,
    social_reactions: [
      { role: "fan", handle: "@ NetizenBola", text: "Waduh kolom komentarnya mulai dipantau ketat nih 😂" },
    ],
    choices: [
      {
        id: "clarify_calmly",
        text: "Beri pengertian & batasi kolom komentar",
        effects: { mental_boost: 1, form: 0.04, trait_intensity: { composed: 2, loyal: 1 } },
      },
      {
        id: "ignore_drama",
        text: "Cuek saja, anggap bagian dari popularitas",
        effects: { form: -0.04, trait_intensity: { controversial: 2 } },
      },
    ],
  },
  {
    id: "family_financial_request",
    category: "family",
    title: "Keluarga Meminta Bantuan Usaha",
    description:
      "Paman di kampung halaman menghubungi dan meminta bantuan modal untuk membuka bengkel keluarga, tepat saat kamu sedang menabung.",
    condition: {},
    tone: "neutral",
    priority: 3,
    max_occurrences: 3,
    choices: [
      {
        id: "help_family",
        text: "Kirim bantuan modal secukupnya",
        effects: { mental_boost: 1, form: 0.05, trait_intensity: { generous: 2, loyal: 1 } },
      },
      {
        id: "refuse_save_money",
        text: "Tolak dengan alasan dana sedang ditahan agen",
        effects: { trait_intensity: { greedy: 2, ambitious: 1 } },
      },
    ],
  },
  {
    id: "media_podcast_interview",
    category: "media_social",
    title: "Undangan Podcast Sepak Bola Viral",
    description:
      "Host podcast bola paling ramai di Indonesia mengundangmu tampil. Dia memancing pertanyaan soal kepemimpinan wasit dan target juara musim ini.",
    condition: {},
    tone: "neutral",
    priority: 4,
    max_occurrences: null,
    social_reactions: [
      {
        role: "media",
        handle: "@ PodcastGaruda",
        text: "Episode terbaru bareng bintang muda Liga 1 langsung trending!",
      },
      { role: "critic", handle: "@ KomentatorPedas", text: "Jawaban di depan mikrofon nunjukin kematangan mentalnya." },
    ],
    choices: [
      {
        id: "diplomatic_answer",
        text: "Jawab diplomatis, puji kerja keras tim & suporter",
        effects: { form: 0.06, trait_intensity: { media_friendly: 2, composed: 1 } },
      },
      {
        id: "spicy_statement",
        text: "Bicara blak-blakan & sindir tim rival",
        effects: { form: 0.08, mental_boost: -1, trait_intensity: { controversial: 2, hot_headed: 1 } },
      },
    ],
  },
  {
    id: "mentor_captain_advice",
    category: "mentor",
    title: "Wejangan Kapten Senior",
    description:
      "Kapten tim memanggilmu bicara empat mata usai latihan. Ia membagikan tips membaca ruang dan menjaga konsistensi sepanjang musim panjang.",
    condition: { phase: ["youth", "pro_step"] },
    tone: "positive",
    priority: 4,
    max_occurrences: 2,
    choices: [
      {
        id: "absorb_lesson",
        text: "Dengarkan dengan serius dan catat masukannya",
        effects: {
          mental_boost: 1,
          attack_boost: 1,
          form: 0.08,
          trait_intensity: { quick_learner: 2, professional: 1 },
        },
      },
      {
        id: "confident_reply",
        text: "Ucapkan terima kasih tapi tetap pakai gayamu sendiri",
        effects: { form: 0.04, trait_intensity: { ambitious: 2 } },
      },
    ],
  },
  {
    id: "psychology_fan_criticism",
    category: "psychology",
    title: "Kritik Tajam di Media Sosial",
    description:
      "Potongan klip aksimu di lapangan ramai dikomentari akun analisis taktik. Sebagian suporter membela, sebagian lagi menuntut kamu tampil lebih tajam.",
    condition: {},
    tone: "critical",
    priority: 3,
    max_occurrences: null,
    social_reactions: [
      {
        role: "critic",
        handle: "@ TaktikPapanTulis",
        text: "Pengambilan keputusannya di sepertiga akhir masih harus diasah lagi.",
      },
      { role: "fan", handle: "@ UltrasSetia", text: "Tetap dukung penuh! Proses nggak pernah mengkhianati hasil." },
    ],
    choices: [
      {
        id: "use_as_fuel",
        text: "Jadikan motivasi untuk bungkam kritik di laga berikutnya",
        effects: { form: 0.1, mental_boost: 1, trait_intensity: { determination: 2 } },
      },
      {
        id: "reply_haters",
        text: "Balas komentar netizen di kolom balasan",
        effects: { form: -0.08, trait_intensity: { hot_headed: 2, fragile_mentally: 1 } },
      },
    ],
  },
  {
    id: "debt_crypto_scam_offer",
    category: "debt_credit",
    title: "Tawaran Investasi 'Pasti Terbang'",
    description:
      "Seorang kenalan lama menawarkan proyek token kripto eksklusif dan menjanjikan dana berlipat ganda hanya dalam dua minggu.",
    condition: {},
    tone: "critical",
    priority: 2,
    max_occurrences: 2,
    choices: [
      {
        id: "reject_scam",
        text: "Tolak tegas, fokus simpan gaji di instrumen aman",
        effects: { mental_boost: 1, trait_intensity: { composed: 2, clean_cut: 1 } },
      },
      {
        id: "gamble_savings",
        text: "Coba setor sebagian tabungan karena tergiur",
        effects: { form: -0.1, mental_boost: -1, trait_intensity: { risk_taker: 2, greedy: 1 } },
      },
    ],
  },
  {
    id: "team_dynamics_locker_clash",
    category: "team_dynamics",
    title: "Ketegangan di Ruang Ganti",
    description:
      "Dua pemain senior bersitegang soal pembagian tugas bertahan saat evaluasi video pertandingan. Suasana ruang ganti mendadak hening.",
    condition: {},
    tone: "neutral",
    priority: 3,
    max_occurrences: 3,
    choices: [
      {
        id: "mediate_team",
        text: "Tengahi suasana dan ajak fokus ke laga berikutnya",
        effects: { mental_boost: 1, form: 0.05, trait_intensity: { leader: 2, composed: 1 } },
      },
      {
        id: "stay_quiet",
        text: "Diam dan tidak ikut campur urusan senior",
        effects: { trait_intensity: { introvert: 1 } },
      },
    ],
  },

  // ─── Injury / Health ──────────────────────────────────────────────────────

  {
    id: "injury_knee_pain_training",
    category: "injury_health",
    title: "Nyeri Lutut Setelah Sesi Fisik",
    description:
      "Usai sesi lari intensitas tinggi, lututmu terasa nyeri dan sedikit membengkak. Fisioterapis tim menyarankan istirahat dua hari, tapi laga penting mendekat.",
    condition: {},
    tone: "critical",
    priority: 4,
    max_occurrences: null,
    social_reactions: [{ role: "fan", handle: "@ SupporterSetia", text: "Jaga kondisi bro, fisik nomor satu!" }],
    choices: [
      {
        id: "rest_fully",
        text: "Ikuti saran fisioterapis, absen latihan dua hari",
        effects: { stamina: 0.1, form: -0.06, trait_intensity: { professional: 1 } },
      },
      {
        id: "push_through_pain",
        text: "Abaikan sakit, tetap latihan meski pincang",
        effects: { stamina: -0.2, form: 0.04, trait_intensity: { determination: 2, injury_magnet: 1 } },
      },
    ],
  },

  {
    id: "injury_fatigue_congested",
    category: "injury_health",
    title: "Kelelahan Musim Padat",
    description:
      "Lima laga dalam 17 hari terakhir. Dokter tim memintamu mengisi formulir pemantauan kondisi — otot paha kanan terasa kaku tiap pagi.",
    condition: { phase: ["prime", "late"] },
    tone: "critical",
    priority: 3,
    max_occurrences: null,
    choices: [
      {
        id: "request_bench",
        text: "Minta pelatih rotasikan kamu di laga berikutnya",
        effects: { stamina: 0.12, form: -0.05, trait_intensity: { professional: 2 } },
      },
      {
        id: "self_medicate_play",
        text: "Konsumsi anti-nyeri dan tetap tampil penuh",
        effects: { stamina: -0.15, phys_boost: -1, trait_intensity: { determination: 1, risk_taker: 1 } },
      },
    ],
  },

  // ─── Career / Transfer ────────────────────────────────────────────────────

  {
    id: "career_renewal_below_market",
    category: "career_transfer",
    title: "Tawaran Perpanjangan Kontrak di Bawah Ekspektasi",
    description:
      "Manajer umum klub menawarkan perpanjangan dua tahun, tapi kenaikan gajinya jauh di bawah angka yang kamu dan agenmu harapkan.",
    condition: { phase: ["rise", "prime"] },
    tone: "neutral",
    priority: 4,
    max_occurrences: 2,
    social_reactions: [
      { role: "media", handle: "@ TransferIndonesia", text: "Kontrak pemain ini masih jadi tanda tanya besar." },
    ],
    choices: [
      {
        id: "accept_stability",
        text: "Terima demi kepastian & loyalitas ke klub",
        effects: { mental_boost: 1, form: 0.04, trait_intensity: { loyal: 2, content: 1 } },
      },
      {
        id: "reject_seek_better",
        text: "Tolak, instruksikan agen cari opsi lain",
        effects: { form: -0.05, trait_intensity: { ambitious: 2, mercenary: 1 } },
      },
    ],
  },

  {
    id: "career_foreign_scout_watching",
    category: "career_transfer",
    title: "Mata-mata Klub Asing Hadir di Tribun",
    description:
      "Pelatih membisikkan bahwa ada agen dari klub liga Asia Tenggara yang sedang mengamati penampilanmu malam ini.",
    condition: { phase: ["rise", "prime"] },
    tone: "positive",
    priority: 3,
    max_occurrences: 3,
    social_reactions: [
      { role: "media", handle: "@ TransferKabar", text: "Pemain Liga 1 ini mulai dilirik pasar asing — bangga!" },
    ],
    choices: [
      {
        id: "play_to_impress",
        text: "Keluarkan semua kemampuan terbaik malam ini",
        effects: { form: 0.08, attack_boost: 1, trait_intensity: { ambitious: 2, risk_taker: 1 } },
      },
      {
        id: "play_normal",
        text: "Tetap main seperti biasa, jangan terlalu dipikir",
        effects: { form: 0.04, mental_boost: 1, trait_intensity: { composed: 1 } },
      },
    ],
  },

  // ─── National Team ────────────────────────────────────────────────────────

  {
    id: "national_team_first_callup",
    category: "national_team",
    title: "Pemanggilan Perdana ke Timnas",
    description:
      "Telepon dari staf pelatih Timnas Indonesia tiba: kamu masuk skuad untuk laga kualifikasi. Ini pertama kalinya jersey garuda ada di depan namamu.",
    condition: { phase: ["pro_step", "rise"] },
    tone: "positive",
    priority: 5,
    max_occurrences: 1,
    social_reactions: [
      { role: "fan", handle: "@ GarudaGaruda12", text: "YEEES akhirnya! Bawa nama bangsa bro 🦅" },
      { role: "media", handle: "@ BolaNasional", text: "Rekrutan anyar Timnas — bintang muda yang ditunggu-tunggu." },
    ],
    choices: [
      {
        id: "embrace_pressure",
        text: "Sambut dengan semangat, siap bela bangsa",
        effects: { form: 0.1, mental_boost: 1, trait_intensity: { ambitious: 2, determination: 1 } },
      },
      {
        id: "manage_nerves",
        text: "Terima dengan tenang, fokus ke persiapan fisik",
        effects: { form: 0.06, stamina: 0.05, trait_intensity: { composed: 2, professional: 1 } },
      },
    ],
  },

  {
    id: "national_team_snubbed",
    category: "national_team",
    title: "Gagal Masuk Skuad Timnas",
    description:
      "Pengumuman skuad Timnas keluar — namamu tidak ada di daftar. Padahal performa musim ini terbilang solid. Wartawan mulai menghubungimu.",
    condition: { phase: ["rise", "prime"] },
    tone: "critical",
    priority: 3,
    max_occurrences: 3,
    social_reactions: [
      {
        role: "fan",
        handle: "@ AnalisisTaktikID",
        text: "Keputusan pelatih bisa diperdebatkan, tapi itu hak prerogatifnya.",
      },
      { role: "critic", handle: "@ KritikusSepakbola", text: "Statistiknya seharusnya cukup buat dapat tiket Garuda." },
    ],
    choices: [
      {
        id: "stay_professional",
        text: "Sampaikan dukungan ke timnas, fokus performa klub",
        effects: { mental_boost: 1, form: 0.04, trait_intensity: { professional: 2, composed: 1 } },
      },
      {
        id: "vent_frustration",
        text: "Unggah tweet samar soal 'seleksi yang tidak adil'",
        effects: { form: -0.06, trait_intensity: { controversial: 2, hot_headed: 1 } },
      },
    ],
  },

  // ─── Legal / Match-Fixing ─────────────────────────────────────────────────

  {
    id: "legal_matchfixing_approach",
    category: "legal",
    title: "Bisikan dari Orang Tak Dikenal",
    description:
      "Usai latihan, seorang pria berpakaian rapi mendekatimu di parkiran. Ia berbisik soal 'pengaturan skor' dan angka yang disebutnya sangat menggiurkan.",
    condition: {},
    tone: "critical",
    priority: 5,
    max_occurrences: 2,
    choices: [
      {
        id: "report_to_club",
        text: "Segera laporkan ke manajemen klub dan abaikan tawaran",
        effects: { form: 0.06, mental_boost: 1, trait_intensity: { clean_cut: 3, professional: 1 } },
      },
      {
        id: "consider_offer",
        text: "Simpan nomor kontaknya dulu sambil pikir-pikir",
        effects: {
          form: -0.08,
          mental_boost: -1,
          trait_intensity: { greedy: 2, risk_taker: 2 },
          legal_case: "match_fixing_investigation",
        },
      },
    ],
  },

  // ─── Endorsement / Business ───────────────────────────────────────────────

  {
    id: "endorsement_energy_drink",
    category: "endorsement",
    title: "Tawaran Endorse Minuman Energi",
    description:
      "Brand minuman energi terlaris di Indonesia menghubungi agenmu. Mereka ingin wajahmu di papan reklame stadion dan iklan digital. Kontrak setahun.",
    condition: { phase: ["rise", "prime", "late"] },
    tone: "positive",
    priority: 3,
    max_occurrences: 1,
    social_reactions: [
      { role: "fan", handle: "@ MerchKita", text: "Endorse brand ini artinya udah level seleb bola nih!" },
    ],
    choices: [
      {
        id: "accept_deal",
        text: "Setujui, tambahan penghasilan sambil urus penampilan brand",
        effects: { form: 0.04, mental_boost: 1, trait_intensity: { extrovert: 1, media_friendly: 1 } },
      },
      {
        id: "decline_focus_football",
        text: "Tolak dulu, jadwal padat dan tidak ingin distraksi",
        effects: { stamina: 0.05, trait_intensity: { professional: 2 } },
      },
    ],
  },

  {
    id: "endorsement_shady_brand",
    category: "endorsement",
    title: "Tawaran Endorse Situs Judi Online (Berkedok 'Game')",
    description:
      "Sebuah platform digital menawarkan nominal besar. Namun setelah diteliti agenmu, ternyata itu situs taruhan daring dengan izin abu-abu.",
    condition: {},
    tone: "critical",
    priority: 4,
    max_occurrences: 2,
    social_reactions: [
      {
        role: "critic",
        handle: "@ IntegritasBola",
        text: "Banyak pesepakbola terjebak promosi platform ilegal karena iming-iming bayaran besar.",
      },
    ],
    choices: [
      {
        id: "reject_on_principle",
        text: "Tolak, reputasi jangka panjang lebih berharga",
        effects: { mental_boost: 1, trait_intensity: { clean_cut: 2, professional: 1 } },
      },
      {
        id: "sign_for_money",
        text: "Tanda tangani, gunakan nama samaran",
        effects: {
          form: -0.05,
          trait_intensity: { greedy: 2, risk_taker: 2 },
          legal_case: "illegal_endorsement_probe",
        },
      },
    ],
  },

  // ─── Gambling ─────────────────────────────────────────────────────────────

  {
    id: "gambling_bet_invite",
    category: "gambling",
    title: "Ajakan Taruhan Antar Pemain",
    description:
      "Di sela perjalanan tandang, beberapa rekan setim bermain kartu dengan taruhan kecil. Mereka mengajakmu bergabung.",
    condition: { phase: ["youth", "pro_step", "rise"] },
    tone: "critical",
    priority: 3,
    max_occurrences: null,
    choices: [
      {
        id: "decline_gambling",
        text: "Tolak, pilih tidur atau dengarkan musik",
        effects: { stamina: 0.06, trait_intensity: { clean_cut: 2, professional: 1 } },
      },
      {
        id: "join_small_bet",
        text: "Ikut sebentar, taruhannya kecil toh",
        effects: { form: 0.02, trait_intensity: { risk_taker: 2, lazy: 1 } },
      },
    ],
  },

  // ─── Religion / Culture ───────────────────────────────────────────────────

  {
    id: "religion_ramadan_schedule",
    category: "religion_culture",
    title: "Puasa di Tengah Jadwal Padat",
    description:
      "Ramadan tiba di tengah phase kompetisi paling intens musim ini. Kamu ingin menjalankan puasa penuh, tapi dokter tim menyarankan untuk berhati-hati.",
    condition: {},
    tone: "neutral",
    priority: 3,
    max_occurrences: 1,
    social_reactions: [
      { role: "fan", handle: "@ PenjagaNilai", text: "Salut pemain kita tetap jalankan kewajiban meski jadwal padat!" },
      {
        role: "critic",
        handle: "@ SportSains",
        text: "Secara ilmiah performa bisa turun saat puasa, manajemen risiko penting.",
      },
    ],
    choices: [
      {
        id: "fast_fully",
        text: "Jalankan puasa penuh dengan penyesuaian pola makan sahur & buka",
        effects: { mental_boost: 1, stamina: -0.08, trait_intensity: { determination: 2, professional: 1 } },
      },
      {
        id: "take_rukhsah",
        text: "Ambil rukhsah (keringanan) untuk jaga kondisi fisik",
        effects: { stamina: 0.05, trait_intensity: { composed: 1 } },
      },
    ],
  },

  // ─── Fan Interaction ──────────────────────────────────────────────────────

  {
    id: "fan_recognition_mall",
    category: "fan_interaction",
    title: "Dikenali Suporter di Mal",
    description:
      "Kamu sedang belanja santai ketika serombongan remaja berteriak namamu dari jarak jauh. Mereka meminta foto dan tanda tangan di tengah keramaian.",
    condition: {},
    tone: "positive",
    priority: 2,
    max_occurrences: null,
    choices: [
      {
        id: "embrace_fans",
        text: "Layani semua permintaan foto dan tanda tangan",
        effects: { form: 0.06, mental_boost: 1, trait_intensity: { extrovert: 2, media_friendly: 1 } },
      },
      {
        id: "politely_excuse",
        text: "Minta maaf dengan sopan, lagi bersama keluarga",
        effects: { trait_intensity: { introvert: 1, composed: 1 } },
      },
    ],
  },

  {
    id: "fan_angry_missed_penalty",
    category: "fan_interaction",
    title: "Amukan Suporter Pasca Penalti Gagal",
    description:
      "Tendangan penaltimu yang gagal di menit ke-85 membuat kekalahan 0–1 tak bisa dihindari. Di luar stadion, beberapa suporter menunggu dan mulai berteriak.",
    condition: {},
    tone: "critical",
    priority: 4,
    max_occurrences: null,
    social_reactions: [
      { role: "fan", handle: "@ TribunBarat", text: "Kita kalah gara-gara penalti gagal itu... sesak banget." },
      { role: "neutral", handle: "@ ReporterLapangan", text: "Ketegangan antara pemain dan suporter di luar stadion." },
    ],
    choices: [
      {
        id: "face_fans_apologize",
        text: "Hadapi suporter dengan kepala tegak, minta maaf tulus",
        effects: { form: -0.06, mental_boost: 1, trait_intensity: { leader: 2, composed: 1 } },
      },
      {
        id: "rush_to_bus",
        text: "Langsung naik bus tim dan hindari kontak",
        effects: { form: -0.1, trait_intensity: { introvert: 1, fragile_mentally: 1 } },
      },
    ],
  },

  // ─── Agent ────────────────────────────────────────────────────────────────

  {
    id: "agent_demands_higher_cut",
    category: "agent",
    title: "Agen Minta Kenaikan Komisi",
    description:
      "Agenmu menelepon dengan nada tegas: ia merasa jasa yang ia berikan jauh melampaui persentase komisi saat ini dan meminta revisi kontrak keagenan.",
    condition: {},
    tone: "neutral",
    priority: 3,
    max_occurrences: 2,
    choices: [
      {
        id: "negotiate_terms",
        text: "Duduk bareng dan negosiasikan angka yang masuk akal",
        effects: { mental_boost: 1, trait_intensity: { composed: 2, ambitious: 1 } },
      },
      {
        id: "fire_agent",
        text: "Putuskan hubungan dan cari agen baru",
        effects: { form: -0.06, trait_intensity: { risk_taker: 2, mercenary: 1 } },
      },
    ],
  },

  // ─── Team Dynamics (tambahan) ─────────────────────────────────────────────

  {
    id: "team_dynamics_foreign_star",
    category: "team_dynamics",
    title: "Pemain Asing Baru Datang & Langsung Mendominasi",
    description:
      "Klub mendatangkan gelandang asing berperingkat tinggi. Posisinya sama persis denganmu. Pelatih mengisyaratkan rotasi ketat mulai pekan depan.",
    condition: {},
    tone: "critical",
    priority: 4,
    max_occurrences: 2,
    social_reactions: [
      { role: "fan", handle: "@ SigmaBola", text: "Pemain asing kelas satu masuk — kompetisi makin sengit!" },
      {
        role: "media",
        handle: "@ SkuadUpdate",
        text: "Pemain lokal harus buktikan diri agar tidak tersingkir dari rotasi.",
      },
    ],
    choices: [
      {
        id: "raise_game",
        text: "Jadikan rival latihan bagi diri sendiri, tingkatkan performa",
        effects: { form: 0.08, tech_boost: 1, trait_intensity: { determination: 2, ambitious: 1 } },
      },
      {
        id: "request_transfer",
        text: "Minta agen mulai jajaki opsi pindah",
        effects: { form: -0.04, trait_intensity: { mercenary: 2 } },
      },
    ],
  },

  // ─── Family (tambahan) ────────────────────────────────────────────────────

  {
    id: "family_parent_hospitalized",
    category: "family",
    title: "Orang Tua Dilarikan ke Rumah Sakit",
    description:
      "Tengah malam kamu mendapat kabar bahwa ibumu jatuh sakit dan harus dirawat inap. Laga kandang penting ada dua hari lagi.",
    condition: {},
    tone: "critical",
    priority: 5,
    max_occurrences: 1,
    choices: [
      {
        id: "rush_home",
        text: "Minta izin klub, pulang menemani keluarga",
        effects: { form: -0.08, stamina: -0.1, mental_boost: 1, trait_intensity: { loyal: 2, generous: 1 } },
      },
      {
        id: "stay_for_match",
        text: "Tetap di kota pertandingan atas permintaan ibumu sendiri",
        effects: { form: 0.04, mental_boost: -1, trait_intensity: { determined: 1 } },
      },
    ],
  },

  // ─── Media / Social (tambahan) ────────────────────────────────────────────

  {
    id: "media_false_transfer_rumor",
    category: "media_social",
    title: "Hoaks Transfer Tersebar Liar",
    description:
      "Portal bola lokal mengunggah 'breaking news' bahwa kamu sudah sepakati kontrak dengan klub rival — padahal itu 100% palsu.",
    condition: {},
    tone: "critical",
    priority: 3,
    max_occurrences: 3,
    social_reactions: [
      { role: "fan", handle: "@ UltrasSetia", text: "Bilang ini hoaks dong! Jangan tinggalkan kami!" },
      {
        role: "media",
        handle: "@ PortalBolaTerkini",
        text: "Sumber terpercaya mengonfirmasi deal sudah final. *unverified*",
      },
    ],
    choices: [
      {
        id: "clarify_statement",
        text: "Unggah klarifikasi resmi di media sosial",
        effects: { form: 0.05, mental_boost: 1, trait_intensity: { media_friendly: 2, composed: 1 } },
      },
      {
        id: "no_comment",
        text: "Diam saja, biarkan manajemen yang urus",
        effects: { trait_intensity: { composed: 1, introvert: 1 } },
      },
    ],
  },

  // ─── Psychology (tambahan) ────────────────────────────────────────────────

  {
    id: "psychology_form_slump",
    category: "psychology",
    title: "Tiga Laga Tanpa Kontribusi",
    description:
      "Tiga pertandingan berturut-turut tanpa gol, assist, atau rating di atas 6. Forum suporter mulai mempertanyakan layak-tidaknya kamu di starting XI.",
    condition: {},
    tone: "critical",
    priority: 4,
    max_occurrences: null,
    social_reactions: [
      { role: "critic", handle: "@ TabelForm", text: "Tiga laga nol kontribusi — kapan kembali ke peak-nya?" },
      { role: "fan", handle: "@ Doa12Suporter", text: "Masa sulit ini pasti berlalu. Kami tetap di belakangmu." },
    ],
    choices: [
      {
        id: "seek_sports_psychologist",
        text: "Minta konsultasi dengan psikolog olahraga klub",
        effects: { form: 0.08, mental_boost: 1, trait_intensity: { professional: 2, composed: 1 } },
      },
      {
        id: "train_obsessively",
        text: "Latihan ekstra sendiri hingga menemukan ritme",
        effects: { tech_boost: 1, attack_boost: 1, stamina: -0.12, trait_intensity: { determination: 2 } },
      },
      {
        id: "sink_into_doubt",
        text: "Tidak tahu harus bagaimana, mulai malas ke lapangan",
        effects: { form: -0.1, mental_boost: -1, trait_intensity: { fragile_mentally: 2, lazy: 1 } },
      },
    ],
  },

  // ─── Training / Development (tambahan) ───────────────────────────────────

  {
    id: "training_tactical_new_coach",
    category: "training_development",
    title: "Pelatih Baru Terapkan Sistem Berbeda",
    description:
      "Pelatih anyar membawa formasi 3-5-2 yang belum pernah kamu mainkan. Sesi video analisis berlangsung dua jam dan otak mulai kelelahan.",
    condition: {},
    tone: "neutral",
    priority: 3,
    max_occurrences: 2,
    choices: [
      {
        id: "study_hard",
        text: "Pulang bawa catatan, pelajari sistem baru sampai hafal",
        effects: {
          tech_boost: 1,
          mental_boost: 1,
          stamina: -0.08,
          trait_intensity: { quick_learner: 2, professional: 1 },
        },
      },
      {
        id: "wing_it",
        text: "Andalkan insting di lapangan, sistem baru bisa dipelajari pelan-pelan",
        effects: { form: 0.02, trait_intensity: { risk_taker: 1 } },
      },
    ],
  },

  // ─── Social (tambahan) ────────────────────────────────────────────────────

  {
    id: "social_sma_reunion",
    category: "social",
    title: "Reuni SMA: Dunia Terasa Berbeda",
    description:
      "Teman-teman SMA mengadakan reuni makan malam. Banyak yang masih mengenalmu sebagai 'si kurus yang suka bola' — sebelum semuanya berubah.",
    condition: { phase: ["pro_step", "rise"] },
    tone: "positive",
    priority: 2,
    max_occurrences: 1,
    social_reactions: [
      { role: "fan", handle: "@ AlumniSMAN", text: "Bangga punya teman sekelas yang sekarang main di Liga 1! 🙌" },
    ],
    choices: [
      {
        id: "enjoy_fully",
        text: "Nikmati malam itu sepenuh hati, pulang sebelum tengah malam",
        effects: { form: 0.06, mental_boost: 1, stamina: -0.05, trait_intensity: { extrovert: 2 } },
      },
      {
        id: "leave_early",
        text: "Datang sebentar lalu pamit karena besok ada sesi pagi",
        effects: { stamina: 0.04, trait_intensity: { professional: 1, introvert: 1 } },
      },
    ],
  },
];

// Roll whether an event triggers this week (~40% chance), filtered by career phase & traits
export function rollEventForPlayer(player: Player, occurredCounts: Record<string, number>): GameEvent | null {
  if (Math.random() > 0.4) return null;

  const phase = careerPhase(player.age);
  const eligible = EVENTS.filter((ev) => {
    if (ev.max_occurrences != null && (occurredCounts[ev.id] ?? 0) >= ev.max_occurrences) {
      return false;
    }
    if (ev.condition.phase && !ev.condition.phase.includes(phase)) {
      return false;
    }
    if (ev.condition.requires_trait && !ev.condition.requires_trait.every((t) => player.traits.includes(t))) {
      return false;
    }
    if (ev.condition.excludes_trait && ev.condition.excludes_trait.some((t) => player.traits.includes(t))) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((s, ev) => s + ev.priority, 0);
  let r = Math.random() * totalWeight;
  for (const ev of eligible) {
    r -= ev.priority;
    if (r <= 0) return ev;
  }
  return eligible[0];
}

// Apply chosen event outcome to DB and return a short Indonesian summary of effects
export function applyEventChoice(playerId: number, eventId: string, choiceId: string): string {
  const ev = EVENTS.find((e) => e.id === eventId);
  const choice = ev?.choices.find((c) => c.id === choiceId);
  const player = getPlayer(playerId);
  if (!ev || !choice || !player) return "";

  const eff = choice.effects;
  const summaryParts: string[] = [];

  const newForm = Math.min(1.0, Math.max(0.1, Number((player.form + (eff.form ?? 0)).toFixed(2))));
  if (eff.form) summaryParts.push(`Form ${eff.form > 0 ? "+" : ""}${Math.round(eff.form * 100)}%`);

  const newStamina = Math.min(1.0, Math.max(0.1, Number((player.stamina + (eff.stamina ?? 0)).toFixed(2))));
  if (eff.stamina) summaryParts.push(`Stamina ${eff.stamina > 0 ? "+" : ""}${Math.round(eff.stamina * 100)}%`);

  const dm = (eff.mental_boost ?? 0) * 2;
  const da = (eff.attack_boost ?? 0) * 2;
  const dt = (eff.tech_boost ?? 0) * 2;
  const dp = (eff.phys_boost ?? 0) * 2;

  if (dm) summaryParts.push(`Mental ${dm > 0 ? "+" : ""}${dm}`);
  if (da) summaryParts.push(`Finishing ${da > 0 ? "+" : ""}${da}`);
  if (dt) summaryParts.push(`Teknik ${dt > 0 ? "+" : ""}${dt}`);
  if (dp) summaryParts.push(`Fisik ${dp > 0 ? "+" : ""}${dp}`);

  const traits = [...player.traits];
  const intensity: Partial<Record<Trait, number>> = { ...player.trait_intensity };

  if (eff.trait_intensity) {
    for (const [k, delta] of Object.entries(eff.trait_intensity) as [Trait, number][]) {
      const cur = (intensity[k] ?? 0) + delta;
      intensity[k] = cur;
      // Threshold >= 3 unlocks trait (max 5, removes mutually exclusive opposite)
      if (cur >= 3 && !traits.includes(k)) {
        const opp = EXCLUSIVE_TRAITS[k];
        if (opp && traits.includes(opp)) {
          traits.splice(traits.indexOf(opp), 1);
          summaryParts.push(`Trait -${opp}`);
        }
        if (traits.length < 5) {
          traits.push(k);
          summaryParts.push(`Trait Baru: +${k}`);
        }
      } else if (cur <= -2 && traits.includes(k)) {
        traits.splice(traits.indexOf(k), 1);
        summaryParts.push(`Trait -${k}`);
      } else if (delta > 0) {
        summaryParts.push(`Kecenderungan +${k}`);
      }
    }
  }

  const db = getDB();
  db.run(
    `UPDATE players SET
       form = ?, stamina = ?,
       decisions = MIN(100, MAX(1, decisions + ?)),
       composure = MIN(100, MAX(1, composure + ?)),
       finishing = MIN(100, MAX(1, finishing + ?)),
       off_the_ball = MIN(100, MAX(1, off_the_ball + ?)),
       technique = MIN(100, MAX(1, technique + ?)),
       passing = MIN(100, MAX(1, passing + ?)),
       strength = MIN(100, MAX(1, strength + ?)),
       work_rate = MIN(100, MAX(1, work_rate + ?)),
       traits = ?, trait_intensity = ?
     WHERE id = ?`,
    [newForm, newStamina, dm, dm, da, da, dt, dt, dp, dp, JSON.stringify(traits), JSON.stringify(intensity), playerId],
  );

  return summaryParts.join(" · ") || "Tidak ada perubahan signifikan";
}
