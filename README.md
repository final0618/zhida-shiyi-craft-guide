# 知達拾藝 Craft Guide

無資料庫的工藝品導覽網站。作品資料存放於 `data/artifacts.json`，工藝老師資料存放於 `data/teachers.json`；照片、語音 WAV 與 QR Code 分別存於 `assets/uploads/`、`assets/audio/` 與 `qrcodes/`。

掃描作品 QR Code 開啟作品頁時，網站會嘗試自動播放語音介紹，並在作品頁提供明顯的「播放語音介紹」按鈕；掃描工藝老師 QR Code 則直接開啟老師介紹及語音。若瀏覽器封鎖自動播放，可使用頁面上的播放控制。

作品詳情頁會由知達小匠陪同導覽；語音播放時會有嘴型變化，暫停或結束時則更新提示與動態狀態。首頁及作品頁的小匠圖片可進入知達小匠介紹頁（`guide.html`）。

## 啟動網站與本機後台

使用 Windows 與 Python 3.9 以上版本。在專案資料夾執行：

```powershell
python -m pip install -r requirements.txt
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run_server.ps1
```

請使用 Windows PowerShell 5.1 啟動，並保持視窗開啟。若系統限制執行本機腳本，可在目前終端機執行 `Set-ExecutionPolicy -Scope Process Bypass`，再重試；這不需要管理員權限。

網站啟動後：

- 本機管理後台：`http://127.0.0.1:8000/admin`
- 同一 Wi-Fi 的訪客預覽網址會顯示在伺服器啟動訊息中。

管理 API 與管理頁僅接受本機連線。網站內容可以讓同一 Wi-Fi 的訪客瀏覽；管理後台產生的 QR Code 會指向公開網站 `https://final0618.github.io/zhida-shiyi-craft-guide/`。Windows 防火牆若詢問是否允許連線，只有需要讓同一 Wi-Fi 的訪客瀏覽時才允許私人網路存取。

進入管理後台需要輸入管理密碼；登入工作階段最長有效 12 小時，登出或重啟伺服器後需重新登入。管理 API 也會檢查登入狀態，不要將本機管理伺服器暴露到公用網際網路。

## 新增工藝品

在管理後台輸入作品資料、上傳 JPG／PNG／WebP 照片及填寫工藝步驟。送出後會：

1. 將作品資料追加到 `data/artifacts.json`。
2. 將照片存入 `assets/uploads/`。
3. 使用 Windows 內建的繁體中文（台灣）語音離線產生 WAV，存入 `assets/audio/`。
4. 產生作品專屬 QR Code PNG，存入 `qrcodes/`。

語音不會送到雲端。電腦需要安裝 Windows 繁體中文語音；啟動時會確認語音並顯示使用的語音名稱。語音會使用 Windows 內建的 .NET 語音引擎產生 WAV。請保持啟動網站的 PowerShell 視窗開啟，並定期備份整個專案資料夾。

## 編輯作品與重新產生 QR Code

管理後台的「已建立作品」清單可載入既有作品。選擇「編輯」後可修改介紹、語音稿及工藝步驟；網址代碼固定，照片可留空以保留原圖。只有更換照片或修改語音稿時，系統才會更新對應素材。選擇「產生 QR Code」會以目前設定的訪客網址重新產生該作品的 PNG。

## 工藝老師介紹

首頁新增「工藝老師」區塊，列出老師照片或姓名圖示、姓名、專長與介紹；選取老師卡片可進入介紹頁並播放語音。管理後台可新增及編輯工藝老師，填寫姓名、工藝專長、介紹及語音稿；老師照片為選填。編輯時網址代碼固定，未重新上傳照片會保留原圖；本機模式在語音稿變更時重新產生 WAV，原 QR Code 仍可使用。新增老師會加入 `data/teachers.json` 並產生專屬 QR Code。掃描 QR Code 會使用 `?teacher=<網址代碼>` 開啟相同介紹頁。

老師介紹頁會比對作品資料的「創作者」欄位；姓名相符時，頁面會列出通往既有作品頁的連結。多位創作者可用「、」、逗號、分號或斜線分隔，姓名需完整相符。老師資料、圖片及本機語音素材請一併備份。

隨附的陳高明測試資料參考 [La Vie 的 43 椅介紹](https://www.wowlavie.com/article/ae1502235) 與 [Yii 工藝中心的 43 椅作品資料](https://yii.ntcri.gov.tw/home/zh-tw/Collection/909)，未使用老師肖像照片。

## QR Code 網址範圍

新增或重新產生的 QR Code 預設指向上述公開網站。透過本機後台新增作品時，資料和素材仍只儲存在本機；請先將更新後的作品資料與素材發布到網站，再讓訪客掃描該作品的公開 QR Code。

可使用 `python generate_qr.py --base-url https://你的正式網站網址` 產生指向正式網址的 QR Code。這個本機管理後台不是可直接部署至純靜態網站空間的版本；公開部署時仍需設定適當的主機與管理安全措施。不要將本機管理伺服器直接暴露到公用網際網路。

## 雲端管理後台（Cloudflare Worker）

雲端管理不使用資料庫：Cloudflare Worker 驗證管理者並透過 GitHub API 更新 `data/artifacts.json`、`data/teachers.json` 與相關照片；每次更新會建立 Git commit，觸發 GitHub Pages 發布。雲端模式保存語音稿，不產生 WAV；訪客端使用瀏覽器語音合成。本機管理方式仍維持原狀。

啟用前需有 Node.js/npm、Cloudflare 帳號，以及只允許存取此作品儲存庫、具 **Contents: Read and write** 權限的 GitHub fine-grained token。在專案目錄執行：

```powershell
Set-Location .\cloudflare
npm install
npx wrangler login
```

`wrangler.toml` 的 `namespace_id` 必須是帳號內唯一的正整數；目前設定為 `2026111501`，若已被其他 Worker 使用，請改成另一個未使用的正整數。並確認 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH`、`PUBLIC_BASE_URL` 與 `ALLOWED_ORIGINS` 符合正式網站。首次先部署 Worker，再用 Wrangler 的互動提示設定 secrets；每次設定 secret 都會更新 Worker 部署：

```powershell
npx wrangler deploy
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
```

雲端管理密碼至少 20 個字元；`SESSION_SECRET` 請使用隨機且至少 32 個字元的值。可在本機以 `python -c "import secrets; print(secrets.token_urlsafe(48))"` 產生。密碼、session secret 與 GitHub token 只能輸入 Wrangler 提示，勿貼到聊天、程式碼或版本控制。

部署後，確認發布版 `admin.html` 的 `<meta name="craft-admin-api">` 已設為 Worker 的 HTTPS 網址（本專案目前使用 `https://zhida-shiyi-admin-api.final0618000001.workers.dev`），並把 `admin.html`、`admin.js` 和 `cloudflare/` 一併發布至 GitHub Pages 儲存庫。Worker 只允許 `ALLOWED_ORIGINS` 列出的來源；若使用自訂網域，需同步更新該設定。登入 token 僅保存在目前頁面的記憶體，有效 4 小時；登出或關閉頁面會清除瀏覽器中的 token。

## 其他方式

只預覽靜態頁面可執行 `python -m http.server 8000`，但此簡易伺服器不包含新增作品、語音生成或管理 API。管理後台請使用 `run_server.ps1` 啟動。

若要獨立產生公開網址 QR Code，可執行：

```powershell
python generate_qr.py --base-url https://你的正式網站網址
```
