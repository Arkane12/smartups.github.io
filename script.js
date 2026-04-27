const FIREBASE_BASE_URL = "https://smartups-25ba9-default-rtdb.europe-west1.firebasedatabase.app/devices/";
const EFFICIENCY = 0.85;
const MAC_MAXLEN = 12;

let savedDevices    = JSON.parse(localStorage.getItem('ups_devices_list'))    || [];
let currentDeviceId = localStorage.getItem('ups_current_device')              || null;
let deviceSettings  = JSON.parse(localStorage.getItem('ups_device_settings')) || {};
let fetchInterval;

let lastUpdateTimeLocal = 0;
let lastUpdateUptime    = -1;
let firstUptimeSeen     = false; 
let wasOffline          = null;  

const i18n = {
  uk: {
    setup_title: 'Додати пристрій', connect_btn: 'Підключити', cancel: 'Скасувати',
    empty_id: 'Введіть ID пристрою!', id_ph: 'Введіть MAC адресу',
    connecting: 'Отримання даних...', offline: 'ПРИСТРІЙ ОФЛАЙН',
    status_on: 'Мережа: 220V (Зарядка)', status_bat: 'Увага: РОБОТА ВІД БАТАРЕЇ',
    voltage: 'Напруга АКБ', charge: 'Рівень заряду', runtime: 'Орієнтовний час роботи',
    charging: 'Заряджається...', runtime_fmt: (h, m) => `~ ${h} год ${m} хв`,
    menu_home: 'Головна', menu_cons: 'Споживання', menu_logs: 'Історія',
    menu_calib: 'Калібрування', menu_lang: 'Мова', menu_mac: 'MAC Адреси', menu_ble: 'Bluetooth',
    cons_title: 'Графік споживання', cur_current: 'Поточний струм',
    logs_title: 'Історія відключень', no_logs: 'Немає записів...',
    calib_title: 'Калібрування', cur_params: 'Поточні параметри:',
    cap_label: 'Загальна ємність АКБ (mAh)', volts_label: 'Робоча напруга (V)',
    cap_ph: 'Напр. 12000', volts_ph: 'Напр. 12',
    save_btn: 'Зберегти для цього ДБЖ',
    lang_title: 'Мова інтерфейсу',
    mac_title: 'MAC Адреси пристроїв', mac_add_ph: 'Введіть MAC адресу',
    mac_add_btn: 'Додати', mac_empty: 'Немає пристроїв',
    mac_remove_confirm: 'Видалити цей пристрій з додатку?',
    log_lost: 'Зникло світло', log_restored: 'Світло з\'явилося',
    log_offline: 'Пристрій офлайн', log_online: 'Пристрій онлайн',
    log_power_on: 'Світло є', log_power_off: 'Світла немає',
    clear_logs_confirm: 'Очистити всю історію подій (локальну та з Firebase)?',
    ble_btn: 'Пошук по Bluetooth',
    or_text: 'Або введіть вручну',
    ble_prompt_ssid: 'Введіть назву вашої Wi-Fi мережі (SSID):',
    ble_prompt_pass: 'Введіть пароль від Wi-Fi (залиште пустим, якщо немає):',
    ble_success: 'Налаштування відправлено! ДБЖ зараз перезавантажиться і з\'явиться в мережі.',
    ble_error: 'Помилка Bluetooth. Перевірте, чи увімкнений Bluetooth та чи плата знаходиться поруч.'
  },
  en: {
    setup_title: 'Add Device', connect_btn: 'Connect', cancel: 'Cancel',
    empty_id: 'Enter Device ID!', id_ph: 'Enter MAC address',
    connecting: 'Fetching data...', offline: 'DEVICE OFFLINE',
    status_on: 'Grid: 220V (Charging)', status_bat: 'Warning: RUNNING ON BATTERY',
    voltage: 'Battery Voltage', charge: 'Charge Level', runtime: 'Estimated Runtime',
    charging: 'Charging...', runtime_fmt: (h, m) => `~ ${h} h ${m} min`,
    menu_home: 'Home', menu_cons: 'Consumption', menu_logs: 'History',
    menu_calib: 'Calibration', menu_lang: 'Language', menu_mac: 'MAC Addresses', menu_ble: 'Bluetooth',
    cons_title: 'Consumption Chart', cur_current: 'Live Current',
    logs_title: 'Outage History', no_logs: 'No records found...',
    calib_title: 'Calibration', cur_params: 'Current parameters:',
    cap_label: 'Total Battery Capacity (mAh)', volts_label: 'Operating Voltage (V)',
    cap_ph: 'e.g. 12000', volts_ph: 'e.g. 12',
    save_btn: 'Save for this UPS',
    lang_title: 'Interface Language',
    mac_title: 'Device MAC Addresses', mac_add_ph: 'Enter MAC address',
    mac_add_btn: 'Add', mac_empty: 'No devices',
    mac_remove_confirm: 'Remove this device from app?',
    log_lost: 'Power Lost', log_restored: 'Power Restored',
    log_offline: 'Device Offline', log_online: 'Device Online',
    log_power_on: 'Power is on', log_power_off: 'No power',
    clear_logs_confirm: 'Clear all event history (local + Firebase)?',
    ble_btn: 'Search via Bluetooth',
    or_text: 'Or enter manually',
    ble_prompt_ssid: 'Enter your Wi-Fi network name (SSID):',
    ble_prompt_pass: 'Enter Wi-Fi password (leave blank if none):',
    ble_success: 'Settings sent! UPS will restart and appear online shortly.',
    ble_error: 'Bluetooth connection error. Ensure Bluetooth is on and the board is nearby.'
  }
};

let lang = localStorage.getItem('ups_lang') || 'uk';

// ─── Навігація ───────────────────────────────────────────────────────────────

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('navBtn').style.display = (id === 'pageSetup') ? 'none' : 'flex';
  if (id !== 'pageSetup') localStorage.setItem('ups_last_page', id);
}

function updateDrawerHome() {
  const v = document.getElementById('volts')?.innerText   || '-- V';
  const r = document.getElementById('runtime')?.innerText || '--';
  const el = document.getElementById('drawerHomeSub');
  if (el) el.innerText = v + '  |  ' + r;
}

function openDrawer()  { updateDrawerHome(); document.getElementById('drawerOverlay').classList.add('open'); document.getElementById('settingsDrawer').classList.add('open'); }
function closeDrawer() { document.getElementById('drawerOverlay').classList.remove('open'); document.getElementById('settingsDrawer').classList.remove('open'); }

function goToPage(id) {
  closeDrawer();
  if (id === 'pageCalib') buildCalibPage();
  if (id === 'pageLang')  buildLangPage();
  if (id === 'pageMac')   buildMacPage();
  showPage(id);
}
function goHome() { closeDrawer(); showPage('pageDashboard'); }

// ─── Калібрування ────────────────────────────────────────────────────────────

function buildCalibPage() {
  const t = i18n[lang];
  const s = getSettings();
  document.getElementById('calibPageTitleText').innerText = t.calib_title;
  document.getElementById('curParamsLabel').innerText     = t.cur_params;
  document.getElementById('currentCap').innerText         = s.cap;
  document.getElementById('currentVolts').innerText       = s.volts;
  document.getElementById('capLabel').innerText           = t.cap_label;
  document.getElementById('voltsLabel').innerText         = t.volts_label;
  document.getElementById('capInput').placeholder         = t.cap_ph;
  document.getElementById('voltsInput').placeholder       = t.volts_ph;
  document.getElementById('saveBtn').innerText            = t.save_btn;
}

function saveSettings() {
  const c = document.getElementById('capInput').value;
  const v = document.getElementById('voltsInput').value;
  const s = getSettings();
  if (c) s.cap   = parseFloat(c);
  if (v) s.volts = parseFloat(v);
  deviceSettings[currentDeviceId] = s;
  localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings));
  buildCalibPage();
  fetchData();
}

// ─── Мова ────────────────────────────────────────────────────────────────────

function buildLangPage() {
  document.getElementById('langPageTitleText').innerText = i18n[lang].lang_title;
  document.querySelectorAll('.lang-option').forEach(el =>
    el.classList.toggle('active', el.dataset.lang === lang));
}
function setLang(l) { lang = l; localStorage.setItem('ups_lang', l); applyLang(); buildLangPage(); }

// ─── MAC Адреси ──────────────────────────────────────────────────────────────

function onMacInput(input) {
  let cleaned = input.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (cleaned.length > MAC_MAXLEN) cleaned = cleaned.substring(0, MAC_MAXLEN);
  input.value = cleaned;
}

function buildMacPage() {
  const t = i18n[lang];
  document.getElementById('macPageTitleText').innerText = t.mac_title;
  document.getElementById('macAddInput').placeholder    = t.mac_add_ph;
  document.getElementById('macAddBtn').innerText        = t.mac_add_btn;
  renderMacList();
}

function renderMacList() {
  const list = document.getElementById('macList');
  list.innerHTML = '';
  if (savedDevices.length === 0) {
    list.innerHTML = `<div style="font-size:0.72em;color:var(--text-muted);padding:8px 0;">${i18n[lang].mac_empty}</div>`;
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
  if (newId.length < MAC_MAXLEN) return;
  if (!savedDevices.includes(newId)) {
    savedDevices.push(newId);
    localStorage.setItem('ups_devices_list', JSON.stringify(savedDevices));
    if (!deviceSettings[newId]) {
      deviceSettings[newId] = { cap: 12000, volts: 12.0 };
      localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings));
    }
    if (!currentDeviceId) {
      currentDeviceId = newId;
      localStorage.setItem('ups_current_device', currentDeviceId);
    }
  }
  input.value = '';
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
  renderMacList();
  if (savedDevices.length === 0) showPage('pageSetup');
}

// ─── Застосування перекладів ─────────────────────────────────────────────────

function applyLang() {
  const t = i18n[lang];
  document.getElementById('setupTitleText').innerText  = t.setup_title;
  document.getElementById('connectBtn').innerText      = t.connect_btn;
  document.getElementById('idInput').placeholder       = t.id_ph;
  document.getElementById('labelVoltage').innerText    = t.voltage;
  document.getElementById('labelCharge').innerText     = t.charge;
  document.getElementById('labelRuntime').innerText    = t.runtime;

  document.getElementById('menuHome').innerText        = t.menu_home;
  document.getElementById('menuCons').innerText        = t.menu_cons;
  document.getElementById('menuLogs').innerText        = t.menu_logs;
  document.getElementById('menuCalib').innerText       = t.menu_calib;
  document.getElementById('menuLang').innerText        = t.menu_lang;
  document.getElementById('menuMac').innerText         = t.menu_mac;
  if(document.getElementById('menuBle')) document.getElementById('menuBle').innerText = t.menu_ble;

  document.getElementById('consPageTitleText').innerText = t.cons_title;
  document.getElementById('labelCurrent').innerText      = t.cur_current;
  document.getElementById('logsPageTitleText').innerText = t.logs_title;
  
  if(document.getElementById('bleBtnText')) document.getElementById('bleBtnText').innerText = t.ble_btn;
  if(document.getElementById('orText')) document.getElementById('orText').innerText = t.or_text;

  document.documentElement.lang = lang;
  if (window._lastData) renderData(window._lastData);
}

// ─── Утиліти ─────────────────────────────────────────────────────────────────

function maskId(id) { return (!id || id.length <= 6) ? id : id.substring(0, 6) + '******'; }
function getSettings() { return deviceSettings[currentDeviceId] || { cap: 12000, volts: 12.0 }; }

function calculateRuntime(pct, mA) {
  const s  = getSettings();
  let pw   = s.volts * (mA / 1000.0);
  if (pw <= 0) pw = 1.0;
  const totalWh = (s.cap / 1000.0) * s.volts; 
  const mins    = Math.floor((totalWh * pct / 100 / pw) * EFFICIENCY * 60);
  return i18n[lang].runtime_fmt(Math.floor(mins / 60), mins % 60);
}

// ─── Рендер даних ────────────────────────────────────────────────────────────

function renderData(data) {
  const t     = i18n[lang];
  const badge = document.getElementById('status');
  const dot   = document.getElementById('headerDot');

  if (data.uptime !== undefined) {
    if (!firstUptimeSeen) {
      firstUptimeSeen  = true;
      lastUpdateUptime = data.uptime;
    } else if (data.uptime !== lastUpdateUptime) {
      lastUpdateUptime    = data.uptime;
      lastUpdateTimeLocal = Date.now();
    }
  }

  const isOffline = (lastUpdateTimeLocal === 0) || ((Date.now() - lastUpdateTimeLocal) > 12000);

  if (wasOffline === null) {
    wasOffline = isOffline; 
  } else if (!wasOffline && isOffline) {
    addLocalLog('DEVICE_OFFLINE');
    wasOffline = true;
  } else if (wasOffline && !isOffline) {
    addLocalLog('DEVICE_ONLINE');
    addLocalLog(data.mains_online ? 'POWER_STATE_ON' : 'POWER_STATE_OFF');
    wasOffline = false;
  }

  if (isOffline) {
    badge.innerText   = t.offline;
    badge.className   = 'status-badge offline';
    dot.className     = 'header-dot dot-offline';
    document.getElementById('volts').innerText       = '-- V';
    document.getElementById('perc').innerText        = '-- %';
    document.getElementById('runtime').innerText     = '--';
    document.getElementById('liveCurrent').innerText = '-- mA';
  } else {
    const voltage    = data.voltage    != null ? data.voltage.toFixed(2)       : '--';
    const percentage = data.percentage != null ? data.percentage                : '--';
    const current    = data.current_mA != null ? Math.round(data.current_mA)   : '--';

    document.getElementById('volts').innerText       = voltage + ' V';
    document.getElementById('perc').innerText        = percentage + ' %';
    document.getElementById('liveCurrent').innerText = current + ' mA';

    if (data.mains_online) {
      badge.innerText = t.status_on;
      badge.className = 'status-badge online';
      dot.className   = 'header-dot dot-online';
      document.getElementById('runtime').innerText = t.charging;
    } else {
      badge.innerText = t.status_bat;
      badge.className = 'status-badge battery';
      dot.className   = 'header-dot dot-battery';
      document.getElementById('runtime').innerText = calculateRuntime(data.percentage || 0, data.current_mA || 1000);
    }
  }

  // Графік
  if (data.chart) {
    const chartPoints = Object.values(data.chart).slice(-20);
    const labels = chartPoints.map(p => {
      if (!p.ts) return '--:--';
      const d = new Date(p.ts);
      return (d.getFullYear() > 2020)
        ? d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes()
        : '--:--';
    });
    const currentData = chartPoints.map(p => p.mA);

    if (window.myChart) {
      window.myChart.data.labels            = labels;
      window.myChart.data.datasets[0].data  = currentData;
      window.myChart.update('none'); 
    } else {
      const ctx = document.getElementById('consChart').getContext('2d');
      window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'mA',
            data: currentData,
            borderColor: '#6a9a6a',
            backgroundColor: 'rgba(90,138,90,0.07)',
            fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#6a9a6a', borderWidth: 1.5
          }]
        },
        options: {
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              display: true,
              grid:  { color: 'rgba(255,255,255,0.04)' },
              ticks: { color: '#555', font: { size: 9, family: 'IBM Plex Mono' } }
            }
          }
        }
      });
    }
  }

  // Логи
  const logsDiv = document.getElementById('logsContainer');
  const localLogs = getLocalLogs();

  let allEntries = [];
  if (data.logs) {
    allEntries = allEntries.concat(Object.values(data.logs));
  }
  allEntries = allEntries.concat(localLogs);

  if (allEntries.length === 0) {
    logsDiv.innerHTML = `<div class="log-empty">${t.no_logs}</div>`;
  } else {
    logsDiv.innerHTML = '';
    allEntries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    allEntries.slice(0, 30).forEach(log => {
      let timeStr = '--:--';
      if (log.ts) {
        const date = new Date(log.ts);
        if (date.getFullYear() > 2020) {
          const dStr = date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
          const tStr = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
          timeStr = `${dStr} ${tStr}`;
        }
      }
      
      let text, cssClass, dotHtml;
      
      if (log.event === 'POWER_LOST') {
        dotHtml = '<span class="log-dot dot-red"></span>';
        text = t.log_lost; cssClass = 'lost';
      } else if (log.event === 'POWER_RESTORED') {
        dotHtml = '<span class="log-dot dot-green"></span>';
        text = t.log_restored; cssClass = 'restored';
      } else if (log.event === 'DEVICE_OFFLINE') {
        dotHtml = '<span class="log-dot dot-grey"></span>';
        text = t.log_offline; cssClass = 'dev-offline';
      } else if (log.event === 'DEVICE_ONLINE') {
        dotHtml = '<span class="log-dot dot-blue"></span>';
        text = t.log_online; cssClass = 'dev-online';
      } else if (log.event === 'POWER_STATE_ON') {
        dotHtml = '<span class="log-dot dot-green"></span>';
        text = t.log_power_on; cssClass = 'restored power-state';
      } else if (log.event === 'POWER_STATE_OFF') {
        dotHtml = '<span class="log-dot dot-red"></span>';
        text = t.log_power_off; cssClass = 'lost power-state';
      } else {
        dotHtml = '<span class="log-dot dot-grey"></span>';
        text = log.event; cssClass = '';
      }
      
      logsDiv.innerHTML += `<div class="log-item ${cssClass}">${dotHtml}<span class="log-time">[${timeStr}]</span><span class="log-text">${text}</span></div>`;
    });
  }
}

// ─── Локальні логи та Очищення ───────────────────────────────────────────────

function getLocalLogsKey() { return 'ups_local_logs_' + (currentDeviceId || 'default'); }

function getLocalLogs() {
  try { return JSON.parse(localStorage.getItem(getLocalLogsKey())) || []; }
  catch { return []; }
}

function addLocalLog(event) {
  const logs = getLocalLogs();
  logs.push({ event, ts: Date.now(), local: true });
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  localStorage.setItem(getLocalLogsKey(), JSON.stringify(logs));
}

function clearLogs() {
  if (!confirm(i18n[lang].clear_logs_confirm)) return;
  localStorage.removeItem(getLocalLogsKey());
  if (currentDeviceId) {
    fetch(FIREBASE_BASE_URL + currentDeviceId + '/logs.json', { method: 'DELETE' })
      .catch(err => console.warn('Firebase logs delete error:', err));
  }
  if (window._lastData) {
    window._lastData.logs = null;
    renderData(window._lastData);
  } else {
    const logsDiv = document.getElementById('logsContainer');
    if (logsDiv) logsDiv.innerHTML = `<div class="log-empty">${i18n[lang].no_logs}</div>`;
  }
}

// ─── Firebase Fetch (З Антикешем) ────────────────────────────────────────────

function fetchData() {
  if (!currentDeviceId) return;
  fetch(`${FIREBASE_BASE_URL}${currentDeviceId}.json?_t=${Date.now()}`)
    .then(r => r.json())
    .then(data => { if (!data) return; window._lastData = data; renderData(data); })
    .catch(err => console.warn('Fetch error:', err));
}

// ─── Дашборд та Налаштування ─────────────────────────────────────────────────

function populateDeviceDropdown() {
  const select = document.getElementById('deviceSelect');
  select.innerHTML = '';
  savedDevices.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.text  = 'UPS ID: ' + maskId(id);
    if (id === currentDeviceId) opt.selected = true;
    select.appendChild(opt);
  });
}

function onDeviceChange(newId) {
  currentDeviceId = newId;
  localStorage.setItem('ups_current_device', currentDeviceId);
  window._lastData    = null;
  firstUptimeSeen     = false;
  lastUpdateTimeLocal = 0;
  lastUpdateUptime    = -1;
  wasOffline          = null;
  fetchData();
}

function connectDevice() {
  const input = document.getElementById('idInput');
  const id    = input.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (id.length < MAC_MAXLEN) return;
  if (!savedDevices.includes(id)) {
    savedDevices.push(id);
    localStorage.setItem('ups_devices_list', JSON.stringify(savedDevices));
  }
  currentDeviceId = id;
  localStorage.setItem('ups_current_device', id);
  if (!deviceSettings[id]) {
    deviceSettings[id] = { cap: 12000, volts: 12.0 };
    localStorage.setItem('ups_device_settings', JSON.stringify(deviceSettings));
  }
  showDashboard();
}

function handleKeyPress(e) { if (e.key === 'Enter') connectDevice(); }

function cancelSetup() {
  if (savedDevices.length > 0) showDashboard();
}

function showDashboard() {
  populateDeviceDropdown();
  fetchData();
  if (fetchInterval) clearInterval(fetchInterval);
  fetchInterval = setInterval(fetchData, 2000);
  showPage('pageDashboard');
}

function showSetup() {
  if (fetchInterval) clearInterval(fetchInterval);
  document.getElementById('idInput').value = '';
  showPage('pageSetup');
}

// ─── Web Bluetooth API ───────────────────────────────────────────────────────

const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_MAC_UUID = "12345678-1234-5678-1234-56789abcdef0";
const BLE_CHAR_WIFI_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice;
let bleServer;
let wifiCharacteristic;

async function connectViaBLE() {
  const t = i18n[lang];
  try {
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'SmartUPS_BLE' }],
      optionalServices: [BLE_SERVICE_UUID]
    });

    bleServer = await bleDevice.gatt.connect();
    const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
    const macChar = await service.getCharacteristic(BLE_CHAR_MAC_UUID);
    wifiCharacteristic = await service.getCharacteristic(BLE_CHAR_WIFI_UUID);

    // Зчитуємо MAC
    const macValue = await macChar.readValue();
    const decoder = new TextDecoder('utf-8');
    const macString = decoder.decode(macValue);

    if (macString && macString.length >= 12) {
        document.getElementById('idInput').value = macString;
    }

    setTimeout(async () => {
        let ssid = prompt(t.ble_prompt_ssid);
        if (!ssid) {
            if (bleDevice.gatt.connected) bleDevice.gatt.disconnect();
            return;
        }
        
        let pass = prompt(t.ble_prompt_pass);
        if (pass === null) pass = ""; 
        
        const dataString = ssid + ";" + pass;
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataString);
        
        await wifiCharacteristic.writeValue(dataBuffer);
        alert(t.ble_success);
        
        if (bleDevice.gatt.connected) bleDevice.gatt.disconnect();
        connectDevice();
    }, 500);

  } catch (error) {
    console.error("Bluetooth error:", error);
    if (error.name !== 'NotFoundError') {
        alert(t.ble_error);
    }
  }
}

// ─── Ініціалізація ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  applyLang();
  if (savedDevices.length > 0) {
    if (!currentDeviceId || !savedDevices.includes(currentDeviceId)) {
      currentDeviceId = savedDevices[0];
      localStorage.setItem('ups_current_device', currentDeviceId);
    }
    
    populateDeviceDropdown();
    fetchData();
    if (fetchInterval) clearInterval(fetchInterval);
    fetchInterval = setInterval(fetchData, 2000);

    const lastPage = localStorage.getItem('ups_last_page') || 'pageDashboard';
    const validPages = ['pageDashboard','pageConsumption','pageLogs','pageCalib','pageLang','pageMac'];
    const targetPage = validPages.includes(lastPage) ? lastPage : 'pageDashboard';

    if (targetPage === 'pageCalib') buildCalibPage();
    if (targetPage === 'pageLang')  buildLangPage();
    if (targetPage === 'pageMac')   buildMacPage();

    showPage(targetPage);
  } else {
    showSetup();
  }
});
