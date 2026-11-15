const grid = document.querySelector("#craft-grid");
const searchInput = document.querySelector("#search-input");
const filterList = document.querySelector("#filter-list");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const loadError = document.querySelector("#load-error");
const detailScreen = document.querySelector("#detail-screen");
const adminNavLink = document.querySelector("#admin-nav-link");

let artifacts = [];
let selectedCategory = "全部作品";
let activeUtterance = null;

if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  adminNavLink.hidden = false;
}

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const updateLocation = (artifactId) => {
  const url = new URL(window.location.href);
  if (artifactId) {
    url.searchParams.set("artifact", artifactId);
  } else {
    url.searchParams.delete("artifact");
  }
  window.history.pushState({}, "", url);
  renderRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const categories = () => ["全部作品", ...new Set(artifacts.map((artifact) => artifact.category))];

const renderFilters = () => {
  filterList.innerHTML = categories().map((category) => `
    <button class="filter-button${category === selectedCategory ? " active" : ""}" type="button" data-category="${escapeHTML(category)}" aria-pressed="${category === selectedCategory}">
      ${escapeHTML(category)}
    </button>
  `).join("");
};

const renderCards = () => {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = artifacts.filter((artifact) => {
    const matchesCategory = selectedCategory === "全部作品" || artifact.category === selectedCategory;
    const searchable = [artifact.title, artifact.subtitle, artifact.category, artifact.description, artifact.material].join(" ").toLocaleLowerCase();
    return matchesCategory && searchable.includes(query);
  });

  resultCount.textContent = `共 ${filtered.length} 件作品`;
  emptyState.hidden = filtered.length !== 0;
  grid.innerHTML = filtered.map((artifact, index) => `
    <article class="craft-card" style="animation-delay:${Math.min(index * 70, 280)}ms">
      <a class="card-image-link" href="?artifact=${encodeURIComponent(artifact.id)}" data-artifact="${escapeHTML(artifact.id)}" aria-label="探索作品：${escapeHTML(artifact.title)}">
        <img src="${escapeHTML(artifact.image)}" alt="${escapeHTML(artifact.imageAlt)}" loading="lazy">
        <span class="card-number">${String(artifact.number).padStart(2, "0")} / ${String(artifacts.length).padStart(2, "0")}</span>
        <span class="card-category">${escapeHTML(artifact.category)}</span>
      </a>
      <div class="card-body">
        <div class="card-title-row">
          <div>
            <h3 class="card-title">${escapeHTML(artifact.title)}</h3>
            <p class="card-material">${escapeHTML(artifact.material)}</p>
          </div>
          <span class="card-arrow" aria-hidden="true">↗</span>
        </div>
        <p class="card-description">${escapeHTML(artifact.description)}</p>
        <div class="card-footer">
          <span>${escapeHTML(artifact.maker)}</span>
          <span>探索作品　↗</span>
        </div>
      </div>
    </article>
  `).join("");
};

const getArtifactFromLocation = () => new URLSearchParams(window.location.search).get("artifact");

const stopNarration = () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  activeUtterance = null;
};

const renderDetail = (artifact) => {
  stopNarration();
  const steps = artifact.steps.map((step, index) => `
    <button class="step-tab${index === 0 ? " active" : ""}" id="step-tab-${index}" type="button" role="tab" data-step="${index}" aria-controls="step-panel" aria-selected="${index === 0}" tabindex="${index === 0 ? "0" : "-1"}">
      ${String(index + 1).padStart(2, "0")} ${escapeHTML(step.tab)}
    </button>
  `).join("");

  detailScreen.innerHTML = `
    <header class="detail-header">
      <button class="back-button" type="button" data-back><span aria-hidden="true">←</span>返回作品選集</button>
      <a class="detail-brand" href="./">知達拾藝 CRAFT GUIDE</a>
    </header>
    <div class="detail-layout">
      <div class="detail-visual">
        <div class="detail-image-wrap">
          <img class="detail-image" src="${escapeHTML(artifact.image)}" alt="${escapeHTML(artifact.imageAlt)}">
          <span class="detail-number">${String(artifact.number).padStart(2, "0")} / ${String(artifacts.length).padStart(2, "0")}</span>
        </div>
        <div class="detail-caption"><span>${escapeHTML(artifact.caption)}</span><span>${escapeHTML(artifact.year)}</span></div>
      </div>
      <article class="detail-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> ${escapeHTML(artifact.category)} / ${escapeHTML(artifact.maker)}</p>
        <h1>${escapeHTML(artifact.title)}</h1>
        <p class="detail-subtitle">${escapeHTML(artifact.subtitle)}</p>
        <p class="detail-intro">${escapeHTML(artifact.description)}</p>
        ${artifact.audio ? `
        <div class="voice-panel voice-file-panel">
          <div class="voice-copy"><strong>聽一段作品故事</strong><span>離線語音導覽 · 繁體中文</span></div>
          <audio class="detail-audio" controls preload="none">
            <source src="${escapeHTML(artifact.audio)}" type="audio/wav">
            此瀏覽器不支援音訊播放。
          </audio>
        </div>
        ` : `<div class="voice-panel">
          <button class="voice-button" type="button" aria-label="播放語音導覽" data-state="idle">
            <svg class="icon-play" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8c0-.8.9-1.3 1.6-.8l8.1 5.5c.6.4.6 1.4 0 1.8l-8.1 5.5c-.7.5-1.6 0-1.6-.8V3.8Z"/></svg>
            <svg class="icon-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z"/></svg>
          </button>
          <button class="voice-stop-button" type="button" aria-label="停止語音導覽" disabled>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5z"/></svg>
          </button>
          <div class="voice-copy"><strong>聽一段作品故事</strong><span>語音導覽 · 繁體中文</span></div>
          <span class="voice-duration">約 1 分鐘</span>
        </div>`}
        <div class="story-heading"><h2>走近作品</h2><span>點選細節，慢慢探索</span></div>
        <div class="step-tabs" role="tablist" aria-label="作品介紹步驟">${steps}</div>
        <div class="step-panel" id="step-panel" role="tabpanel" aria-labelledby="step-tab-0"></div>
        <div class="detail-facts">
          <div class="fact"><span>材質</span><strong>${escapeHTML(artifact.material)}</strong></div>
          <div class="fact"><span>創作者</span><strong>${escapeHTML(artifact.maker)}</strong></div>
          <div class="fact"><span>工藝</span><strong>${escapeHTML(artifact.technique)}</strong></div>
          <div class="fact"><span>作品年代</span><strong>${escapeHTML(artifact.year)}</strong></div>
        </div>
      </article>
    </div>
    <footer class="detail-footer"><span>知達拾藝 Craft Guide</span><span>一件工藝，一個故事。</span></footer>
  `;
  detailScreen.hidden = false;
  document.querySelector(".page-shell").hidden = true;

  const stepPanel = detailScreen.querySelector(".step-panel");
  const showStep = (index) => {
    const step = artifact.steps[index];
    detailScreen.querySelectorAll(".step-tab").forEach((tab, tabIndex) => {
      const active = tabIndex === index;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    stepPanel.setAttribute("aria-labelledby", `step-tab-${index}`);
    stepPanel.innerHTML = `<h3>${escapeHTML(step.title)}</h3><p>${escapeHTML(step.description)}</p>`;
  };
  showStep(0);

  detailScreen.querySelector(".step-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-step]");
    if (tab) showStep(Number(tab.dataset.step));
  });

  detailScreen.querySelector("[data-back]").addEventListener("click", () => updateLocation(null));
  const voiceButton = detailScreen.querySelector(".voice-button");
  if (voiceButton) {
    const stopButton = detailScreen.querySelector(".voice-stop-button");
    const voiceStatus = detailScreen.querySelector(".voice-copy span");
    const resetVoiceControls = () => {
      voiceButton.dataset.state = "idle";
      voiceButton.setAttribute("aria-label", "播放語音導覽");
      stopButton.disabled = true;
      voiceStatus.textContent = "語音導覽 · 繁體中文";
    };

    voiceButton.addEventListener("click", () => {
      const button = voiceButton;
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        button.disabled = true;
        stopButton.disabled = true;
        voiceStatus.textContent = "此瀏覽器不支援語音播放";
        return;
      }

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        button.dataset.state = "playing";
        button.setAttribute("aria-label", "暫停語音導覽");
        voiceStatus.textContent = "正在播放 · 點擊暫停";
        return;
      }

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.pause();
        button.dataset.state = "paused";
        button.setAttribute("aria-label", "繼續語音導覽");
        voiceStatus.textContent = "已暫停 · 點擊繼續";
        return;
      }

      activeUtterance = new SpeechSynthesisUtterance(artifact.voiceText);
      activeUtterance.lang = "zh-TW";
      activeUtterance.rate = 0.9;
      activeUtterance.onend = () => {
        if (activeUtterance !== utterance) return;
        activeUtterance = null;
        resetVoiceControls();
      };
      activeUtterance.onerror = (error) => {
        if (activeUtterance !== utterance) return;
        activeUtterance = null;
        resetVoiceControls();
        voiceStatus.textContent = "語音播放失敗，請稍後再試";
        console.error("語音導覽播放失敗", error);
      };
      const utterance = activeUtterance;
      window.speechSynthesis.speak(utterance);
      button.dataset.state = "playing";
      button.setAttribute("aria-label", "暫停語音導覽");
      stopButton.disabled = false;
      voiceStatus.textContent = "正在播放 · 點擊暫停";
    });

    stopButton.addEventListener("click", () => {
      stopNarration();
      resetVoiceControls();
    });
  }
};

const renderRoute = () => {
  const artifactId = getArtifactFromLocation();
  const artifact = artifacts.find((item) => item.id === artifactId);
  const pageShell = document.querySelector(".page-shell");

  if (artifact) {
    renderDetail(artifact);
    return;
  }

  stopNarration();
  detailScreen.hidden = true;
  pageShell.hidden = false;
  if (artifactId) {
    emptyState.textContent = "找不到這件作品，請確認 QR Code 或網址是否正確。";
    emptyState.hidden = false;
    grid.hidden = true;
  } else {
    emptyState.textContent = "找不到符合條件的作品，試試其他關鍵字或分類。";
    grid.hidden = false;
    renderCards();
  }
};

filterList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  selectedCategory = button.dataset.category;
  renderFilters();
  renderCards();
});

searchInput.addEventListener("input", renderCards);

grid.addEventListener("click", (event) => {
  const link = event.target.closest("[data-artifact]");
  if (!link) return;
  event.preventDefault();
  updateLocation(link.dataset.artifact);
});

window.addEventListener("popstate", renderRoute);

fetch("./data/artifacts.json")
  .then((response) => {
    if (!response.ok) throw new Error(`無法載入作品資料：HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data) || data.some((artifact) => !artifact.id || !artifact.title || !Array.isArray(artifact.steps) || artifact.steps.length === 0)) {
      throw new Error("作品資料格式不正確");
    }
    artifacts = data;
    renderFilters();
    renderRoute();
  })
  .catch((error) => {
    console.error("作品資料載入失敗", error);
    loadError.hidden = false;
    resultCount.textContent = "作品資料載入失敗";
  });
