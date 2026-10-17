# Name Generation Doc

**Version:** 0.1
**Status:** Reference & Design Spec
**Scope:** Country-based procedural name generation across the 3 reference games (`Football Agent`, `Footballer Career`, `My Legacy`) and target architecture for Game Bola.

---

## 1. Reference Games Comparison

| Aspect | Football Agent | Footballer Career | My Legacy | Game Bola (Current) |
| :--- | :--- | :--- | :--- | :--- |
| **Source File** | `assets/flutter_assets/data/names.db` + `libapp.so` | `package:air/SezonSimule/fikstur_bolumleri/isimveSoyisim.dart` (`libapp.so`) | `assets/index.android.bundle` (Hermes bytecode v98) | `game/src/data/indonesia.ts` + `game/src/engine/worldgen.ts` |
| **Storage Mechanism** | SQLite table `pla_names` (83,344 rows) + `nats` (212 countries) | Hardcoded Dart `Map<String, UlkeIsimVerisi> isimHavuzu` (~217 countries) | JS Object `NAMES_BY_COUNTRY` (~250 country codes) + default/fallback pools | TypeScript arrays `INDO_FIRST` & `INDO_LAST` |
| **Combination Method** | Offline pre-mixed full names (1 row picked per regen) | Runtime `pick(isimler) + " " + pick(soyisimler)` | Runtime `pick(male \| female) + " " + pick(last)` | Runtime `pick(INDO_FIRST) + " " + pick(INDO_LAST)` |
| **Gender Support** | Male only | Male only | Male & Female (`male`, `female`, `last`) for life-sim NPCs | Male only (currently) |
| **Avatar / Ethnicity Link** | `facee` integer (`0..3`) per row in `pla_names` | Flag only (`assets/Ulkeler/<country>.png`) | Separate appearance config | None yet |
| **Fallback for Minor Nations** | All 212 nations populated in SQLite (min ~100–300 rows) | Country/league key normalization via `_havuzAnahtari` | Deterministic LCG subset (`buildPool`) from 60-item international pool | Indonesia only (Phase 1 MVP) |

---

## 2. Game 1: Football Agent (`football_agent_decoded/`)

### 2.1 Database Schema (`names.db`)

Football Agent stores pre-generated full names in SQLite rather than combining first and last names at runtime:

```sql
CREATE TABLE "nats" (
  "id"        INTEGER UNIQUE,
  "name"      TEXT,           -- e.g. 'Indonesia'
  "kisa"      TEXT,           -- 3-letter code, e.g. 'IDN'
  "kita"      INTEGER DEFAULT 0, -- Continent ID
  "formation" INTEGER DEFAULT 0,
  "nation"    INTEGER,        -- Demonym, e.g. 'Indonesian'
  "color61"   TEXT,           -- JSON array of hex colors, e.g. '["#FF0000","#FFFFFF","#FF0000"]'
  PRIMARY KEY("id" AUTOINCREMENT)
);

CREATE TABLE "pla_names" (
  "id"    INTEGER UNIQUE,
  "name"  TEXT,    -- Pre-combined full name
  "nat"   INTEGER, -- FK -> nats.id
  "facee" INTEGER, -- Avatar ethnicity group (0..3)
  PRIMARY KEY("id" AUTOINCREMENT)
);
```

### 2.2 Pool Construction & Volume

- **Total rows:** 83,344 across 212 countries (`nats`).
- **Top countries by row count:** Spain (2,280), Argentina (1,956), Brazil (1,893), Germany (1,592), France (1,573), Italy (1,554), Colombia (1,487), England (1,364).
- **Indonesia (`nat = 90`, `kisa = 'IDN'`):** 300 rows (173 unique first names, 195 unique last names).
- **Offline cross-product artifact:** The pool was generated offline by scraping real club rosters (`Players24` / `Players25`), splitting first and last names, and crossing them within the same league/country. Because foreign/naturalized players in Liga 1 were included in the scrape, Indonesia's pool contains hybrids like:
  - `Marc Tri Laksono`, `Ilija Rumere`, `Stefano Wahudi`, `Andik Novriza`, `Febri Afif`, `Egy Nurcahyono`, `Ezra Satria`, `Manahati Basna`, `Irfan Simanjuntak`, `Hansamu Ronaldi`.

### 2.3 Ethnicity / Face Group (`facee`)

Each entry in `pla_names` carries a `facee` integer (`0..3`) mapped to sprite folders in `assets/flutter_assets/images/facee/` (`beyaz`, `siyah`, `asian`):
- `0`:49,199 rows — European / Latin American / SE Asian (e.g. England, Brazil, Indonesia)
- `1`: 22,677 rows — Mediterranean / Middle Eastern / Turkish (e.g. Türkiye)
- `2`: 8,017 rows — Sub-Saharan African / Black diaspora (e.g. Nigeria, plus subset of France/England)
- `3`: 3,451 rows — East Asian (e.g. Japan, Korea, China)

Because `facee` is stored **per name row** rather than per country, multi-ethnic countries (e.g. France, England, USA) naturally produce players whose face sprite matches the ethnic origin of their generated name.

### 2.4 Runtime Queries & In-Game Editor

- Loaded into memory via `pla_namess.fromMap` or queried per country:
  - `SELECT name, facee FROM pla_names WHERE nat = ?`
  - `SELECT id, name, facee FROM pla_names WHERE nat = ?`
- Includes an in-game editor (`package:footballagent61/editor.dart`) allowing users to add or delete country names via `INSERT INTO pla_names (name, nat, facee) VALUES (?, ?, ?)` and `DELETE FROM pla_names WHERE nat = ?`.

---

## 3. Game 2: Footballer Career (`footballer_career_decoded/`)

### 3.1 Data Structure (`isimveSoyisim.dart`)

Compiled inside `lib/arm64-v8a/libapp.so`, `package:air/SezonSimule/fikstur_bolumleri/isimveSoyisim.dart` defines an in-memory dictionary initialized via `init:isimHavuzu`:

```dart
class UlkeIsimVerisi {
  final List<String> isimler;     // First names
  final List<String> soyisimler;  // Last names / surnames
}

final Map<String, UlkeIsimVerisi> isimHavuzu = { ... };
```

### 3.2 Country Resolution & Usage

- **Key Normalization (`_havuzAnahtari@907057051`):** Normalizes country or league names into the canonical key used by `isimHavuzu` (matching the ~217 countries in `assets/flutter_assets/assets/Ulkeler/`).
- **Separate Surname Tracking (`soyisim` / `kadroSoyad`):** Unlike Football Agent, Footballer Career keeps `isim` (first name) and `soyisim` (last name) separate on the player state (`_aktifIsim`, `_aktifSoyisim`, `adSoyad`, `kadroSoyad`).
  - Why: Match commentary, transfer rumors, and news headlines (`assets/translations/tr.json` & `en.json`) heavily use `{soy}` (surname only) alongside `{ad}` (full name), plus Turkish possessive suffixes (`{soyIn}`).
- **Indonesia Pool Sample (from `libapp.so` string pool):**
  - `isimler`: `Marselino`, `Witan`, `Asnawi`, `Pratama`, `Bagus`, `Naufal`, `Rizky`, `Bambang`, `Kurnia`, etc.
  - `soyisimler`: `Lumbangaol`, `Sembiring`, `Manulang`, `Pakpahan`, etc.

---

## 4. Game 3: My Legacy (`my_legacy_decoded/`)

### 4.1 Architecture (`index.android.bundle`)

My Legacy has the most complete runtime name generator because its life-sim events require generating **male players**, **female NPCs** (mothers, sisters, partners/spouses), and **shared family surnames**.

The module exports:
- `MALE_NAMES` (65 default Turkish male names)
- `FEMALE_NAMES` (106 default Turkish female names)
- `LAST_NAMES` (118 default Turkish surnames)
- `NAMES_BY_COUNTRY` (dictionary mapping ~250 FIFA 3-letter and ISO 2-letter country codes to `{ male, female, last }`)
- `getCountryNames(countryCode)`
- `generateRandomName(gender, countryCode)`
- `getFamilyName(playerFullName, countryCode)`

### 4.2 Data Structure (`NAMES_BY_COUNTRY`)

Each country entry has 3 arrays (`male`, `female`, `last`), typically 12–40 items each:

```ts
const NAMES_BY_COUNTRY: Record<string, { male: string[]; female: string[]; last: string[] }> = {
  ID: {
    male: [
      "Budi", "Agus", "Bambang", "Adi", "Wahyu", "Joko",
      "Eko", "Rizky", "Andi", "Hendra", "Dimas", "Arif"
    ],
    female: [
      "Siti", "Dewi", "Sri", "Indah", "Ayu", "Putri",
      "Rina", "Lestari", "Maya", "Wulan", "Ratih", "Nur"
    ],
    last: [
      "Wijaya", "Saputra", "Hidayat", "Pratama", "Setiawan", "Suryanto",
      "Kurniawan", "Santoso", "Susanto", "Nugroho", "Rahmawati", "Hartono"
    ]
  },
  // ... 250+ country keys (ENG, BRA, ARG, DE, ES, FR, IT, ID, IN, JP, KR, etc.)
};
```

### 4.3 Lookup & Deterministic LCG Fallback (`getCountryNames` & `buildPool`)

Located at bytecode offsets `43309923..43310733` in `index.android.bundle`:

```ts
// Fallback international base pools (60 items each)
const INTL_MALE = ["Liam", "Noah", "Oliver", "James", "Elijah", "Mateo", "Lucas", ...];
const INTL_FEMALE = ["Olivia", "Emma", "Sophia", "Amelia", "Mia", "Ava", "Isabella", ...];
const INTL_LAST = ["Smith", "Johnson", "Brown", "Williams", "Miller", "Davis", "Garcia", ...];

const fallbackCache: Record<string, { male: string[]; female: string[]; last: string[] }> = {};

function buildPool(basePool: string[], seedKey: string, count = 20): string[] {
  // 1. Hash seedKey using charCodeAt
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) {
    seed = (seed * 31 + seedKey.charCodeAt(i)) | 0;
  }
  seed = Math.abs(seed) || 1;

  // 2. Deterministic Fisher-Yates shuffle via LCG (1103515245, 12345, 0x7fffffff)
  const copy = [...basePool];
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function getCountryNames(countryCode?: string) {
  const code = (countryCode || "TR").toUpperCase();
  if (NAMES_BY_COUNTRY[code]) return NAMES_BY_COUNTRY[code];
  if (code === "TR" || code === "TUR") {
    return { male: MALE_NAMES, female: FEMALE_NAMES, last: LAST_NAMES };
  }
  if (!fallbackCache[code]) {
    fallbackCache[code] = {
      male: buildPool(INTL_MALE, `${code}_male`, 20),
      female: buildPool(INTL_FEMALE, `${code}_female`, 20),
      last: buildPool(INTL_LAST, `${code}_last`, 20),
    };
  }
  return fallbackCache[code];
}

function generateRandomName(gender: "male" | "female" = "male", countryCode?: string): string {
  const pool = getCountryNames(countryCode);
  const firstPool = gender === "female" ? pool.female : pool.male;
  const first = firstPool[Math.floor(Math.random() * firstPool.length)];
  const last = pool.last[Math.floor(Math.random() * pool.last.length)];
  return `${first} ${last}`;
}
```

### 4.4 Family Surname Inheritance (`getFamilyName`)

Located at bytecode offset `45010822`:
- When generating parents or siblings in life-sim events, `getFamilyName(playerFullName, countryCode)` splits `playerFullName` by whitespace and extracts the last token so family members share the player's surname.
- If the player has a single-word name (mononym) or empty surname, it falls back to picking from `getCountryNames(countryCode).last`.

---

## 5. Takeaways for Game Bola

1. **Avoid Football Agent's Naive Roster Scrape for Local Pools:** Scraping Liga 1 rosters without filtering foreign players caused Football Agent to generate names like `Marc Tri Laksono` and `Ilija Widodo` for native Indonesian youth regens. Keep native pools (`INDO_FIRST`, `INDO_LAST` in `game/src/data/indonesia.ts`) distinct from foreign player pools.
2. **Adopt My Legacy's `{ male, female, last }` Structure + LCG Fallback:**
   - Needed once Life Sim events (partner, mother, sister) and foreign player quotas (Liga 1 `ForeignRuleSet`: max 8 foreign + 1 Asian) are active.
3. **Preserve Mononym / Single-Name Support for Indonesia:** Unlike European names, a small percentage (~10–15%) of Indonesian/Brazilian players use a single name or double given name without a western family surname; `getFamilyName` fallback handles this cleanly.
