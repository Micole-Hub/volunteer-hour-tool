// Volunteer_Hour_Tool.js

// === Google Apps Script Web App URL（志工名單用）===
// 貼你部署好的 /exec 網址（不要加 ?action=...）
const GSHEET_VOLUNTEER_URL =
  "https://script.google.com/macros/s/AKfycbxal88OGtSpLHJ6bye8x_KUhL4KMUAN7j-xtEy3NZxkcx_MqEV52f3GtSwo3sHpUlbKpQ/exec";

// === 登入設定（前端假登入，每次重新開頁面都要再登入）===
const APP_LOGIN_PASSWORD = "dasan123";

// localStorage key（志工名單）
const VOLUNTEER_STORAGE_KEY = "volToolVolunteers";

// === DOM ===
// 登入區
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const loginForm = document.getElementById("loginForm");
const loginPasswordInput = document.getElementById("loginPassword");
const loginErrorEl = document.getElementById("loginError");

// 志工名單
const volunteerForm = document.getElementById("volunteer-form");
const volunteerNameInput = document.getElementById("volunteerName");
const volunteerIdInput = document.getElementById("volunteerId");
const volunteerSubmitBtn = document.getElementById("volunteerSubmitBtn");
const volunteerListEl = document.getElementById("volunteerList");
const volunteerIdErrorEl = document.getElementById("volunteerIdError");

// 志工下拉（服務紀錄用）
const recordVolunteerSelect = document.getElementById("recordVolunteerName");
const recordVolunteerIdInput = document.getElementById("recordVolunteerId");

// 服務紀錄表單
const recordForm = document.getElementById("record-form");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const serviceItemSelect = document.getElementById("serviceItemSelect");
const serviceContentSelect = document.getElementById("serviceContentSelect");
const hoursInput = document.getElementById("hours");
const minutesInput = document.getElementById("minutes");
const clientCountInput = document.getElementById("clientCount");
const peopleCountDisplayInput = document.getElementById("peopleCountDisplay");
const trafficFeeInput = document.getElementById("trafficFee");
const mealFeeInput = document.getElementById("mealFee");
const recordErrorEl = document.getElementById("recordError");
const recordSubmitBtn = document.getElementById("recordSubmitBtn");

// 表格 & 按鈕
const recordsTableBody = document.getElementById("recordsTableBody");

// 複製按鈕：支援新 id copyTableBtn，也支援舊 id exportCsvBtn
const copyTableBtn =
  document.getElementById("copyTableBtn") || document.getElementById("exportCsvBtn");

const clearRecordsBtn = document.getElementById("clearRecordsBtn");
const displayModeInputs = document.querySelectorAll('input[name="displayMode"]');

// === 資料 ===
const volunteers = [];
const records = [];
let displayMode = "readable";

let editingVolunteerIndex = null;
let editingRecordIndex = null;

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

// === 小工具 ===
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

// 用本地時間組 YYYY-MM-DD，避免 toISOString() 造成日期少一天
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

  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  return new Date(y, m - 1, d);
}

// ISO 日期 YYYY-MM-DD → 民國 7 碼
function toRocDate(isoDateStr) {
  if (!isoDateStr) return "";

  const parts = isoDateStr.split("-");
  if (parts.length !== 3) return isoDateStr;

  const year = Number(parts[0]) - 1911;
  const month = parts[1];
  const day = parts[2];

  const rocYear = String(year).padStart(3, "0");
  return rocYear + month + day;
}

function isValidTaiwanId(id) {
  if (!id) return false;
  id = id.toUpperCase().trim();
  return /^[A-Z][0-9]{9}$/.test(id);
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

// 清理儲存格文字，避免貼到 Excel 時被換行或 Tab 弄亂
function cleanCellForExcel(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .trim();
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

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

// === 結束日期規則 ===
// 開始日期一選：
// 1. 結束日期限制不能早於開始日期
// 2. 結束日期限制不能跨月
// 3. 結束日期限制不能超過今天
// 4. 初始自動帶同月份最後一天，若月底是未來，則帶今天
// 5. 使用者之後可以自由改同月內其他日期
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

  const isCurrentValueInvalid =
    !currentEndValue ||
    currentEndValue < startValue ||
    currentEndValue > maxStr ||
    currentEndValue.slice(0, 7) !== startValue.slice(0, 7);

  if (isCurrentValueInvalid) {
    endDateInput.value = maxStr;
  }
}

// === localStorage：志工名單 ===
function saveVolunteersToStorage() {
  try {
    localStorage.setItem(VOLUNTEER_STORAGE_KEY, JSON.stringify(volunteers));
  } catch (err) {
    console.error("儲存志工名單到 localStorage 失敗", err);
  }
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

      volunteers.push({
        name: String(v.name),
        id: String(v.id).toUpperCase(),
      });
    });
  } catch (err) {
    console.error("讀取志工名單 localStorage 失敗", err);
  }
}

// === Google Sheet 同步：新增/修改 ===
async function sendVolunteerToGSheet(vol) {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("請把這裡換成你的網址")) {
    console.warn("尚未設定 GSHEET_VOLUNTEER_URL，略過同步到 Google Sheet");
    return;
  }

  try {
    await fetch(GSHEET_VOLUNTEER_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        action: "upsert",
        name: vol.name,
        id: vol.id,
      }),
    });
  } catch (err) {
    console.warn("呼叫 Google Sheet Web App（upsert）失敗：", err);
  }
}

// === Google Sheet 同步：刪除 ===
async function deleteVolunteerFromGSheet(vol) {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("請把這裡換成你的網址")) {
    console.warn("尚未設定 GSHEET_VOLUNTEER_URL，略過刪除同步");
    return;
  }

  try {
    await fetch(GSHEET_VOLUNTEER_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({
        action: "delete",
        id: vol.id,
      }),
    });
  } catch (err) {
    console.warn("呼叫 Google Sheet Web App（delete）失敗：", err);
  }
}

// === Google Sheet：讀取志工名單 ===
async function loadVolunteersFromGSheet() {
  if (!GSHEET_VOLUNTEER_URL || GSHEET_VOLUNTEER_URL.includes("請把這裡換成你的網址")) {
    console.warn("尚未設定 GSHEET_VOLUNTEER_URL，略過從雲端載入志工名單");
    return;
  }

  try {
    const url = GSHEET_VOLUNTEER_URL + "?action=listVolunteers";
    const resp = await fetch(url);

    if (!resp.ok) {
      console.warn("從 Google Sheet 讀取志工名單失敗，HTTP 狀態：", resp.status);
      return;
    }

    const data = await resp.json();

    if (!data || !Array.isArray(data.volunteers)) {
      console.warn("從 Google Sheet 回傳格式不如預期：", data);
      return;
    }

    volunteers.length = 0;

    data.volunteers.forEach((v) => {
      if (!v) return;

      const name = (v.name || "").toString().trim();
      const id = (v.id || "").toString().trim().toUpperCase();

      if (!name || !id) return;

      volunteers.push({ name, id });
    });

    saveVolunteersToStorage();
    renderVolunteerList();
    renderVolunteerSelect();
  } catch (err) {
    console.warn("從 Google Sheet 讀取志工名單時發生錯誤：", err);
  }
}

// === 登入 ===
function showApp() {
  if (loginSection) loginSection.classList.add("hidden");
  if (appSection) appSection.classList.remove("hidden");
}

function showLogin() {
  if (appSection) appSection.classList.add("hidden");
  if (loginSection) loginSection.classList.remove("hidden");
}

function initLogin() {
  if (loginSection && appSection) showLogin();

  if (!loginForm) return;

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setText(loginErrorEl, "");

    const pwd = (loginPasswordInput?.value || "").trim();

    if (!pwd) {
      setText(loginErrorEl, "請先輸入密碼。");
      return;
    }

    if (pwd !== APP_LOGIN_PASSWORD) {
      setText(loginErrorEl, "密碼錯誤，請再試一次。");

      if (loginPasswordInput) {
        loginPasswordInput.value = "";
        loginPasswordInput.focus();
      }

      return;
    }

    if (loginPasswordInput) loginPasswordInput.value = "";
    showApp();
  });
}

// === 服務項目 / 內容下拉 ===
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
    opt.value = "";
    opt.textContent = "請先選擇服務項目";
    serviceContentSelect.appendChild(opt);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "請選擇服務內容";
  serviceContentSelect.appendChild(placeholder);

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

// === 身分證輸入限制 ===
function initVolunteerIdInputGuards() {
  if (!volunteerIdInput) return;

  volunteerIdInput.addEventListener("input", function (e) {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (value.length > 10) value = value.slice(0, 10);
    e.target.value = value;
  });

  volunteerIdInput.addEventListener("blur", function () {
    const id = (volunteerIdInput.value || "").trim().toUpperCase();

    if (!id) {
      setText(volunteerIdErrorEl, "");
      return;
    }

    if (!isValidTaiwanId(id)) {
      setText(volunteerIdErrorEl, "身分證格式：1 英文字母 + 9 數字（例 A123456789）");
    } else {
      setText(volunteerIdErrorEl, "");
    }
  });
}

// === 志工編輯模式 ===
function enterVolunteerEditMode(index) {
  editingVolunteerIndex = index;

  const v = volunteers[index];
  if (!v) return;

  if (volunteerNameInput) volunteerNameInput.value = v.name;
  if (volunteerIdInput) volunteerIdInput.value = v.id;

  setText(volunteerIdErrorEl, "");

  if (volunteerSubmitBtn) volunteerSubmitBtn.textContent = "儲存修改";
}

function exitVolunteerEditMode() {
  editingVolunteerIndex = null;

  if (volunteerForm) volunteerForm.reset();

  setText(volunteerIdErrorEl, "");

  if (volunteerSubmitBtn) volunteerSubmitBtn.textContent = "新增志工";
}

// === 志工列表渲染 ===
function renderVolunteerList() {
  if (!volunteerListEl) return;

  volunteerListEl.innerHTML = "";

  volunteers.forEach((v, index) => {
    const li = document.createElement("li");
    li.dataset.index = String(index);

    li.innerHTML = `
      <div class="volunteer-text">
        ${v.name} <span>（身分證：${v.id}）</span>
      </div>
      <div class="volunteer-actions">
        <button type="button" class="btn btn-small btn-secondary" data-action="edit">修改</button>
        <button type="button" class="btn btn-small btn-danger" data-action="delete">刪除</button>
      </div>
    `;

    volunteerListEl.appendChild(li);
  });
}

// === 志工下拉（服務紀錄用）===
function renderVolunteerSelect() {
  if (!recordVolunteerSelect) return;

  const prevName = recordVolunteerSelect.value;

  recordVolunteerSelect.innerHTML = '<option value="">請選擇志工</option>';

  volunteers.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = v.name;
    recordVolunteerSelect.appendChild(opt);
  });

  const stillExists = volunteers.some((v) => v.name === prevName);
  recordVolunteerSelect.value = stillExists ? prevName : "";

  if (recordVolunteerIdInput) {
    const matched = volunteers.find((v) => v.name === recordVolunteerSelect.value);
    recordVolunteerIdInput.value = matched ? matched.id : "";
  }
}

// === 志工名單：新增 / 修改 ===
function initVolunteerForm() {
  if (!volunteerForm) return;

  volunteerForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const name = trimValue(volunteerNameInput);
    const id = trimValue(volunteerIdInput).toUpperCase();

    if (!name || !id) {
      alert("請輸入完整的志工姓名與身分證字號");
      return;
    }

    if (!isValidTaiwanId(id)) {
      setText(volunteerIdErrorEl, "身分證格式：1 英文字母 + 9 數字（例 A123456789）");
      alert("身分證格式不正確，請確認後再新增或修改。");
      return;
    }

    setText(volunteerIdErrorEl, "");

    const exists = volunteers.some((v, idx) => {
      if (editingVolunteerIndex !== null && idx === editingVolunteerIndex) return false;
      return v.id === id;
    });

    if (exists) {
      alert("此身分證字號已在志工名單中");
      return;
    }

    if (editingVolunteerIndex === null) {
      volunteers.push({ name, id });
    } else {
      volunteers[editingVolunteerIndex].name = name;
      volunteers[editingVolunteerIndex].id = id;
    }

    saveVolunteersToStorage();
    renderVolunteerList();
    renderVolunteerSelect();
    exitVolunteerEditMode();

    sendVolunteerToGSheet({ name, id });
  });
}

// === 志工列表事件代理 ===
function initVolunteerListActions() {
  if (!volunteerListEl) return;

  volunteerListEl.addEventListener("click", function (e) {
    const button = e.target.closest("button");
    if (!button) return;

    const li = button.closest("li");
    if (!li) return;

    const index = Number(li.dataset.index);
    if (Number.isNaN(index)) return;

    const action = button.dataset.action;

    if (action === "edit") {
      enterVolunteerEditMode(index);
      return;
    }

    if (action === "delete") {
      const v = volunteers[index];
      if (!v) return;

      if (!confirm(`確定要刪除志工「${v.name}」嗎？`)) return;

      volunteers.splice(index, 1);

      saveVolunteersToStorage();
      renderVolunteerList();
      renderVolunteerSelect();

      if (editingVolunteerIndex === index) {
        exitVolunteerEditMode();
      } else if (editingVolunteerIndex !== null && editingVolunteerIndex > index) {
        editingVolunteerIndex -= 1;
      }

      if (recordVolunteerSelect && recordVolunteerSelect.value === v.name) {
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

    if (recordVolunteerIdInput) {
      recordVolunteerIdInput.value = matched ? matched.id : "";
    }
  });
}

// === 受服務人次預覽 ===
function updatePeopleCountPreview() {
  if (!hoursInput || !minutesInput || !clientCountInput || !peopleCountDisplayInput) return;

  const hours = hoursInput.value !== "" ? Number(hoursInput.value) : 0;
  const minutes = minutesInput.value !== "" ? Number(minutesInput.value) : 0;
  const clientCount = clientCountInput.value !== "" ? Number(clientCountInput.value) : 0;

  const totalMinutes = hours * 60 + minutes;

  if (!Number.isFinite(totalMinutes) || totalMinutes < 30) {
    peopleCountDisplayInput.value = "";
    return;
  }

  const totalHours = totalMinutes / 60;
  const peopleCount = Math.round(clientCount * totalHours);

  peopleCountDisplayInput.value = String(peopleCount);
}

function initPeopleCountPreview() {
  [hoursInput, minutesInput, clientCountInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", updatePeopleCountPreview);
  });
}

// === 服務紀錄：編輯模式 ===
function enterRecordEditMode(index) {
  editingRecordIndex = index;

  const r = records[index];
  if (!r) return;

  if (recordVolunteerSelect) recordVolunteerSelect.value = r.name;
  if (recordVolunteerIdInput) recordVolunteerIdInput.value = r.id;
  if (startDateInput) startDateInput.value = r.startDate;

  updateEndDateConstraints();

  // 編輯既有資料時，優先帶回原本的 endDate
  if (endDateInput) {
    const min = endDateInput.min;
    const max = endDateInput.max;

    if (r.endDate && (!min || r.endDate >= min) && (!max || r.endDate <= max)) {
      endDateInput.value = r.endDate;
    }
  }

  if (serviceItemSelect) {
    serviceItemSelect.value = r.serviceItemCode;
    renderServiceContentOptions(r.serviceItemCode);
  }

  if (serviceContentSelect) serviceContentSelect.value = r.serviceContentCode;
  if (hoursInput) hoursInput.value = r.hours ?? 0;
  if (minutesInput) minutesInput.value = r.minutes ?? 0;
  if (clientCountInput) clientCountInput.value = r.clientCount ?? 0;
  if (trafficFeeInput) trafficFeeInput.value = r.trafficFee ?? 0;
  if (mealFeeInput) mealFeeInput.value = r.mealFee ?? 0;

  setText(recordErrorEl, "");
  updatePeopleCountPreview();

  if (recordSubmitBtn) recordSubmitBtn.textContent = "儲存修改";
}

function resetRecordFormPreserveVolunteer() {
  const keepName = recordVolunteerSelect ? recordVolunteerSelect.value : "";
  const keepId = recordVolunteerIdInput ? recordVolunteerIdInput.value : "";

  if (recordForm) recordForm.reset();

  if (recordVolunteerSelect) recordVolunteerSelect.value = keepName;
  if (recordVolunteerIdInput) recordVolunteerIdInput.value = keepId;

  if (startDateInput) startDateInput.value = "";
  if (endDateInput) endDateInput.value = "";

  updateEndDateConstraints();

  if (serviceItemSelect) serviceItemSelect.value = "";
  renderServiceContentOptions("");

  if (hoursInput) hoursInput.value = "";
  if (minutesInput) minutesInput.value = "";
  if (clientCountInput) clientCountInput.value = "0";
  if (trafficFeeInput) trafficFeeInput.value = "0";
  if (mealFeeInput) mealFeeInput.value = "0";
  if (peopleCountDisplayInput) peopleCountDisplayInput.value = "";

  setText(recordErrorEl, "");
}

function exitRecordEditMode(preserveVolunteer = true) {
  editingRecordIndex = null;

  if (!preserveVolunteer) {
    if (recordForm) recordForm.reset();
    if (recordVolunteerSelect) recordVolunteerSelect.value = "";
    if (recordVolunteerIdInput) recordVolunteerIdInput.value = "";
    if (peopleCountDisplayInput) peopleCountDisplayInput.value = "";

    renderServiceContentOptions("");

    if (clientCountInput) clientCountInput.value = "0";
    if (trafficFeeInput) trafficFeeInput.value = "0";
    if (mealFeeInput) mealFeeInput.value = "0";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";

    updateEndDateConstraints();
    setText(recordErrorEl, "");
  } else {
    resetRecordFormPreserveVolunteer();
  }

  if (recordSubmitBtn) recordSubmitBtn.textContent = "新增服務紀錄";
}

// === 表格：組每列 17 欄 ===
function buildReadableRowCells(r) {
  const itemText = `${padCode4(r.serviceItemCode)} - ${getServiceItemLabel(r.serviceItemCode)}`;
  const contentText = `${padCode4(r.serviceContentCode)} - ${getServiceContentLabel(
    r.serviceItemCode,
    r.serviceContentCode
  )}`;

  return [
    r.name || "",
    r.id || "",
    r.startDate || "",
    r.endDate || "",
    itemText,
    contentText,
    String(r.hours ?? 0),
    String(r.minutes ?? 0),
    String(r.peopleCount ?? 0),
    String(r.trafficFee ?? 0),
    String(r.mealFee ?? 0),
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

function buildImportRowCells(r) {
  return [
    r.name || "",
    r.id || "",
    toRocDate(r.startDate),
    toRocDate(r.endDate),
    padCode4(r.serviceItemCode),
    padCode4(r.serviceContentCode),
    String(r.hours ?? 0),
    String(r.minutes ?? 0),
    String(r.peopleCount ?? 0),
    String(r.trafficFee ?? 0),
    String(r.mealFee ?? 0),
    "",
    "",
    "",
    "",
    "",
    "",
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

    const actionTd = document.createElement("td");
    actionTd.innerHTML = `
      <button type="button" class="btn btn-small btn-secondary" data-action="editRecord" data-index="${index}">
        編輯
      </button>
    `;
    tr.appendChild(actionTd);

    recordsTableBody.appendChild(tr);
  });
}

function initRecordTableActions() {
  if (!recordsTableBody) return;

  recordsTableBody.addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const index = Number(btn.dataset.index);

    if (Number.isNaN(index)) return;

    if (action === "editRecord") {
      enterRecordEditMode(index);
    }
  });
}

// === 新增/修改 服務紀錄 ===
function initRecordForm() {
  if (!recordForm) return;

  recordForm.addEventListener("submit", function (e) {
    e.preventDefault();
    setText(recordErrorEl, "");

    const name = recordVolunteerSelect ? recordVolunteerSelect.value : "";
    const id = recordVolunteerIdInput ? recordVolunteerIdInput.value : "";
    const startDate = startDateInput ? startDateInput.value : "";
    const endDate = endDateInput ? endDateInput.value : "";
    const serviceItemCode = serviceItemSelect ? serviceItemSelect.value : "";
    const serviceContentCode = serviceContentSelect ? serviceContentSelect.value : "";

    if (!name) {
      setText(recordErrorEl, "請選擇志工姓名。");
      return;
    }

    if (!id) {
      setText(recordErrorEl, "請確認已選擇志工，並帶出身分證字號。");
      return;
    }

    if (!startDate || !endDate) {
      setText(recordErrorEl, "請填寫服務起訖日期。");
      return;
    }

    if (endDate < startDate) {
      setText(recordErrorEl, "服務日期迄不能早於服務日期起。");
      return;
    }

    const todayStr = getTodayLocalYYYYMMDD();

    if (startDate > todayStr || endDate > todayStr) {
      setText(recordErrorEl, "服務日期不可填未來日期（起訖都必須 ≤ 今天）。");
      return;
    }

    if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
      setText(recordErrorEl, "服務日期不可跨月（起訖的 YYYY-MM 必須相同）。");
      return;
    }

    if (!serviceItemCode) {
      setText(recordErrorEl, "請選擇服務項目。");
      return;
    }

    if (!serviceContentCode) {
      setText(recordErrorEl, "請選擇服務內容。");
      return;
    }

    const hours = toNonNegativeIntOrZero(hoursInput ? hoursInput.value : "");

    if (Number.isNaN(hours)) {
      setText(recordErrorEl, "服務時數-小時請輸入 0 以上的數字。");
      return;
    }

    const minutes = toNonNegativeIntOrZero(minutesInput ? minutesInput.value : "");

    if (Number.isNaN(minutes)) {
      setText(recordErrorEl, "服務時數-分鐘請輸入 0–59 的數字（可留空視為 0）。");
      return;
    }

    if (minutes < 0 || minutes > 59) {
      setText(recordErrorEl, "服務時數-分鐘範圍必須是 0–59（可留空視為 0）。");
      return;
    }

    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes < 30) {
      setText(recordErrorEl, "總服務時間不得少於 30 分鐘。");
      return;
    }

    const clientCount = toNonNegativeIntOrZero(clientCountInput ? clientCountInput.value : "0");

    if (Number.isNaN(clientCount)) {
      setText(recordErrorEl, "人數請輸入 0 以上的數字（可為 0）。");
      return;
    }

    const trafficFee = toNonNegativeNumberOrZero(trafficFeeInput ? trafficFeeInput.value : "0");

    if (Number.isNaN(trafficFee)) {
      setText(recordErrorEl, "交通費請輸入 0 以上的數字（空白視為 0）。");
      return;
    }

    const mealFee = toNonNegativeNumberOrZero(mealFeeInput ? mealFeeInput.value : "0");

    if (Number.isNaN(mealFee)) {
      setText(recordErrorEl, "誤餐費請輸入 0 以上的數字（空白視為 0）。");
      return;
    }

    const totalHours = totalMinutes / 60;
    const peopleCount = Math.round(clientCount * totalHours);

    const record = {
      name,
      id,
      startDate,
      endDate,
      serviceItemCode: padCode4(serviceItemCode),
      serviceContentCode: padCode4(serviceContentCode),
      hours,
      minutes,
      clientCount,
      peopleCount,
      trafficFee,
      mealFee,
    };

    if (editingRecordIndex === null) {
      records.push(record);
    } else {
      records[editingRecordIndex] = record;
    }

    renderRecordsTable();
    exitRecordEditMode(true);
  });
}

// === 顯示模式切換 ===
function initDisplayModeToggle() {
  if (!displayModeInputs || displayModeInputs.length === 0) return;

  const checked = document.querySelector('input[name="displayMode"]:checked');
  if (checked && checked.value) displayMode = checked.value;

  displayModeInputs.forEach((input) => {
    input.addEventListener("change", function () {
      if (input.checked) {
        displayMode = input.value;
        renderRecordsTable();
      }
    });
  });
}

// === 從目前 tbody 產生可貼到 Excel 的文字 ===
function buildCopyTextFromCurrentTableBody() {
  if (!recordsTableBody) return "";

  const rows = Array.from(recordsTableBody.querySelectorAll("tr"));

  return rows
    .map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"))
        .slice(0, 17)
        .map((td) => cleanCellForExcel(td.textContent));

      return cells.join("\t");
    })
    .join("\r\n");
}

// === 複製表格內容 ===
function initCopyButton() {
  if (!copyTableBtn) return;

  copyTableBtn.addEventListener("click", async function () {
    if (records.length === 0) {
      alert("目前沒有資料可複製。");
      return;
    }

    const text = buildCopyTextFromCurrentTableBody();

    if (!text) {
      alert("目前表格沒有可複製的資料。");
      return;
    }

    try {
      await copyTextToClipboard(text);
      alert(`已複製 ${records.length} 筆資料到剪貼簿。`);
    } catch (err) {
      console.error(err);
      alert("複製失敗，請確認瀏覽器權限或改用 HTTPS / GitHub Pages。");
    }
  });
}

// === 清空紀錄 ===
function initClearRecordsButton() {
  if (!clearRecordsBtn) return;

  clearRecordsBtn.addEventListener("click", function () {
    if (records.length === 0) {
      alert("目前沒有紀錄可清空。");
      return;
    }

    if (!confirm("確定要清空所有服務紀錄嗎？此操作無法復原。")) return;

    records.length = 0;
    renderRecordsTable();
    exitRecordEditMode(true);
  });
}

// === 日期限制初始化 ===
function initDateConstraints() {
  if (startDateInput) {
    startDateInput.max = getTodayLocalYYYYMMDD();
  }

  if (startDateInput && endDateInput) {
    startDateInput.addEventListener("change", updateEndDateConstraints);
  }
}

// === 初始化 ===
function initDefaults() {
  if (clientCountInput && clientCountInput.value === "") clientCountInput.value = "0";
  if (trafficFeeInput && trafficFeeInput.value === "") trafficFeeInput.value = "0";
  if (mealFeeInput && mealFeeInput.value === "") mealFeeInput.value = "0";

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

  renderRecordsTable();
}

document.addEventListener("DOMContentLoaded", init);