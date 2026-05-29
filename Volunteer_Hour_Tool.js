// Volunteer_Hour_Tool.js

// === Google Apps Script Web App URL（志工名單用）===
const GSHEET_VOLUNTEER_URL =
  "https://script.google.com/macros/s/AKfycbx2GxuRiXJNRYE3VLsT7Z_cC3l667XPadbr52gdR84jnwn-4M7z_1jbi9UXES7-SHidcA/exec";

// === 登入設定 ===
const APP_LOGIN_PASSWORD = "dasan123";

// localStorage keys
const VOLUNTEER_STORAGE_KEY = "volToolVolunteers";
const RECORDS_STORAGE_KEY   = "volToolRecords";

// === DOM ===
const loginSection          = document.getElementById("loginSection");
const appSection            = document.getElementById("appSection");
const loginForm             = document.getElementById("loginForm");
const loginPasswordInput    = document.getElementById("loginPassword");
const loginErrorEl          = document.getElementById("loginError");

const volunteerForm         = document.getElementById("volunteer-form");
const volunteerNameInput    = document.getElementById("volunteerName");
const volunteerIdInput      = document.getElementById("volunteerId");
const volunteerSubmitBtn    = document.getElementById("volunteerSubmitBtn");
const volunteerListEl       = document.getElementById("volunteerList");
const volunteerIdErrorEl    = document.getElementById("volunteerIdError");

const recordVolunteerSelect  = document.getElementById("recordVolunteerName");
const recordVolunteerIdInput = document.getElementById("recordVolunteerId");

const recordForm            = document.getElementById("record-form");
const startDateInput        = document.getElementById("startDate");
const endDateInput          = document.getElementById("endDate");
const serviceItemSelect     = document.getElementById("serviceItemSelect");
const serviceContentSelect  = document.getElementById("serviceContentSelect");
const hoursInput            = document.getElementById("hours");
const minutesInput          = document.getElementById("minutes");
const clientCountInput      = document.getElementById("clientCount");
const peopleCountDisplayInput = document.getElementById("peopleCountDisplay");
const trafficFeeInput       = document.getElementById("trafficFee");
const mealFeeInput          = document.getElementById("mealFee");
const recordErrorEl         = document.getElementById("recordError");
const recordSubmitBtn       = document.getElementById("recordSubmitBtn");

const recordsTableBody      = document.getElementById("recordsTableBody");
const copyTableBtn          = document.getElementById("copyTableBtn") || document.getElementById("exportCsvBtn");
const clearRecordsBtn       = document.getElementById("clearRecordsBtn");
const displayModeInputs     = document.querySelectorAll('input[name="displayMode"]');

// === 資料 ===
const volunteers = [];
const records    = [];
let displayMode  = "readable";
let editingVolunteerIndex = null;
let editingRecordIndex    = null;

// === 服務項目 / 內容代碼表 ===
const SERVICE_ITEMS = [
  { code: "0060", label: "老人服務" },
  { code: "0130", label: "社區服務" },
];

const SERVICE_CONTENTS_BY_ITEM = {
  "0060": [
    { code: "0056", label: "共餐服務" },
    { code: "0055", label: "健康促進" },
    { code: "0053", label: "關懷訪視" },
  ],
  "0130": [
    { code: "0049", label: "行政支援" },
    { code: "0006", label: "資料整理" },
    { code: "0020", label: "活動支援服務" },
    { code: "0028", label: "引導服務" },
    { code: "0012", label: "宣導推廣服務" },
    { code: "0017", label: "環保服務" },
  ],
};

// ============================================================
// === Toast 通知系統（取代 alert / confirm）===
// ============================================================

let toastContainer = null;

function getToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement("div");
  toastContainer.id = "toastContainer";
  toastContainer.style.cssText = `
    position: fixed;
    top: 1.2rem;
    right: 1.2rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * 顯示 Toast 提示
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration ms，0 = 不自動消失
 */
function showToast(message, type = "info", duration = 3200) {
  const container = getToastContainer();

  const iconMap = {
    success: "✓",
    error:   "✕",
    warning: "⚠",
    info:    "ℹ",
  };

  const colorMap = {
    success: { bg: "#f0fdf4", border: "#86efac", text: "#166534", icon: "#16a34a" },
    error:   { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", icon: "#dc2626" },
    warning: { bg: "#fffbeb", border: "#fcd34d", text: "#92400e", icon: "#d97706" },
    info:    { bg: "#f0f9ff", border: "#7dd3fc", text: "#075985", icon: "#0284c7" },
  };

  const c = colorMap[type] || colorMap.info;

  const toast = document.createElement("div");
  toast.style.cssText = `
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    background: ${c.bg};
    border: 1.5px solid ${c.border};
    border-radius: 10px;
    padding: 0.75rem 1rem;
    min-width: 240px;
    max-width: 340px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    pointer-events: auto;
    opacity: 0;
    transform: translateX(20px);
    transition: opacity 0.22s ease, transform 0.22s ease;
    cursor: default;
  `;

  const iconEl = document.createElement("span");
  iconEl.style.cssText = `
    font-size: 1rem;
    font-weight: 700;
    color: ${c.icon};
    flex-shrink: 0;
    line-height: 1.4;
  `;
  iconEl.textContent = iconMap[type] || "ℹ";

  const msgEl = document.createElement("span");
  msgEl.style.cssText = `
    font-size: 0.88rem;
    color: ${c.text};
    line-height: 1.5;
    flex: 1;
  `;
  msgEl.textContent = message;

  toast.appendChild(iconEl);
  toast.appendChild(msgEl);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateX(0)";
  });

  const dismiss = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 250);
  };

  toast.addEventListener("click", dismiss);

  if (duration > 0) setTimeout(dismiss, duration);

  return toast;
}

/**
 * 畫面內確認對話框（取代 confirm()）
 * @returns {Promise<boolean>}
 */
function showConfirm(message, confirmLabel = "確定", cancelLabel = "取消") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(15,23,42,0.35);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: #fff;
      border-radius: 14px;
      padding: 1.6rem 1.8rem 1.4rem;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 12px 36px rgba(15,23,42,0.18);
      font-family: inherit;
    `;

    const msg = document.createElement("p");
    msg.style.cssText = `
      margin: 0 0 1.3rem;
      font-size: 0.95rem;
      color: #0f172a;
      line-height: 1.6;
    `;
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.style.cssText = `
      display: flex;
      gap: 0.6rem;
      justify-content: flex-end;
    `;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.cssText = `
      padding: 0.55rem 1.2rem;
      border-radius: 999px;
      border: 1.5px solid #d1d5db;
      background: #f9fafb;
      color: #374151;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    `;

    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = confirmLabel;
    confirmBtn.style.cssText = `
      padding: 0.55rem 1.2rem;
      border-radius: 999px;
      border: none;
      background: #dc2626;
      color: #fff;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    `;

    cancelBtn.addEventListener("click", () => { overlay.remove(); resolve(false); });
    confirmBtn.addEventListener("click", () => { overlay.remove(); resolve(true); });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(msg);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 按 Escape 取消
    const onKey = (e) => {
      if (e.key === "Escape") { overlay.remove(); resolve(false); document.removeEventListener("keydown", onKey); }
    };
    document.addEventListener("keydown", onKey);
  });
}

// ============================================================
// === 小工具函式 ===
// ============================================================

function setText(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function trimValue(inputEl) {
  return inputEl ? inputEl.value.trim() : "";
}

function padCode4(code) {
  if (code === null || code === undefined) return "";
  const str = String(code).trim();
  if (!str) return "";
  return str.padStart(4, "0");
}

function getServiceItemLabel(code) {
  const item = SERVICE_ITEMS.find((i) => i.code === code);
  return item ? item.label : "";
}

function getServiceContentLabel(itemCode, contentCode) {
  const list = SERVICE_CONTENTS_BY_ITEM[itemCode] || [];
  const found = list.find((c) => c.code === contentCode);
  return found ? found.label : "";
}

function formatLocalYYYYMMDD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayLocalYYYYMMDD() {
  return formatLocalYYYYMMDD(new Date());
}

function parseIsoDateToDate(isoDateStr) {
  const parts = isoDateStr.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d);
}

function toRocDate(isoDateStr) {
  if (!isoDateStr) return "";
  const parts = isoDateStr.split("-");
  if (parts.length !== 3) return isoDateStr;
  const year = Number(parts[0]) - 1911;
  return String(year).padStart(3, "0") + parts[1] + parts[2];
}

function isValidTaiwanId(id) {
  if (!id) return false;
  return /^[A-Z][0-9]{9}$/.test(id.toUpperCase().trim());
}

function toNonNegativeIntOrZero(valueStr) {
  if (valueStr === null || valueStr === undefined) return 0;
  const s = String(valueStr).trim();
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.floor(n);
}

function toNonNegativeNumberOrZero(valueStr) {
  if (valueStr === null || valueStr === undefined) return 0;
  const s = String(valueStr).trim();
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function cleanCellForExcel(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try { return document.execCommand("copy"); }
  finally { document.body.removeChild(ta); }
}

// ============================================================
// === 統計摘要 ===
// ============================================================

function renderSummaryBar() {
  let summaryBar = document.getElementById("recordsSummaryBar");
  if (!summaryBar) return;

  if (records.length === 0) {
    summaryBar.innerHTML = "<span>目前沒有紀錄</span>";
    return;
  }

  let totalMinutes = 0;
  let totalPeople  = 0;
  let totalTraffic = 0;
  let totalMeal    = 0;

  records.forEach((r) => {
    totalMinutes += (r.hours || 0) * 60 + (r.minutes || 0);
    totalPeople  += r.peopleCount || 0;
    totalTraffic += r.trafficFee || 0;
    totalMeal    += r.mealFee    || 0;
  });

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const timeStr = m > 0 ? `${h} 小時 ${m} 分` : `${h} 小時`;

  summaryBar.innerHTML = `
    <span class="summary-item"><strong>${records.length}</strong> 筆紀錄</span>
    <span class="summary-divider">·</span>
    <span class="summary-item">總時數 <strong>${timeStr}</strong></span>
    <span class="summary-divider">·</span>
    <span class="summary-item">受服務人次 <strong>${totalPeople}</strong></span>
    <span class="summary-divider">·</span>
    <span class="summary-item">交通費 <strong>${totalTraffic}</strong> 元</span>
    <span class="summary-divider">·</span>
    <span class="summary-item">誤餐費 <strong>${totalMeal}</strong> 元</span>
  `;
}

// ============================================================
// === 日期限制 ===
// ============================================================

function updateEndDateConstraints() {
  if (!startDateInput || !endDateInput) return;
  const startValue = startDateInput.value;
  if (!startValue) {
    endDateInput.min = "";
    endDateInput.max = "";
    endDateInput.value = "";
    return;
  }
  const start = parseIsoDateToDate(startValue);
  if (!start) return;
  const year = start.getFullYear();
  const monthIndex = start.getMonth();
  const lastDateOfMonth = new Date(year, monthIndex + 1, 0);
  const lastDayStr = formatLocalYYYYMMDD(lastDateOfMonth);
  const todayStr = getTodayLocalYYYYMMDD();
  const maxStr = lastDayStr <= todayStr ? lastDayStr : todayStr;
  endDateInput.min = startValue;
  endDateInput.max = maxStr;
  const currentEndValue = endDateInput.value;
  const isInvalid =
    !currentEndValue ||
    currentEndValue < startValue ||
    currentEndValue > maxStr ||
    currentEndValue.slice(0, 7) !== startValue.slice(0, 7);
  if (isInvalid) endDateInput.value = maxStr;
}

// ============================================================
// === localStorage：志工名單 ===
// ============================================================

function saveVolunteersToStorage() {
  try { localStorage.setItem(VOLUNTEER_STORAGE_KEY, JSON.stringify(volunteers)); }
  catch (err) { console.error("儲存志工名單失敗", err); }
}

function loadVolunteersFromStorage() {
  try {
    const raw = localStorage.getItem(VOLUNTEER_STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    volunteers.length = 0;
    list.forEach((v) => {
      if (!v || !v.name || !v.id) return;
      volunteers.push({ name: String(v.name), id: String(v.id).toUpperCase() });
    });
  } catch (err) { console.error("讀取志工名單失敗", err); }
}

// ============================================================
// === localStorage：服務紀錄 ===
// ============================================================

function saveRecordsToStorage() {
  try { localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records)); }
  catch (err) { console.error("儲存服務紀錄失敗", err); }
}

function loadRecordsFromStorage() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    records.length = 0;
    list.forEach((r) => {
      if (!r || !r.name || !r.startDate) return;
      records.push(r);
    });
  } catch (err) { console.error("讀取服務紀錄失敗", err); }
}

// ============================================================
// === Google Sheet 同步 ===
// ============================================================

async function sendVolunteerToGSheet(vol) {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("[你的網址]")) return;
  try {
    await fetch(GSHEET_VOLUNTEER_URL, {
      method: "POST", mode: "no-cors",
      body: JSON.stringify({ action: "upsert", name: vol.name, id: vol.id }),
    });
  } catch (err) { console.warn("GSheet upsert 失敗：", err); }
}

async function deleteVolunteerFromGSheet(vol) {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("[你的網址]")) return;
  try {
    await fetch(GSHEET_VOLUNTEER_URL, {
      method: "POST", mode: "no-cors",
      body: JSON.stringify({ action: "delete", id: vol.id }),
    });
  } catch (err) { console.warn("GSheet delete 失敗：", err); }
}

async function loadVolunteersFromGSheet() {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("[你的網址]")) return;
  try {
    const resp = await fetch(GSHEET_VOLUNTEER_URL + "?action=listVolunteers");
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data || !Array.isArray(data.volunteers)) return;
    volunteers.length = 0;
    data.volunteers.forEach((v) => {
      const name = (v.name || "").toString().trim();
      const id   = (v.id   || "").toString().trim().toUpperCase();
      if (!name || !id) return;
      volunteers.push({ name, id });
    });
    saveVolunteersToStorage();
    renderVolunteerList();
    renderVolunteerSelect();
  } catch (err) { console.warn("從 GSheet 讀取志工名單失敗：", err); }
}

// ============================================================
// === 登入 ===
// ============================================================

function showApp()   { loginSection?.classList.add("hidden");    appSection?.classList.remove("hidden"); }
function showLogin() { appSection?.classList.add("hidden");      loginSection?.classList.remove("hidden"); }

function initLogin() {
  if (loginSection && appSection) showLogin();
  if (!loginForm) return;
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setText(loginErrorEl, "");
    const pwd = (loginPasswordInput?.value || "").trim();
    if (!pwd) { setText(loginErrorEl, "請先輸入密碼。"); return; }
    if (pwd !== APP_LOGIN_PASSWORD) {
      setText(loginErrorEl, "密碼錯誤，請再試一次。");
      if (loginPasswordInput) { loginPasswordInput.value = ""; loginPasswordInput.focus(); }
      return;
    }
    if (loginPasswordInput) loginPasswordInput.value = "";
    showApp();
  });
}

// ============================================================
// === 服務項目 / 內容下拉 ===
// ============================================================

function renderServiceItemOptions() {
  if (!serviceItemSelect) return;
  serviceItemSelect.innerHTML = '<option value="">請選擇服務項目</option>';
  SERVICE_ITEMS.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.code;
    opt.textContent = `${padCode4(item.code)} - ${item.label}`;
    serviceItemSelect.appendChild(opt);
  });
  renderServiceContentOptions("");
}

function renderServiceContentOptions(itemCode) {
  if (!serviceContentSelect) return;
  serviceContentSelect.innerHTML = "";
  if (!itemCode || !SERVICE_CONTENTS_BY_ITEM[itemCode]) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "請先選擇服務項目";
    serviceContentSelect.appendChild(opt);
    return;
  }
  const ph = document.createElement("option");
  ph.value = ""; ph.textContent = "請選擇服務內容";
  serviceContentSelect.appendChild(ph);
  SERVICE_CONTENTS_BY_ITEM[itemCode].forEach((content) => {
    const opt = document.createElement("option");
    opt.value = content.code;
    opt.textContent = `${padCode4(content.code)} - ${content.label}`;
    serviceContentSelect.appendChild(opt);
  });
}

function initServiceSelects() {
  renderServiceItemOptions();
  if (!serviceItemSelect) return;
  serviceItemSelect.addEventListener("change", function () {
    renderServiceContentOptions(serviceItemSelect.value);
  });
}

// ============================================================
// === 身分證輸入限制 ===
// ============================================================

function initVolunteerIdInputGuards() {
  if (!volunteerIdInput) return;
  volunteerIdInput.addEventListener("input", function (e) {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length > 10) v = v.slice(0, 10);
    e.target.value = v;
  });
  volunteerIdInput.addEventListener("blur", function () {
    const id = (volunteerIdInput.value || "").trim().toUpperCase();
    if (!id) { setText(volunteerIdErrorEl, ""); return; }
    setText(volunteerIdErrorEl, isValidTaiwanId(id) ? "" : "身分證格式：1 英文字母 + 9 數字（例 A123456789）");
  });
}

// ============================================================
// === 志工編輯模式 ===
// ============================================================

function enterVolunteerEditMode(index) {
  editingVolunteerIndex = index;
  const v = volunteers[index];
  if (!v) return;
  if (volunteerNameInput) volunteerNameInput.value = v.name;
  if (volunteerIdInput)   volunteerIdInput.value   = v.id;
  setText(volunteerIdErrorEl, "");
  if (volunteerSubmitBtn) volunteerSubmitBtn.textContent = "儲存修改";
}

function exitVolunteerEditMode() {
  editingVolunteerIndex = null;
  if (volunteerForm) volunteerForm.reset();
  setText(volunteerIdErrorEl, "");
  if (volunteerSubmitBtn) volunteerSubmitBtn.textContent = "新增志工";
}

// ============================================================
// === 志工列表渲染 ===
// ============================================================

function renderVolunteerList() {
  if (!volunteerListEl) return;
  volunteerListEl.innerHTML = "";
  if (volunteers.length === 0) {
    volunteerListEl.innerHTML = '<li style="color:#6b7280;font-size:0.88rem;padding:0.4rem 0;">尚未建立志工名單</li>';
    return;
  }
  volunteers.forEach((v, index) => {
    const li = document.createElement("li");
    li.dataset.index = String(index);
    li.innerHTML = `
      <div class="volunteer-text">
        ${v.name}<br><small>身分證：${v.id}</small>
      </div>
      <div class="volunteer-actions">
        <button type="button" class="btn btn-small btn-secondary" data-action="edit">修改</button>
        <button type="button" class="btn btn-small btn-danger"    data-action="delete">刪除</button>
      </div>`;
    volunteerListEl.appendChild(li);
  });
}

function renderVolunteerSelect() {
  if (!recordVolunteerSelect) return;
  const prevName = recordVolunteerSelect.value;
  recordVolunteerSelect.innerHTML = '<option value="">請選擇志工</option>';
  volunteers.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.name; opt.textContent = v.name;
    recordVolunteerSelect.appendChild(opt);
  });
  const stillExists = volunteers.some((v) => v.name === prevName);
  recordVolunteerSelect.value = stillExists ? prevName : "";
  if (recordVolunteerIdInput) {
    const matched = volunteers.find((v) => v.name === recordVolunteerSelect.value);
    recordVolunteerIdInput.value = matched ? matched.id : "";
  }
}

// ============================================================
// === 志工名單：新增 / 修改 ===
// ============================================================

function initVolunteerForm() {
  if (!volunteerForm) return;
  volunteerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = trimValue(volunteerNameInput);
    const id   = trimValue(volunteerIdInput).toUpperCase();
    if (!name || !id) { showToast("請輸入完整的志工姓名與身分證字號", "warning"); return; }
    if (!isValidTaiwanId(id)) {
      setText(volunteerIdErrorEl, "身分證格式：1 英文字母 + 9 數字（例 A123456789）");
      showToast("身分證格式不正確", "error");
      return;
    }
    setText(volunteerIdErrorEl, "");
    const exists = volunteers.some((v, idx) => {
      if (editingVolunteerIndex !== null && idx === editingVolunteerIndex) return false;
      return v.id === id;
    });
    if (exists) { showToast("此身分證字號已在志工名單中", "warning"); return; }
    if (editingVolunteerIndex === null) {
      volunteers.push({ name, id });
      showToast(`已新增志工「${name}」`, "success");
    } else {
      volunteers[editingVolunteerIndex].name = name;
      volunteers[editingVolunteerIndex].id   = id;
      showToast(`已更新志工「${name}」的資料`, "success");
    }
    saveVolunteersToStorage();
    renderVolunteerList();
    renderVolunteerSelect();
    exitVolunteerEditMode();
    sendVolunteerToGSheet({ name, id });
  });
}

// ============================================================
// === 志工列表事件代理 ===
// ============================================================

function initVolunteerListActions() {
  if (!volunteerListEl) return;
  volunteerListEl.addEventListener("click", async function (e) {
    const button = e.target.closest("button");
    if (!button) return;
    const li = button.closest("li");
    if (!li) return;
    const index = Number(li.dataset.index);
    if (Number.isNaN(index)) return;
    const action = button.dataset.action;
    if (action === "edit") { enterVolunteerEditMode(index); return; }
    if (action === "delete") {
      const v = volunteers[index];
      if (!v) return;
      const ok = await showConfirm(`確定要刪除志工「${v.name}」嗎？`);
      if (!ok) return;
      volunteers.splice(index, 1);
      saveVolunteersToStorage();
      renderVolunteerList();
      renderVolunteerSelect();
      showToast(`已刪除志工「${v.name}」`, "info");
      if (editingVolunteerIndex === index) exitVolunteerEditMode();
      else if (editingVolunteerIndex !== null && editingVolunteerIndex > index) editingVolunteerIndex -= 1;
      if (recordVolunteerSelect?.value === v.name) {
        recordVolunteerSelect.value = "";
        if (recordVolunteerIdInput) recordVolunteerIdInput.value = "";
      }
      deleteVolunteerFromGSheet(v);
    }
  });
}

function initVolunteerSelectAutoFill() {
  if (!recordVolunteerSelect) return;
  recordVolunteerSelect.addEventListener("change", function () {
    const matched = volunteers.find((v) => v.name === recordVolunteerSelect.value);
    if (recordVolunteerIdInput) recordVolunteerIdInput.value = matched ? matched.id : "";
  });
}

// ============================================================
// === 受服務人次預覽 ===
// ============================================================

function updatePeopleCountPreview() {
  if (!hoursInput || !minutesInput || !clientCountInput || !peopleCountDisplayInput) return;
  const hours       = hoursInput.value       !== "" ? Number(hoursInput.value)       : 0;
  const minutes     = minutesInput.value     !== "" ? Number(minutesInput.value)     : 0;
  const clientCount = clientCountInput.value !== "" ? Number(clientCountInput.value) : 0;
  const totalMinutes = hours * 60 + minutes;
  if (!Number.isFinite(totalMinutes) || totalMinutes < 30) { peopleCountDisplayInput.value = ""; return; }
  peopleCountDisplayInput.value = String(Math.round(clientCount * (totalMinutes / 60)));
}

function initPeopleCountPreview() {
  [hoursInput, minutesInput, clientCountInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", updatePeopleCountPreview);
  });
}

// ============================================================
// === 服務紀錄：編輯模式 ===
// ============================================================

function enterRecordEditMode(index) {
  editingRecordIndex = index;
  const r = records[index];
  if (!r) return;
  if (recordVolunteerSelect)  recordVolunteerSelect.value  = r.name;
  if (recordVolunteerIdInput) recordVolunteerIdInput.value = r.id;
  if (startDateInput) startDateInput.value = r.startDate;
  updateEndDateConstraints();
  if (endDateInput) {
    const min = endDateInput.min, max = endDateInput.max;
    if (r.endDate && (!min || r.endDate >= min) && (!max || r.endDate <= max))
      endDateInput.value = r.endDate;
  }
  if (serviceItemSelect) {
    serviceItemSelect.value = r.serviceItemCode;
    renderServiceContentOptions(r.serviceItemCode);
  }
  if (serviceContentSelect) serviceContentSelect.value = r.serviceContentCode;
  if (hoursInput)       hoursInput.value       = r.hours       ?? 0;
  if (minutesInput)     minutesInput.value     = r.minutes     ?? 0;
  if (clientCountInput) clientCountInput.value = r.clientCount ?? 0;
  if (trafficFeeInput)  trafficFeeInput.value  = r.trafficFee  ?? 0;
  if (mealFeeInput)     mealFeeInput.value     = r.mealFee     ?? 0;
  setText(recordErrorEl, "");
  updatePeopleCountPreview();
  if (recordSubmitBtn) recordSubmitBtn.textContent = "儲存修改";

  // 捲動到表單
  recordForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetRecordFormPreserveVolunteer() {
  const keepName = recordVolunteerSelect ? recordVolunteerSelect.value : "";
  const keepId   = recordVolunteerIdInput ? recordVolunteerIdInput.value : "";
  if (recordForm) recordForm.reset();
  if (recordVolunteerSelect)  recordVolunteerSelect.value  = keepName;
  if (recordVolunteerIdInput) recordVolunteerIdInput.value = keepId;
  if (startDateInput) startDateInput.value = "";
  if (endDateInput)   endDateInput.value   = "";
  updateEndDateConstraints();
  if (serviceItemSelect) serviceItemSelect.value = "";
  renderServiceContentOptions("");
  if (hoursInput)               hoursInput.value               = "";
  if (minutesInput)             minutesInput.value             = "";
  if (clientCountInput)         clientCountInput.value         = "0";
  if (trafficFeeInput)          trafficFeeInput.value          = "0";
  if (mealFeeInput)             mealFeeInput.value             = "0";
  if (peopleCountDisplayInput)  peopleCountDisplayInput.value  = "";
  setText(recordErrorEl, "");
}

function exitRecordEditMode(preserveVolunteer = true) {
  editingRecordIndex = null;
  if (!preserveVolunteer) {
    if (recordForm) recordForm.reset();
    if (recordVolunteerSelect)  recordVolunteerSelect.value  = "";
    if (recordVolunteerIdInput) recordVolunteerIdInput.value = "";
    if (peopleCountDisplayInput) peopleCountDisplayInput.value = "";
    renderServiceContentOptions("");
    if (clientCountInput) clientCountInput.value = "0";
    if (trafficFeeInput)  trafficFeeInput.value  = "0";
    if (mealFeeInput)     mealFeeInput.value     = "0";
    if (startDateInput)   startDateInput.value   = "";
    if (endDateInput)     endDateInput.value     = "";
    updateEndDateConstraints();
    setText(recordErrorEl, "");
  } else {
    resetRecordFormPreserveVolunteer();
  }
  if (recordSubmitBtn) recordSubmitBtn.textContent = "新增服務紀錄";
}

// ============================================================
// === 表格：組每列 17 欄 ===
// ============================================================

function buildReadableRowCells(r) {
  return [
    r.name || "",
    r.id   || "",
    r.startDate || "",
    r.endDate   || "",
    `${padCode4(r.serviceItemCode)} - ${getServiceItemLabel(r.serviceItemCode)}`,
    `${padCode4(r.serviceContentCode)} - ${getServiceContentLabel(r.serviceItemCode, r.serviceContentCode)}`,
    String(r.hours       ?? 0),
    String(r.minutes     ?? 0),
    String(r.peopleCount ?? 0),
    String(r.trafficFee  ?? 0),
    String(r.mealFee     ?? 0),
    "", "", "", "", "", "",
  ];
}

function buildImportRowCells(r) {
  return [
    r.name || "",
    r.id   || "",
    toRocDate(r.startDate),
    toRocDate(r.endDate),
    padCode4(r.serviceItemCode),
    padCode4(r.serviceContentCode),
    String(r.hours       ?? 0),
    String(r.minutes     ?? 0),
    String(r.peopleCount ?? 0),
    String(r.trafficFee  ?? 0),
    String(r.mealFee     ?? 0),
    "", "", "", "", "", "",
  ];
}

function renderRecordsTable() {
  if (!recordsTableBody) return;
  recordsTableBody.innerHTML = "";

  records.forEach((r, index) => {
    const tr = document.createElement("tr");
    const cells = displayMode === "import" ? buildImportRowCells(r) : buildReadableRowCells(r);
    cells.forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    // 操作欄：編輯 + 刪除
    const actionTd = document.createElement("td");
    actionTd.style.whiteSpace = "nowrap";
    actionTd.innerHTML = `
      <button type="button" class="btn btn-small btn-secondary" data-action="editRecord"   data-index="${index}">編輯</button>
      <button type="button" class="btn btn-small btn-danger"    data-action="deleteRecord" data-index="${index}" style="margin-left:0.3rem;">刪除</button>
    `;
    tr.appendChild(actionTd);

    recordsTableBody.appendChild(tr);
  });

  renderSummaryBar();
}

function initRecordTableActions() {
  if (!recordsTableBody) return;
  recordsTableBody.addEventListener("click", async function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;
    const index  = Number(btn.dataset.index);
    if (Number.isNaN(index)) return;

    if (action === "editRecord") {
      enterRecordEditMode(index);
      return;
    }

    if (action === "deleteRecord") {
      const r = records[index];
      if (!r) return;
      const ok = await showConfirm(`確定要刪除「${r.name}」在 ${r.startDate} 的服務紀錄嗎？`);
      if (!ok) return;
      records.splice(index, 1);
      saveRecordsToStorage();
      renderRecordsTable();
      showToast("已刪除該筆服務紀錄", "info");
      if (editingRecordIndex === index) exitRecordEditMode(true);
      else if (editingRecordIndex !== null && editingRecordIndex > index) editingRecordIndex -= 1;
    }
  });
}

// ============================================================
// === 新增/修改 服務紀錄 ===
// ============================================================

function initRecordForm() {
  if (!recordForm) return;
  recordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setText(recordErrorEl, "");

    const name               = recordVolunteerSelect  ? recordVolunteerSelect.value  : "";
    const id                 = recordVolunteerIdInput ? recordVolunteerIdInput.value : "";
    const startDate          = startDateInput  ? startDateInput.value  : "";
    const endDate            = endDateInput    ? endDateInput.value    : "";
    const serviceItemCode    = serviceItemSelect    ? serviceItemSelect.value    : "";
    const serviceContentCode = serviceContentSelect ? serviceContentSelect.value : "";

    if (!name)      { setText(recordErrorEl, "請選擇志工姓名。");                           return; }
    if (!id)        { setText(recordErrorEl, "請確認已選擇志工，並帶出身分證字號。");         return; }
    if (!startDate || !endDate) { setText(recordErrorEl, "請填寫服務起訖日期。");            return; }
    if (endDate < startDate)    { setText(recordErrorEl, "服務日期迄不能早於服務日期起。");  return; }

    const todayStr = getTodayLocalYYYYMMDD();
    if (startDate > todayStr || endDate > todayStr) {
      setText(recordErrorEl, "服務日期不可填未來日期。"); return;
    }
    if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
      setText(recordErrorEl, "服務日期不可跨月。"); return;
    }
    if (!serviceItemCode)    { setText(recordErrorEl, "請選擇服務項目。"); return; }
    if (!serviceContentCode) { setText(recordErrorEl, "請選擇服務內容。"); return; }

    const hours   = toNonNegativeIntOrZero(hoursInput   ? hoursInput.value   : "");
    const minutes = toNonNegativeIntOrZero(minutesInput ? minutesInput.value : "");

    if (Number.isNaN(hours))   { setText(recordErrorEl, "服務時數-小時請輸入 0 以上的數字。"); return; }
    if (Number.isNaN(minutes)) { setText(recordErrorEl, "服務時數-分鐘請輸入 0–59 的數字。");  return; }
    if (minutes < 0 || minutes > 59) { setText(recordErrorEl, "分鐘範圍必須是 0–59。"); return; }

    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes < 30) { setText(recordErrorEl, "總服務時間不得少於 30 分鐘。"); return; }

    const clientCount = toNonNegativeIntOrZero(clientCountInput ? clientCountInput.value : "0");
    const trafficFee  = toNonNegativeNumberOrZero(trafficFeeInput ? trafficFeeInput.value : "0");
    const mealFee     = toNonNegativeNumberOrZero(mealFeeInput   ? mealFeeInput.value     : "0");

    if (Number.isNaN(clientCount)) { setText(recordErrorEl, "人數請輸入 0 以上的數字。"); return; }
    if (Number.isNaN(trafficFee))  { setText(recordErrorEl, "交通費請輸入 0 以上的數字。"); return; }
    if (Number.isNaN(mealFee))     { setText(recordErrorEl, "誤餐費請輸入 0 以上的數字。"); return; }

    const record = {
      name, id, startDate, endDate,
      serviceItemCode:    padCode4(serviceItemCode),
      serviceContentCode: padCode4(serviceContentCode),
      hours, minutes, clientCount,
      peopleCount: Math.round(clientCount * (totalMinutes / 60)),
      trafficFee, mealFee,
    };

    if (editingRecordIndex === null) {
      records.push(record);
      showToast(`已新增「${name}」的服務紀錄`, "success");
    } else {
      records[editingRecordIndex] = record;
      showToast(`已更新第 ${editingRecordIndex + 1} 筆服務紀錄`, "success");
    }

    saveRecordsToStorage();
    renderRecordsTable();
    exitRecordEditMode(true);
  });
}

// ============================================================
// === 顯示模式切換 ===
// ============================================================

function initDisplayModeToggle() {
  if (!displayModeInputs || displayModeInputs.length === 0) return;
  const checked = document.querySelector('input[name="displayMode"]:checked');
  if (checked?.value) displayMode = checked.value;
  displayModeInputs.forEach((input) => {
    input.addEventListener("change", function () {
      if (input.checked) { displayMode = input.value; renderRecordsTable(); }
    });
  });
}

// ============================================================
// === 複製表格 ===
// ============================================================

function buildCopyTextFromCurrentTableBody() {
  if (!recordsTableBody) return "";
  return Array.from(recordsTableBody.querySelectorAll("tr"))
    .map((tr) =>
      Array.from(tr.querySelectorAll("td"))
        .slice(0, 17)
        .map((td) => cleanCellForExcel(td.textContent))
        .join("\t")
    )
    .join("\r\n");
}

function initCopyButton() {
  if (!copyTableBtn) return;
  copyTableBtn.addEventListener("click", async function () {
    if (records.length === 0) { showToast("目前沒有資料可複製", "warning"); return; }
    const text = buildCopyTextFromCurrentTableBody();
    if (!text) { showToast("目前表格沒有可複製的資料", "warning"); return; }
    try {
      await copyTextToClipboard(text);
      showToast(`已複製 ${records.length} 筆資料到剪貼簿`, "success");
    } catch (err) {
      console.error(err);
      showToast("複製失敗，請確認瀏覽器權限或改用 HTTPS", "error");
    }
  });
}

// ============================================================
// === 清空紀錄 ===
// ============================================================

function initClearRecordsButton() {
  if (!clearRecordsBtn) return;
  clearRecordsBtn.addEventListener("click", async function () {
    if (records.length === 0) { showToast("目前沒有紀錄可清空", "warning"); return; }
    const ok = await showConfirm("確定要清空所有服務紀錄嗎？此操作無法復原。", "清空", "取消");
    if (!ok) return;
    records.length = 0;
    saveRecordsToStorage();
    renderRecordsTable();
    exitRecordEditMode(true);
    showToast("已清空所有服務紀錄", "info");
  });
}

// ============================================================
// === 初始化 ===
// ============================================================

function initDateConstraints() {
  if (startDateInput) startDateInput.max = getTodayLocalYYYYMMDD();
  if (startDateInput && endDateInput)
    startDateInput.addEventListener("change", updateEndDateConstraints);
}

function initDefaults() {
  if (clientCountInput && clientCountInput.value === "") clientCountInput.value = "0";
  if (trafficFeeInput  && trafficFeeInput.value  === "") trafficFeeInput.value  = "0";
  if (mealFeeInput     && mealFeeInput.value     === "") mealFeeInput.value     = "0";
  updateEndDateConstraints();
  updatePeopleCountPreview();
}

function initVolunteersDataFlow() {
  loadVolunteersFromStorage();
  renderVolunteerList();
  renderVolunteerSelect();
  loadVolunteersFromGSheet();
}

function init() {
  initLogin();
  initVolunteerIdInputGuards();
  initVolunteerForm();
  initVolunteerListActions();
  initVolunteerSelectAutoFill();
  initServiceSelects();
  initPeopleCountPreview();
  initDateConstraints();
  initRecordForm();
  initDisplayModeToggle();
  initRecordTableActions();
  initCopyButton();
  initClearRecordsButton();
  initDefaults();
  initVolunteersDataFlow();

  // 讀取存檔的服務紀錄
  loadRecordsFromStorage();
  renderRecordsTable();
}

document.addEventListener("DOMContentLoaded", init);
