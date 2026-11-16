const form = document.querySelector("#artifact-form");
const loginPanel = document.querySelector("#admin-login");
const adminShell = document.querySelector("#admin-shell");
const loginForm = document.querySelector("#admin-login-form");
const loginPassword = document.querySelector("#admin-password");
const loginMessage = document.querySelector("#admin-login-message");
const logoutButton = document.querySelector("#admin-logout");
const stepsContainer = document.querySelector("#admin-steps");
const addStepButton = document.querySelector("#add-step");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const successPanel = document.querySelector("#admin-success");
const titleInput = document.querySelector("#title");
const idInput = document.querySelector("#artifact-id");
const descriptionInput = document.querySelector("#description");
const voiceInput = document.querySelector("#voice-text");
const photoInput = document.querySelector("#photo");
const photoPreview = document.querySelector("#photo-preview");
const photoLabel = document.querySelector("#photo-label");
const photoHelp = document.querySelector("#photo-help");
const artifactList = document.querySelector("#admin-artifacts");
const teacherForm = document.querySelector("#teacher-form");
const teacherList = document.querySelector("#admin-teachers");
const teacherNameInput = document.querySelector("#teacher-name");
const teacherIdInput = document.querySelector("#teacher-id");
const teacherDescriptionInput = document.querySelector("#teacher-description");
const teacherVoiceInput = document.querySelector("#teacher-voice-text");
const teacherPhotoInput = document.querySelector("#teacher-photo");
const teacherPhotoPreview = document.querySelector("#teacher-photo-preview");
const teacherPhotoLabel = document.querySelector("#teacher-photo-label");
const teacherPhotoHelp = document.querySelector("#teacher-photo-help");
const teacherFormHeading = document.querySelector("#teacher-form-heading");
const teacherFormMessage = document.querySelector("#teacher-form-message");
const teacherSubmitButton = document.querySelector("#teacher-submit-button");
const apiConfig = document.querySelector('meta[name="craft-admin-api"]');
const isLocalAdmin = ["localhost", "127.0.0.1"].includes(location.hostname);
const adminApiBase = isLocalAdmin || !apiConfig
  ? ""
  : apiConfig.content.trim().replace(/\/+$/, "");
const isRemoteAdmin = Boolean(adminApiBase);
const isPublishedAdmin = location.hostname === "final0618.github.io";

let stepCount = 0;
let voiceTextWasEdited = false;
let titleWasEdited = false;
let photoPreviewUrl = null;
let existingImage = null;
let editingArtifactId = null;
let artifacts = [];
let teachers = [];
let adminToken = null;
let teacherPhotoPreviewUrl = null;
let teacherExistingImage = null;
let editingTeacherId = null;
let teacherVoiceTextWasEdited = false;
let teacherIdWasEdited = false;
let lastSuccessKind = "artifact";

const apiRequest = async (path, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (adminToken) headers.set("Authorization", `Bearer ${adminToken}`);
  const response = await fetch(`${adminApiBase}${path}`, { ...options, headers });
  if (adminToken && response.status === 401) {
    adminToken = null;
    showLogin("登入工作階段已逾期，請重新登入。");
  }
  return response;
};

if (isRemoteAdmin) {
  document.querySelector("#admin-intro-description").textContent =
    "從外網管理作品；儲存後會更新公開導覽網站。";
  document.querySelector("#voice-section-description").textContent =
    "線上後台會保存語音稿，訪客裝置使用瀏覽器語音合成，不會自動產生 WAV。";
  document.querySelector("#voice-text-help").textContent =
    "最長 5,000 字；可用語音與播放方式依訪客裝置及瀏覽器而異。";
  document.querySelector("#submit-description").textContent =
    "送出後會將作品資料與照片儲存至 GitHub，並產生可下載的 QR Code。";
  document.querySelector("#admin-footer-note").textContent =
    "儲存後會更新公開網站；GitHub Pages 部署需要短暫時間。";
  document.querySelector("#teacher-voice-help").textContent =
    "最長 5,000 字；雲端訪客裝置會使用瀏覽器語音合成。";
  document.querySelector("#teacher-submit-description").textContent =
    "送出後會將老師資料與照片儲存至 GitHub，並產生可下載的 QR Code。";
}

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const slugify = (value) => {
  const ascii = value.toLocaleLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `craft-${Date.now().toString(36)}`;
};

const updateDefaultVoiceText = () => {
  if (voiceTextWasEdited) return;
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  voiceInput.value = [title && `這件作品叫做${title}。`, description].filter(Boolean).join("");
};

const addStep = (step = {}) => {
  if (stepCount >= 6) return;
  const index = stepCount++;
  const panel = document.createElement("fieldset");
  panel.className = "admin-step-card";
  panel.dataset.step = String(index);
  panel.innerHTML = `
    <legend>步驟 ${String(index + 1).padStart(2, "0")}</legend>
    <button class="remove-step" type="button" aria-label="移除步驟 ${index + 1}" ${stepCount <= 1 ? "disabled" : ""}>移除</button>
    <div class="admin-fields">
      <label class="admin-field">
        <span>步驟標籤 <i>*</i></span>
        <input data-step-field="tab" required maxlength="20" placeholder="例如：塑形" value="${escapeHTML(step.tab || "")}">
      </label>
      <label class="admin-field">
        <span>步驟標題 <i>*</i></span>
        <input data-step-field="title" required maxlength="80" placeholder="例如：從一團土開始" value="${escapeHTML(step.title || "")}">
      </label>
      <label class="admin-field admin-field-wide">
        <span>步驟介紹 <i>*</i></span>
        <textarea data-step-field="description" required maxlength="600" rows="3" placeholder="描述這個工藝步驟。">${escapeHTML(step.description || "")}</textarea>
      </label>
    </div>
  `;
  panel.querySelector(".remove-step").addEventListener("click", () => {
    panel.remove();
    renumberSteps();
  });
  stepsContainer.append(panel);
  renumberSteps();
};

const renumberSteps = () => {
  const panels = [...stepsContainer.querySelectorAll(".admin-step-card")];
  stepCount = panels.length;
  panels.forEach((panel, index) => {
    panel.querySelector("legend").textContent = `步驟 ${String(index + 1).padStart(2, "0")}`;
    panel.querySelector(".remove-step").setAttribute("aria-label", `移除步驟 ${index + 1}`);
    panel.querySelector(".remove-step").disabled = panels.length <= 1;
  });
  addStepButton.disabled = panels.length >= 6;
  addStepButton.textContent = panels.length >= 6 ? "最多可設定 6 個步驟" : "＋ 新增步驟";
};

const showMessage = (message, isError) => {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
  formMessage.hidden = false;
};

const showLogin = (message = "") => {
  adminShell.hidden = true;
  loginPanel.hidden = false;
  loginMessage.textContent = message;
  loginMessage.hidden = !message;
  loginPassword.focus();
};

const loadVoiceStatus = () => {
  apiRequest("/api/status")
    .then((response) => {
      if (!response.ok) throw new Error("無法讀取本機語音引擎狀態。");
      return response.json();
    })
    .then((status) => {
      document.querySelector("#server-status").textContent = isRemoteAdmin
        ? status.message
        : status.voiceAvailable
          ? status.message
          : "目前作業系統不支援本機 WAV 語音產生。";
    })
    .catch((error) => {
      console.error("讀取後台狀態失敗", error);
      document.querySelector("#server-status").textContent = isRemoteAdmin
        ? "無法連線雲端管理服務。"
        : "無法連線本機後台，請確認 server.py 正在執行。";
    });
};

const openAdmin = () => {
  loginPanel.hidden = true;
  adminShell.hidden = false;
  loginMessage.hidden = true;
  loadArtifacts();
  loadTeachers();
  loadVoiceStatus();
};

const collectArtifact = () => {
  const values = Object.fromEntries(new FormData(form).entries());
  return {
    id: values.id.trim(),
    title: values.title.trim(),
    subtitle: values.subtitle.trim(),
    category: values.category.trim(),
    material: values.material.trim(),
    maker: values.maker.trim(),
    technique: values.technique.trim(),
    year: values.year.trim(),
    imageAlt: values.imageAlt.trim(),
    caption: values.caption.trim(),
    description: values.description.trim(),
    voiceText: values.voiceText.trim(),
    steps: [...stepsContainer.querySelectorAll(".admin-step-card")].map((panel) => ({
      tab: panel.querySelector('[data-step-field="tab"]').value.trim(),
      title: panel.querySelector('[data-step-field="title"]').value.trim(),
      description: panel.querySelector('[data-step-field="description"]').value.trim(),
    })),
  };
};

const showSuccess = (result) => {
  const isTeacher = Boolean(result.teacher);
  const entry = isTeacher ? result.teacher : result.artifact;
  const entryName = isTeacher ? entry.name : entry.title;
  const entryUrl = isTeacher ? result.teacherUrl : result.artifactUrl;
  lastSuccessKind = isTeacher ? "teacher" : "artifact";
  document.querySelector("#success-title").textContent = `${isTeacher ? "工藝老師" : "作品"}「${entryName}」已建立`;
  document.querySelector("#success-detail").textContent = result.message;
  const qrImage = result.qrImage.startsWith("data:")
    ? result.qrImage
    : `${result.qrImage}?v=${Date.now()}`;
  document.querySelector("#qr-image").src = qrImage;
  document.querySelector("#qr-image").alt = `${isTeacher ? "工藝老師" : "作品"}導覽 QR Code`;
  document.querySelector("#qr-title").textContent = `${isTeacher ? "老師介紹" : "作品導覽"}專屬 QR Code`;
  document.querySelector("#qr-url").textContent = entryUrl;
  const downloadQr = document.querySelector("#download-qr");
  downloadQr.href = qrImage;
  downloadQr.download = result.qrFileName || `${entry.id}.png`;
  downloadQr.textContent = downloadQr.download.endsWith(".svg")
    ? "下載 QR Code SVG"
    : "下載 QR Code PNG";
  const openLink = document.querySelector("#open-artifact");
  openLink.href = entryUrl;
  openLink.textContent = isTeacher ? "開啟老師介紹頁 ↗" : "開啟作品導覽頁 ↗";
  document.querySelector("#add-another").textContent = isTeacher
    ? "＋ 繼續新增老師"
    : "＋ 繼續新增作品";
  successPanel.hidden = false;
  successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
};

const renderArtifacts = () => {
  if (!artifacts.length) {
    artifactList.textContent = "目前還沒有作品，請使用下方表單新增。";
    return;
  }
  artifactList.innerHTML = artifacts.map((artifact) => `
    <article class="admin-artifact-row">
      <div class="admin-artifact-info">
        <span class="admin-artifact-number">${String(artifact.number).padStart(2, "0")}</span>
        <div><strong>${escapeHTML(artifact.title)}</strong><span>${escapeHTML(artifact.category)}</span></div>
      </div>
      <div class="admin-artifact-actions">
        <button class="admin-artifact-button" type="button" data-action="edit" data-id="${escapeHTML(artifact.id)}" aria-label="編輯 ${escapeHTML(artifact.title)}">編輯</button>
        <button class="admin-artifact-button" type="button" data-action="qrcode" data-id="${escapeHTML(artifact.id)}" aria-label="為 ${escapeHTML(artifact.title)} 產生 QR Code">產生 QR Code</button>
      </div>
    </article>
  `).join("");
};

const loadArtifacts = async () => {
  artifactList.textContent = "正在載入作品…";
  try {
    const response = await apiRequest("/api/artifacts");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `讀取作品失敗（${response.status}）`);
    if (!Array.isArray(result.artifacts)) throw new Error("後台回傳的作品資料格式不正確。");
    artifacts = result.artifacts;
    renderArtifacts();
    return true;
  } catch (error) {
    console.error("讀取已建立作品失敗", error);
    artifactList.textContent = `無法載入作品：${error.message || "請確認本機後台仍在執行。"}`;
    return false;
  }
};

const renderTeachers = () => {
  if (!teachers.length) {
    teacherList.textContent = "目前還沒有工藝老師，請使用下方表單新增。";
    return;
  }
  teacherList.innerHTML = teachers.map((teacher) => `
    <article class="admin-artifact-row">
      <div class="admin-artifact-info">
        <span class="admin-artifact-number">${String(teacher.number).padStart(2, "0")}</span>
        <div><strong>${escapeHTML(teacher.name)}</strong><span>${escapeHTML(teacher.specialty)}</span></div>
      </div>
      <div class="admin-artifact-actions">
        <button class="admin-artifact-button" type="button" data-teacher-action="edit" data-id="${escapeHTML(teacher.id)}" aria-label="編輯 ${escapeHTML(teacher.name)}">編輯</button>
        <button class="admin-artifact-button" type="button" data-teacher-action="qrcode" data-id="${escapeHTML(teacher.id)}" aria-label="為 ${escapeHTML(teacher.name)} 產生 QR Code">產生 QR Code</button>
      </div>
    </article>
  `).join("");
};

const loadTeachers = async () => {
  teacherList.textContent = "正在載入工藝老師…";
  try {
    const response = await apiRequest("/api/teachers");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `讀取工藝老師失敗（${response.status}）`);
    if (!Array.isArray(result.teachers)) throw new Error("後台回傳的工藝老師資料格式不正確。");
    teachers = result.teachers;
    renderTeachers();
    return true;
  } catch (error) {
    console.error("讀取工藝老師清單失敗", error);
    teacherList.textContent = `無法載入工藝老師：${error.message || "請確認管理服務仍在執行。"}`;
    return false;
  }
};

const clearPhotoPreview = () => {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  photoPreview.hidden = true;
  photoPreview.removeAttribute("src");
};

const updateDefaultTeacherVoiceText = () => {
  if (teacherVoiceTextWasEdited) return;
  const name = teacherNameInput.value.trim();
  const specialty = teacherForm.elements.specialty.value.trim();
  const description = teacherDescriptionInput.value.trim();
  teacherVoiceInput.value = [
    name && `今天為你介紹工藝老師${name}。`,
    specialty && `專長是${specialty}。`,
    description,
  ].filter(Boolean).join("");
};

const clearTeacherPhotoPreview = () => {
  if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl);
  teacherPhotoPreviewUrl = null;
  teacherPhotoPreview.hidden = true;
  teacherPhotoPreview.removeAttribute("src");
};

const resetTeacherForm = () => {
  teacherForm.reset();
  editingTeacherId = null;
  teacherExistingImage = null;
  teacherVoiceTextWasEdited = false;
  teacherIdWasEdited = false;
  teacherIdInput.readOnly = false;
  clearTeacherPhotoPreview();
  teacherPhotoLabel.textContent = "老師照片";
  teacherPhotoHelp.textContent = "選填；支援 JPG、PNG、WebP，檔案需小於 10 MB。";
  teacherFormHeading.textContent = "新增工藝老師";
  document.querySelector("#teacher-edit-mode-notice").hidden = true;
  document.querySelector("#teacher-submit-label").textContent = "建立老師";
  document.querySelector("#teacher-submit-description").textContent = isRemoteAdmin
    ? "送出後會將老師資料與照片儲存至 GitHub，並產生可下載的 QR Code。"
    : "送出後會新增老師資料、上傳照片、產生語音檔及專屬 QR Code。";
  teacherFormMessage.classList.remove("error");
  teacherFormMessage.hidden = true;
};

const startEditingTeacher = (teacher) => {
  resetTeacherForm();
  editingTeacherId = teacher.id;
  teacherIdInput.value = teacher.id;
  teacherIdInput.readOnly = true;
  teacherNameInput.value = teacher.name || "";
  teacherForm.elements.specialty.value = teacher.specialty || "";
  teacherDescriptionInput.value = teacher.description || "";
  teacherForm.elements.imageAlt.value = teacher.imageAlt || "";
  teacherVoiceInput.value = teacher.voiceText || "";
  teacherVoiceTextWasEdited = true;
  teacherExistingImage = teacher.image || null;
  if (teacherExistingImage) {
    teacherPhotoPreview.src = teacherExistingImage;
    teacherPhotoPreview.hidden = false;
  }
  teacherPhotoLabel.textContent = "老師照片（選填）";
  teacherPhotoHelp.textContent = "支援 JPG、PNG、WebP，檔案需小於 10 MB；留空會保留原照片。";
  teacherFormHeading.textContent = "編輯工藝老師";
  document.querySelector("#teacher-edit-mode-name").textContent = teacher.name;
  document.querySelector("#teacher-edit-mode-notice").hidden = false;
  document.querySelector("#teacher-submit-label").textContent = "儲存修改";
  document.querySelector("#teacher-submit-description").textContent = isRemoteAdmin
    ? "儲存後會更新公開老師介紹；網址代碼與 QR Code 維持不變。"
    : "儲存後會更新老師介紹；語音稿變更時會重新產生 WAV。";
  teacherFormMessage.classList.remove("error");
  teacherFormMessage.hidden = true;
  successPanel.hidden = true;
  teacherForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

const resetEditor = () => {
  form.reset();
  editingArtifactId = null;
  existingImage = null;
  voiceTextWasEdited = false;
  titleWasEdited = false;
  idInput.readOnly = false;
  photoInput.required = true;
  photoLabel.innerHTML = '作品照片 <i>*</i>';
  photoHelp.textContent = "支援 JPG、PNG、WebP，檔案需小於 10 MB。";
  document.querySelector("#edit-mode-notice").hidden = true;
  document.querySelector("#submit-label").textContent = "建立作品";
  document.querySelector("#submit-description").textContent = isRemoteAdmin
    ? "送出後會將作品資料與照片儲存至 GitHub，並產生可下載的 QR Code。"
    : "送出後會新增作品資料、上傳照片、產生語音檔及 QR Code。";
  clearPhotoPreview();
  stepsContainer.replaceChildren();
  stepCount = 0;
  addStep();
};

const startEditing = (artifact) => {
  resetEditor();
  editingArtifactId = artifact.id;
  idInput.value = artifact.id;
  idInput.readOnly = true;
  titleWasEdited = true;
  for (const field of [
    "title", "subtitle", "category", "maker", "material", "technique",
    "year", "description", "imageAlt", "caption", "voiceText",
  ]) {
    form.elements[field].value = artifact[field] || "";
  }
  photoInput.required = false;
  photoLabel.textContent = "作品照片（選填）";
  photoHelp.textContent = "支援 JPG、PNG、WebP，檔案需小於 10 MB；留空會保留原照片。";
  existingImage = artifact.image || null;
  if (existingImage) {
    photoPreview.src = existingImage;
    photoPreview.hidden = false;
  }
  stepsContainer.replaceChildren();
  stepCount = 0;
  (artifact.steps || []).forEach((step) => addStep(step));
  if (!artifact.steps || !artifact.steps.length) addStep();
  document.querySelector("#edit-mode-title").textContent = artifact.title;
  document.querySelector("#edit-mode-notice").hidden = false;
  document.querySelector("#submit-label").textContent = "儲存修改";
  document.querySelector("#submit-description").textContent = isRemoteAdmin
    ? "儲存後會發布作品資料；語音稿有變更時，訪客頁會改用瀏覽器語音合成。"
    : "只有更換照片或修改語音稿時，才會更新對應的素材檔。";
  formMessage.hidden = true;
  successPanel.hidden = true;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

titleInput.addEventListener("input", () => {
  if (!titleWasEdited || !idInput.value) {
    idInput.value = slugify(titleInput.value);
  }
  const imageAltInput = document.querySelector("#image-alt");
  if (!imageAltInput.value) imageAltInput.value = titleInput.value;
  updateDefaultVoiceText();
});

idInput.addEventListener("input", () => {
  titleWasEdited = idInput.value !== slugify(titleInput.value);
});

descriptionInput.addEventListener("input", updateDefaultVoiceText);
voiceInput.addEventListener("input", () => {
  voiceTextWasEdited = true;
});

photoInput.addEventListener("change", () => {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  const file = photoInput.files[0];
  if (!file) {
    photoPreview.hidden = !existingImage;
    if (existingImage) photoPreview.src = existingImage;
    else photoPreview.removeAttribute("src");
    return;
  }
  photoPreviewUrl = URL.createObjectURL(file);
  photoPreview.src = photoPreviewUrl;
  photoPreview.hidden = false;
});

addStepButton.addEventListener("click", () => addStep());
document.querySelector("#refresh-artifacts").addEventListener("click", loadArtifacts);
document.querySelector("#refresh-teachers").addEventListener("click", loadTeachers);
document.querySelector("#cancel-edit").addEventListener("click", () => {
  resetEditor();
  formMessage.hidden = true;
});
document.querySelector("#cancel-teacher-edit").addEventListener("click", () => {
  resetTeacherForm();
});
artifactList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const artifact = artifacts.find((item) => item.id === button.dataset.id);
  if (!artifact) {
    await loadArtifacts();
    return;
  }
  if (button.dataset.action === "edit") {
    startEditing(artifact);
    return;
  }

  successPanel.hidden = true;
  formMessage.hidden = true;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "正在產生…";
  try {
    const response = await apiRequest(`/api/artifacts/${encodeURIComponent(artifact.id)}/qrcode`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `產生 QR Code 失敗（${response.status}）`);
    showSuccess(result);
  } catch (error) {
    showMessage(`產生 QR Code 失敗：${error.message || "請稍後再試。"}`, true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

teacherList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-teacher-action]");
  if (!button || button.disabled) return;
  const teacher = teachers.find((item) => item.id === button.dataset.id);
  if (!teacher) {
    await loadTeachers();
    return;
  }
  if (button.dataset.teacherAction === "edit") {
    startEditingTeacher(teacher);
    return;
  }
  if (button.dataset.teacherAction !== "qrcode") return;

  successPanel.hidden = true;
  teacherFormMessage.hidden = true;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "正在產生…";
  try {
    const response = await apiRequest(`/api/teachers/${encodeURIComponent(teacher.id)}/qrcode`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `產生 QR Code 失敗（${response.status}）`);
    showSuccess(result);
  } catch (error) {
    teacherFormMessage.textContent = `產生 QR Code 失敗：${error.message || "請稍後再試。"}`;
    teacherFormMessage.classList.add("error");
    teacherFormMessage.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

document.querySelector("#add-another").addEventListener("click", () => {
  if (lastSuccessKind === "teacher") {
    resetTeacherForm();
    successPanel.hidden = true;
    loadTeachers();
    teacherForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  resetEditor();
  successPanel.hidden = true;
  formMessage.hidden = true;
  loadArtifacts();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

teacherNameInput.addEventListener("input", () => {
  if (!teacherIdWasEdited || !teacherIdInput.value) {
    teacherIdInput.value = slugify(teacherNameInput.value);
  }
  const imageAltInput = document.querySelector("#teacher-image-alt");
  if (!imageAltInput.value) imageAltInput.value = teacherNameInput.value;
  updateDefaultTeacherVoiceText();
});
teacherIdInput.addEventListener("input", () => {
  teacherIdWasEdited = teacherIdInput.value !== slugify(teacherNameInput.value);
});
teacherForm.elements.specialty.addEventListener("input", updateDefaultTeacherVoiceText);
teacherDescriptionInput.addEventListener("input", updateDefaultTeacherVoiceText);
teacherVoiceInput.addEventListener("input", () => {
  teacherVoiceTextWasEdited = true;
});
teacherPhotoInput.addEventListener("change", () => {
  if (teacherPhotoPreviewUrl) URL.revokeObjectURL(teacherPhotoPreviewUrl);
  teacherPhotoPreviewUrl = null;
  const file = teacherPhotoInput.files[0];
  if (!file) {
    teacherPhotoPreview.hidden = !teacherExistingImage;
    if (teacherExistingImage) teacherPhotoPreview.src = teacherExistingImage;
    else teacherPhotoPreview.removeAttribute("src");
    return;
  }
  teacherPhotoPreviewUrl = URL.createObjectURL(file);
  teacherPhotoPreview.src = teacherPhotoPreviewUrl;
  teacherPhotoPreview.hidden = false;
});

teacherForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  teacherFormMessage.hidden = true;
  successPanel.hidden = true;
  if (!teacherForm.reportValidity()) return;

  const isEditing = editingTeacherId !== null;
  const photo = teacherPhotoInput.files[0];
  if (photo && !teacherForm.elements.imageAlt.value.trim()) {
    teacherFormMessage.textContent = "上傳老師照片時請填寫照片替代文字。";
    teacherFormMessage.classList.add("error");
    teacherFormMessage.hidden = false;
    return;
  }
  if (photo && photo.size > 10 * 1024 * 1024) {
    teacherFormMessage.textContent = "照片檔案需小於 10 MB。";
    teacherFormMessage.classList.add("error");
    teacherFormMessage.hidden = false;
    return;
  }

  const teacher = {
    id: teacherIdInput.value.trim(),
    name: teacherNameInput.value.trim(),
    specialty: teacherForm.elements.specialty.value.trim(),
    description: teacherDescriptionInput.value.trim(),
    imageAlt: teacherForm.elements.imageAlt.value.trim(),
    voiceText: teacherVoiceInput.value.trim(),
  };
  const payload = new FormData();
  payload.append("teacher", JSON.stringify(teacher));
  if (photo) payload.append("photo", photo, photo.name);
  teacherSubmitButton.disabled = true;
  document.querySelector("#teacher-submit-label").textContent = isEditing ? "正在儲存修改…" : "正在建立老師…";
  teacherFormMessage.classList.remove("error");
  teacherFormMessage.textContent = isRemoteAdmin
    ? isEditing
      ? "正在更新老師資料並發布至公開網站…"
      : "正在儲存老師資料並發布至公開網站…"
    : isEditing
      ? "正在儲存老師資料，語音稿變更時會重新產生 WAV。"
      : "正在以本機繁體中文語音產生 WAV，請稍候。";
  teacherFormMessage.hidden = false;

  try {
    const endpoint = isEditing
      ? `/api/teachers/${encodeURIComponent(editingTeacherId)}`
      : "/api/teachers";
    const response = await apiRequest(endpoint, { method: isEditing ? "PUT" : "POST", body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `${isEditing ? "更新" : "新增"}工藝老師失敗（${response.status}）`);
    if (isEditing) {
      resetTeacherForm();
      teacherFormMessage.textContent = result.message;
      teacherFormMessage.hidden = false;
    } else {
      teacherFormMessage.textContent = result.message;
      showSuccess(result);
      resetTeacherForm();
    }
    await loadTeachers();
  } catch (error) {
    teacherFormMessage.textContent = error.message || "儲存工藝老師失敗，請確認管理服務仍在執行。";
    teacherFormMessage.classList.add("error");
    teacherFormMessage.hidden = false;
  } finally {
    teacherSubmitButton.disabled = false;
    document.querySelector("#teacher-submit-label").textContent = editingTeacherId ? "儲存修改" : "建立老師";
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.hidden = true;
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await apiRequest("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginPassword.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "登入失敗。");
    if (isRemoteAdmin) {
      if (typeof result.token !== "string" || !result.token) {
        throw new Error("雲端管理服務未提供有效的登入工作階段。");
      }
      adminToken = result.token;
    }
    loginPassword.value = "";
    openAdmin();
  } catch (error) {
    loginMessage.textContent = error.message || (isRemoteAdmin
      ? "登入失敗，請確認雲端管理服務已設定。"
      : "登入失敗，請確認本機後台仍在執行。");
    loginMessage.hidden = false;
    loginPassword.focus();
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    const response = await apiRequest("/api/logout", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "登出失敗。");
    adminToken = null;
    loginPassword.value = "";
    showLogin();
  } catch (error) {
    showMessage(error.message || "登出失敗，請稍後再試。", true);
  } finally {
    logoutButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.hidden = true;
  successPanel.hidden = true;

  if (!form.reportValidity()) return;
  const photo = photoInput.files[0];
  const isEditing = editingArtifactId !== null;
  if (!isEditing && !photo) {
    showMessage("請選擇一張作品照片。", true);
    return;
  }
  if (photo && photo.size > 10 * 1024 * 1024) {
    showMessage("照片檔案需小於 10 MB。", true);
    return;
  }

  const artifact = collectArtifact();
  const payload = new FormData();
  payload.append("artifact", JSON.stringify(artifact));
  if (photo) payload.append("photo", photo, photo.name);
  submitButton.disabled = true;
  document.querySelector("#submit-label").textContent = isEditing ? "正在儲存修改…" : "正在建立作品…";
  showMessage(isRemoteAdmin
    ? "正在儲存作品資料並發布至公開網站…"
    : isEditing
      ? "正在儲存作品資料，若修改語音稿會重新產生 WAV。"
      : "正在以本機繁體中文語音產生 WAV，請稍候。", false);

  try {
    const endpoint = isEditing
      ? `/api/artifacts/${encodeURIComponent(editingArtifactId)}`
      : "/api/artifacts";
    const response = await apiRequest(endpoint, { method: isEditing ? "PUT" : "POST", body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `新增失敗（${response.status}）`);
    if (isEditing) {
      resetEditor();
      showMessage(`${result.message} 如需更新 QR Code，請在作品清單點選「產生 QR Code」。`, false);
    } else {
      showMessage(result.message, false);
      showSuccess(result);
    }
    await loadArtifacts();
  } catch (error) {
    showMessage(error.message || "新增作品失敗，請確認網站伺服器仍在執行。", true);
  } finally {
    submitButton.disabled = false;
    document.querySelector("#submit-label").textContent = editingArtifactId ? "儲存修改" : "建立作品";
  }
});

addStep();

if (isPublishedAdmin && !adminApiBase) {
  loginForm.querySelector('button[type="submit"]').disabled = true;
  showLogin("雲端管理服務尚未設定，請稍後再試。");
} else {
  apiRequest("/api/session")
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法確認登入狀態。");
      if (result.authenticated) openAdmin();
      else showLogin();
    })
    .catch((error) => {
      console.error("確認後台登入狀態失敗", error);
      showLogin(isRemoteAdmin
        ? "無法連線雲端管理服務，請確認服務網址與設定。"
        : "無法連線本機後台，請確認 server.py 正在執行。");
    });
}
