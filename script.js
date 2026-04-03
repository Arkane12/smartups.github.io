const FIREBASE_BASE_URL = "https://smartups-25ba9-default-rtdb.europe-west1.firebasedatabase.app/devices/";
const EFFICIENCY = 0.85;
const MAC_MAXLEN = 12; 

let savedDevices    = JSON.parse(localStorage.getItem('ups_devices_list'))     || [];
let currentDeviceId = localStorage.getItem('ups_current_device')               || null;
let deviceSettings  = JSON.parse(localStorage.getItem('ups_device_settings'))  || {};
let fetchInterval;

const i18n = {
  uk: {
    setup_title:'Додати пристрій', connect_btn:'Підключити', cancel:'Скасувати',
    empty_id:'Введіть ID пристрою!', id_ph:'Введіть MAC адресу',
    connecting:'Отримання даних...', offline:'ПРИСТРІЙ ОФЛАЙН',
    status_on:'Мережа: 220V (Зарядка)', status_bat:'Увага: РОБОТА ВІД БАТАРЕЇ',
    voltage:'Напруга АКБ', charge:'Рівень заряду', runtime:'Орієнтовний час роботи',
    charging:'Заряджається...', runtime_fmt:(h,m)=>`~ ${h} год ${m} хв`,
    menu_home:'Головна', menu_calib:'Калібрування', menu_lang:'Мова', menu_mac:'MAC Адреси',
    calib_title:'Калібрування', cur_params:'Поточні параметри:',
    cap_label:'Загальна ємність АКБ (mAh)', volts_label:'Робоча напруга пристроїв (V)',
    amps_label:'Сумарний струм споживання (A)',
    cap_ph:'Напр. 12000', volts_ph:'Напр. 12', amps_ph:'Напр. 1.2',
    save_btn:'Зберегти для цього ДБЖ',
    lang_title:'Мова інтерфейсу',
    mac_title:'MAC Адреси пристроїв', mac_add_ph:'Введіть MAC адресу',
    mac_add_btn:'Додати', mac_empty:'Немає пристроїв',
    mac_remove_confirm:'Видалити цей пристрій з додатку?',
    mac_tip_left: 'Залишилось: ', mac_tip_full: 'Довжина MAC досягнута (12 симв.)'
  },
  en: {
    setup_title:'Add Device', connect_btn:'Connect', cancel:'Cancel',
    empty_id:'Enter Device ID!', id_ph:'Enter MAC address',
    connecting:'Fetching data...', offline:'DEVICE OFFLINE',
    status_on:'Grid: 220V (Charging)', status_bat:'Warning: RUNNING ON BATTERY',
    voltage:'Battery Voltage', charge:'Charge Level', runtime:'Estimated Runtime',
    charging:'Charging...', runtime_fmt:(h,m)=>`~ ${h} h ${m} min`,
    menu_home:'Home', menu_calib:'Calibration', menu_lang:'Language', menu_mac:'MAC Addresses',
    calib_title:'Calibration', cur_params:'Current parameters:',
    cap_label:'Total Battery Capacity (mAh)', volts_label:'Device Operating Voltage (V)',
    amps_label:'Total Current Draw (A)',
    cap_ph:'e.g. 12000', volts_ph:'e.g. 12', amps_ph:'e.g. 1.2',
    save_btn:'Save for this UPS',
    lang_title:'Interface Language',
    mac_title:'Device MAC Addresses', mac_add_ph:'Enter MAC address',
    mac_add_btn:'Add', mac_empty:'No devices',
    mac_remove_confirm:'Remove this device from app?',
    mac_tip_left: 'Chars left: ', mac_tip_full: 'MAC length reached (12 chars)'
  }
};

let lang = localStorage.getItem('ups_lang') || 'uk';

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const navBtn = document.getElementById('navBtn');
  navBtn.style.display = (id === 'pageSetup') ? 'none' : 'flex';
}

function updateDrawerHome() {
  const v = document.getElementById('volts') ? document.getElementById('volts').innerText : '-- V';
  const r = document.getElementById('runtime')  ? document.getElementById('runtime').innerText  : '--';
  const el = document.getElementById('drawerHomeSub');
  if (el) el.innerText = v + '  |  ' + r;
}

function openDrawer()  {
  updateDrawerHome();
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('settingsDrawer').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('settingsDrawer').classList.remove('open');
}
function goToPage(id) {
  closeDrawer();
  if (id === 'pageCalib') buildCalibPage();
  if (id === 'pageLang')  buildLangPage();
  if (id === 'pageMac')   buildMacPage();
  showPage(id);
}
function goHome() { closeDrawer(); showPage('pageDashboard'); }

function buildCalibPage() {
  const t = i18n[lang]; const s = getSettings();
  document.getElementById('calibPageTitleText').innerText = t.calib_title;
  document.getElementById('curParamsLabel').innerText = t.cur_params;
  document.getElementById('currentCap').innerText     = s.cap;
  document.getElementById('currentVolts').innerText   = s.volts;
  document.getElementById('currentAmps').innerText    = s.amps;
  document.getElementById('capLabel').innerText       = t.cap_label;
  document.getElementById('voltsLabel').innerText     = t.volts_label;
  document.getElementById('ampsLabel').innerText      = t.amps_label;
  document.getElementById('capInput').placeholder     = t.cap_ph;
  document.getElementById('voltsInput').placeholder   = t.volts_ph;
  document.getElementById('ampsInput').placeholder    = t.amps_ph;
  document.getElementById('saveBtn').innerText        = t.save_btn;
  document.getElementById('capInput').value = '';
  document.getElementById('voltsInput').value = '';
  document.getElementById('ampsInput').value = '';
}
function saveSettings() {
  const c = document.getElementById('capInput').value;
  const v = document.getElementById('voltsInput').value;
  const a = document.getElementById('ampsInput').value;
  let s = getSettings();
  if (c) s.cap = parseFloat(c);
  if (v) s.volts = parseFloat(v);
  if (a) s.amps = parseFloat(a);
  deviceSettings[currentDeviceId] = s;
  localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings));
  document.getElementById('capInput').value = '';
  document.getElementById('voltsInput').value = '';
  document.getElementById('ampsInput').value = '';
  document.getElementById('currentCap').innerText   = s.cap;
  document.getElementById('currentVolts').innerText = s.volts;
  document.getElementById('currentAmps').innerText  = s.amps;
  fetchData();
}

function buildLangPage() {
  document.getElementById('langPageTitleText').innerText = i18n[lang].lang_title;
  document.querySelectorAll('.lang-option').forEach(el =>
    el.classList.toggle('active', el.dataset.lang === lang));
}
function setLang(l) {
  lang = l; localStorage.setItem('ups_lang', l);
  applyLang(); buildLangPage();
}

function onMacInput(input) {
  let cleaned = input.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (cleaned.length > MAC_MAXLEN) { cleaned = cleaned.substring(0, MAC_MAXLEN); }
  input.value = cleaned;
  const len = cleaned.length;
  const tooltip = document.getElementById('macTooltip');
  const remaining = MAC_MAXLEN - len;
  
  tooltip.className = 'mac-tooltip visible';
  if (remaining === 0) {
    tooltip.innerText = i18n[lang].mac_tip_full;
    tooltip.style.color = 'var(--accent)'; 
  } else {
    tooltip.innerText = i18n[lang].mac_tip_left + remaining;
    tooltip.style.color = 'var(--text-secondary)';
  }
}
function onMacFocus() {
  document.getElementById('macTooltip').className = 'mac-tooltip visible';
  onMacInput(document.getElementById('macAddInput') || document.getElementById('idInput'));
}
function onMacBlur() {
  setTimeout(() => { document.getElementById('macTooltip').className = 'mac-tooltip'; }, 200);
}

function buildMacPage() {
  const t = i18n[lang];
  document.getElementById('macPageTitleText').innerText  = t.mac_title;
  document.getElementById('macAddInput').placeholder = t.mac_add_ph;
  document.getElementById('macAddBtn').innerText     = t.mac_add_btn;
  renderMacList();
}
function renderMacList() {
  const t = i18n[lang];
  const list = document.getElementById('macList');
  list.innerHTML = '';
  if (savedDevices.length === 0) {
    list.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:0.72em;color:var(--text-muted);padding:8px 0;">${t.mac_empty}</div>`;
    return;
  }
  savedDevices.forEach(id => {
    const div = document.createElement('div');
    div.className = 'mac-item' + (id === currentDeviceId ? ' active-device' : '');
    div.innerHTML = `<div class="mac-dot"></div><div class="mac-item-id">${id}</div><button class="mac-remove-btn" onclick="removeMac('${id}')"><span class="material-symbols-outlined">delete</span></button>`;
    list.appendChild(div);
  });
}
function addMac() {
  const input = document.getElementById('macAddInput');
  const newId = input.value.trim().toUpperCase();
  if (newId.length < MAC_MAXLEN) {
    alert(lang === 'uk' ? "Введіть повну MAC адресу (12 символів)!" : "Enter full MAC address (12 chars)!");
    return;
  }
  if (!savedDevices.includes(newId)) {
    savedDevices.push(newId);
    localStorage.setItem('ups_devices_list', JSON.stringify(savedDevices));
    if (!deviceSettings[newId]) {
      deviceSettings[newId] = { cap: 12000, volts: 12.0, amps: 1.0 };
      localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings));
    }
    if (!currentDeviceId) {
      currentDeviceId = newId;
      localStorage.setItem('ups_current_device', currentDeviceId);
    }
    populateDeviceDropdown();
  }
  input.value = '';
  onMacInput(input);
  renderMacList();
}
function removeMac(id) {
  if (!confirm(i18n[lang].mac_remove_confirm)) return;
  savedDevices = savedDevices.filter(d => d !== id);
  localStorage.setItem('ups_devices_list', JSON.stringify(savedDevices));
  if (currentDeviceId === id) {
    currentDeviceId = savedDevices.length > 0 ? savedDevices[0] : null;
    if (currentDeviceId) localStorage.setItem('ups_current_device', currentDeviceId);
    else localStorage.removeItem('ups_current_device');
  }
  populateDeviceDropdown();
  renderMacList();
  if (savedDevices.length === 0) showPage('pageSetup');
}

function applyLang() {
  const t = i18n[lang];
  document.getElementById('setupTitleText').innerText   = t.setup_title;
  document.getElementById('connectBtn').innerText   = t.connect_btn;
  document.getElementById('idInput').placeholder    = t.id_ph;
  document.getElementById('labelVoltage').innerText = t.voltage;
  document.getElementById('labelCharge').innerText  = t.charge;
  document.getElementById('labelRuntime').innerText = t.runtime;
  document.getElementById('menuHome').innerText     = t.menu_home;
  document.getElementById('menuCalib').innerText    = t.menu_calib;
  document.getElementById('menuLang').innerText     = t.menu_lang;
  document.getElementById('menuMac').innerText      = t.menu_mac;
  document.documentElement.lang = lang;
  if (window._lastData) renderData(window._lastData);
  else {
    const badge = document.getElementById('status');
    if (badge) badge.innerText = t.connecting;
  }
}

function maskId(id) { return (!id || id.length <= 6) ? id : id.substring(0,6)+"******"; }
function getSettings() { return deviceSettings[currentDeviceId] || { cap:12000, volts:12.0, amps:1.0 }; }

function calculateRuntime(pct) {
  const s = getSettings();
  let pw = s.volts * s.amps; if (pw <= 0) pw = 1.0;
  const totalWh = (s.cap / 1000.0) * 3.7;
  const mins = Math.floor((totalWh * pct / 100 / pw) * EFFICIENCY * 60);
  return i18n[lang].runtime_fmt(Math.floor(mins/60), mins%60);
}

function renderData(data) {
  const t = i18n[lang];
  const badge = document.getElementById('status');
  const dot   = document.getElementById('headerDot');
  if ((Date.now() - data.last_update) > 15000) {
    badge.innerText = t.offline; badge.className = 'status-badge offline';
    dot.className = 'header-dot dot-offline';
    document.getElementById('volts').innerText = '-- V';
    document.getElementById('perc').innerText  = '-- %';
    document.getElementById('runtime').innerText = '--';
  } else {
    document.getElementById('volts').innerText = data.voltage.toFixed(2) + ' V';
    document.getElementById('perc').innerText  = data.percentage + ' %';
    if (data.mains_online) {
      badge.innerText = t.status_on; badge.className = 'status-badge online';
      dot.className = 'header-dot dot-online';
      document.getElementById('runtime').innerText = t.charging;
    } else {
      badge.innerText = t.status_bat; badge.className = 'status-badge battery';
      dot.className = 'header-dot dot-battery';
      document.getElementById('runtime').innerText = calculateRuntime(data.percentage);
    }
  }
  updateDrawerHome();
}

function fetchData() {
  if (!currentDeviceId) return;
  fetch(FIREBASE_BASE_URL + currentDeviceId + ".json")
    .then(r => r.json())
    .then(data => { if (!data) return; window._lastData = data; renderData(data); })
    .catch(err => console.log('Fetch error', err));
}

function populateDeviceDropdown() {
  const select = document.getElementById('deviceSelect');
  select.innerHTML = '';
  savedDevices.forEach(id => {
    let opt = document.createElement('option');
    opt.value = id; opt.text = "UPS ID: " + maskId(id);
    if (id === currentDeviceId) opt.selected = true;
    select.appendChild(opt);
  });
}

function onDeviceChange(newId) {
  currentDeviceId = newId;
  localStorage.setItem('ups_current_device', currentDeviceId);
  window._lastData = null;
  document.getElementById('status').innerText  = i18n[lang].connecting;
  document.getElementById('volts').innerText   = '-- V';
  document.getElementById('perc').innerText    = '-- %';
  document.getElementById('runtime').innerText = '--';
  fetchData();
}

function connectDevice() {
  const input = document.getElementById('idInput');
  let id = input.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase(); 
  if (id.length < MAC_MAXLEN) { 
    alert(lang === 'uk' ? "Введіть повну MAC адресу (12 символів)!" : "Enter full MAC address (12 chars)!"); 
    return; 
  }
  if (!savedDevices.includes(id)) { 
    savedDevices.push(id); 
    localStorage.setItem('ups_devices_list', JSON.stringify(savedDevices)); 
  }
  currentDeviceId = id; 
  localStorage.setItem('ups_current_device', id);
  if (!deviceSettings[id]) { 
    deviceSettings[id] = {cap:12000,volts:12.0,amps:1.0}; 
    localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings)); 
  }
  showDashboard();
}

function handleKeyPress(e) { if (e.key === 'Enter') connectDevice(); }

function showDashboard() {
  populateDeviceDropdown(); fetchData();
  if (fetchInterval) clearInterval(fetchInterval);
  fetchInterval = setInterval(fetchData, 2000);
  showPage('pageDashboard');
}

function showSetup() {
  if (fetchInterval) clearInterval(fetchInterval);
  document.getElementById('idInput').value = '';
  showPage('pageSetup');
}

// Ініціалізація після завантаження сторінки
document.addEventListener("DOMContentLoaded", function() {
  applyLang();
  if (savedDevices.length > 0) {
    if (!currentDeviceId || !savedDevices.includes(currentDeviceId)) {
      currentDeviceId = savedDevices[0];
      localStorage.setItem('ups_current_device', currentDeviceId);
    }
    showDashboard();
  } else {
    showSetup();
  }
});