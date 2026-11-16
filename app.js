'use strict';
/* ================= Utility ================= */
const KEY = 'idraulico.data.v1';
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const eur = n => EUR.format(n || 0);
const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
const pad = n => String(n).padStart(2, '0');
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MSHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Legge numeri scritti all'italiana: "12,50", "1.234,5", "€ 3" */
function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const numIn = n => (n || n === 0) && +n !== 0 ? String(Math.round(n * 100) / 100).replace('.', ',') : '';
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => s ? parseISO(s).toLocaleDateString('it-IT', o) : '';
const fmtDateLong = s => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function fmtMin(m) {
  m = Math.round(m || 0);
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} min`;
  return mm ? `${h} h ${pad(mm)}` : `${h} h`;
}
function toast(msg) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}

/* ================= Dati ================= */
function normalize(d) {
  d = d || {};
  return {
    version: 1, savedAt: d.savedAt || 0,
    jobs: Array.isArray(d.jobs) ? d.jobs : [],
    materials: Array.isArray(d.materials) ? d.materials : [],
    moves: Array.isArray(d.moves) ? d.moves : [],
    settings: Object.assign({ lastBackup: null, hideInstall: false }, d.settings || {})
  };
}
function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return normalize(); }
}
/* Copia di sicurezza in IndexedDB (Safari a volte svuota localStorage) */
let idbConn = null;
function idb() {
  if (idbConn) return idbConn;
  idbConn = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open('idraulico', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  idbConn.catch(() => { idbConn = null; });
  return idbConn;
}
async function idbGet(k) {
  const d = await idb();
  return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(k, v) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
let saveFailed = false;
function save() {
  db.savedAt = Date.now();
  const json = JSON.stringify(db);
  let ok = false;
  try { localStorage.setItem(KEY, json); ok = localStorage.getItem(KEY) === json; } catch (e) { ok = false; }
  idbSet('data', json).then(() => { if (saveFailed) { saveFailed = false; render(); } }).catch(() => {
    if (!ok) { saveFailed = true; alert('ATTENZIONE: il telefono non permette di salvare i dati. Apri l\'app dall\'icona sulla schermata Home e non da una finestra privata di Safari.'); }
  });
  if (!ok) saveFailed = true;
}
function storageWorks() {
  try { localStorage.setItem('_t', '1'); const ok = localStorage.getItem('_t') === '1'; localStorage.removeItem('_t'); return ok; } catch (e) { return false; }
}
/* All'avvio: se la copia in IndexedDB è più recente (o localStorage è vuoto) la recupera */
async function recover() {
  try {
    const raw = await idbGet('data');
    if (!raw) { if (db.jobs.length || db.materials.length || db.moves.length) idbSet('data', JSON.stringify(db)).catch(() => {}); return; }
    const d = normalize(JSON.parse(raw));
    const localEmpty = !db.jobs.length && !db.materials.length && !db.moves.length;
    if (document.querySelector('.sheet-wrap')) return;
    if ((d.savedAt || 0) > (db.savedAt || 0) || (localEmpty && (d.jobs.length || d.materials.length || d.moves.length))) {
      db = d;
      try { localStorage.setItem(KEY, raw); } catch (e) {}
      if (!document.querySelector('.sheet-wrap')) render();
      toast('Dati recuperati');
    }
  } catch (e) {}
}
let db = load();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const getJob = id => db.jobs.find(j => j.id === id);
const getMat = id => db.materials.find(m => m.id === id);
const getMove = id => db.moves.find(m => m.id === id);
const matTotal = m => num(m.qty) * num(m.unitCost);
const jobMaterials = id => db.materials.filter(m => m.jobId === id);
const jobMatCost = id => sum(jobMaterials(id).map(matTotal));
const jobMinutes = j => (j.minutes || 0) + (j.timerStart ? (Date.now() - j.timerStart) / 60000 : 0);
const isUnpaid = j => j.status !== 'annullato' && !j.paid && num(j.amount) > 0;
const byDateTime = (a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'));
const STATUS = { programmato: ['Programmato', 'blue'], completato: ['Completato', 'green'], annullato: ['Annullato', ''] };

/** Tutti i movimenti di denaro: incassi dei lavori, acquisti materiali, entrate/uscite manuali */
function flows() {
  const out = [];
  db.jobs.forEach(j => {
    if (j.status !== 'annullato' && j.paid && num(j.amount) > 0)
      out.push({ kind: 'job', type: 'in', date: j.paidDate || j.date, amount: num(j.amount), label: j.title || 'Lavoro', sub: (j.client ? j.client + ' · ' : '') + (j.payMethod || 'Incasso lavoro'), ref: j.id });
  });
  db.materials.forEach(m => out.push({ kind: 'mat', type: 'out', date: m.date, amount: matTotal(m), label: m.name + (m.brand ? ' · ' + m.brand : ''), sub: 'Materiale' + (m.supplier ? ' · ' + m.supplier : ''), ref: m.id }));
  db.moves.forEach(v => out.push({ kind: 'move', type: v.type, date: v.date, amount: num(v.amount), label: v.desc || v.category || (v.type === 'in' ? 'Entrata' : 'Uscita'), sub: v.category || '', ref: v.id }));
  return out;
}

function stats(from, to) {
  const inR = d => d && d >= from && d <= to;
  const jobsR = db.jobs.filter(j => j.status !== 'annullato' && inR(j.date));
  const paidIn = sum(db.jobs.filter(j => j.status !== 'annullato' && j.paid && inR(j.paidDate || j.date)).map(j => num(j.amount)));
  const otherIn = sum(db.moves.filter(v => v.type === 'in' && inR(v.date)).map(v => num(v.amount)));
  const matOut = sum(db.materials.filter(m => inR(m.date)).map(matTotal));
  const otherOut = sum(db.moves.filter(v => v.type === 'out' && inR(v.date)).map(v => num(v.amount)));
  const minutes = sum(jobsR.map(jobMinutes));
  const billed = sum(jobsR.map(j => num(j.amount)));
  return {
    paidIn, otherIn, inTot: paidIn + otherIn, matOut, otherOut, outTot: matOut + otherOut,
    net: paidIn + otherIn - matOut - otherOut,
    unpaid: sum(jobsR.filter(j => !j.paid).map(j => num(j.amount))),
    minutes, billed, count: jobsR.length,
    done: jobsR.filter(j => j.status === 'completato').length,
    perHour: minutes > 0 ? billed / (minutes / 60) : 0, jobsR
  };
}

/* ================= Stato interfaccia ================= */
const N = new Date();
const S = {
  tab: 'agenda', jobId: null,
  cy: N.getFullYear(), cm: N.getMonth(), day: today(),
  filter: 'tutti', q: '',
  my: N.getFullYear(), mm: N.getMonth(),
  matMode: 'list', mq: '',
  period: 'mese', py: N.getFullYear(), pm: N.getMonth()
};

/* ================= Componenti ================= */
function jobItem(j, showDate = true) {
  const [lab, col] = STATUS[j.status] || STATUS.programmato;
  const money = num(j.amount) > 0
    ? `<div class="r num ${j.paid ? 'in' : ''}">${eur(j.amount)}<small>${j.paid ? 'Pagato' : (j.status === 'annullato' ? '' : 'Da incassare')}</small></div>` : '';
  return `<div class="swipe${j.important ? ' imp' : ''}">
    <button class="sw-act sw-left" data-a="toggleImp" data-id="${j.id}" tabindex="-1">${ICON.star}<span>${j.important ? 'Non importante' : 'Importante'}</span></button>
    <button class="sw-act sw-right" data-a="delJob" data-id="${j.id}" tabindex="-1">${ICON.trash}<span>Elimina</span></button>
    <button class="item sw-front" data-a="openJob" data-id="${j.id}">
    <div class="time">${showDate ? `<div class="small">${esc(fmtDate(j.date, { day: 'numeric', month: 'short' }))}</div>` : ''}${esc(j.time || (showDate ? '' : '—'))}</div>
    <div class="main"><div class="t">${j.important ? '<span class="star">★</span> ' : ''}${esc(j.title || 'Lavoro')}</div>
      <div class="s">${j.client ? esc(j.client) + ' · ' : ''}<span class="chip ${col}">${lab}</span>${j.timerStart ? ' <span class="chip amber">⏱ in corso</span>' : ''}</div></div>
    ${money}</button></div>`;
}
function flowItem(f) {
  return `<button class="item" data-a="openFlow" data-id="${f.kind}:${f.ref}">
    <div class="main"><div class="t">${esc(f.label)}</div><div class="s">${esc(fmtDate(f.date))}${f.sub ? ' · ' + esc(f.sub) : ''}</div></div>
    <div class="r num ${f.type === 'in' ? 'in' : 'out'}">${f.type === 'in' ? '+' : '−'}${eur(f.amount)}</div></button>`;
}
function matItem(m, showJob = true) {
  const j = m.jobId && getJob(m.jobId);
  return `<button class="item" data-a="editMat" data-id="${m.id}">
    <div class="main"><div class="t">${esc(m.name)}${m.brand ? ` <span class="muted">· ${esc(m.brand)}</span>` : ''}</div>
      <div class="s">${esc(fmtDate(m.date))} · ${numIn(num(m.qty)) || 0} ${esc(m.unit || 'pz')} × ${eur(m.unitCost)}${showJob && j ? ' · ' + esc(j.title) : ''}</div></div>
    <div class="r num">${eur(matTotal(m))}</div></button>`;
}
function timerBanner() {
  return db.jobs.filter(j => j.timerStart && j.id !== S.jobId).map(j =>
    `<button class="timerbar" data-a="openJob" data-id="${j.id}"><span class="pulse"></span><span style="flex:1">${esc(j.title)}</span><span data-timer="${j.id}">${fmtMin(jobMinutes(j))}</span></button>`).join('');
}
const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
};
function monthNav(label, prev, next, todayAct) {
  return `<div class="mnav"><button data-a="${prev}" aria-label="Precedente">${ICON.left}</button>
    <strong>${label}</strong>
    <div style="display:flex">${todayAct ? `<button class="today" data-a="${todayAct}">Oggi</button>` : ''}<button data-a="${next}" aria-label="Successivo">${ICON.right}</button></div></div>`;
}

/* ================= Viste ================= */
function viewAgenda() {
  const y = S.cy, m = S.cm, t = today();
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const byDay = {};
  db.jobs.forEach(j => { if (j.status !== 'annullato') (byDay[j.date] = byDay[j.date] || []).push(j); });
  let cells = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'].map(d => `<div class="wd">${d}</div>`).join('');
  for (let i = 0; i < off; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`, n = (byDay[k] || []).length;
    cells += `<button class="day ${k === S.day ? 'sel' : ''} ${k === t ? 'today' : ''}" data-a="pickDay" data-id="${k}">
      <span>${d}</span><i class="dots">${n ? '•'.repeat(Math.min(n, 3)) : ''}</i></button>`;
  }
  const dayJobs = db.jobs.filter(j => j.date === S.day).sort(byDateTime);
  const upcoming = db.jobs.filter(j => j.status === 'programmato' && j.date >= t && j.date !== S.day).sort(byDateTime).slice(0, 6);
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const installHint = isIOS && !navigator.standalone && !db.settings.hideInstall
    ? `<div class="hint"><b>Installa l'app:</b> in Safari tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>"Aggiungi alla schermata Home"</b>. <button class="link small" data-a="hideInstall" style="font-size:14px">Ok, nascondi</button></div>` : '';
  return {
    title: 'Agenda',
    html: `${installHint}
    <div class="card">${monthNav(`${MONTHS[m]} ${y}`, 'calPrev', 'calNext', 'calToday')}<div class="cal">${cells}</div></div>
    <div class="sec">${esc(fmtDateLong(S.day))}</div>
    <div class="list">${dayJobs.map(j => jobItem(j, false)).join('') || `<div class="empty">Nessun impegno.<br><button class="btn full" data-a="newJob">+ Aggiungi impegno</button></div>`}</div>
    ${upcoming.length ? `<div class="sec">Prossimi impegni</div><div class="list">${upcoming.map(j => jobItem(j)).join('')}</div>` : ''}`
  };
}

function jobsList() {
  const q = S.q.trim().toLowerCase();
  let list = db.jobs.slice();
  if (S.filter === 'programmati') list = list.filter(j => j.status === 'programmato');
  if (S.filter === 'completati') list = list.filter(j => j.status === 'completato');
  if (S.filter === 'incassare') list = list.filter(isUnpaid);
  if (S.filter === 'importanti') list = list.filter(j => j.important);
  if (q) list = list.filter(j => [j.title, j.client, j.address, j.notes, j.phone].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => byDateTime(b, a));
  if (!list.length) return `<div class="list"><div class="empty">${db.jobs.length ? 'Nessun lavoro trovato.' : 'Nessun lavoro ancora.<br>Tocca + per aggiungerne uno.'}</div></div>`;
  let html = '', cur = '';
  list.forEach(j => {
    const k = j.date.slice(0, 7);
    if (k !== cur) {
      if (cur) html += '</div>';
      const [y, m] = k.split('-');
      html += `<div class="sec">${MONTHS[+m - 1]} ${y}</div><div class="list">`; cur = k;
    }
    html += jobItem(j);
  });
  return html + '</div>';
}
function viewLavori() {
  const unpaid = db.jobs.filter(isUnpaid);
  const f = [['tutti', 'Tutti'], ['programmati', 'Da fare'], ['completati', 'Fatti'], ['incassare', `Da incassare${unpaid.length ? ' (' + unpaid.length + ')' : ''}`], ['importanti', '★ Importanti']];
  return {
    title: 'Lavori',
    html: `<input id="q" class="search" type="search" placeholder="Cerca cliente, lavoro, indirizzo…" value="${esc(S.q)}">
      <div class="seg">${f.map(([k, l]) => `<button class="${S.filter === k ? 'on' : ''}" data-a="filter" data-id="${k}">${l}</button>`).join('')}</div>
      <div id="list">${jobsList()}</div>`
  };
}

function viewJob(j) {
  const mats = jobMaterials(j.id).sort((a, b) => a.date.localeCompare(b.date));
  const mc = sum(mats.map(matTotal)), mins = jobMinutes(j), amount = num(j.amount);
  const margin = amount - mc, perH = mins > 0 ? margin / (mins / 60) : 0;
  const [lab, col] = STATUS[j.status] || STATUS.programmato;
  return {
    title: 'Lavoro',
    html: `<div class="card jh">
      <h2>${esc(j.title || 'Lavoro')}</h2>
      <div class="muted">${esc(fmtDateLong(j.date))}${j.time ? ' · ore ' + esc(j.time) : ''}</div>
      <div style="margin-top:6px">${j.important ? '<span class="chip amber">★ Importante</span> ' : ''}<span class="chip ${col}">${lab}</span> ${j.paid ? '<span class="chip green">Pagato</span>' : amount > 0 && j.status !== 'annullato' ? '<span class="chip amber">Da incassare</span>' : ''}</div>
      ${j.client ? `<div style="margin-top:10px;font-weight:600">${esc(j.client)}</div>` : ''}
      ${j.address ? `<div class="muted small">${esc(j.address)}</div>` : ''}
      <div class="actions">
        ${j.phone ? `<a class="btn" href="tel:${esc(j.phone.replace(/[^\d+]/g, ''))}">${ICON.phone} Chiama</a>` : ''}
        ${j.address ? `<button class="btn" data-a="mapChoice" data-id="${j.id}">${ICON.map} Mappa</button>` : ''}
        <button class="btn" data-a="editJob" data-id="${j.id}">${ICON.edit} Modifica</button>
        ${j.status === 'programmato' ? `<button class="btn green" data-a="completeJob" data-id="${j.id}">${ICON.check} Completato</button>` : ''}
      </div></div>

    <div class="card"><h3>Tempo impiegato</h3>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="big" data-timer="${j.id}">${fmtMin(mins)}</div>
        <button class="btn ${j.timerStart ? 'danger' : 'solid'}" data-a="timer" data-id="${j.id}">${j.timerStart ? ICON.stop + ' Ferma' : ICON.play + ' Avvia'}</button>
      </div>
      <div class="muted small" style="margin-top:6px">${j.timerStart ? 'Cronometro in corso…' : 'Avvia il cronometro quando inizi, oppure scrivi tu il tempo qui sotto.'}</div>
      <div class="row" style="margin-top:12px">
        <label style="margin:0">Ore<input id="tH" inputmode="numeric" placeholder="0" value="${Math.floor(Math.round(mins) / 60) || ''}"></label>
        <label style="margin:0">Minuti<input id="tM" inputmode="numeric" placeholder="0" value="${Math.round(mins) % 60 || ''}"></label></div>
      <div class="quick">
        <button class="btn" data-a="addTime" data-id="15">+15 min</button>
        <button class="btn" data-a="addTime" data-id="30">+30 min</button>
        <button class="btn" data-a="addTime" data-id="60">+1 h</button>
        <button class="btn danger" data-a="resetTime">Azzera</button></div></div>

    <div class="sec">Materiali usati</div>
    <div class="list">${mats.map(m => matItem(m, false)).join('') || '<div class="empty">Nessun materiale.</div>'}
      <button class="item" data-a="newMat" data-id="${j.id}" style="color:var(--accent);font-weight:600;justify-content:center">+ Aggiungi materiale</button></div>

    <div class="card"><h3>Conti del lavoro</h3>
      <div class="kv"><span>Importo al cliente</span><span>${eur(amount)}</span></div>
      <div class="kv"><span>Costo materiali</span><span class="out">−${eur(mc)}</span></div>
      <div class="kv"><span>Guadagno</span><span class="${margin >= 0 ? 'in' : 'out'}">${eur(margin)}</span></div>
      <div class="kv"><span>Guadagno all'ora</span><span>${mins > 0 ? eur(perH) + '/h' : '—'}</span></div>
      ${j.paid ? `<div class="kv"><span>Pagato il</span><span>${esc(fmtDate(j.paidDate || j.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${j.payMethod ? ' · ' + esc(j.payMethod) : ''}</span></div>` : ''}
      ${amount > 0 ? `<button class="btn full ${j.paid ? '' : 'green'}" data-a="togglePaid" data-id="${j.id}">${j.paid ? 'Segna come NON pagato' : ICON.check + ' Segna come pagato oggi'}</button>` : '<div class="muted small" style="margin-top:8px">Inserisci l\'importo in "Modifica".</div>'}
    </div>
    ${j.notes ? `<div class="card"><h3>Note</h3><div style="white-space:pre-wrap">${esc(j.notes)}</div></div>` : ''}`
  };
}

function viewSoldi() {
  const from = `${S.my}-${pad(S.mm + 1)}-01`, to = `${S.my}-${pad(S.mm + 1)}-31`;
  const f = flows().filter(x => x.date >= from && x.date <= to).sort((a, b) => b.date.localeCompare(a.date));
  const inn = sum(f.filter(x => x.type === 'in').map(x => x.amount)), out = sum(f.filter(x => x.type === 'out').map(x => x.amount));
  const unpaid = db.jobs.filter(isUnpaid).sort(byDateTime);
  return {
    title: 'Soldi',
    html: `${monthNav(`${MONTHS[S.mm]} ${S.my}`, 'mPrev', 'mNext', 'mToday')}
    <div class="grid3">
      <div class="stat"><div class="l">Entrate</div><div class="v in">${eur(inn)}</div></div>
      <div class="stat"><div class="l">Uscite</div><div class="v out">${eur(out)}</div></div>
      <div class="stat"><div class="l">Saldo</div><div class="v ${inn - out >= 0 ? '' : 'out'}">${eur(inn - out)}</div></div>
    </div>
    ${unpaid.length ? `<div class="sec">Da incassare · ${eur(sum(unpaid.map(j => num(j.amount))))}</div><div class="list">${unpaid.map(j => jobItem(j)).join('')}</div>` : ''}
    <div class="sec">Movimenti del mese</div>
    <div class="list">${f.map(flowItem).join('') || '<div class="empty">Nessun movimento in questo mese.<br>Tocca + per aggiungere un\'entrata o una spesa.</div>'}</div>
    <p class="muted small" style="margin:0 4px">Gli incassi dei lavori pagati e i materiali comprati compaiono qui da soli. Con + aggiungi le altre spese (gasolio, attrezzi, furgone…) o entrate.</p>`
  };
}

function matList() {
  const q = S.mq.trim().toLowerCase();
  let list = db.materials.slice();
  if (q) list = list.filter(m => [m.name, m.brand, m.supplier, m.notes, (getJob(m.jobId) || {}).title].join(' ').toLowerCase().includes(q));
  if (!list.length) return `<div class="list"><div class="empty">${db.materials.length ? 'Nessun materiale trovato.' : 'Nessun materiale ancora.<br>Aggiungili da un lavoro o con +.'}</div></div>`;
  if (S.matMode === 'group') {
    const g = {};
    list.forEach(m => {
      const k = (m.name || '').trim().toLowerCase() + '|' + (m.brand || '').trim().toLowerCase();
      (g[k] = g[k] || { name: m.name, brand: m.brand, unit: m.unit, items: [] }).items.push(m);
    });
    const rows = Object.values(g).map(x => {
      x.items.sort((a, b) => b.date.localeCompare(a.date));
      const prices = x.items.map(i => num(i.unitCost));
      return { ...x, qty: sum(x.items.map(i => num(i.qty))), tot: sum(x.items.map(matTotal)), last: prices[0], min: Math.min(...prices), max: Math.max(...prices) };
    }).sort((a, b) => b.tot - a.tot);
    return `<div class="list">${rows.map(r => `<button class="item" data-a="searchMat" data-id="${esc(r.name)}">
      <div class="main"><div class="t">${esc(r.name)}${r.brand ? ` <span class="muted">· ${esc(r.brand)}</span>` : ''}</div>
      <div class="s">${numIn(r.qty) || 0} ${esc(r.unit || 'pz')} in ${r.items.length} volt${r.items.length === 1 ? 'a' : 'e'} · ultimo ${eur(r.last)}${r.min !== r.max ? ` (min ${eur(r.min)} – max ${eur(r.max)})` : ''}</div></div>
      <div class="r num">${eur(r.tot)}</div></button>`).join('')}</div>`;
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  let html = '', cur = '';
  list.forEach(m => {
    const k = m.date.slice(0, 7);
    if (k !== cur) {
      if (cur) html += '</div>';
      const [y, mo] = k.split('-');
      const tot = sum(list.filter(x => x.date.startsWith(k)).map(matTotal));
      html += `<div class="sec">${MONTHS[+mo - 1]} ${y} · ${eur(tot)}</div><div class="list">`; cur = k;
    }
    html += matItem(m);
  });
  return html + '</div>';
}
function viewMateriali() {
  return {
    title: 'Materiali',
    html: `<input id="mq" class="search" type="search" placeholder="Cerca articolo, marca, fornitore…" value="${esc(S.mq)}">
    <div class="seg"><button class="${S.matMode === 'list' ? 'on' : ''}" data-a="matMode" data-id="list">Cronologia</button>
      <button class="${S.matMode === 'group' ? 'on' : ''}" data-a="matMode" data-id="group">Per articolo e prezzi</button></div>
    <div id="list">${matList()}</div>`
  };
}

function periodRange() {
  if (S.period === 'mese') return [`${S.py}-${pad(S.pm + 1)}-01`, `${S.py}-${pad(S.pm + 1)}-31`, `${MONTHS[S.pm]} ${S.py}`];
  if (S.period === 'anno') return [`${S.py}-01-01`, `${S.py}-12-31`, `Anno ${S.py}`];
  return ['0000-00-00', '9999-12-31', 'Da sempre'];
}
function viewRiepilogo() {
  const [from, to, label] = periodRange();
  const s = stats(from, to);
  // Classifiche
  const cl = {};
  s.jobsR.forEach(j => { const k = (j.client || 'Senza nome').trim(); cl[k] = (cl[k] || 0) + num(j.amount); });
  const topClients = Object.entries(cl).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mt = {};
  db.materials.filter(m => m.date >= from && m.date <= to).forEach(m => { const k = m.name + (m.brand ? ' · ' + m.brand : ''); mt[k] = (mt[k] || 0) + matTotal(m); });
  const topMats = Object.entries(mt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let yearTable = '';
  if (S.period === 'anno') {
    const rows = MONTHS.map((_, i) => { const st = stats(`${S.py}-${pad(i + 1)}-01`, `${S.py}-${pad(i + 1)}-31`); return [i, st]; });
    yearTable = `<div class="card"><h3>Mese per mese</h3><table><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Utile</th><th>Ore</th></tr>
      ${rows.map(([i, st]) => `<tr><td>${MSHORT[i]}</td><td class="in">${st.inTot ? eur(st.inTot) : '–'}</td><td class="out">${st.outTot ? eur(st.outTot) : '–'}</td><td>${st.inTot || st.outTot ? eur(st.net) : '–'}</td><td>${st.minutes ? Math.round(st.minutes / 6) / 10 : '–'}</td></tr>`).join('')}
    </table></div>`;
  }
  const lb = db.settings.lastBackup;
  const daysSince = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
  const nav = S.period === 'tutto' ? `<div class="mnav"><strong>${label}</strong></div>` : monthNav(label, 'pPrev', 'pNext', 'pToday');
  return {
    title: 'Riepilogo',
    html: `<div class="seg">${[['mese', 'Mese'], ['anno', 'Anno'], ['tutto', 'Tutto']].map(([k, l]) => `<button class="${S.period === k ? 'on' : ''}" data-a="period" data-id="${k}">${l}</button>`).join('')}</div>
    ${nav}
    <div class="grid2">
      <div class="stat wide"><div class="l">Utile (entrate − uscite)</div><div class="v ${s.net >= 0 ? 'in' : 'out'}" style="font-size:30px">${eur(s.net)}</div></div>
      <div class="stat"><div class="l">Entrate</div><div class="v in">${eur(s.inTot)}</div></div>
      <div class="stat"><div class="l">Uscite</div><div class="v out">${eur(s.outTot)}</div></div>
      <div class="stat"><div class="l">Ore lavorate</div><div class="v">${fmtMin(s.minutes)}</div></div>
      <div class="stat"><div class="l">Da incassare</div><div class="v" style="color:var(--amber)">${eur(s.unpaid)}</div></div>
    </div>
    <div class="card"><h3>Dettaglio</h3>
      <div class="kv"><span>Incassi da lavori</span><span class="in">${eur(s.paidIn)}</span></div>
      <div class="kv"><span>Altre entrate</span><span class="in">${eur(s.otherIn)}</span></div>
      <div class="kv"><span>Spese materiali</span><span class="out">${eur(s.matOut)}</span></div>
      <div class="kv"><span>Altre spese</span><span class="out">${eur(s.otherOut)}</span></div>
      <div class="kv"><span>Lavori (completati)</span><span>${s.count} (${s.done})</span></div>
      <div class="kv"><span>Fatturato medio all'ora</span><span>${s.minutes ? eur(s.perHour) + '/h' : '—'}</span></div>
    </div>
    ${yearTable}
    ${topClients.length ? `<div class="card"><h3>Clienti principali</h3>${topClients.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${eur(v)}</span></div>`).join('')}</div>` : ''}
    ${topMats.length ? `<div class="card"><h3>Materiali che costano di più</h3>${topMats.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${eur(v)}</span></div>`).join('')}</div>` : ''}

    <div class="sec">Backup e dati</div>
    <div class="card">
      <div class="small ${daysSince === null || daysSince > 14 ? 'out' : 'muted'}">${daysSince === null ? 'Non hai ancora fatto un backup.' : daysSince === 0 ? 'Ultimo backup: oggi.' : `Ultimo backup: ${daysSince} giorn${daysSince === 1 ? 'o' : 'i'} fa.`}
        I dati stanno solo su questo telefono: fai un backup ogni tanto (salvalo in File/iCloud o mandalo via WhatsApp/email).</div>
      <button class="btn solid full" data-a="exportJson">Salva backup</button>
      <button class="btn full" data-a="importJson">Ripristina da backup</button>
      <button class="btn full" data-a="exportCsv">Esporta movimenti per Excel (CSV)</button>
      <button class="btn danger full" data-a="wipe">Cancella tutti i dati</button>
    </div>
    <p class="muted small" style="text-align:center">Agenda Idraulico · ${db.jobs.length} lavori · ${db.materials.length} materiali · ${db.moves.length} movimenti</p>`
  };
}
const VIEWS = { agenda: viewAgenda, lavori: viewLavori, soldi: viewSoldi, materiali: viewMateriali, riepilogo: viewRiepilogo };

function render() {
  openSwipe = null; drag = null;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.id === S.tab));
  let v;
  if (S.jobId) {
    const j = getJob(S.jobId);
    if (!j) { S.jobId = null; return render(); }
    v = viewJob(j);
  } else v = VIEWS[S.tab]();
  $('#title').textContent = v.title;
  $('#back').hidden = !S.jobId;
  const warn = (saveFailed || !storageWorks())
    ? `<div class="hint" style="background:var(--red-soft)"><b style="color:var(--red)">I dati NON vengono salvati.</b> Probabilmente stai usando una finestra privata di Safari. Apri il link in una finestra normale di Safari, poi Condividi → "Aggiungi alla schermata Home" e usa sempre l'icona.</div>` : '';
  $('#main').innerHTML = warn + timerBanner() + v.html;
  $('#fab').hidden = !!S.jobId || S.tab === 'riepilogo';
}

/* ================= Moduli (fogli) ================= */
/* Richiesta di conferma ben visibile (al posto della finestrella di sistema) */
function askConfirm(title, text, okLabel = 'Elimina', noLabel = 'Annulla, non eliminare') {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'ask-wrap';
    el.innerHTML = `<div class="ask" role="alertdialog" aria-label="${esc(title)}">
      <div class="ask-icon">!</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <button type="button" class="btn danger full" data-ok>${esc(okLabel)}</button>
      <button type="button" class="btn full" data-no>${esc(noLabel)}</button></div>`;
    document.body.appendChild(el);
    const done = v => { el.remove(); resolve(v); };
    el.querySelector('[data-ok]').onclick = () => done(true);
    el.querySelector('[data-no]').onclick = () => done(false);
    el.addEventListener('click', e => { if (e.target === el) done(false); });
  });
}
/* Moduli con salvataggio automatico: ogni modifica viene salvata subito, senza tasto "Salva". */
function readForm(form) {
  const v = {};
  [...form.elements].forEach(x => {
    if (!x.name) return;
    if (x.type === 'checkbox') v[x.name] = x.checked;
    else if (x.type === 'radio') { if (x.checked) v[x.name] = x.value; }
    else v[x.name] = x.value;
  });
  return v;
}
function openSheet(title, body, cfg) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-head"><span class="saved" data-saved></span><strong>${esc(title)}</strong>
      <button type="button" class="link bold" data-x>Fine</button></div>
    <form class="sheet-body" autocomplete="off" onsubmit="return false">${body}
      <p class="muted small" style="text-align:center;margin:4px 0 0">Le modifiche si salvano da sole.</p>
      <button type="button" class="btn solid full" data-x>Fine</button>
      <button type="button" class="btn danger full" data-del>Elimina</button></form></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const form = el.querySelector('form');
  const lbl = el.querySelector('[data-saved]');
  let inserted = !cfg.isNew;
  const sync = () => {
    cfg.apply(readForm(form));
    const empty = cfg.empty();
    if (!inserted && !empty) { cfg.add(); inserted = true; }
    else if (inserted && cfg.isNew && empty) { cfg.remove(); inserted = false; }
    if (inserted || cfg.isNew) save();
    lbl.textContent = inserted ? 'Salvato ✓' : '';
  };
  const close = () => {
    sync();
    el.remove(); document.body.style.overflow = '';
    if (inserted && cfg.after) cfg.after();
    render();
  };
  el.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.querySelector('[data-del]').onclick = async () => {
    if (!inserted) { el.remove(); document.body.style.overflow = ''; render(); return; }
    if (await askConfirm(cfg.delTitle || 'Sei sicuro di voler eliminare?', (typeof cfg.delMsg === 'function' ? cfg.delMsg() : cfg.delMsg) || 'Non si potrà più recuperare.')) {
      cfg.remove(); save();
      el.remove(); document.body.style.overflow = ''; render(); toast('Eliminato');
    }
  };
  if (cfg.init) cfg.init(form);
  // ascoltati dopo init: così i completamenti automatici (cliente, articolo) vengono salvati anche loro
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  return form;
}
const uniq = arr => [...new Set(arr.map(x => (x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
const datalist = (id, arr) => `<datalist id="${id}">${uniq(arr).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
const opt = (v, cur, l = v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;

function jobForm(j, presetDate) {
  const isNew = !j;
  j = j || { id: uid(), created: Date.now(), date: presetDate || today(), time: '', status: 'programmato', minutes: 0, amount: 0, paid: false };
  const mins = Math.round(j.minutes || 0);
  const body = `
    <label>Lavoro da fare<input name="title" placeholder="Es. Perdita sotto lavello" value="${esc(j.title)}"></label>
    <label>Cliente<input name="client" list="dlC" placeholder="Nome e cognome" value="${esc(j.client)}"></label>${datalist('dlC', db.jobs.map(x => x.client))}
    <div class="row"><label>Telefono<input name="phone" type="tel" value="${esc(j.phone)}"></label></div>
    <label>Indirizzo<input name="address" placeholder="Via, numero, città" value="${esc(j.address)}"></label>
    <div class="row"><label>Data<input type="date" name="date" value="${esc(j.date)}"></label>
      <label>Ora<input type="time" name="time" value="${esc(j.time)}"></label></div>
    <label>Stato<select name="status">${opt('programmato', j.status, 'Programmato')}${opt('completato', j.status, 'Completato')}${opt('annullato', j.status, 'Annullato')}</select></label>
    <div class="row"><label>Ore impiegate<input name="h" inputmode="numeric" placeholder="0" value="${Math.floor(mins / 60) || ''}"></label>
      <label>Minuti<input name="mi" inputmode="numeric" placeholder="0" value="${mins % 60 || ''}"></label></div>
    <label>Importo al cliente (€)<input name="amount" inputmode="decimal" placeholder="0,00" value="${numIn(j.amount)}"></label>
    <label class="check"><input type="checkbox" name="paid" ${j.paid ? 'checked' : ''}> Già pagato</label><div style="height:12px"></div>
    <div class="row"><label>Data pagamento<input type="date" name="paidDate" value="${esc(j.paidDate || '')}"></label>
      <label>Pagamento<select name="payMethod">${opt('', j.payMethod || '', '—')}${['Contanti', 'Bonifico', 'POS / Carta', 'Assegno', 'Altro'].map(x => opt(x, j.payMethod)).join('')}</select></label></div>
    <label>Note<textarea name="notes" placeholder="Dettagli, codici, misure…">${esc(j.notes)}</textarea></label>`;
  return openSheet(isNew ? 'Nuovo lavoro' : 'Modifica lavoro', body, {
    isNew,
    apply: d => Object.assign(j, {
      title: d.title.trim(), client: d.client.trim(), phone: d.phone.trim(), address: d.address.trim(),
      date: d.date || j.date || today(), time: d.time, status: d.status,
      minutes: Math.max(0, num(d.h) * 60 + num(d.mi)),
      amount: num(d.amount), paid: !!d.paid, paidDate: d.paid ? (d.paidDate || today()) : '', payMethod: d.payMethod, notes: d.notes.trim()
    }),
    empty: () => !(j.title || j.client || j.phone || j.address || j.notes || j.amount || j.minutes),
    add: () => db.jobs.push(j),
    remove: () => { db.materials = db.materials.filter(m => m.jobId !== j.id); db.jobs = db.jobs.filter(x => x !== j); if (S.jobId === j.id) S.jobId = null; },
    after: () => { S.day = j.date; const dd = parseISO(j.date); S.cy = dd.getFullYear(); S.cm = dd.getMonth(); },
    delTitle: 'Eliminare questo lavoro?',
    delMsg: () => `"${j.title || 'Lavoro'}"${j.client ? ' di ' + j.client : ''} verrà eliminato insieme ai materiali collegati. Non si potrà più recuperare.`,
    init: f => {
      // Se scegli un cliente già noto, compila telefono e indirizzo
      f.client.addEventListener('change', () => {
        const prev = db.jobs.filter(x => x !== j && x.client && x.client.trim().toLowerCase() === f.client.value.trim().toLowerCase()).sort(byDateTime).pop();
        if (prev) { if (!f.phone.value) f.phone.value = prev.phone || ''; if (!f.address.value) f.address.value = prev.address || ''; }
      });
      f.paid.addEventListener('change', () => { if (f.paid.checked && !f.paidDate.value) f.paidDate.value = today(); });
    }
  });
}

function matForm(m, jobId) {
  const isNew = !m;
  const job = jobId && getJob(jobId);
  m = m || { id: uid(), date: job ? job.date : today(), qty: 1, unit: 'pz', jobId: jobId || '' };
  const jobs = db.jobs.filter(x => x.status !== 'annullato').sort((a, b) => byDateTime(b, a)).slice(0, 150);
  if (m.jobId && !jobs.find(x => x.id === m.jobId) && getJob(m.jobId)) jobs.unshift(getJob(m.jobId));
  const units = ['pz', 'm', 'kg', 'l', 'conf', 'rotolo', 'set'];
  const body = `
    <label>Articolo<input name="name" list="dlN" placeholder="Es. Raccordo a T 1/2&quot;" value="${esc(m.name)}"></label>${datalist('dlN', db.materials.map(x => x.name))}
    <label>Marca<input name="brand" list="dlB" placeholder="Es. Grohe, Caleffi…" value="${esc(m.brand)}"></label>${datalist('dlB', db.materials.map(x => x.brand))}
    <div class="row"><label>Quantità<input name="qty" inputmode="decimal" value="${numIn(m.qty) || '1'}"></label>
      <label>Unità<select name="unit">${units.map(u => opt(u, m.unit)).join('')}</select></label></div>
    <label>Prezzo per unità (€)<input name="unitCost" inputmode="decimal" placeholder="0,00" value="${numIn(m.unitCost)}"></label>
    <div class="totbox"><span>Totale</span><span id="mTot">${eur(matTotal(m))}</span></div>
    <label>Data<input type="date" name="date" value="${esc(m.date)}"></label>
    <label>Fornitore / negozio<input name="supplier" list="dlS" value="${esc(m.supplier)}"></label>${datalist('dlS', db.materials.map(x => x.supplier))}
    <label>Per il lavoro<select name="jobId">${opt('', m.jobId || '', '— Nessuno (scorta / magazzino) —')}${jobs.map(x => opt(x.id, m.jobId, `${fmtDate(x.date, { day: 'numeric', month: 'short' })} · ${x.title || 'Lavoro'}${x.client ? ' · ' + x.client : ''}`)).join('')}</select></label>
    <label>Note<textarea name="notes">${esc(m.notes)}</textarea></label>`;
  return openSheet(isNew ? 'Nuovo materiale' : 'Modifica materiale', body, {
    isNew,
    apply: d => Object.assign(m, { name: d.name.trim(), brand: d.brand.trim(), qty: num(d.qty) || 1, unit: d.unit, unitCost: num(d.unitCost), date: d.date || m.date || today(), supplier: d.supplier.trim(), jobId: d.jobId, notes: d.notes.trim() }),
    empty: () => !(m.name || m.brand || m.unitCost || m.supplier || m.notes),
    add: () => db.materials.push(m),
    remove: () => { db.materials = db.materials.filter(x => x !== m); },
    delTitle: 'Eliminare questo materiale?',
    delMsg: () => `"${m.name || 'Materiale'}"${m.brand ? ' (' + m.brand + ')' : ''} verrà eliminato. Non si potrà più recuperare.`,
    init: f => {
      const upd = () => { $('#mTot').textContent = eur(num(f.qty.value) * num(f.unitCost.value)); };
      f.qty.addEventListener('input', upd); f.unitCost.addEventListener('input', upd);
      // Se l'articolo è già stato comprato, propone marca, unità e ultimo prezzo
      f.name.addEventListener('change', () => {
        const prev = db.materials.filter(x => x !== m && (x.name || '').trim().toLowerCase() === f.name.value.trim().toLowerCase()).sort((a, b) => a.date.localeCompare(b.date)).pop();
        if (prev) {
          if (!f.brand.value) f.brand.value = prev.brand || '';
          if (!f.unitCost.value) f.unitCost.value = numIn(prev.unitCost);
          if (!f.supplier.value) f.supplier.value = prev.supplier || '';
          f.unit.value = prev.unit || 'pz'; upd();
        }
      });
    }
  });
}

function moveForm(v) {
  const isNew = !v;
  v = v || { id: uid(), type: 'out', date: today() };
  const cats = ['Carburante', 'Furgone / manutenzione', 'Attrezzatura', 'Assicurazione', 'Tasse e contributi', 'Commercialista', 'Telefono', 'Pranzo / trasferta', 'Altro', 'Lavoro extra', 'Rimborso'];
  const body = `
    <div class="radio"><label><input type="radio" name="type" value="in" ${v.type === 'in' ? 'checked' : ''}><span class="r-in">+ Entrata</span></label>
      <label><input type="radio" name="type" value="out" ${v.type !== 'in' ? 'checked' : ''}><span class="r-out">− Uscita</span></label></div>
    <label>Importo (€)<input name="amount" inputmode="decimal" placeholder="0,00" value="${numIn(v.amount)}"></label>
    <label>Categoria<input name="category" list="dlCat" placeholder="Es. Carburante" value="${esc(v.category)}"></label>${datalist('dlCat', cats.concat(db.moves.map(x => x.category)))}
    <label>Descrizione<input name="desc" placeholder="Es. Pieno furgone" value="${esc(v.desc)}"></label>
    <label>Data<input type="date" name="date" value="${esc(v.date)}"></label>`;
  return openSheet(isNew ? 'Nuovo movimento' : 'Modifica movimento', body, {
    isNew,
    apply: d => Object.assign(v, { type: d.type || 'out', amount: num(d.amount), category: d.category.trim(), desc: d.desc.trim(), date: d.date || v.date || today() }),
    empty: () => !(v.amount || v.category || v.desc),
    add: () => db.moves.push(v),
    remove: () => { db.moves = db.moves.filter(x => x !== v); },
    delTitle: 'Eliminare questo movimento?',
    delMsg: () => `${v.type === 'in' ? 'Entrata' : 'Uscita'} di ${eur(v.amount)}${v.desc ? ' – ' + v.desc : ''} verrà eliminata. Non si potrà più recuperare.`,
    after: () => { const dd = parseISO(v.date); S.my = dd.getFullYear(); S.mm = dd.getMonth(); }
  });
}

/* ================= Backup ================= */
async function shareFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}
const stamp = () => today();
function csvCell(v) { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

/* ================= Azioni ================= */
const shiftMonth = (y, m, d) => { const t = new Date(y, m + d, 1); return [t.getFullYear(), t.getMonth()]; };
const A = {
  tab: id => { S.tab = id; S.jobId = null; render(); scrollTo(0, 0); },
  back: () => { S.jobId = null; render(); },
  openJob: id => { S.jobId = id; render(); scrollTo(0, 0); },
  fab: () => {
    if (S.tab === 'agenda' || S.tab === 'lavori') jobForm(null, S.tab === 'agenda' ? S.day : today());
    else if (S.tab === 'soldi') moveForm();
    else if (S.tab === 'materiali') matForm();
  },
  newJob: () => jobForm(null, S.day),
  editJob: id => jobForm(getJob(id)),
  completeJob: id => { const j = getJob(id); j.status = 'completato'; if (j.timerStart) A.timer(id, true); save(); render(); toast('Lavoro completato'); },
  timer: (id, silent) => {
    const j = getJob(id);
    if (j.timerStart) { j.minutes = (j.minutes || 0) + (Date.now() - j.timerStart) / 60000; j.timerStart = null; if (silent !== true) toast('Tempo salvato: ' + fmtMin(j.minutes)); }
    else j.timerStart = Date.now();
    save(); render();
  },
  togglePaid: id => {
    const j = getJob(id); j.paid = !j.paid;
    j.paidDate = j.paid ? today() : '';
    save(); render(); if (j.paid) toast('Segnato come pagato');
  },
  newMat: id => matForm(null, id),
  editMat: id => matForm(getMat(id)),
  searchMat: name => { S.mq = name; S.matMode = 'list'; render(); },
  openFlow: id => {
    const [k, ref] = id.split(':');
    if (k === 'job') A.openJob(ref); else if (k === 'mat') matForm(getMat(ref)); else moveForm(getMove(ref));
  },
  pickDay: id => { S.day = id; render(); },
  calPrev: () => { [S.cy, S.cm] = shiftMonth(S.cy, S.cm, -1); render(); },
  calNext: () => { [S.cy, S.cm] = shiftMonth(S.cy, S.cm, 1); render(); },
  calToday: () => { const n = new Date(); S.cy = n.getFullYear(); S.cm = n.getMonth(); S.day = today(); render(); },
  mPrev: () => { [S.my, S.mm] = shiftMonth(S.my, S.mm, -1); render(); },
  mNext: () => { [S.my, S.mm] = shiftMonth(S.my, S.mm, 1); render(); },
  mToday: () => { const n = new Date(); S.my = n.getFullYear(); S.mm = n.getMonth(); render(); },
  pPrev: () => { if (S.period === 'anno') S.py--; else[S.py, S.pm] = shiftMonth(S.py, S.pm, -1); render(); },
  pNext: () => { if (S.period === 'anno') S.py++; else[S.py, S.pm] = shiftMonth(S.py, S.pm, 1); render(); },
  pToday: () => { const n = new Date(); S.py = n.getFullYear(); S.pm = n.getMonth(); render(); },
  period: id => { S.period = id; render(); },
  filter: id => { S.filter = id; render(); },
  matMode: id => { S.matMode = id; render(); },
  mapChoice: id => {
    const j = getJob(id); if (!j || !j.address) return;
    const a = encodeURIComponent(j.address);
    const el = document.createElement('div');
    el.className = 'ask-wrap';
    el.innerHTML = `<div class="ask" role="dialog" aria-label="Apri indirizzo">
      <h2>Come vuoi arrivarci?</h2><p>${esc(j.address)}</p>
      <a class="btn solid full" href="https://www.google.com/maps/dir/?api=1&destination=${a}" target="_blank" rel="noopener">Google Maps</a>
      <a class="btn full" href="https://maps.apple.com/?daddr=${a}" target="_blank" rel="noopener">Mappe di Apple</a>
      <a class="btn full" href="https://waze.com/ul?q=${a}&navigate=yes" target="_blank" rel="noopener">Waze</a>
      <button type="button" class="btn full" data-no style="background:var(--line);color:var(--text)">Annulla</button></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('a,[data-no]')) setTimeout(() => el.remove(), 50); });
  },
  addTime: n => {
    const j = getJob(S.jobId); if (!j) return;
    j.minutes = jobMinutes(j) + +n;
    if (j.timerStart) j.timerStart = Date.now();
    save(); render(); toast('Aggiunti ' + fmtMin(+n) + ' · totale ' + fmtMin(jobMinutes(j)));
  },
  resetTime: async () => {
    const j = getJob(S.jobId); if (!j) return;
    if (!(await askConfirm('Azzerare il tempo?', `Il tempo di questo lavoro (${fmtMin(jobMinutes(j))}) tornerà a zero.`, 'Azzera', 'Annulla'))) return;
    j.minutes = 0; j.timerStart = null; save(); render();
  },
  toggleImp: id => {
    const j = getJob(id); if (!j) return;
    j.important = !j.important; save(); render();
    toast(j.important ? '★ Segnato come importante' : 'Tolto da importanti');
  },
  delJob: async id => {
    const j = getJob(id); if (!j) return;
    closeSwipe();
    if (!(await askConfirm('Eliminare questo lavoro?', `"${j.title || 'Lavoro'}"${j.client ? ' di ' + j.client : ''} verrà eliminato insieme ai materiali collegati. Non si potrà più recuperare.`))) return;
    db.materials = db.materials.filter(m => m.jobId !== id); db.jobs = db.jobs.filter(x => x !== j);
    save(); render(); toast('Lavoro eliminato');
  },
  hideInstall: () => { db.settings.hideInstall = true; save(); render(); },
  exportJson: async () => {
    const ok = await shareFile(`backup-idraulico-${stamp()}.json`, JSON.stringify(db, null, 1), 'application/json');
    if (ok) { db.settings.lastBackup = Date.now(); save(); render(); }
  },
  importJson: () => $('#importFile').click(),
  exportCsv: () => {
    const rows = [['Data', 'Tipo', 'Descrizione', 'Dettaglio', 'Importo']];
    flows().sort((a, b) => a.date.localeCompare(b.date)).forEach(f =>
      rows.push([f.date, f.type === 'in' ? 'Entrata' : 'Uscita', f.label, f.sub, (f.type === 'in' ? '' : '-') + f.amount.toFixed(2).replace('.', ',')]));
    shareFile(`movimenti-${stamp()}.csv`, '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
  },
  wipe: async () => {
    if (!(await askConfirm('Cancellare TUTTI i dati?', 'Verranno eliminati tutti i lavori, i materiali e i movimenti. Fai prima un backup!', 'Cancella tutto'))) return;
    if (prompt('Per confermare scrivi CANCELLA') !== 'CANCELLA') return;
    db = normalize(); save(); render(); toast('Dati cancellati');
  }
};

document.addEventListener('click', e => {
  if (Date.now() < swipeBlockUntil && !e.target.closest('.sw-act')) { e.preventDefault(); e.stopPropagation(); return; }
  // Con una riga aperta, un tocco altrove la richiude e basta
  if (openSwipe && !e.target.closest('.sw-act')) { e.preventDefault(); closeSwipe(); return; }
  const t = e.target.closest('[data-a]');
  if (!t || t.closest('.sheet-wrap')) return;
  const fn = A[t.dataset.a];
  if (fn) { e.preventDefault(); fn(t.dataset.id, t); }
});
/* ===== Scorrimento delle righe dei lavori (come su iPhone) =====
   verso sinistra → Elimina, verso destra → Importante. Poi si tocca il pulsante comparso. */
const SW = 92;
let openSwipe = null, swipeBlockUntil = 0, drag = null;
function setX(front, x, anim) { front.style.transition = anim ? 'transform .22s ease' : 'none'; front.style.transform = x ? `translateX(${x}px)` : ''; }
function closeSwipe() { if (openSwipe) { setX(openSwipe, 0, true); openSwipe.parentElement.classList.remove('open-l', 'open-r'); openSwipe = null; } }
document.addEventListener('pointerdown', e => {
  const front = e.target.closest('.sw-front');
  if (!front || e.button > 0) return;
  if (openSwipe && openSwipe !== front) closeSwipe();
  const start = openSwipe === front ? (front.parentElement.classList.contains('open-l') ? SW : -SW) : 0;
  drag = { front, x0: e.clientX, y0: e.clientY, start, dx: 0, active: false, id: e.pointerId };
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // sta scorrendo la pagina
    if (Math.abs(dx) < 10) return;
    drag.active = true;
  }
  let x = drag.start + dx;
  if (Math.abs(x) > SW) x = Math.sign(x) * (SW + (Math.abs(x) - SW) * 0.3); // un po' di resistenza
  drag.dx = x;
  const row = drag.front.parentElement;
  row.classList.toggle('open-l', x > 0); row.classList.toggle('open-r', x < 0);
  setX(drag.front, x, false);
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag; drag = null;
  if (!d.active) return;
  swipeBlockUntil = Date.now() + 350;
  const row = d.front.parentElement;
  if (d.dx > SW / 2) { setX(d.front, SW, true); row.classList.add('open-l'); row.classList.remove('open-r'); openSwipe = d.front; }
  else if (d.dx < -SW / 2) { setX(d.front, -SW, true); row.classList.add('open-r'); row.classList.remove('open-l'); openSwipe = d.front; }
  else { setX(d.front, 0, true); row.classList.remove('open-l', 'open-r'); if (openSwipe === d.front) openSwipe = null; }
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('scroll', () => closeSwipe(), { passive: true });

// Aggiorna i conti quando ha finito di scrivere il tempo (non mentre passa da Ore a Minuti)
document.addEventListener('change', e => {
  if (e.target.id === 'tH' || e.target.id === 'tM')
    setTimeout(() => { const a = document.activeElement; if (!a || (a.id !== 'tH' && a.id !== 'tM')) render(); }, 150);
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { S.q = e.target.value; $('#list').innerHTML = jobsList(); }
  if (e.target.id === 'mq') { S.mq = e.target.value; $('#list').innerHTML = matList(); }
  if ((e.target.id === 'tH' || e.target.id === 'tM') && S.jobId) {
    // Tempo scritto a mano: diventa il totale (se il cronometro gira, riparte da qui)
    const j = getJob(S.jobId); if (!j) return;
    j.minutes = Math.max(0, num($('#tH').value) * 60 + num($('#tM').value));
    if (j.timerStart) j.timerStart = Date.now();
    save();
    document.querySelectorAll(`[data-timer="${j.id}"]`).forEach(el => { el.textContent = fmtMin(jobMinutes(j)); });
  }
});
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.jobs)) throw new Error('formato');
    if (!confirm(`Ripristinare il backup? (${d.jobs.length} lavori, ${(d.materials || []).length} materiali). I dati attuali verranno sostituiti.`)) return;
    db = normalize(d); save(); render(); toast('Backup ripristinato');
  } catch (err) { alert('File non valido: scegli un file di backup creato da questa app.'); }
});
// Aggiorna i cronometri a schermo
setInterval(() => {
  document.querySelectorAll('[data-timer]').forEach(el => { const j = getJob(el.dataset.timer); if (j) el.textContent = fmtMin(jobMinutes(j)); });
}, 10000);
// Se l'app torna in primo piano in un altro giorno, aggiorna
/* Cambio di giorno: se l'app è rimasta aperta (anche in sottofondo) oltre la mezzanotte,
   sposta su "oggi" il giorno evidenziato e i mesi mostrati che erano su quello corrente. */
let lastToday = today();
function checkNewDay() {
  const t = today();
  if (t === lastToday) return false;
  const old = parseISO(lastToday), n = new Date();
  if (S.day === lastToday) S.day = t;
  if (S.cy === old.getFullYear() && S.cm === old.getMonth()) { S.cy = n.getFullYear(); S.cm = n.getMonth(); }
  if (S.my === old.getFullYear() && S.mm === old.getMonth()) { S.my = n.getFullYear(); S.mm = n.getMonth(); }
  if (S.py === old.getFullYear() && (S.period === 'anno' || S.pm === old.getMonth())) { S.py = n.getFullYear(); if (S.period !== 'anno') S.pm = n.getMonth(); }
  lastToday = t;
  return true;
}
function refreshIfNeeded(force) {
  if (document.hidden || document.querySelector('.sheet-wrap, .ask-wrap')) return;
  if (checkNewDay() || force) render();
}
document.addEventListener('visibilitychange', () => refreshIfNeeded(true));
window.addEventListener('focus', () => refreshIfNeeded(false));
window.addEventListener('pageshow', () => refreshIfNeeded(false));
setInterval(() => refreshIfNeeded(false), 60000);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
render();
try { localStorage.removeItem('idraulico.draft.v1'); } catch (e) {}
recover();
