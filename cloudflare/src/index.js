import qrcode from "qrcode-generator";

const textEncoder = new TextEncoder();
const maxRequestSize = 15 * 1024 * 1024;
const maxPhotoSize = 10 * 1024 * 1024;
const sessionTtlSeconds = 4 * 60 * 60;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const jsonResponse = (status, value) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  },
});

const errorResponse = (status, message) => jsonResponse(status, { error: message });

const corsHeadersFor = (origin, env) => {
  const allowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowedOrigins.includes(origin)) return null;

  return new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  });
};

const addCorsHeaders = (response, corsHeaders) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const encodeBase64Url = (bytes) => bytesToBase64(bytes)
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

const decodeBase64Url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(base64 + "=".repeat((4 - base64.length % 4) % 4));
};

const importSessionKey = async (env) => {
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, "雲端登入工作階段尚未完成安全設定。");
  }
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
};

const createSessionToken = async (env) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(textEncoder.encode(JSON.stringify({
    sub: "admin",
    iat: now,
    exp: now + sessionTtlSeconds,
  })));
  const key = await importSessionKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
};

const verifySessionToken = async (token, env) => {
  if (typeof token !== "string" || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

  try {
    const key = await importSessionKey(env);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parts[1]),
      textEncoder.encode(parts[0]),
    );
    if (!valid) return false;
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    return claims.sub === "admin"
      && Number.isInteger(claims.exp)
      && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

const bearerTokenFrom = (request) => {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
};

const requireAdmin = async (request, env) => {
  if (!await verifySessionToken(bearerTokenFrom(request), env)) {
    throw new ApiError(401, "登入工作階段已逾期，請重新登入。");
  }
};

const readJsonBody = async (request, maxSize) => {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxSize) throw new ApiError(413, "送出的資料超過大小限制。");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw new ApiError(400, "請提供登入資料。");
  if (bytes.length > maxSize) throw new ApiError(413, "送出的資料超過大小限制。");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "送出的資料不是有效的 JSON。");
  }
};

const constantTimeEquals = (left, right) => {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
};

const handleLogin = async (request, env) => {
  const limiter = env.LOGIN_RATE_LIMITER;
  if (limiter) {
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const result = await limiter.limit({ key: `login:${clientIp}` });
    if (!result.success) throw new ApiError(429, "登入嘗試過於頻繁，請稍後再試。");
  }

  if (typeof env.ADMIN_PASSWORD !== "string" || env.ADMIN_PASSWORD.length < 20) {
    throw new ApiError(503, "雲端管理密碼尚未完成安全設定。");
  }
  const credentials = await readJsonBody(request, 4096);
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)
    || typeof credentials.password !== "string") {
    throw new ApiError(400, "登入資料格式不正確。");
  }
  if (!constantTimeEquals(credentials.password, env.ADMIN_PASSWORD)) {
    throw new ApiError(401, "密碼錯誤，請再試一次。");
  }

  return jsonResponse(200, {
    authenticated: true,
    token: await createSessionToken(env),
    expiresIn: sessionTtlSeconds,
  });
};

const repoPath = (env, suffix) => {
  if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH || !env.GITHUB_TOKEN) {
    throw new ApiError(503, "GitHub 作品儲存服務尚未完成設定。");
  }
  return `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}${suffix}`;
};

const githubJson = async (path, env, method = "GET", body) => {
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "Zhida-Shiyi-Craft-Guide",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    console.error("GitHub API request failed.", error);
    throw new ApiError(502, "目前無法連線 GitHub，請稍後再試。");
  }

  if (!response.ok) {
    if (response.status === 409) {
      throw new ApiError(409, "作品資料剛被更新，請重新整理作品清單後再試。");
    }
    if (response.status === 422) {
      throw new ApiError(502, "GitHub 拒絕這次提交；請確認主分支允許 Worker 寫入，且資料格式符合限制。");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, "GitHub 拒絕更新，請檢查 Worker 的儲存庫權限或 API 限流。");
    }
    if (response.status === 404) {
      throw new ApiError(502, "找不到 GitHub 作品儲存庫或資料檔。");
    }
    throw new ApiError(502, "GitHub 暫時無法處理作品資料，請稍後再試。");
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError(502, "GitHub 回傳了無法讀取的結果。");
  }
};

const readArtifacts = async (env) => {
  const path = repoPath(
    env,
    `/contents/data/artifacts.json?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
  );
  const file = await githubJson(path, env);
  if (file.encoding !== "base64" || typeof file.content !== "string") {
    throw new ApiError(502, "GitHub 作品資料格式不正確。");
  }
  let artifacts;
  try {
    artifacts = JSON.parse(new TextDecoder().decode(base64ToBytes(file.content)));
  } catch {
    throw new ApiError(502, "GitHub 作品資料不是有效的 JSON。");
  }
  if (!Array.isArray(artifacts)) throw new ApiError(502, "GitHub 作品清單格式不正確。");
  return artifacts;
};

const readTeachers = async (env) => {
  const path = repoPath(
    env,
    `/contents/data/teachers.json?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
  );
  const file = await githubJson(path, env);
  if (file.encoding !== "base64" || typeof file.content !== "string") {
    throw new ApiError(502, "GitHub 工藝老師資料格式不正確。");
  }
  let teachers;
  try {
    teachers = JSON.parse(new TextDecoder().decode(base64ToBytes(file.content)));
  } catch {
    throw new ApiError(502, "GitHub 工藝老師資料不是有效的 JSON。");
  }
  if (!Array.isArray(teachers)) throw new ApiError(502, "GitHub 工藝老師清單格式不正確。");
  return teachers;
};

const validateArtifact = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "作品資料格式不正確。");
  }
  if (typeof value.id !== "string"
    || value.id.length > 60
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    throw new ApiError(400, "作品網址代碼僅可使用小寫英文字母、數字與連字號。");
  }

  const limits = {
    title: 80,
    subtitle: 100,
    category: 40,
    maker: 80,
    material: 100,
    technique: 100,
    year: 30,
    caption: 100,
    imageAlt: 160,
    description: 2000,
    voiceText: 5000,
  };
  const artifact = { id: value.id };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > limit) {
      throw new ApiError(400, `請確認「${field}」已填寫且未超過長度限制。`);
    }
    artifact[field] = value[field].trim();
  }

  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 6) {
    throw new ApiError(400, "工藝步驟需設定 1 至 6 個。");
  }
  artifact.steps = value.steps.map((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new ApiError(400, "每個工藝步驟都需填寫標籤、標題與介紹。");
    }
    const limits = { tab: 20, title: 80, description: 600 };
    const result = {};
    for (const [field, limit] of Object.entries(limits)) {
      if (typeof step[field] !== "string" || !step[field].trim() || step[field].length > limit) {
        throw new ApiError(400, "每個工藝步驟都需填寫標籤、標題與介紹。");
      }
      result[field] = step[field].trim();
    }
    return result;
  });
  return artifact;
};

const validateTeacher = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "工藝老師資料格式不正確。");
  }
  if (typeof value.id !== "string"
    || value.id.length > 60
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    throw new ApiError(400, "老師網址代碼僅可使用小寫英文字母、數字與連字號。");
  }

  const limits = {
    name: 80,
    specialty: 100,
    description: 2000,
    voiceText: 5000,
  };
  const teacher = { id: value.id };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof value[field] !== "string" || !value[field].trim() || value[field].length > limit) {
      throw new ApiError(400, `請確認「${field}」已填寫且未超過長度限制。`);
    }
    teacher[field] = value[field].trim();
  }
  const imageAlt = value.imageAlt === undefined ? "" : value.imageAlt;
  if (typeof imageAlt !== "string" || imageAlt.length > 160) {
    throw new ApiError(400, "照片替代文字不可超過 160 個字。");
  }
  teacher.imageAlt = imageAlt.trim();
  return teacher;
};

const readPhoto = async (file, label = "作品") => {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) {
    throw new ApiError(400, `請選擇一張${label}照片。`);
  }
  if (file.size > maxPhotoSize) throw new ApiError(413, "照片檔案需小於 10 MB。");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.length >= 12
    && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  if (isPng) return { bytes, extension: "png" };
  if (isJpeg) return { bytes, extension: "jpg" };
  if (isWebp) return { bytes, extension: "webp" };
  throw new ApiError(400, "照片檔案格式無效，請使用 JPG、PNG 或 WebP。");
};

const readEntityForm = async (request, field, validator, label) => {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxRequestSize) {
    throw new ApiError(413, "表單總大小需小於 15 MB。");
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "請使用有效的 multipart/form-data 表單。");
  }
  let totalSize = 0;
  for (const [, value] of form.entries()) {
    totalSize += typeof value === "string"
      ? textEncoder.encode(value).length
      : Number(value.size) || 0;
  }
  if (totalSize > maxRequestSize) throw new ApiError(413, "表單總大小需小於 15 MB。");
  const recordText = form.get(field);
  if (typeof recordText !== "string") throw new ApiError(400, `${label}資料格式不正確。`);
  let input;
  try {
    input = JSON.parse(recordText);
  } catch {
    throw new ApiError(400, `${label}資料不是有效的 JSON。`);
  }
  return { record: validator(input), photo: form.get("photo") };
};

const readArtifactForm = async (request) => {
  const { record, photo } = await readEntityForm(request, "artifact", validateArtifact, "作品");
  return { artifact: record, photo };
};

const readTeacherForm = async (request) => {
  const { record, photo } = await readEntityForm(request, "teacher", validateTeacher, "工藝老師");
  return { teacher: record, photo };
};

const bytesToBlob = async (bytes, env) => githubJson(
  repoPath(env, "/git/blobs"),
  env,
  "POST",
  { content: bytesToBase64(bytes), encoding: "base64" },
);

const commitFiles = async (files, message, env) => {
  const branch = encodeURIComponent(env.GITHUB_BRANCH);
  const ref = await githubJson(repoPath(env, `/git/ref/heads/${branch}`), env);
  const parent = await githubJson(repoPath(env, `/git/commits/${ref.object.sha}`), env);
  const entries = await Promise.all(files.map(async (file) => {
    const blob = await bytesToBlob(file.bytes, env);
    return {
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    };
  }));
  const tree = await githubJson(
    repoPath(env, "/git/trees"),
    env,
    "POST",
    { base_tree: parent.tree.sha, tree: entries },
  );
  const commit = await githubJson(
    repoPath(env, "/git/commits"),
    env,
    "POST",
    { message, tree: tree.sha, parents: [parent.sha] },
  );
  await githubJson(
    repoPath(env, `/git/refs/heads/${branch}`),
    env,
    "PATCH",
    { sha: commit.sha, force: false },
  );
};

const publicUrlFor = (env, key, id) => {
  let url;
  try {
    url = new URL(env.PUBLIC_BASE_URL);
  } catch {
    throw new ApiError(503, "公開網站網址尚未完成設定。");
  }
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new ApiError(503, "公開網站網址設定不正確。");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.searchParams.set(key, id);
  return url.toString();
};

const artifactUrlFor = (env, artifactId) => publicUrlFor(env, "artifact", artifactId);
const teacherUrlFor = (env, teacherId) => publicUrlFor(env, "teacher", teacherId);

const qrResultFor = (env, artifact) => {
  const artifactUrl = artifactUrlFor(env, artifact.id);
  const code = qrcode(0, "M");
  code.addData(artifactUrl);
  code.make();
  const svg = code.createSvgTag({
    cellSize: 8,
    margin: 4,
    scalable: true,
    alt: "作品導覽 QR Code",
    title: "作品導覽 QR Code",
  });
  return {
    artifactUrl,
    qrImage: `data:image/svg+xml;base64,${bytesToBase64(textEncoder.encode(svg))}`,
    qrFileName: `${artifact.id}.svg`,
  };
};

const teacherQrResultFor = (env, teacher) => {
  const teacherUrl = teacherUrlFor(env, teacher.id);
  const code = qrcode(0, "M");
  code.addData(teacherUrl);
  code.make();
  const svg = code.createSvgTag({
    cellSize: 8,
    margin: 4,
    scalable: true,
    alt: "工藝老師介紹 QR Code",
    title: "工藝老師介紹 QR Code",
  });
  return {
    teacherUrl,
    qrImage: `data:image/svg+xml;base64,${bytesToBase64(textEncoder.encode(svg))}`,
    qrFileName: `teacher-${teacher.id}.svg`,
  };
};

const handleCreateArtifact = async (request, env) => {
  const { artifact, photo } = await readArtifactForm(request);
  if (!photo || typeof photo.arrayBuffer !== "function") {
    throw new ApiError(400, "請選擇一張作品照片。");
  }
  const image = await readPhoto(photo);
  const artifacts = await readArtifacts(env);
  if (artifacts.some((item) => item.id === artifact.id)) {
    throw new ApiError(409, "這個作品網址代碼已存在，請換一個代碼。");
  }

  artifact.number = artifacts.length + 1;
  artifact.image = `./assets/uploads/${artifact.id}-${crypto.randomUUID()}.${image.extension}`;
  delete artifact.audio;
  const updatedArtifacts = [...artifacts, artifact];
  const qr = qrResultFor(env, artifact);
  await commitFiles([
    {
      path: artifact.image.slice(2),
      bytes: image.bytes,
    },
    {
      path: "data/artifacts.json",
      bytes: textEncoder.encode(`${JSON.stringify(updatedArtifacts, null, 2)}\n`),
    },
  ], `Add craft artifact ${artifact.id}`, env);

  return jsonResponse(201, {
    ...qr,
    artifact,
    message: "作品已儲存至 GitHub，公開導覽網站正在更新。",
  });
};

const handleCreateTeacher = async (request, env) => {
  const { teacher, photo } = await readTeacherForm(request);
  if (photo && typeof photo.arrayBuffer === "function" && photo.size > 0 && !teacher.imageAlt) {
    throw new ApiError(400, "請填寫老師照片替代文字。");
  }
  const image = photo && typeof photo.arrayBuffer === "function" && photo.size > 0
    ? await readPhoto(photo, "工藝老師")
    : null;
  const teachers = await readTeachers(env);
  if (teachers.some((item) => item.id === teacher.id)) {
    throw new ApiError(409, "這個老師網址代碼已存在，請換一個代碼。");
  }

  teacher.number = teachers.length + 1;
  if (image) teacher.image = `./assets/uploads/teachers/${teacher.id}-${crypto.randomUUID()}.${image.extension}`;
  delete teacher.audio;
  const updatedTeachers = [...teachers, teacher];
  const qr = teacherQrResultFor(env, teacher);
  const files = [
    ...(image ? [{
      path: teacher.image.slice(2),
      bytes: image.bytes,
    }] : []),
    {
      path: "data/teachers.json",
      bytes: textEncoder.encode(`${JSON.stringify(updatedTeachers, null, 2)}\n`),
    },
  ];
  await commitFiles(files, `Add craft teacher ${teacher.id}`, env);

  return jsonResponse(201, {
    ...qr,
    teacher,
    message: "工藝老師已儲存至 GitHub，公開導覽網站正在更新。",
  });
};

const handleUpdateArtifact = async (request, env, artifactId) => {
  const { artifact, photo } = await readArtifactForm(request);
  if (artifact.id !== artifactId) throw new ApiError(400, "編輯時不可變更作品網址代碼。");
  const artifacts = await readArtifacts(env);
  const index = artifacts.findIndex((item) => item.id === artifactId);
  if (index < 0) throw new ApiError(404, "找不到這件作品。");

  const previous = artifacts[index];
  artifact.number = previous.number || index + 1;
  artifact.image = previous.image;
  if (artifact.voiceText === previous.voiceText && typeof previous.audio === "string") {
    artifact.audio = previous.audio;
  }

  const files = [];
  if (photo && typeof photo.arrayBuffer === "function" && photo.size > 0) {
    const image = await readPhoto(photo);
    artifact.image = `./assets/uploads/${artifactId}-${crypto.randomUUID()}.${image.extension}`;
    files.push({ path: artifact.image.slice(2), bytes: image.bytes });
  }
  artifacts[index] = artifact;
  files.push({
    path: "data/artifacts.json",
    bytes: textEncoder.encode(`${JSON.stringify(artifacts, null, 2)}\n`),
  });
  await commitFiles(files, `Update craft artifact ${artifactId}`, env);
  return jsonResponse(200, {
    artifact,
    message: "作品已儲存至 GitHub，公開導覽網站正在更新。",
  });
};

const routeRequest = async (request, env) => {
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();

  if (pathname === "/api/login" && method === "POST") return handleLogin(request, env);
  if (pathname === "/api/session" && method === "GET") {
    return jsonResponse(200, {
      authenticated: await verifySessionToken(bearerTokenFrom(request), env),
    });
  }
  if (pathname === "/api/logout" && method === "POST") {
    await requireAdmin(request, env);
    return jsonResponse(200, { authenticated: false });
  }
  if (pathname === "/api/status" && method === "GET") {
    await requireAdmin(request, env);
    return jsonResponse(200, {
      voiceAvailable: false,
      message: "雲端管理模式・作品與工藝老師資料存於 GitHub；訪客裝置會使用瀏覽器語音合成。",
    });
  }
  if (pathname === "/api/artifacts" && method === "GET") {
    await requireAdmin(request, env);
    return jsonResponse(200, { artifacts: await readArtifacts(env) });
  }
  if (pathname === "/api/teachers" && method === "GET") {
    await requireAdmin(request, env);
    return jsonResponse(200, { teachers: await readTeachers(env) });
  }
  if (pathname === "/api/artifacts" && method === "POST") {
    await requireAdmin(request, env);
    return handleCreateArtifact(request, env);
  }
  if (pathname === "/api/teachers" && method === "POST") {
    await requireAdmin(request, env);
    return handleCreateTeacher(request, env);
  }

  const qrMatch = pathname.match(/^\/api\/artifacts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/qrcode$/);
  if (qrMatch && method === "POST") {
    await requireAdmin(request, env);
    const artifacts = await readArtifacts(env);
    const artifact = artifacts.find((item) => item.id === qrMatch[1]);
    if (!artifact) throw new ApiError(404, "找不到這件作品。");
    return jsonResponse(200, {
      ...qrResultFor(env, artifact),
      artifact,
      message: "作品 QR Code 已產生。",
    });
  }

  const teacherQrMatch = pathname.match(/^\/api\/teachers\/([a-z0-9]+(?:-[a-z0-9]+)*)\/qrcode$/);
  if (teacherQrMatch && method === "POST") {
    await requireAdmin(request, env);
    const teachers = await readTeachers(env);
    const teacher = teachers.find((item) => item.id === teacherQrMatch[1]);
    if (!teacher) throw new ApiError(404, "找不到這位工藝老師。");
    return jsonResponse(200, {
      ...teacherQrResultFor(env, teacher),
      teacher,
      message: "工藝老師 QR Code 已產生。",
    });
  }

  const artifactMatch = pathname.match(/^\/api\/artifacts\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
  if (artifactMatch && method === "PUT") {
    await requireAdmin(request, env);
    return handleUpdateArtifact(request, env, artifactMatch[1]);
  }

  return errorResponse(404, "找不到這個管理 API。");
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const corsHeaders = corsHeadersFor(origin, env);
    if (!corsHeaders) return errorResponse(403, "不允許的來源網站。");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      return addCorsHeaders(await routeRequest(request, env), corsHeaders);
    } catch (error) {
      if (error instanceof ApiError) {
        return addCorsHeaders(errorResponse(error.status, error.message), corsHeaders);
      }
      console.error("Cloudflare admin request failed.", error);
      return addCorsHeaders(errorResponse(500, "雲端管理服務發生錯誤，請稍後再試。"), corsHeaders);
    }
  },
};
