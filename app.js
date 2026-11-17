const grid = document.querySelector("#craft-grid");
const teacherGrid = document.querySelector("#teacher-grid");
const teacherEmpty = document.querySelector("#teacher-empty");
const searchInput = document.querySelector("#search-input");
const filterList = document.querySelector("#filter-list");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const loadError = document.querySelector("#load-error");
const detailScreen = document.querySelector("#detail-screen");
const adminNavLink = document.querySelector("#admin-nav-link");

let artifacts = [];
let teachers = [];
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

const updateLocation = (type, id) => {
  const url = new URL(window.location.href);
  url.searchParams.delete("artifact");
  url.searchParams.delete("teacher");
  if (id) url.searchParams.set(type, id);
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

const renderTeacherCards = () => {
  teacherEmpty.hidden = teachers.length !== 0;
  teacherGrid.innerHTML = teachers.map((teacher) => `
    <article class="teacher-card">
      <a class="teacher-card-link" href="?teacher=${encodeURIComponent(teacher.id)}" data-teacher="${escapeHTML(teacher.id)}" aria-label="認識工藝老師：${escapeHTML(teacher.name)}">
        <div class="teacher-card-portrait">
          ${teacher.image
            ? `<img src="${escapeHTML(teacher.image)}" alt="${escapeHTML(teacher.imageAlt || teacher.name)}" loading="lazy">`
            : `<span role="img" aria-label="${escapeHTML(teacher.name)}老師介紹">${escapeHTML(teacher.name.slice(0, 1))}</span>`}
        </div>
        <div class="teacher-card-content">
          <p class="teacher-card-specialty">${escapeHTML(teacher.specialty)}</p>
          <h3>${escapeHTML(teacher.name)}</h3>
          <p class="teacher-card-description">${escapeHTML(teacher.description)}</p>
          <span class="teacher-card-cta">認識老師・聽介紹 <span aria-hidden="true">↗</span></span>
        </div>
      </a>
    </article>
  `).join("");
};

const getArtifactFromLocation = () => new URLSearchParams(window.location.search).get("artifact");
const getTeacherFromLocation = () => new URLSearchParams(window.location.search).get("teacher");

const makerMatchesTeacher = (maker, teacherName) => {
  const normalize = (value) => String(value).normalize("NFC").trim().toLocaleLowerCase();
  const names = String(maker).split(/[、,，;；|/]/).map(normalize);
  return names.includes(normalize(teacherName));
};

const stopNarration = () => {
  const audioPlayer = detailScreen.querySelector(".detail-audio");
  if (audioPlayer) audioPlayer.pause();
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
  const guideCompanion = `
    <div class="guide-companion" data-state="idle">
      <a class="guide-companion-portrait" href="./guide.html" aria-label="認識知達小匠">
        <img class="guide-companion-image" src="./assets/zhida-guide-character.png" alt="知達小匠導覽員的臉部特寫" data-idle-src="./assets/zhida-guide-character.png" data-speak-src="./assets/mouth-talking.gif?v=2">
      </a>
      <div class="guide-companion-bubble">
        <strong>知達小匠</strong>
        <span data-guide-message>你好！我來陪你認識這件作品。</span>
      </div>
    </div>
  `;

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
        ${guideCompanion}
        ${artifact.audio ? `
        <div class="voice-panel voice-file-panel">
          <div class="voice-copy"><strong>聽一段作品故事</strong><span>頁面開啟時會嘗試自動播放</span></div>
          <audio class="detail-audio" controls autoplay preload="auto">
            <source src="${escapeHTML(artifact.audio)}" type="audio/wav">
            此瀏覽器不支援音訊播放。
          </audio>
          <button class="voice-audio-button" type="button" aria-label="播放語音介紹" data-state="idle">
            <svg class="icon-play" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8c0-.8.9-1.3 1.6-.8l8.1 5.5c.6.4.6 1.4 0 1.8l-8.1 5.5c-.7.5-1.6 0-1.6-.8V3.8Z"/></svg>
            <svg class="icon-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z"/></svg>
            <span>播放語音介紹</span>
          </button>
        </div>
        ` : `<div class="voice-panel">
          <button class="voice-button" type="button" aria-label="播放語音導覽" data-state="idle">
            <svg class="icon-play" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8c0-.8.9-1.3 1.6-.8l8.1 5.5c.6.4.6 1.4 0 1.8l-8.1 5.5c-.7.5-1.6 0-1.6-.8V3.8Z"/></svg>
            <svg class="icon-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z"/></svg>
            <span class="voice-button-label">播放語音介紹</span>
          </button>
          <button class="voice-stop-button" type="button" aria-label="停止語音導覽" disabled>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5z"/></svg>
          </button>
          <div class="voice-copy"><strong>聽一段作品故事</strong><span>頁面開啟時會嘗試自動播放</span></div>
          <span class="voice-duration">約 1 分鐘</span>
        </div>`}
        <p class="detail-intro">${escapeHTML(artifact.description)}</p>
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

  const setGuideStatus = (state, message) => {
    const companion = detailScreen.querySelector(".guide-companion");
    companion.dataset.state = state;
    companion.querySelector("[data-guide-message]").textContent = message;

    const img = companion.querySelector(".guide-companion-image");
    if (state === "speaking") {
      img.src = img.dataset.speakSrc;
    } else {
      img.src = img.dataset.idleSrc;
    }
  };
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
  const audioPlayer = detailScreen.querySelector(".detail-audio");
  if (audioPlayer) {
    const audioStatus = detailScreen.querySelector(".voice-copy span");
    const audioButton = detailScreen.querySelector(".voice-audio-button");
    let playbackStarted = false;
    let playbackFailed = false;
    const showAudioError = (error) => {
      playbackFailed = true;
      audioButton.dataset.state = "idle";
      audioButton.setAttribute("aria-label", "播放語音介紹");
      audioButton.querySelector("span").textContent = error.name === "NotAllowedError"
        ? "點擊播放語音介紹"
        : "重新播放語音介紹";
      if (error.name === "NotAllowedError") {
        audioStatus.textContent = "瀏覽器封鎖自動播放，請點擊下方按鈕";
        setGuideStatus("idle", "點一下播放按鈕，我就能開始介紹作品。");
        return;
      }
      audioStatus.textContent = "音訊播放失敗，請點擊下方按鈕重試";
      setGuideStatus("idle", "語音暫時無法播放，請再試一次。");
      console.error("語音檔播放失敗", error);
    };

    audioPlayer.addEventListener("playing", () => {
      playbackStarted = true;
      playbackFailed = false;
      audioButton.dataset.state = "playing";
      audioButton.setAttribute("aria-label", "暫停語音導覽");
      audioButton.querySelector("span").textContent = "暫停語音介紹";
      audioStatus.textContent = "正在播放語音導覽";
      setGuideStatus("speaking", "作品故事開始了，請跟我一起聽。");
    });
    audioPlayer.addEventListener("pause", () => {
      if (playbackStarted && !playbackFailed && !audioPlayer.ended) {
        audioButton.dataset.state = "idle";
        audioButton.setAttribute("aria-label", "繼續語音導覽");
        audioButton.querySelector("span").textContent = "繼續播放語音介紹";
        audioStatus.textContent = "已暫停 · 點擊播放按鈕繼續";
        setGuideStatus("paused", "先休息一下，準備好再繼續聽。");
      }
    });
    audioPlayer.addEventListener("ended", () => {
      audioButton.dataset.state = "idle";
      audioButton.setAttribute("aria-label", "重新播放語音導覽");
      audioButton.querySelector("span").textContent = "重新播放語音介紹";
      audioStatus.textContent = "語音導覽已播放完畢";
      setGuideStatus("idle", "介紹到這裡，一起看看作品的工藝細節吧！");
    });
    audioPlayer.addEventListener("error", () => {
      showAudioError(audioPlayer.error || new Error("音訊檔載入失敗"));
    });
    audioButton.addEventListener("click", async () => {
      if (!audioPlayer.paused && !audioPlayer.ended) {
        audioPlayer.pause();
        return;
      }

      audioButton.disabled = true;
      try {
        await audioPlayer.play();
      } catch (error) {
        showAudioError(error);
      } finally {
        audioButton.disabled = false;
      }
    });
    try {
      const playback = audioPlayer.play();
      if (playback) playback.catch(showAudioError);
    } catch (error) {
      showAudioError(error);
    }
  }

  const voiceButton = detailScreen.querySelector(".voice-button");
  if (voiceButton) {
    const stopButton = detailScreen.querySelector(".voice-stop-button");
    const voiceStatus = detailScreen.querySelector(".voice-copy span");
    let autoplayAttemptPending = false;
    const setVoiceButton = (state, label, ariaLabel) => {
      voiceButton.dataset.state = state;
      voiceButton.setAttribute("aria-label", ariaLabel);
      voiceButton.querySelector(".voice-button-label").textContent = label;
    };
    const resetVoiceControls = (guideMessage = "準備好後，點擊播放聽聽完整介紹。") => {
      setVoiceButton("idle", "播放語音介紹", "播放語音導覽");
      stopButton.disabled = true;
      voiceStatus.textContent = "語音導覽 · 繁體中文";
      setGuideStatus("idle", guideMessage);
    };

    voiceButton.addEventListener("click", () => {
      const restartingAutoplay = autoplayAttemptPending;
      if (restartingAutoplay) {
        window.speechSynthesis.cancel();
        activeUtterance = null;
        autoplayAttemptPending = false;
      }

      const button = voiceButton;
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        button.disabled = true;
        stopButton.disabled = true;
        voiceStatus.textContent = "此瀏覽器不支援語音播放";
        return;
      }

      if (!restartingAutoplay && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setVoiceButton("playing", "暫停語音介紹", "暫停語音導覽");
        voiceStatus.textContent = "正在播放 · 點擊暫停";
        setGuideStatus("speaking", "我們繼續聽作品故事！");
        return;
      }

      if (!restartingAutoplay && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.pause();
        setVoiceButton("paused", "繼續播放語音介紹", "繼續語音導覽");
        voiceStatus.textContent = "已暫停 · 點擊繼續";
        setGuideStatus("paused", "先休息一下，準備好再繼續聽。");
        return;
      }

      activeUtterance = new SpeechSynthesisUtterance(artifact.voiceText);
      const utterance = activeUtterance;
      autoplayAttemptPending = true;
      activeUtterance.lang = "zh-TW";
      activeUtterance.rate = 0.9;
      activeUtterance.onstart = () => {
        if (activeUtterance !== utterance) return;
        autoplayAttemptPending = false;
        setVoiceButton("playing", "暫停語音介紹", "暫停語音導覽");
        stopButton.disabled = false;
        voiceStatus.textContent = "正在播放 · 點擊暫停";
        setGuideStatus("speaking", "作品故事開始了，請跟我一起聽。");
      };
      activeUtterance.onend = () => {
        if (activeUtterance !== utterance) return;
        autoplayAttemptPending = false;
        activeUtterance = null;
        resetVoiceControls("介紹到這裡，一起看看作品的工藝細節吧！");
      };
      activeUtterance.onerror = (error) => {
        if (activeUtterance !== utterance) return;
        autoplayAttemptPending = false;
        activeUtterance = null;
        resetVoiceControls();
        voiceStatus.textContent = error.error === "not-allowed"
          ? "瀏覽器封鎖自動播放，請點擊播放按鈕"
          : "自動播放未成功，請點擊播放按鈕重試";
        setGuideStatus("idle", "點一下播放按鈕，我就能開始介紹作品。");
        console.error("語音導覽播放失敗", error);
      };
      setVoiceButton("idle", "播放語音介紹", "播放語音導覽");
      stopButton.disabled = true;
      voiceStatus.textContent = "若未聽到語音，請點擊播放按鈕";
      try {
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        autoplayAttemptPending = false;
        activeUtterance = null;
        resetVoiceControls();
        voiceStatus.textContent = "自動播放未成功，請點擊播放按鈕重試";
        setGuideStatus("idle", "語音暫時無法播放，請再試一次。");
        console.error("語音導覽無法啟動", error);
      }
    });

    voiceButton.click();

    stopButton.addEventListener("click", () => {
      autoplayAttemptPending = false;
      stopNarration();
      resetVoiceControls();
    });
  }
};

const renderTeacher = (teacher) => {
  stopNarration();
  const relatedArtifacts = artifacts.filter((artifact) => makerMatchesTeacher(artifact.maker, teacher.name));
  const narration = teacher.audio
    ? `
      <div class="voice-panel voice-file-panel">
        <div class="voice-copy"><strong>聽聽老師的介紹</strong><span>若未自動播放，請使用下方音訊控制列</span></div>
        <audio class="detail-audio teacher-audio" controls autoplay preload="auto" aria-label="播放工藝老師語音介紹">
          <source src="${escapeHTML(teacher.audio)}" type="audio/wav">
          此瀏覽器不支援音訊播放。
        </audio>
      </div>
    `
    : `
      <div class="voice-panel">
        <button class="voice-button" type="button" aria-label="播放老師介紹" data-state="idle">
          <svg class="icon-play" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8c0-.8.9-1.3 1.6-.8l8.1 5.5c.6.4.6 1.4 0 1.8l-8.1 5.5c-.7.5-1.6 0-1.6-.8V3.8Z"/></svg>
          <svg class="icon-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z"/></svg>
          <span class="voice-button-label">播放老師介紹</span>
        </button>
        <button class="voice-stop-button" type="button" aria-label="停止老師介紹" disabled>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5z"/></svg>
        </button>
        <div class="voice-copy"><strong>聽聽老師的介紹</strong><span>頁面開啟時會嘗試自動播放</span></div>
        <span class="voice-duration">繁體中文語音</span>
      </div>
    `;

  detailScreen.innerHTML = `
    <header class="detail-header">
      <button class="back-button" type="button" data-back><span aria-hidden="true">←</span>返回導覽首頁</button>
      <a class="detail-brand" href="./">知達拾藝 CRAFT GUIDE</a>
    </header>
    <div class="detail-layout">
      <div class="detail-visual">
        <div class="detail-image-wrap">
          ${teacher.image
            ? `<img class="detail-image" src="${escapeHTML(teacher.image)}" alt="${escapeHTML(teacher.imageAlt || teacher.name)}">`
            : `<div class="teacher-portrait-placeholder" role="img" aria-label="${escapeHTML(teacher.name)}老師介紹">${escapeHTML(teacher.name.slice(0, 1))}</div>`}
          <span class="detail-number">工藝老師</span>
        </div>
        <div class="detail-caption"><span>${escapeHTML(teacher.specialty)}</span><span>知達拾藝 Craft Guide</span></div>
      </div>
      <article class="detail-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> 工藝老師 / ${escapeHTML(teacher.specialty)}</p>
        <h1>${escapeHTML(teacher.name)}</h1>
        ${narration}
        <p class="detail-intro">${escapeHTML(teacher.description)}</p>
        ${relatedArtifacts.length ? `
          <section class="teacher-related-works" aria-labelledby="teacher-works-heading">
            <div class="story-heading"><h2 id="teacher-works-heading">相關作品</h2><span>認識老師的工藝作品</span></div>
            <ul>${relatedArtifacts.map((artifact) => `
              <li><a href="?artifact=${encodeURIComponent(artifact.id)}">${escapeHTML(artifact.title)}<span aria-hidden="true">↗</span></a></li>
            `).join("")}</ul>
          </section>
        ` : ""}
      </article>
    </div>
    <footer class="detail-footer"><span>知達拾藝 Craft Guide</span><span>一位老師，一段工藝故事。</span></footer>
  `;
  detailScreen.hidden = false;
  document.querySelector(".page-shell").hidden = true;
  detailScreen.querySelector("[data-back]").addEventListener("click", () => updateLocation(null, null));

  const audioPlayer = detailScreen.querySelector(".teacher-audio");
  if (audioPlayer) {
    const audioStatus = detailScreen.querySelector(".voice-copy span");
    audioPlayer.addEventListener("playing", () => {
      audioStatus.textContent = "正在播放老師介紹";
    });
    audioPlayer.addEventListener("ended", () => {
      audioStatus.textContent = "老師介紹已播放完畢";
    });
    audioPlayer.addEventListener("error", () => {
      audioStatus.textContent = "音訊播放失敗，請使用音訊控制列重試";
      console.error("工藝老師語音檔播放失敗", audioPlayer.error);
    });
    const showAudioError = (error) => {
      audioStatus.textContent = error.name === "NotAllowedError"
        ? "瀏覽器封鎖自動播放，請使用下方音訊控制列"
        : "音訊播放失敗，請使用音訊控制列重試";
      if (error.name !== "NotAllowedError") console.error("工藝老師語音檔播放失敗", error);
    };
    try {
      const playback = audioPlayer.play();
      if (playback) playback.catch(showAudioError);
    } catch (error) {
      showAudioError(error);
    }
    return;
  }

  const voiceButton = detailScreen.querySelector(".voice-button");
  const stopButton = detailScreen.querySelector(".voice-stop-button");
  const voiceStatus = detailScreen.querySelector(".voice-copy span");
  const setVoiceButton = (state, label, ariaLabel) => {
    voiceButton.dataset.state = state;
    voiceButton.setAttribute("aria-label", ariaLabel);
    voiceButton.querySelector(".voice-button-label").textContent = label;
  };
  const resetVoiceControls = () => {
    setVoiceButton("idle", "播放老師介紹", "播放老師介紹");
    stopButton.disabled = true;
    voiceStatus.textContent = "語音導覽 · 繁體中文";
  };
  const playTeacherVoice = () => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      voiceButton.disabled = true;
      voiceStatus.textContent = "此瀏覽器不支援語音播放";
      return;
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setVoiceButton("playing", "暫停老師介紹", "暫停老師介紹");
      voiceStatus.textContent = "正在播放 · 點擊暫停";
      return;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.pause();
      setVoiceButton("paused", "繼續播放老師介紹", "繼續老師介紹");
      voiceStatus.textContent = "已暫停 · 點擊繼續";
      return;
    }

    const utterance = new SpeechSynthesisUtterance(teacher.voiceText);
    activeUtterance = utterance;
    utterance.lang = "zh-TW";
    utterance.rate = 0.9;
    utterance.onstart = () => {
      if (activeUtterance !== utterance) return;
      setVoiceButton("playing", "暫停老師介紹", "暫停老師介紹");
      stopButton.disabled = false;
      voiceStatus.textContent = "正在播放 · 點擊暫停";
    };
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      resetVoiceControls();
    };
    utterance.onerror = (error) => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      resetVoiceControls();
      voiceStatus.textContent = error.error === "not-allowed"
        ? "瀏覽器封鎖自動播放，請點擊播放按鈕"
        : "語音播放失敗，請點擊播放按鈕重試";
      if (error.error !== "not-allowed") console.error("工藝老師語音播放失敗", error);
    };
    voiceStatus.textContent = "若未聽到語音，請點擊播放按鈕";
    try {
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      activeUtterance = null;
      resetVoiceControls();
      voiceStatus.textContent = "語音播放失敗，請點擊播放按鈕重試";
      console.error("工藝老師語音無法啟動", error);
    }
  };
  voiceButton.addEventListener("click", playTeacherVoice);
  stopButton.addEventListener("click", () => {
    stopNarration();
    resetVoiceControls();
  });
  playTeacherVoice();
};

const renderRoute = () => {
  const artifactId = getArtifactFromLocation();
  const teacherId = getTeacherFromLocation();
  const artifact = artifacts.find((item) => item.id === artifactId);
  const pageShell = document.querySelector(".page-shell");

  if (artifactId && teacherId) {
    stopNarration();
    detailScreen.hidden = true;
    pageShell.hidden = false;
    emptyState.textContent = "網址不可同時指定作品與工藝老師，請確認 QR Code。";
    emptyState.hidden = false;
    grid.hidden = true;
    return;
  }
  if (artifact) {
    renderDetail(artifact);
    return;
  }
  if (teacherId) {
    const teacher = teachers.find((item) => item.id === teacherId);
    if (teacher) {
      renderTeacher(teacher);
      return;
    }
  }

  stopNarration();
  detailScreen.hidden = true;
  pageShell.hidden = false;
  if (artifactId || teacherId) {
    emptyState.textContent = artifactId
      ? "找不到這件作品，請確認 QR Code 或網址是否正確。"
      : "找不到這位工藝老師，請確認 QR Code 或網址是否正確。";
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
  updateLocation("artifact", link.dataset.artifact);
});

teacherGrid.addEventListener("click", (event) => {
  const link = event.target.closest("[data-teacher]");
  if (!link) return;
  event.preventDefault();
  updateLocation("teacher", link.dataset.teacher);
});

window.addEventListener("popstate", renderRoute);

const dataCacheKey = Date.now();
Promise.all([
  fetch(`./data/artifacts.json?v=${dataCacheKey}`, { cache: "no-store" }),
  fetch(`./data/teachers.json?v=${dataCacheKey}`, { cache: "no-store" }),
])
  .then(async ([artifactResponse, teacherResponse]) => {
    if (!artifactResponse.ok) throw new Error(`無法載入作品資料：HTTP ${artifactResponse.status}`);
    if (!teacherResponse.ok) throw new Error(`無法載入工藝老師資料：HTTP ${teacherResponse.status}`);
    return Promise.all([artifactResponse.json(), teacherResponse.json()]);
  })
  .then(([artifactData, teacherData]) => {
    if (!Array.isArray(artifactData) || artifactData.some((artifact) => !artifact.id || !artifact.title || !Array.isArray(artifact.steps) || artifact.steps.length === 0)) {
      throw new Error("作品資料格式不正確");
    }
    if (!Array.isArray(teacherData) || teacherData.some((teacher) => (
      !teacher.id || !teacher.name || !teacher.specialty || !teacher.description || !teacher.voiceText
    ))) {
      throw new Error("工藝老師資料格式不正確");
    }
    artifacts = artifactData;
    teachers = teacherData;
    renderFilters();
    renderTeacherCards();
    renderRoute();
  })
  .catch((error) => {
    console.error("作品資料載入失敗", error);
    loadError.hidden = false;
    resultCount.textContent = "作品資料載入失敗";
  });
