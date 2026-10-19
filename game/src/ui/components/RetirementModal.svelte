<script lang="ts">
  import type { RetirementOptions, ManagerClubOffer, ClubStaffOffer } from "../../engine/retirement.js";
  import type { ClubStaffLevels } from "../../engine/scheduler.js";

  interface Props {
    options: RetirementOptions;
    onchoose: (
      choice: "manager" | "agent" | "staff" | "pundit" | "child",
      extraData?: {
        clubId?: number;
        agencyName?: string;
        role?: keyof ClubStaffLevels;
        childName?: string;
      },
    ) => void;
    onclose: () => void;
  }

  let { options, onchoose, onclose }: Props = $props();

  type Tab = "manager" | "agent" | "staff" | "pundit" | "child";
  let activeTab = $state<Tab>("manager");

  // Manager path form
  let selectedClubId = $state<number>(0);

  // Agent path form
  let customAgencyName = $state("");

  // Staff path form
  let selectedStaffRole = $state<keyof ClubStaffLevels>("coach");
  let selectedStaffClubId = $state<number>(0);

  // Child path form
  let customChildName = $state("");

  $effect(() => {
    if (!selectedClubId && options.managerOffers[0]) {
      selectedClubId = options.managerOffers[0].clubId;
    }
    if (!customAgencyName) {
      customAgencyName = options.agentInfo.defaultAgencyName;
    }
    if (!selectedStaffClubId && options.staffOffers[0]) {
      selectedStaffClubId = options.staffOffers[0].clubId;
    }
    if (!customChildName) {
      customChildName = `${options.playerName} Jr.`;
    }
  });

  function formatMoney(amount: number): string {
    if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)} Miliar`;
    if (amount >= 1_000_000) return `Rp ${Math.round(amount / 1_000_000)} Juta`;
    return `Rp ${amount.toLocaleString("id-ID")}`;
  }

  function submitManager() {
    onchoose("manager", { clubId: selectedClubId });
  }

  function submitAgent() {
    onchoose("agent", { agencyName: customAgencyName.trim() || options.agentInfo.defaultAgencyName });
  }

  function submitStaff() {
    onchoose("staff", { clubId: selectedStaffClubId, role: selectedStaffRole });
  }

  function submitPundit() {
    onchoose("pundit");
  }

  function submitChild() {
    onchoose("child", { childName: customChildName.trim() });
  }
</script>

<div class="retirement-backdrop">
  <div class="retirement-modal">
    <!-- Header -->
    <div class="modal-header">
      <div class="header-titles">
        <span class="badge-retirement">🏆 GANTUNG SEPATU & TRANSISI KARIR</span>
        <h2>Babak Baru Kehidupan Sepak Bola</h2>
        <p class="subtitle">
          Karier bermainmu sebagai pesepakbola profesional telah mencapai garis akhir. Kini saatnya memilih jalur kehidupan profesional berikutnya!
        </p>
      </div>
      <button class="close-btn" onclick={onclose} title="Tutup">✕</button>
    </div>

    <!-- Player Career Highlights -->
    <div class="career-stats-card">
      <div class="stat-box">
        <span class="stat-label">Pemain</span>
        <span class="stat-value">{options.playerName}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">Usia Akhir</span>
        <span class="stat-value">{options.age} Tahun</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">Rating Overall</span>
        <span class="stat-value highlight">{options.overall}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">Caps / Laga</span>
        <span class="stat-value">{options.careerMatches}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">Total Gol</span>
        <span class="stat-value">{options.careerGoals}</span>
      </div>
      <div class="stat-box">
        <span class="stat-label">Koleksi Trofi</span>
        <span class="stat-value gold">🏆 {options.careerTrophies}</span>
      </div>
      <div class="stat-box full-width">
        <span class="stat-label">Akumulasi Tabungan Karir (Modal Awal)</span>
        <span class="stat-value cash">{formatMoney(options.savings)}</span>
      </div>
    </div>

    <!-- Path Navigation Tabs -->
    <div class="nav-tabs">
      <button class="tab-btn" class:active={activeTab === "manager"} onclick={() => (activeTab = "manager")}>
        👔 Manajer Klub
      </button>
      <button class="tab-btn" class:active={activeTab === "agent"} onclick={() => (activeTab = "agent")}>
        💼 Agen Pemain
      </button>
      <button class="tab-btn" class:active={activeTab === "staff"} onclick={() => (activeTab = "staff")}>
        📋 Staf Pelatih
      </button>
      <button class="tab-btn" class:active={activeTab === "pundit"} onclick={() => (activeTab = "pundit")}>
        🎙️ Pundit Media
      </button>
      <button class="tab-btn" class:active={activeTab === "child"} onclick={() => (activeTab = "child")}>
        🧬 Dinasti Anak
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- 1. Manager Path -->
      {#if activeTab === "manager"}
        <div class="path-panel">
          <div class="path-intro">
            <h3>👔 Jalur Pelatih & Manajer Klub</h3>
            <p>
              Gunakan pemahaman taktik dan reputasi besarmu untuk menukangi klub sepak bola profesional. Klub-klub berikut tertarik merekrutmu berdasarkan reputasi akhirmu:
            </p>
          </div>

          <div class="offers-grid">
            {#each options.managerOffers as offer}
              <label class="offer-card" class:selected={selectedClubId === offer.clubId}>
                <input
                  type="radio"
                  name="managerClub"
                  value={offer.clubId}
                  checked={selectedClubId === offer.clubId}
                  onchange={() => (selectedClubId = offer.clubId)}
                />
                <div class="offer-details">
                  <div class="club-title">
                    <span class="c-name">{offer.clubName}</span>
                    <span class="c-league">{offer.leagueName}</span>
                  </div>
                  <div class="c-meta">
                    <span class="badge-rep">Reputasi: {offer.reputation}</span>
                    <span class="badge-wage">Gaji: {formatMoney(offer.wageOffer)}/bln</span>
                  </div>
                </div>
              </label>
            {/each}
          </div>

          <div class="action-footer">
            <button class="btn-primary" onclick={submitManager}>
              👔 Mulai Karir Manajer Klub
            </button>
          </div>
        </div>
      {/if}

      <!-- 2. Agent Path -->
      {#if activeTab === "agent"}
        <div class="path-panel">
          <div class="path-intro">
            <h3>💼 Jalur Agen Pemain Profesional</h3>
            <p>
              Buka agensi olahraga mandiri! Hubungan luasmu dengan mantan rekan setim dan pelatih memberimu keunggulan dalam melihat bakat serta menegosiasikan kontrak bintang muda.
            </p>
          </div>

          <div class="agent-setup-box">
            <div class="form-group">
              <label for="agencyNameInput">Nama Agensi Olahraga:</label>
              <input
                id="agencyNameInput"
                type="text"
                bind:value={customAgencyName}
                placeholder="Misal: Garuda Sports Management"
                class="text-input"
              />
            </div>

            <div class="stats-preview-grid">
              <div class="preview-item">
                <span class="p-label">Modal Kas Agensi</span>
                <span class="p-value cash">{formatMoney(options.agentInfo.startingCash)}</span>
              </div>
              <div class="preview-item">
                <span class="p-label">Reputasi Agensi Awal</span>
                <span class="p-value highlight">{options.agentInfo.startingReputation} (Koneksi Bintang)</span>
              </div>
              <div class="preview-item">
                <span class="p-label">Insting Scouting (CA/PA)</span>
                <span class="p-value">{options.agentInfo.judgeCa} / {options.agentInfo.judgePa}</span>
              </div>
              <div class="preview-item">
                <span class="p-label">Klien Pertama</span>
                <span class="p-value">2 Wonderkid Muda Binaan</span>
              </div>
            </div>
          </div>

          <div class="action-footer">
            <button class="btn-primary" onclick={submitAgent}>
              💼 Dirikan Agensi & Buka Kantor
            </button>
          </div>
        </div>
      {/if}

      <!-- 3. Staff Path -->
      {#if activeTab === "staff"}
        <div class="path-panel">
          <div class="path-intro">
            <h3>📋 Jalur Staf Pelatih & Spesialis Klub</h3>
            <p>
              Belum ingin beban penuh sebagai manajer? Menjadi staf spesialis memungkinkanmu fokus melatih aspek teknis tim, meningkatkan kualitas fasilitas latihan klub, dan mendapatkan gaji bulanan tetap.
            </p>
          </div>

          <div class="staff-role-selector">
            <label class="role-card" class:selected={selectedStaffRole === "coach"}>
              <input type="radio" name="staffRole" value="coach" checked={selectedStaffRole === "coach"} onchange={() => (selectedStaffRole = "coach")} />
              <div class="role-desc">
                <h4>🎯 Pelatih Kepala Taktik</h4>
                <p>Meningkatkan level Coach klub +2 (+4% taktik tim & PA training wonderkid).</p>
              </div>
            </label>

            <label class="role-card" class:selected={selectedStaffRole === "assistant"}>
              <input type="radio" name="staffRole" value="assistant" checked={selectedStaffRole === "assistant"} onchange={() => (selectedStaffRole = "assistant")} />
              <div class="role-desc">
                <h4>📋 Asisten Manajer Tim</h4>
                <p>Meningkatkan level Assistant klub +2 (+4% kekompakan & kohesi ruang ganti).</p>
              </div>
            </label>

            <label class="role-card" class:selected={selectedStaffRole === "physio"}>
              <input type="radio" name="staffRole" value="physio" checked={selectedStaffRole === "physio"} onchange={() => (selectedStaffRole = "physio")} />
              <div class="role-desc">
                <h4>⚡ Spesialis Kebugaran & Medis</h4>
                <p>Meningkatkan level Fisioterapis klub +2 (pemulihan stamina harian pemain lebih cepat).</p>
              </div>
            </label>
          </div>

          <div class="action-footer">
            <button class="btn-primary" onclick={submitStaff}>
              📋 Bergabung sebagai Staf Klub
            </button>
          </div>
        </div>
      {/if}

      <!-- 4. Pundit Path -->
      {#if activeTab === "pundit"}
        <div class="path-panel">
          <div class="path-intro">
            <h3>🎙️ Jalur Pundit & Komentator Media</h3>
            <p>
              Sorot jalannya kompetisi dari studio televisi, podcast, dan kolom surat kabar olahraga! Opini, kritik tajam, atau pujianmu akan mempengaruhi moral klub dan performa pemain di dunia nyata.
            </p>
          </div>

          <div class="pundit-stats-overview">
            <div class="pundit-stat-bar">
              <div class="bar-header">
                <span>🌟 Ketenaran (Fame): {options.punditInit.fame}/100</span>
              </div>
              <div class="progress-bg"><div class="progress-fill fame" style="width: {options.punditInit.fame}%"></div></div>
            </div>

            <div class="pundit-stat-bar">
              <div class="bar-header">
                <span>🧠 Kredibilitas Analisis: {options.punditInit.credibility}/100</span>
              </div>
              <div class="progress-bg"><div class="progress-fill cred" style="width: {options.punditInit.credibility}%"></div></div>
            </div>

            <div class="pundit-stat-bar">
              <div class="bar-header">
                <span>🌶️ Tingkat Kontroversi: {options.punditInit.controversy_level}/100</span>
              </div>
              <div class="progress-bg"><div class="progress-fill cont" style="width: {options.punditInit.controversy_level}%"></div></div>
            </div>
          </div>

          <div class="pundit-contracts">
            <h4>📺 Program Media yang Mengontrak:</h4>
            <ul>
              {#each options.punditInit.active_shows as show}
                <li>✓ {show}</li>
              {/each}
            </ul>
            <p class="royalty-note">
              Est. Royalti & Fee Penampilan: <strong>{formatMoney(options.punditInit.monthly_royalty)}/bulan</strong>
            </p>
          </div>

          <div class="action-footer">
            <button class="btn-primary" onclick={submitPundit}>
              🎙️ Mulai Karir sebagai Pundit Televisi
            </button>
          </div>
        </div>
      {/if}

      <!-- 5. Child Path -->
      {#if activeTab === "child"}
        <div class="path-panel">
          <div class="path-intro">
            <h3>🧬 Jalur Dinasti Anak (Next Generation)</h3>
            <p>
              Pensiunkan karakter ini dan lanjutkan petualangan bermain sebagai putra kandungmu (regen 16 tahun). Sang anak akan mewarisi bonus atribut dan reputasi dari warisan kejayaanmu!
            </p>
          </div>

          <div class="child-setup-box">
            <div class="form-group">
              <label for="childNameInput">Nama Lengkap Sang Anak:</label>
              <input
                id="childNameInput"
                type="text"
                bind:value={customChildName}
                class="text-input"
              />
            </div>
            <p class="hint">
              Sang anak akan memulai karir di usia 16 tahun dengan modal PA tinggi berkat gen dan nama besar sang ayah.
            </p>
          </div>

          <div class="action-footer">
            <button class="btn-primary" onclick={submitChild}>
              🧬 Lahirkan Generasi Penerus
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .retirement-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(8, 12, 22, 0.88);
    backdrop-filter: blur(8px);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    overflow-y: auto;
  }

  .retirement-modal {
    background: #141b2d;
    border: 1px solid #2d3b5c;
    border-radius: 12px;
    width: 100%;
    max-width: 760px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
    color: #e2e8f0;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #232e48;
    background: #1a233b;
    border-radius: 12px 12px 0 0;
  }

  .badge-retirement {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 700;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    padding: 2px 8px;
    border-radius: 4px;
    margin-bottom: 0.35rem;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.35rem;
    color: #f8fafc;
  }

  .subtitle {
    margin: 0.35rem 0 0 0;
    font-size: 0.82rem;
    color: #94a3b8;
    line-height: 1.35;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Career Stats Card */
  .career-stats-card {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    padding: 1rem 1.5rem;
    background: #0f1626;
    border-bottom: 1px solid #232e48;
  }

  .stat-box {
    display: flex;
    flex-direction: column;
    background: #182239;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid #263554;
  }

  .stat-box.full-width {
    grid-column: span 3;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .stat-value {
    font-size: 0.95rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  .stat-value.highlight {
    color: #38bdf8;
  }

  .stat-value.gold {
    color: #facc15;
  }

  .stat-value.cash {
    color: #4ade80;
    font-size: 1rem;
  }

  /* Navigation Tabs */
  .nav-tabs {
    display: flex;
    background: #111827;
    border-bottom: 1px solid #232e48;
    padding: 0 1rem;
    gap: 0.25rem;
    overflow-x: auto;
  }

  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #94a3b8;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: #f1f5f9;
  }

  .tab-btn.active {
    color: #38bdf8;
    border-bottom-color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  /* Tab Panel */
  .tab-content {
    padding: 1.25rem 1.5rem;
    flex: 1;
  }

  .path-intro h3 {
    margin: 0 0 0.35rem 0;
    font-size: 1.15rem;
    color: #f8fafc;
  }

  .path-intro p {
    margin: 0 0 1rem 0;
    font-size: 0.84rem;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* Offers Grid */
  .offers-grid {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.25rem;
  }

  .offer-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #182239;
    border: 1px solid #263554;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .offer-card:hover {
    border-color: #38bdf8;
    background: #1e2b48;
  }

  .offer-card.selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .offer-details {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .c-name {
    font-weight: 700;
    color: #f8fafc;
    font-size: 0.95rem;
  }

  .c-league {
    font-size: 0.76rem;
    color: #94a3b8;
    margin-left: 0.5rem;
  }

  .c-meta {
    display: flex;
    gap: 0.5rem;
  }

  .badge-rep {
    font-size: 0.75rem;
    background: #232e48;
    padding: 2px 6px;
    border-radius: 4px;
    color: #cbd5e1;
  }

  .badge-wage {
    font-size: 0.75rem;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  /* Agent Setup */
  .agent-setup-box,
  .child-setup-box {
    background: #182239;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #263554;
    margin-bottom: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }

  .form-group label {
    font-size: 0.8rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .text-input {
    background: #0f1626;
    border: 1px solid #334155;
    color: #f8fafc;
    padding: 0.6rem 0.8rem;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .stats-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
  }

  .preview-item {
    background: #0f1626;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
  }

  .p-label {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .p-value {
    font-size: 0.88rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  /* Staff selector */
  .staff-role-selector {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.25rem;
  }

  .role-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #182239;
    border: 1px solid #263554;
    border-radius: 8px;
    cursor: pointer;
  }

  .role-card.selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .role-desc h4 {
    margin: 0 0 0.2rem 0;
    font-size: 0.92rem;
    color: #f8fafc;
  }

  .role-desc p {
    margin: 0;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  /* Pundit Bars */
  .pundit-stats-overview {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .pundit-stat-bar {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .bar-header {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .progress-bg {
    height: 8px;
    background: #0f1626;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 4px;
  }

  .progress-fill.fame {
    background: #38bdf8;
  }

  .progress-fill.cred {
    background: #4ade80;
  }

  .progress-fill.cont {
    background: #f87171;
  }

  .pundit-contracts {
    background: #182239;
    padding: 0.85rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.25rem;
    border: 1px solid #263554;
  }

  .pundit-contracts h4 {
    margin: 0 0 0.35rem 0;
    font-size: 0.85rem;
  }

  .pundit-contracts ul {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.8rem;
    color: #cbd5e1;
  }

  .royalty-note {
    margin: 0.6rem 0 0 0;
    font-size: 0.82rem;
    color: #4ade80;
  }

  .hint {
    font-size: 0.78rem;
    color: #94a3b8;
    margin: 0.35rem 0 0 0;
  }

  /* Action Footer */
  .action-footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    background: #0284c7;
    color: #ffffff;
    border: none;
    padding: 0.65rem 1.4rem;
    border-radius: 6px;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-primary:hover {
    background: #0369a1;
  }
</style>
