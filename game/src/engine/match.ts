import type { Player, Club, MatchResult, MatchStats, GoalEvent } from "../types/index.js";

// ─── Zone weights ─────────────────────────────────────────────────────────────

const POSITION_ZONE: Record<string, "attack" | "mid" | "defense"> = {
  ST: "attack",
  LW: "attack",
  RW: "attack",
  AM: "attack",
  CM: "mid",
  DM: "mid",
  CB: "defense",
  LB: "defense",
  RB: "defense",
  GK: "defense",
};

function playerZoneScore(p: Player): number {
  switch (p.position) {
    case "ST":
      return (
        p.finishing * 0.35 +
        p.heading * 0.15 +
        p.strength * 0.10 +
        p.composure * 0.15 +
        p.off_the_ball * 0.15 +
        p.technique * 0.10
      );
    case "LW":
    case "RW":
      return (
        p.dribbling * 0.30 +
        p.pace * 0.25 +
        p.crossing * 0.20 +
        p.technique * 0.15 +
        p.agility * 0.10
      );
    case "AM":
      return (
        p.passing * 0.25 +
        p.vision * 0.25 +
        p.finishing * 0.20 +
        p.anticipation * 0.15 +
        p.decisions * 0.15
      );
    case "CM":
      return (
        p.passing * 0.25 +
        p.vision * 0.20 +
        p.decisions * 0.20 +
        p.work_rate * 0.15 +
        p.technique * 0.10 +
        p.positioning * 0.10
      );
    case "DM":
      return (
        p.positioning * 0.25 +
        p.decisions * 0.20 +
        p.tackling * 0.20 +
        p.work_rate * 0.15 +
        p.strength * 0.10 +
        p.anticipation * 0.10
      );
    case "CB":
      return (
        p.positioning * 0.25 +
        p.heading * 0.20 +
        p.tackling * 0.20 +
        p.strength * 0.15 +
        p.anticipation * 0.10 +
        p.decisions * 0.10
      );
    case "LB":
    case "RB":
      return (
        p.positioning * 0.20 +
        p.pace * 0.20 +
        p.tackling * 0.15 +
        p.crossing * 0.15 +
        p.work_rate * 0.15 +
        p.strength * 0.15
      );
    case "GK":
      return (
        p.reflexes * 0.35 +
        p.handling * 0.25 +
        p.gk_positioning * 0.20 +
        p.one_on_ones * 0.15 +
        p.command * 0.05
      );
  }
}

function zoneRating(players: Player[], zone: "attack" | "mid" | "defense"): number {
  const zp = players.filter((p) => POSITION_ZONE[p.position] === zone);
  if (zp.length === 0) return 25;

  if (zone === "attack" || zone === "mid") {
    return zp.reduce((s, p) => s + playerZoneScore(p), 0) / zp.length;
  }

  // defense: (gkRating + mean(outfieldDefRatings)) / 2
  const gk = zp.find((p) => p.position === "GK");
  const outfield = zp.filter((p) => p.position !== "GK");
  const gkRating = gk ? playerZoneScore(gk) : 0;
  const defRating =
    outfield.length > 0 ? outfield.reduce((s, p) => s + playerZoneScore(p), 0) / outfield.length : 0;
  return gk ? (gkRating + defRating) / 2 : defRating;
}

function mean(players: Player[], attr: keyof Player): number {
  if (players.length === 0) return 0.5;
  return players.reduce((s, p) => s + (p[attr] as number), 0) / players.length;
}

// ─── xG formula ───────────────────────────────────────────────────────────────

function calcXG(
  attackRating: number,
  defenseRating: number,
  midAdvantage: number,
  formFactor: number,
  moraleFactor: number,
  staminaFactor: number,
  homeFactor: number,
  baseXG: number,
): number {
  return (
    baseXG *
    Math.pow(attackRating / Math.max(defenseRating, 1), 0.6) *
    Math.pow(midAdvantage, 0.3) *
    homeFactor *
    formFactor *
    moraleFactor *
    staminaFactor
  );
}

function poisson(lambda: number): number {
  // Knuth algorithm
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function noise(n: number): number {
  return Math.floor(Math.random() * (2 * n + 1)) - n;
}

// ─── Goal attribution ─────────────────────────────────────────────────────────

const GOAL_POSITION_WEIGHT: Record<string, number> = {
  ST: 1.0,
  LW: 0.8,
  RW: 0.8,
  AM: 0.6,
  CM: 0.3,
  DM: 0.1,
  CB: 0.1,
  LB: 0.1,
  RB: 0.1,
  GK: 0.0,
};

function attributeGoal(players: Player[], minute: number, clubId: number): GoalEvent {
  const weights = players.map((p) => {
    const composureMod = 0.80 + p.composure / 500;
    return p.finishing * (GOAL_POSITION_WEIGHT[p.position] ?? 0.1) * p.form * composureMod;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  let scorer = players[0];
  for (let i = 0; i < players.length; i++) {
    rand -= weights[i];
    if (rand <= 0) {
      scorer = players[i];
      break;
    }
  }

  // Simple assist: pick from remaining attack/mid players
  const assistCandidates = players.filter((p) => p.id !== scorer.id && GOAL_POSITION_WEIGHT[p.position] >= 0.3);
  const assist =
    assistCandidates.length > 0 ? assistCandidates[Math.floor(Math.random() * assistCandidates.length)] : null;

  return {
    minute,
    scorer_id: scorer.id,
    assist_id: assist?.id ?? null,
    club_id: clubId,
    type: "open_play",
  };
}

// ─── Full Sim ─────────────────────────────────────────────────────────────────

export type TacticalMentality = "attacking" | "balanced" | "defensive";

export interface SimInput {
  home_club: Club;
  away_club: Club;
  home_players: Player[];
  away_players: Player[];
  league_level: number; // 1 = top, higher = lower
  date: number;
  league_id: number;
  match_id: number;
  home_mentality?: TacticalMentality;
  away_mentality?: TacticalMentality;
  home_staff_bonus?: number; // multiplier e.g. 1.0 to 1.15
  away_staff_bonus?: number;
}

const BASE_XG_BY_LEVEL: Record<number, number> = { 1: 1.2, 2: 1.1, 3: 1.0, 4: 0.95 };

function mentalityModifiers(m: TacticalMentality = "balanced"): { att: number; def: number } {
  if (m === "attacking") return { att: 1.14, def: 0.90 };
  if (m === "defensive") return { att: 0.88, def: 1.14 };
  return { att: 1.0, def: 1.0 };
}

export function fullSim(input: SimInput): MatchResult {
  const { home_club, away_club, home_players, away_players, league_level, date, league_id, match_id } = input;
  const baseXG = BASE_XG_BY_LEVEL[league_level] ?? 0.9;
  const hMod = mentalityModifiers(input.home_mentality);
  const aMod = mentalityModifiers(input.away_mentality);
  const hStaff = input.home_staff_bonus ?? 1.0;
  const aStaff = input.away_staff_bonus ?? 1.0;

  const homeAttack = zoneRating(home_players, "attack") * hMod.att * hStaff;
  const homeMid = zoneRating(home_players, "mid") * hStaff;
  const homeDefense = zoneRating(home_players, "defense") * hMod.def * hStaff;

  const awayAttack = zoneRating(away_players, "attack") * aMod.att * aStaff;
  const awayMid = zoneRating(away_players, "mid") * aStaff;
  const awayDefense = zoneRating(away_players, "defense") * aMod.def * aStaff;

  const midAdvHome = homeMid / Math.max(homeMid + awayMid, 1);
  const midAdvAway = 1 - midAdvHome;

  const avgStamHome = mean(home_players, "stamina");
  const avgStamAway = mean(away_players, "stamina");
  const stamPenaltyHome = avgStamHome < 0.3 ? 0.75 : avgStamHome < 0.5 ? 0.9 : 1.0;
  const stamPenaltyAway = avgStamAway < 0.3 ? 0.75 : avgStamAway < 0.5 ? 0.9 : 1.0;

  const formHome = (0.85 + mean(home_players, "form") * 0.3) * stamPenaltyHome;
  const formAway = (0.85 + mean(away_players, "form") * 0.3) * stamPenaltyAway;

  const moraleHome = 0.9 + (home_club.club_morale / 100) * 0.2;
  const moraleAway = 0.9 + (away_club.club_morale / 100) * 0.2;

  const staminaHome = 0.8 + avgStamHome * 0.25;
  const staminaAway = 0.8 + avgStamAway * 0.25;

  const xgHome = calcXG(homeAttack, awayDefense, midAdvHome, formHome, moraleHome, staminaHome, 1.15, baseXG);
  const xgAway = calcXG(awayAttack, homeDefense, midAdvAway, formAway, moraleAway, staminaAway, 1.0, baseXG);

  const homeGoals = poisson(xgHome);
  const awayGoals = poisson(xgAway);

  const stats: MatchStats = {
    home_shots_on_target: Math.max(0, Math.round(xgHome * 3.5 + noise(1))),
    away_shots_on_target: Math.max(0, Math.round(xgAway * 3.5 + noise(1))),
    home_shots: 0,
    away_shots: 0,
    home_possession: Math.round(40 + midAdvHome * 20),
    away_possession: 0,
    home_corners: Math.max(0, Math.round(xgHome * 4.0 + noise(2))),
    away_corners: Math.max(0, Math.round(xgAway * 4.0 + noise(2))),
    home_xg: Math.round(xgHome * 100) / 100,
    away_xg: Math.round(xgAway * 100) / 100,
    home_yellow_cards: poisson(0.35),
    away_yellow_cards: poisson(0.35),
    home_red_cards: Math.random() < 0.04 ? 1 : 0,
    away_red_cards: Math.random() < 0.04 ? 1 : 0,
  };
  stats.home_shots = Math.max(stats.home_shots_on_target, Math.round(stats.home_shots_on_target * 2.8 + noise(2)));
  stats.away_shots = Math.max(stats.away_shots_on_target, Math.round(stats.away_shots_on_target * 2.8 + noise(2)));
  stats.away_possession = 100 - stats.home_possession;

  // Attribute goals to players
  const scorers: GoalEvent[] = [];
  const homeMinutes = generateMinutes(homeGoals);
  const awayMinutes = generateMinutes(awayGoals);
  for (const m of homeMinutes) scorers.push(attributeGoal(home_players, m, home_club.id));
  for (const m of awayMinutes) scorers.push(attributeGoal(away_players, m, away_club.id));
  scorers.sort((a, b) => a.minute - b.minute);

  return {
    id: match_id,
    league_id,
    home_club: home_club.id,
    away_club: away_club.id,
    home_goals: homeGoals,
    away_goals: awayGoals,
    date,
    stats,
    scorers,
  };
}

function generateMinutes(goals: number): number[] {
  return Array.from({ length: goals }, () => Math.floor(Math.random() * 90) + 1).sort((a, b) => a - b);
}

// ─── Wheel / Tonton Match (§2 GAME-ENGINE.md) ─────────────────────────────────

export interface WheelSlice {
  key: string;
  label: string;
  weight: number; // percentage 0–100 (sum ~ 100)
  color: string;
}

export interface MatchStep {
  minute: number;
  attacking_club_id: number;
  attacking_club_name: string;
  team_slices: [WheelSlice, WheelSlice]; // [home, away]
  event_slices: WheelSlice[];
  chosen_index: number;
  outcome_key: string;
  outcome_label: string;
  is_goal: boolean;
  home_goals: number;
  away_goals: number;
  commentary: string;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Commentary Pool (§2.3 GAME-ENGINE.md) ────────────────────────────────────

export type CommentaryOutcome =
  | "goal"
  | "chance_saved"
  | "chance_missed"
  | "tackle"
  | "foul"
  | "quiet"
  | "yellow_card"
  | "red_card";

export const COMMENTARY_POOL: Record<CommentaryOutcome, readonly string[]> = {
  goal: [
    "GOL! {scorer} menjebol gawang lawan untuk {team}{assist}!",
    "GOL SPEKTAKULER! Sepakan keras {scorer} membuat pendukung {team} bersorak{assist}!",
    "GOL! Penyelesaian dingin dari {scorer} menambah keunggulan {team}{assist}!",
    "GOL INDAH! {scorer} menuntaskan skema serangan {team} dengan sempurna{assist}!",
    "GOL! Sundulan tajam {scorer} menggetarkan jala lawan untuk {team}{assist}!",
    "GOL! {scorer} lolos dari kawalan bek dan mencetak gol bagi {team}{assist}!",
    "GOL! Tembakan melengkung {scorer} tak mampu dibendung kiper, poin penuh bagi {team}{assist}!",
    "GOL! {scorer} menyambar bola liar di kotak penalti untuk membawa {team} unggul{assist}!",
    "GOL CANTIK! Aksi individu memukau {scorer} berbuah gol manis bagi {team}{assist}!",
    "GOL! {team} berpesta setelah {scorer} menempatkan bola tepat ke sudut gawang{assist}!",
  ],
  chance_saved: [
    "Tembakan keras pemain {team} berhasil ditepis dengan gemilang oleh kiper lawan!",
    "Peluang emas {team} digagalkan lewat penyelamatan akrobatik penjaga gawang!",
    "Kiper tampil sigap menangkap sepakan terarah dari lini serang {team}.",
    "Refleks luar biasa kiper menggagalkan tembakan jarak dekat {team}!",
    "Sepakan melengkung dari {team} masih mampu dijangkau ujung jari kiper.",
    "Penyelamatan krusial! Kiper menepis bola hasil tendangan keras {team}.",
    "Serangan berbahaya {team} mentah di tangan kiper yang berdiri di posisi tepat.",
    "Duel satu lawan satu dimenangkan kiper, peluang matang {team} pun kandas!",
    "Sundulan tajam pemain {team} berhasil diamankan kiper tepat di garis gawang.",
    "Tembakan mendatar dari {team} ditepis keluar lapangan oleh penjaga gawang.",
  ],
  chance_missed: [
    "Peluang {team} terbuang percuma setelah bola melambung tinggi di atas mistar.",
    "Sayang sekali! Sepakan pemain {team} masih melebar tipis di sisi gawang.",
    "TIANG GAWANG! Tembakan keras dari {team} hanya membentur mistar gawang!",
    "Penyelesaian akhir {team} kurang tenang sehingga bola melenceng jauh dari sasaran.",
    "Sundulan pemain {team} menyambut umpan silang masih belum menemui target.",
    "Tendangan bebas berbahaya dari {team} meluncur tipis di atas palang gawang.",
    "Hakim garis mengangkat bendera, serangan berbahaya {team} terjebak offside.",
    "Sepakan voli spekulatif dari {team} masih menyamping dari gawang lawan.",
    "Peluang terbuka bagi {team}, namun tembakan akhirnya gagal mengarah ke gawang.",
    "Bola hasil tekanan {team} hanya melintas di depan mulut gawang tanpa sambutan.",
  ],
  tackle: [
    "Pertahanan rapat! Bek lawan dengan sigap memotong umpan terobosan berbahaya.",
    "Tekel bersih yang sangat krusial berhasil menghentikan laju penyerang di kotak penalti.",
    "Barisan belakang tampil disiplin menutup ruang tembak dan menyapu bola keluar.",
    "Intersep cerdas di lini tengah langsung mematahkan alur serangan lawan.",
    "Duel fisik dimenangkan bek bertahan, bola berhasil diamankan tanpa pelanggaran.",
    "Sapuan kepala yang lugas dari jantung pertahanan menjauhkan bola dari zona bahaya.",
    "Blok berani dari pemain belakang menggagalkan percobaan tembakan ke arah gawang.",
    "Koordinasi lini pertahanan yang solid membuat penyerang lawan kehilangan bola.",
    "Antisipasi sempurna! Umpan silang berbahaya berhasil dipotong sebelum sampai ke target.",
    "Tekel meluncur yang presisi merebut kembali penguasaan bola di area krusial.",
  ],
  foul: [
    "Pelanggaran dilakukan pemain {team} saat mencoba menghentikan serangan lawan.",
    "Wasit meniup peluit, pelanggaran keras terjadi dari lini tengah {team}.",
    "Pemain {team} menarik baju lawan hingga terjatuh, tendangan bebas diberikan.",
    "Tekel terlambat dari pemain {team} berbuah tendangan bebas bagi lawan.",
    "Dorongan dari belakang oleh pemain {team} langsung dianggap pelanggaran oleh wasit.",
    "Duel udara berujung pelanggaran setelah pemain {team} mengangkat kaki terlalu tinggi.",
    "Wasit memberikan peringatan lisan kepada pemain {team} usai pelanggaran di sisi sayap.",
    "Laju serangan terhenti akibat hadangan ilegal dari pemain bertahan {team}.",
    "Pelanggaran taktis dilakukan {team} demi meredam skema serangan balik cepat.",
    "Wasit menunjuk titik pelanggaran setelah pemain {team} menjatuhkan lawan.",
  ],
  quiet: [
    "Kedua tim masih berhati-hati memainkan bola di lini tengah mencari celah pertahanan.",
    "Tempo pertandingan sedikit melambat, bola mengalir dari kaki ke kaki di area tengah.",
    "Pertarungan sengit di lini tengah membuat belum ada peluang bersih yang tercipta.",
    "Para pemain tampak mengatur napas sambil menjaga kedalaman formasi masing-masing.",
    "Sirkulasi umpan pendek diperagakan untuk memancing lawan keluar dari sarangnya.",
    "Belum ada celah berarti, kedua kesebelasan sama-sama rapat menjaga garis pertahanan.",
    "Bola lebih banyak bergulir di area tengah lapangan tanpa ancaman serius ke gawang.",
    "Serangan balik cepat coba dibangun, namun lini pertahanan lawan sudah kembali rapi.",
    "Kedua pelatih tampak memberikan instruksi dari pinggir lapangan di tengah duel taktis ini.",
    "Penguasaan bola berpindah tangan beberapa kali akibat ketatnya pressing di lini tengah.",
  ],
  yellow_card: [
    "KARTU KUNING! Wasit mengeluarkan kartu kuning untuk pemain {team} akibat tekel keras.",
    "Pemain {team} diganjar kartu kuning setelah melakukan pelanggaran taktis.",
    "Kartu kuning diberikan kepada pemain {team} karena mengulur-ulur waktu pertandingan.",
    "Protes berlebihan kepada wasit membuat pemain {team} dihadiahi kartu kuning.",
    "Tekel dari belakang memaksa wasit merogoh kartu kuning untuk pemain {team}.",
    "Kartu kuning bagi {team} usai menjatuhkan lawan yang sedang melancarkan serangan balik.",
    "Wasit tanpa ragu mengangkat kartu kuning untuk pelanggaran ceroboh pemain {team}.",
    "Peringatan keras berupa kartu kuning diterima pemain {team} di laga yang kian memanas.",
    "Tarikan kaus yang jelas membuat pemain {team} harus rela menerima kartu kuning.",
    "Pelanggaran berulang kali akhirnya berbuah kartu kuning bagi penggawa {team}.",
  ],
  red_card: [
    "KARTU MERAH! Tekel dua kaki yang sangat berbahaya membuat pemain {team} diusir keluar!",
    "KARTU MERAH LANGSUNG! {team} harus bermain dengan sepuluh orang usai pelanggaran brutal!",
    "Bencana bagi {team}! Wasit mencabut kartu merah karena menggagalkan peluang emas lawan!",
    "KARTU MERAH! Emosi tak terkendali membuat pemain {team} mendapat pengusiran dari wasit!",
    "Wasit menunjuk ruang ganti! Kartu merah diberikan kepada pemain {team} akibat sikutan keras!",
    "KARTU MERAH! Akumulasi pelanggaran keras memaksa pemain {team} meninggalkan lapangan lebih cepat!",
    "Petaka untuk {team}! Pelanggaran sebagai orang terakhir berujung kartu merah mutlak!",
    "KARTU MERAH! Keputusan tegas wasit mengusir pemain {team} mengubah jalannya laga!",
    "Tindakan tidak sportif membuat pemain {team} langsung diganjar kartu merah oleh wasit!",
    "KARTU MERAH! Tekel berbahaya dari pemain {team} tak bisa ditoleransi lagi oleh wasit!",
  ],
};

const lastCommentaryIdx: Partial<Record<CommentaryOutcome, number>> = {};

export function commentary(
  outcome: CommentaryOutcome,
  team: string = "",
  scorer?: string,
  assist?: string | null,
): string {
  const pool = COMMENTARY_POOL[outcome];
  const prev = lastCommentaryIdx[outcome] ?? -1;
  let idx = Math.floor(Math.random() * (pool.length - (prev >= 0 ? 1 : 0)));
  if (prev >= 0 && idx >= prev) idx++;
  lastCommentaryIdx[outcome] = idx;

  const assistText = assist ? ` (Assist: ${assist})` : "";
  return pool[idx]
    .replace("{scorer}", scorer || "Pemain")
    .replace("{team}", team)
    .replace("{assist}", assistText);
}

// Non-uniform minute generator: higher density in 30–45' and 75–90'
function sampleAttackMinute(): number {
  const r = Math.random();
  if (r < 0.25) return 30 + Math.floor(Math.random() * 16); // 30–45
  if (r < 0.50) return 75 + Math.floor(Math.random() * 16); // 75–90
  return 1 + Math.floor(Math.random() * 90);
}

export function wheelSim(input: SimInput): { result: MatchResult; steps: MatchStep[] } {
  const { home_club, away_club, home_players, away_players, league_level, date, league_id, match_id } = input;
  const baseXG = BASE_XG_BY_LEVEL[league_level] ?? 0.9;
  const hMod = mentalityModifiers(input.home_mentality);
  const aMod = mentalityModifiers(input.away_mentality);
  const hStaff = input.home_staff_bonus ?? 1.0;
  const aStaff = input.away_staff_bonus ?? 1.0;

  const homeAttack = zoneRating(home_players, "attack") * hMod.att * hStaff;
  const homeMid = zoneRating(home_players, "mid") * hStaff;
  const homeDefense = zoneRating(home_players, "defense") * hMod.def * hStaff;

  const awayAttack = zoneRating(away_players, "attack") * aMod.att * aStaff;
  const awayMid = zoneRating(away_players, "mid") * aStaff;
  const awayDefense = zoneRating(away_players, "defense") * aMod.def * aStaff;

  const midAdvHome = homeMid / Math.max(homeMid + awayMid, 1);
  const midAdvAway = 1 - midAdvHome;

  const formHome = 0.85 + mean(home_players, "form") * 0.3;
  const formAway = 0.85 + mean(away_players, "form") * 0.3;
  const moraleHome = 0.9 + (home_club.club_morale / 100) * 0.2;
  const moraleAway = 0.9 + (away_club.club_morale / 100) * 0.2;
  const staminaHome = 0.8 + mean(home_players, "stamina") * 0.25;
  const staminaAway = 0.8 + mean(away_players, "stamina") * 0.25;

  const xgHome = calcXG(homeAttack, awayDefense, midAdvHome, formHome, moraleHome, staminaHome, 1.15, baseXG);
  const xgAway = calcXG(awayAttack, homeDefense, midAdvAway, formAway, moraleAway, staminaAway, 1.0, baseXG);

  const homeShare = xgHome / Math.max(xgHome + xgAway, 0.1);
  const homePct = Math.round(homeShare * 100);
  const teamSlices: [WheelSlice, WheelSlice] = [
    { key: "HOME", label: home_club.name, weight: homePct, color: "#2a6" },
    { key: "AWAY", label: away_club.name, weight: 100 - homePct, color: "#38c" },
  ];

  // Number of attack sequences (~22–28)
  const totalAttacks = Math.max(14, Math.min(32, poisson(22)));
  const minutes = Array.from({ length: totalAttacks }, sampleAttackMinute).sort((a, b) => a - b);

  let homeGoals = 0;
  let awayGoals = 0;
  const scorers: GoalEvent[] = [];
  const stats: MatchStats = {
    home_shots: 0,
    away_shots: 0,
    home_shots_on_target: 0,
    away_shots_on_target: 0,
    home_possession: Math.round(40 + midAdvHome * 20),
    away_possession: 100 - Math.round(40 + midAdvHome * 20),
    home_corners: 0,
    away_corners: 0,
    home_xg: Math.round(xgHome * 100) / 100,
    away_xg: Math.round(xgAway * 100) / 100,
    home_yellow_cards: 0,
    away_yellow_cards: 0,
    home_red_cards: 0,
    away_red_cards: 0,
  };

  const steps: MatchStep[] = [];

  for (const minute of minutes) {
    const isHome = Math.random() < homeShare;
    const attClub = isHome ? home_club : away_club;
    const defClub = isHome ? away_club : home_club;
    const attPlayers = isHome ? home_players : away_players;
    const attRating = isHome ? homeAttack : awayAttack;
    const defRating = isHome ? awayDefense : homeDefense;
    const teamXG = isHome ? xgHome : xgAway;
    const expectedTeamAttacks = Math.max(4, totalAttacks * (isHome ? homeShare : 1 - homeShare));

    // Calibrate GOAL weight so expected goals across match converges to teamXG (§ Wheel Calibration Fix)
    const nonGoalSlices = [
      { key: "SAVE", label: "🧤 Tepis Kiper", raw: 6 * (attRating / 10), color: "#39d" },
      { key: "DEFENSE", label: "🛡️ Sapuan Bek", raw: 10 * (defRating / 10), color: "#567" },
      { key: "OUT", label: "💨 Melenceng / Offside", raw: 8, color: "#666" },
      { key: "CORNER", label: "🚩 Sepak Pojok", raw: 6, color: "#a83" },
      { key: "COUNTER", label: "⚡ Serangan Balik", raw: 5, color: "#85c" },
      { key: "FOUL", label: "🟨 Pelanggaran", raw: 5, color: "#c92" },
      { key: "FREEKICK", label: "🎯 Tendangan Bebas", raw: 4, color: "#4a9" },
      { key: "WOODWORK", label: "🥅 Tiang Gawang", raw: 2, color: "#d64" },
      { key: "PENALTY", label: "🚨 Penalti", raw: 1, color: "#e34" },
    ];
    const nonGoalTotal = nonGoalSlices.reduce((s, x) => s + x.raw, 0);
    const goalConversionTarget = Math.min(0.45, Math.max(0.02, teamXG / expectedTeamAttacks));
    const goalRaw = (goalConversionTarget * nonGoalTotal) / (1 - goalConversionTarget);
    const rawSlices = [
      { key: "GOAL", label: "⚽ GOL", raw: goalRaw, color: "#2c7" },
      ...nonGoalSlices,
    ];

    const rawTotal = rawSlices.reduce((s, x) => s + x.raw, 0);
    const eventSlices: WheelSlice[] = rawSlices.map((s) => ({
      key: s.key,
      label: s.label,
      weight: Math.max(1, Math.round((s.raw / rawTotal) * 100)),
      color: s.color,
    }));

    // Spin event wheel
    const sumWeights = eventSlices.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * sumWeights;
    let chosenIdx = 0;
    for (let i = 0; i < eventSlices.length; i++) {
      r -= eventSlices[i].weight;
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }

    const chosen = eventSlices[chosenIdx];
    const attacker = pickRandom(attPlayers.filter((p) => p.position !== "GK")) ?? attPlayers[0];

    let isGoal = false;
    let stepCommentary = "";

    switch (chosen.key) {
      case "GOAL": {
        isGoal = true;
        const gEvt = attributeGoal(attPlayers, minute, attClub.id);
        scorers.push(gEvt);
        if (isHome) {
          homeGoals++;
          stats.home_shots++;
          stats.home_shots_on_target++;
        } else {
          awayGoals++;
          stats.away_shots++;
          stats.away_shots_on_target++;
        }
        const scorerName = attPlayers.find((p) => p.id === gEvt.scorer_id)?.name || attacker.name || "Pemain";
        const assistName = gEvt.assist_id ? attPlayers.find((p) => p.id === gEvt.assist_id)?.name : null;
        stepCommentary = `${commentary("goal", attClub.name, scorerName, assistName)} Skor ${homeGoals}–${awayGoals}.`;
        break;
      }
      case "PENALTY": {
        const penScored = Math.random() < 0.78;
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        if (penScored) {
          isGoal = true;
          const gEvt = attributeGoal(attPlayers, minute, attClub.id);
          gEvt.type = "penalty";
          scorers.push(gEvt);
          if (isHome) {
            homeGoals++;
            stats.home_shots_on_target++;
          } else {
            awayGoals++;
            stats.away_shots_on_target++;
          }
          const scorerName = attPlayers.find((p) => p.id === gEvt.scorer_id)?.name || attacker.name || "Algojo";
          stepCommentary = `PENALTI! ${commentary("goal", attClub.name, scorerName)} Skor ${homeGoals}–${awayGoals}.`;
        } else {
          stepCommentary = `PENALTI GAGAL! ${commentary("chance_saved", attClub.name)}`;
        }
        break;
      }
      case "SAVE": {
        if (isHome) {
          stats.home_shots++;
          stats.home_shots_on_target++;
        } else {
          stats.away_shots++;
          stats.away_shots_on_target++;
        }
        stepCommentary = commentary("chance_saved", attClub.name);
        break;
      }
      case "WOODWORK": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        stepCommentary = commentary("chance_missed", attClub.name);
        break;
      }
      case "CORNER": {
        if (isHome) stats.home_corners++;
        else stats.away_corners++;
        stepCommentary = commentary("chance_missed", attClub.name);
        break;
      }
      case "FREEKICK": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        stepCommentary = commentary("chance_missed", attClub.name);
        break;
      }
      case "FOUL": {
        const cardRoll = Math.random();
        if (cardRoll < 0.04) {
          if (isHome) stats.away_red_cards++;
          else stats.home_red_cards++;
          stepCommentary = commentary("red_card", defClub.name);
        } else if (cardRoll < 0.38) {
          if (isHome) stats.away_yellow_cards++;
          else stats.home_yellow_cards++;
          stepCommentary = commentary("yellow_card", defClub.name);
        } else {
          stepCommentary = commentary("foul", defClub.name);
        }
        break;
      }
      case "COUNTER": {
        stepCommentary = commentary("quiet", defClub.name);
        break;
      }
      case "OUT": {
        if (isHome) stats.home_shots++;
        else stats.away_shots++;
        stepCommentary = commentary("chance_missed", attClub.name);
        break;
      }
      default: {
        stepCommentary = commentary("tackle", defClub.name);
        break;
      }
    }

    steps.push({
      minute,
      attacking_club_id: attClub.id,
      attacking_club_name: attClub.name,
      team_slices: teamSlices,
      event_slices: eventSlices,
      chosen_index: chosenIdx,
      outcome_key: chosen.key,
      outcome_label: chosen.label,
      is_goal: isGoal,
      home_goals: homeGoals,
      away_goals: awayGoals,
      commentary: stepCommentary,
    });
  }

  return {
    result: {
      id: match_id,
      league_id,
      home_club: home_club.id,
      away_club: away_club.id,
      home_goals: homeGoals,
      away_goals: awayGoals,
      date,
      stats,
      scorers,
    },
    steps,
  };
}

