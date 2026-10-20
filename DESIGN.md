# DESIGN.md — Game Bola

## Identity

Text-based football life simulator. Indonesian football universe.
Data-dense, event-driven, multi-mode (pemain / manajer / agen / pemilik / pundit).
Dibuat untuk satu pemain: developernya sendiri.

## Personality

Serius. Gritty. Realistis.
Seperti cek Livescore di warung sambil Persija main, bukan promo FIFA.
Tiga game referensi: Football Agent (status + data), Footballer Career (event + wheel),
My Legacy (milestone hidup) — digabung jadi satu.

## Palette

- Base: #0d1009 (hitam kehijau, turf malam hari)
- Surface: #141b11 (charcoal kehijau)
- Elevated: #1c2618
- Border: #243020 (subtle)
- Border2: #2e3e28
- Border3: #3a5032
- Text: #dde8cc (off-white kekuning, seperti kertas program pertandingan)
- Text2: #8aaa72 (hijau-abu-abu medium)
- Text3: #4a6040 (sangat redup)
- Accent: #d4a843 (emas trofi — satu-satunya warna hangat, identitas utama)
- Accent-bg: rgba(212,168,67,0.10)
- Win: #4caf70 (hijau terang untuk menang/positif)
- Loss: #e05050 (merah untuk kalah/cedera)
- Draw: #c8962a (amber gelap untuk seri)
- Info: #4fa8e0 (biru untuk Timnas/info)

## Typography

- Display (judul, skor besar): Oswald 700 — kondensed, sporty, atletik
- Body + UI: JetBrains Mono — data-terminal feel, konsisten dengan referensi game
- Semua uppercase section labels: JetBrains Mono 0.72rem, letter-spacing 0.08em

## Layout

- Mobile-first. Max-width content: 540px, centered.
- Padding base: 1rem kiri-kanan.
- Border radius: 4px (industrial, tidak soft, tidak harsh).

## Dials

ENERGY 2 / RHYTHM 2 / MOTION 1

## Identity Motif

Satu warna aksen emas (--accent) dipakai selektif:

- Tombol primer
- Badge posisi pemain
- Skor aktif di MatchWheel
- Nama judul game
  Tidak dipakai di background atau decoration.
  Simbol `▸` dipertahankan sebagai navigator konsisten (sudah ada di EventModal).
