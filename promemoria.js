'use strict';
/* =====================================================================
   PROMEMORIA, RECAP e STATISTICHE
   - Su iPhone un'app aggiunta da Safari non può programmare notifiche ad app chiusa:
     per questo gli impegni si aggiungono al Calendario dell'iPhone con i promemoria scelti
     (il Calendario avvisa sempre, anche senza internet). In più l'app mostra i promemoria
     al suo interno e, se permesso, una notifica mentre è aperta.
   ===================================================================== */
const REM_OPTS = [
  [0, "All'ora dell'impegno"], [15, '15 minuti prima'], [30, '30 minuti prima'], [60, '1 ora prima'], [120, '2 ore prima'],
  [1440, 'Il giorno prima'], [2880, '2 giorni prima'], [10080, '1 settimana prima'], [20160, '2 settimane prima'], [43200, '1 mese prima']
];
const NOTIF_DEFAULTS = { defaults: [1440, 60], weekRecap: true, weekDay: 0, weekTime: '19:00', monthRecap: true, monthTime: '19:00', seen: {}, shown: {} };
function notifS() {
  const n = db.settings.notif || (db.settings.notif = {});
  for (const k in NOTIF_DEFAULTS) if (n[k] === undefined) n[k] = JSON.parse(JSON.stringify(NOTIF_DEFAULTS[k]));
  return n;
}
const WEEKDAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

/** Testo leggibile per "X minuti prima" (anche valori personalizzati) */
function remLabel(m) {
  const o = REM_OPTS.find(x => x[0] === m); if (o) return o[1];
  if (m % 10080 === 0) return `${m / 10080} settimane prima`;
  if (m % 1440 === 0) return `${m / 1440} giorni prima`;
  if (m % 60 === 0) return `${m / 60} ore prima`;
  return `${m} minuti prima`;
}
const jobRems = j => Array.isArray(j.reminders) ? j.reminders : notifS().defaults;
/** Data/ora dell'impegno (senza ora: si considera alle 8:00) */
function jobStart(j) { const [y, m, d] = j.date.split('-').map(Number); const [h, mi] = (j.time || '08:00').split(':').map(Number); return new Date(y, m - 1, d, h, mi); }

/* ---------- Scelta dei promemoria nel modulo del lavoro ---------- */
function remChips(j) {
  const sel = jobRems(j);
  const all = [...new Set(REM_OPTS.map(o => o[0]).concat(sel))].sort((a, b) => a - b);
  return all.map(m => `<label class="chipbox"><input type="checkbox" name="rem_${m}" ${sel.includes(m) ? 'checked' : ''}><span>${esc(remLabel(m))}</span></label>`).join('');
}
function remField(j) {
  return `<div class="sec" style="margin:18px 0 8px">Promemoria</div>
    <div class="chips" id="remChips">${remChips(j)}</div>
    <div class="row" style="align-items:flex-end;margin-top:8px">
      <label style="margin:0">Altro: quanto prima<input id="remN" inputmode="numeric" placeholder="es. 3"></label>
      <label style="margin:0"><select id="remU"><option value="1440">giorni</option><option value="60">ore</option><option value="1">minuti</option><option value="10080">settimane</option></select></label>
      <button type="button" class="btn" id="remAdd" style="flex:0 0 auto;min-height:46px">Aggiungi</button></div>
    <p class="muted small" style="margin:8px 0 12px">Per ricevere gli avvisi anche ad app chiusa, dopo aver salvato tocca <b>"Aggiungi al Calendario"</b> nella scheda del lavoro.</p>`;
}
function readRems(d) { return Object.keys(d).filter(k => /^rem_\d+$/.test(k) && d[k]).map(k => +k.slice(4)).sort((a, b) => a - b); }
function initRemField(f, j) {
  const add = f.querySelector('#remAdd'); if (!add) return;
  add.addEventListener('click', () => {
    const n = Math.round(num(f.querySelector('#remN').value)); if (n <= 0) return;
    const m = n * +f.querySelector('#remU').value;
    const cur = readRems(readForm(f));
    if (!cur.includes(m)) cur.push(m);
    j.reminders = cur;
    f.querySelector('#remChips').innerHTML = remChips(j);
    f.querySelector('#remN').value = '';
    f.dispatchEvent(new Event('change'));
  });
}

/* ---------- File calendario (.ics) ---------- */
const icsEsc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDT = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUTC = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
function icsFold(line) { // righe al massimo di 75 caratteri, come vuole lo standard
  const out = []; let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
  out.push(s); return out.join('\r\n');
}
function icsAlarm(trigger, text) { return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(text), 'TRIGGER:' + trigger, 'END:VALARM']; }
function jobVevent(j) {
  const summary = (j.title || 'Lavoro') + (j.client ? ' – ' + j.client : '');
  const desc = [j.client && 'Cliente: ' + j.client, j.phone && 'Tel. ' + j.phone, j.address && 'Indirizzo: ' + j.address, num(j.amount) ? 'Importo: ' + eur(j.amount) : '', j.notes].filter(Boolean).join('\n');
  const L = ['BEGIN:VEVENT', `UID:${j.id}@agenda-idraulico`, 'DTSTAMP:' + icsUTC(), 'SUMMARY:' + icsEsc(summary)];
  if (j.time) {
    const s = jobStart(j), e = new Date(s.getTime() + Math.max(60, Math.round(j.minutes || 0)) * 60000);
    L.push('DTSTART:' + icsDT(s), 'DTEND:' + icsDT(e));
    jobRems(j).forEach(m => L.push(...icsAlarm(m ? `-PT${m}M` : 'PT0M', summary)));
  } else { // giornata intera: gli avvisi partono dalle 8:00 del giorno indicato
    const [y, m, d] = j.date.split('-').map(Number), nx = new Date(y, m - 1, d + 1);
    L.push(`DTSTART;VALUE=DATE:${j.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nx.getFullYear()}${pad(nx.getMonth() + 1)}${pad(nx.getDate())}`);
    jobRems(j).forEach(mm => { const t = 480 - mm; L.push(...icsAlarm(t >= 0 ? `PT${t}M` : `-PT${-t}M`, summary)); });
  }
  if (j.address) L.push('LOCATION:' + icsEsc(j.address));
  if (desc) L.push('DESCRIPTION:' + icsEsc(desc));
  L.push('END:VEVENT');
  return L;
}
function recapVevents() {
  const n = notifS(), L = [], now = new Date();
  if (n.weekRecap) {
    const [h, mi] = n.weekTime.split(':').map(Number), s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((n.weekDay - now.getDay() + 7) % 7), h, mi);
    const code = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][n.weekDay];
    L.push('BEGIN:VEVENT', 'UID:recap-settimana@agenda-idraulico', 'DTSTAMP:' + icsUTC(), 'SUMMARY:Recap della prossima settimana',
      'DTSTART:' + icsDT(s), 'DTEND:' + icsDT(new Date(s.getTime() + 15 * 60000)), 'RRULE:FREQ=WEEKLY;BYDAY=' + code,
      'DESCRIPTION:' + icsEsc('Apri Agenda Idraulico → Riepilogo → Recap per vedere gli impegni della prossima settimana.'),
      ...icsAlarm('PT0M', 'Recap: guarda gli impegni della prossima settimana'), 'END:VEVENT');
  }
  if (n.monthRecap) {
    const [h, mi] = n.monthTime.split(':').map(Number), s = new Date(now.getFullYear(), now.getMonth() + 1, 0, h, mi);
    L.push('BEGIN:VEVENT', 'UID:recap-mese@agenda-idraulico', 'DTSTAMP:' + icsUTC(), 'SUMMARY:Recap del prossimo mese',
      'DTSTART:' + icsDT(s), 'DTEND:' + icsDT(new Date(s.getTime() + 15 * 60000)), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1',
      'DESCRIPTION:' + icsEsc('Apri Agenda Idraulico → Riepilogo → Recap per vedere gli impegni del prossimo mese.'),
      ...icsAlarm('PT0M', 'Recap: guarda gli impegni del prossimo mese'), 'END:VEVENT');
  }
  return L;
}
const icsWrap = events => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agenda Idraulico//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'].map(icsFold).join('\r\n') + '\r\n';

/** Apre il file nel Calendario dell'iPhone ("Aggiungi"). Il file viene servito dall'app stessa,
    così Safari lo riconosce come calendario. Se non si apre, c'è la condivisione come riserva. */
async function openIcs(ics, name) {
  const fname = name.replace(/[^\w-]+/g, '-') + '.ics';
  let opened = false;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller && window.caches) {
      const url = new URL('cal/' + Date.now() + '-' + fname, location.href).href;
      const c = await caches.open('idraulico-cal');
      await c.put(url, new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="' + fname + '"' } }));
      location.href = url; opened = true;
    }
  } catch (e) {}
  if (!opened) location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  setTimeout(() => {
    const el = document.createElement('div'); el.className = 'ask-wrap';
    el.innerHTML = `<div class="ask"><h2>Calendario</h2><p>Se è comparsa la schermata del Calendario, tocca <b>"Aggiungi"</b>. Gli avvisi arriveranno anche ad app chiusa.</p>
      <button class="btn solid full" data-no>Fatto</button><button class="btn full" data-sh>Non si è aperto? Condividi il file</button></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-no]').onclick = () => el.remove();
    el.querySelector('[data-sh]').onclick = () => { el.remove(); shareBlob(new Blob([ics], { type: 'text/calendar' }), fname, 'text/calendar'); };
  }, 900);
}

/* ---------- Promemoria dentro l'app (e notifica se l'app è aperta) ---------- */
function dueReminders() {
  const now = Date.now(), out = [], seen = notifS().seen;
  db.jobs.forEach(j => {
    if (j.status !== 'programmato' || !j.date) return;
    const start = jobStart(j).getTime(); if (start < now - 3600000) return;
    const due = jobRems(j).map(m => ({ m, at: start - m * 60000 })).filter(r => r.at <= now);
    if (!due.length) return;
    const r = due.sort((a, b) => b.at - a.at)[0], key = j.id + '|' + j.date + '|' + (j.time || '') + '|' + r.m;
    if (!seen[key]) out.push({ j, key, m: r.m, start });
  });
  return out.sort((a, b) => a.start - b.start);
}
/** Recap automatico: il giorno scelto della settimana e l'ultimo giorno del mese, dall'ora scelta */
function dueRecaps() {
  const n = notifS(), now = new Date(), out = [], hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (n.weekRecap && now.getDay() === n.weekDay && hm >= n.weekTime) { const k = 'w' + today(); if (!n.seen[k]) out.push({ key: k, kind: 'week' }); }
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (n.monthRecap && now.getDate() === last && hm >= n.monthTime) { const k = 'm' + today(); if (!n.seen[k]) out.push({ key: k, kind: 'month' }); }
  return out;
}
function remindersBanner() {
  const r = dueReminders(), rc = dueRecaps();
  if (!r.length && !rc.length) return '';
  const when = x => {
    const d = Math.round((x.start - Date.now()) / 60000); if (d <= 0) return 'adesso'; if (d < 60) return `tra ${d} min`;
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (x.j.date === today()) return 'oggi'; if (x.j.date === iso(tm)) return 'domani';
    const g = Math.round((parseISO(x.j.date) - parseISO(today())) / 864e5); return `tra ${g} giorni (${fmtDate(x.j.date, { day: 'numeric', month: 'short' })})`;
  };
  return `<div class="remind">
    <div class="remind-h">🔔 Promemoria</div>
    ${rc.map(x => `<div class="remind-it"><button class="link" data-a="openRecap" data-id="${x.kind}:${x.key}">${x.kind === 'week' ? 'Recap della prossima settimana' : 'Recap del prossimo mese'} →</button><button class="remind-x" data-a="seenRem" data-id="${x.key}" aria-label="Chiudi">✕</button></div>`).join('')}
    ${r.map(x => `<div class="remind-it"><button class="link" data-a="openJob" data-id="${x.j.id}"><b>${esc(x.j.title || 'Lavoro')}</b>${x.j.client ? ' · ' + esc(x.j.client) : ''} — ${when(x)}${x.j.time ? ' (ore ' + esc(x.j.time) + ')' : ''}</button><button class="remind-x" data-a="seenRem" data-id="${esc(x.key)}" aria-label="Chiudi">✕</button></div>`).join('')}
  </div>`;
}
// Notifica di sistema mentre l'app è aperta (solo se l'utente l'ha permessa)
async function pushDueNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = notifS(); let changed = false;
  const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration().catch(() => null);
  const show = (t, b, tag) => { try { reg ? reg.showNotification(t, { body: b, tag, icon: 'icon-192.png' }) : new Notification(t, { body: b, tag }); } catch (e) {} };
  dueReminders().forEach(x => { if (!n.shown[x.key]) { show(x.j.title || 'Lavoro', `${x.j.client ? x.j.client + ' · ' : ''}${fmtDate(x.j.date)}${x.j.time ? ' ore ' + x.j.time : ''}`, x.key); n.shown[x.key] = 1; changed = true; } });
  dueRecaps().forEach(x => { if (!n.shown[x.key]) { show(x.kind === 'week' ? 'Recap della settimana' : 'Recap del mese', 'Apri l\'app per vedere i prossimi impegni', x.key); n.shown[x.key] = 1; changed = true; } });
  if (changed) save();
}
setInterval(() => { pushDueNotifications(); if (!document.hidden && !document.querySelector('.sheet-wrap,.ask-wrap') && (dueReminders().length || dueRecaps().length) && !document.querySelector('.remind') && !S.jobId && !S.quoteId && S.tab === 'agenda') render(); }, 60000);
setTimeout(pushDueNotifications, 1500);

/* ---------- Recap prossima settimana / prossimo mese ---------- */
function recapRange(kind) {
  const n = new Date();
  if (kind === 'month') { const s = new Date(n.getFullYear(), n.getMonth() + 1, 1), e = new Date(n.getFullYear(), n.getMonth() + 2, 0); return [iso(s), iso(e), `${MONTHS[s.getMonth()]} ${s.getFullYear()}`]; }
  const s = new Date(n.getFullYear(), n.getMonth(), n.getDate() + ((8 - n.getDay()) % 7 || 7)), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  return [iso(s), iso(e), `${s.getDate()} ${MSHORT[s.getMonth()].toLowerCase()} – ${e.getDate()} ${MSHORT[e.getMonth()].toLowerCase()} ${e.getFullYear()}`];
}
function recapData(kind) {
  const [from, to, label] = recapRange(kind);
  const jobs = db.jobs.filter(j => j.status !== 'annullato' && j.date >= from && j.date <= to).sort(byDateTime);
  const quotes = db.quotes.filter(q => q.status === 'inviato');
  const unpaid = db.jobs.filter(isUnpaid);
  return { from, to, label, jobs, expected: sum(jobs.map(j => num(j.amount))), important: jobs.filter(j => j.important).length,
    quotes, quotesTot: sum(quotes.map(q => quoteTotals(q).tot)), unpaid, unpaidTot: sum(unpaid.map(j => num(j.amount))) };
}
function viewRecap(kind) {
  const r = recapData(kind);
  const days = {}; r.jobs.forEach(j => (days[j.date] = days[j.date] || []).push(j));
  return {
    title: 'Recap',
    html: `<div class="seg"><button class="${kind === 'week' ? 'on' : ''}" data-a="openRecap" data-id="week">Prossima settimana</button><button class="${kind === 'month' ? 'on' : ''}" data-a="openRecap" data-id="month">Prossimo mese</button></div>
    <div class="mnav"><strong>${esc(r.label)}</strong></div>
    <div class="grid2">
      <div class="stat"><div class="l">Impegni</div><div class="v">${r.jobs.length}${r.important ? ` <small class="star" style="font-size:14px">★ ${r.important}</small>` : ''}</div></div>
      <div class="stat"><div class="l">Incasso previsto</div><div class="v in">${eur(r.expected)}</div></div>
      <div class="stat"><div class="l">Ancora da incassare</div><div class="v" style="color:var(--amber)">${eur(r.unpaidTot)}</div></div>
      <div class="stat"><div class="l">Preventivi in attesa</div><div class="v">${r.quotes.length}<small class="muted" style="font-size:13px"> · ${eur(r.quotesTot)}</small></div></div>
    </div>
    ${Object.keys(days).map(d => `<div class="sec">${esc(fmtDateLong(d))}</div><div class="list">${days[d].map(j => jobItem(j, false)).join('')}</div>`).join('') || '<div class="list"><div class="empty">Nessun impegno in questo periodo.</div></div>'}
    ${r.quotes.length ? `<div class="sec">Preventivi inviati in attesa di risposta</div><div class="list">${r.quotes.map(quoteItem).join('')}</div>` : ''}
    <button class="btn full" data-a="shareRecap" data-id="${kind}">${ICON.share} Condividi il recap (testo)</button>`
  };
}
function recapText(kind) {
  const r = recapData(kind);
  return [`Recap ${kind === 'week' ? 'settimana' : 'mese'}: ${r.label}`, `Impegni: ${r.jobs.length} · incasso previsto ${eur(r.expected)}`, '',
    ...r.jobs.map(j => `• ${fmtDate(j.date)}${j.time ? ' ' + j.time : ''} – ${j.title || 'Lavoro'}${j.client ? ' (' + j.client + ')' : ''}${j.address ? ' – ' + j.address : ''}`),
    r.unpaid.length ? `\nDa incassare: ${eur(r.unpaidTot)}` : ''].join('\n').replace(/\u00a0/g, ' ');
}

/* ---------- Statistiche: confronto tra i mesi ---------- */
const STAT_M = [['net', 'Utile'], ['inTot', 'Entrate'], ['outTot', 'Uscite'], ['minutes', 'Ore'], ['count', 'Lavori']];
const statFmt = (k, v) => k === 'minutes' ? fmtMin(v) : k === 'count' ? String(v) : eur(v);
const monthStats = (y, m) => stats(`${y}-${pad(m + 1)}-01`, `${y}-${pad(m + 1)}-31`);
function pctChange(a, b) {
  if (!b) return a ? '<span class="muted">nuovo</span>' : '<span class="muted">—</span>';
  const p = (a - b) / Math.abs(b) * 100, up = p >= 0;
  return `<span class="${up ? 'in' : 'out'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(p))}%</span>`;
}
function viewCompare() {
  const k = S.statM || 'net', n = new Date(), N = S.statN || 12;
  const months = []; for (let i = N - 1; i >= 0; i--) { const d = new Date(n.getFullYear(), n.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), s: monthStats(d.getFullYear(), d.getMonth()) }); }
  const vals = months.map(x => x.s[k]);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals), span = (max - min) || 1;
  const W = 340, H = 190, top = 16, bot = 26, ch = H - top - bot, bw = W / N, zeroY = top + ch * (max / span);
  const sel = S.statSel != null ? S.statSel : N - 1;
  const bars = months.map((x, i) => {
    const v = x.s[k], h = Math.abs(v) / span * ch, y = v >= 0 ? zeroY - h : zeroY, xx = i * bw + bw * 0.18, w = bw * 0.64;
    const r = Math.min(4, w / 2, h / 2);
    // estremità arrotondata dal lato del valore, base dritta sullo zero
    const path = h < 0.5 ? '' : v >= 0
      ? `M${xx},${zeroY}V${y + r}Q${xx},${y} ${xx + r},${y}H${xx + w - r}Q${xx + w},${y} ${xx + w},${y + r}V${zeroY}Z`
      : `M${xx},${zeroY}V${y + h - r}Q${xx},${y + h} ${xx + r},${y + h}H${xx + w - r}Q${xx + w},${y + h} ${xx + w},${y + h - r}V${zeroY}Z`;
    return `<g class="bar ${i === sel ? 'sel' : ''}" data-a="statSel" data-id="${i}"><rect x="${i * bw}" y="${top}" width="${bw}" height="${ch + bot}" fill="transparent"/>
      ${path ? `<path d="${path}" class="${v < 0 ? 'neg' : 'pos'}"/>` : ''}
      <text x="${i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="ax">${MSHORT[x.m].slice(0, 1)}${MSHORT[x.m].slice(1, 3).toLowerCase()}</text></g>`;
  }).join('');
  const cur = months[sel], prev = months[sel - 1];
  const ly = monthStats(cur.y - 1, cur.m);
  const nonEmpty = months.filter(x => x.s.inTot || x.s.outTot || x.s.count);
  const best = nonEmpty.length ? nonEmpty.reduce((a, b) => (b.s.net > a.s.net ? b : a)) : null;
  const avg = nonEmpty.length ? sum(nonEmpty.map(x => x.s[k])) / nonEmpty.length : 0;
  return `<div class="seg">${STAT_M.map(([kk, l]) => `<button class="${k === kk ? 'on' : ''}" data-a="statM" data-id="${kk}">${l}</button>`).join('')}</div>
    <div class="seg">${[[6, 'Ultimi 6 mesi'], [12, 'Ultimi 12 mesi']].map(([v, l]) => `<button class="${N === v ? 'on' : ''}" data-a="statN" data-id="${v}">${l}</button>`).join('')}</div>
    <div class="card">
      <h3>${STAT_M.find(x => x[0] === k)[1]} per mese</h3>
      <div class="chart-v"><b>${MONTHS[cur.m]} ${cur.y}:</b> ${statFmt(k, cur.s[k])}</div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${STAT_M.find(x => x[0] === k)[1]} negli ultimi ${N} mesi">
        <line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" class="zero"/>${bars}</svg>
      <div class="muted small">Tocca una colonna per vedere il mese. Media dei mesi con attività: <b>${statFmt(k, avg)}</b></div>
    </div>
    <div class="card"><h3>${MONTHS[cur.m]} ${cur.y} a confronto</h3>
      <table><tr><th></th><th>${MSHORT[cur.m]} ${cur.y}</th><th>vs mese prima</th><th>vs ${MSHORT[cur.m]} ${cur.y - 1}</th></tr>
      ${STAT_M.map(([kk, l]) => `<tr><td>${l}</td><td>${statFmt(kk, cur.s[kk])}</td><td>${prev ? pctChange(cur.s[kk], prev.s[kk]) : '—'}</td><td>${pctChange(cur.s[kk], ly[kk])}</td></tr>`).join('')}
      </table>
      ${best ? `<div class="muted small" style="margin-top:8px">Mese migliore per utile: <b>${MONTHS[best.m]} ${best.y}</b> (${eur(best.s.net)})</div>` : ''}
    </div>
    <div class="card"><h3>Tabella</h3><table><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Utile</th><th>Ore</th></tr>
      ${months.slice().reverse().map(x => `<tr><td>${MSHORT[x.m]} ${String(x.y).slice(2)}</td><td class="in">${x.s.inTot ? eur(x.s.inTot) : '–'}</td><td class="out">${x.s.outTot ? eur(x.s.outTot) : '–'}</td><td>${x.s.inTot || x.s.outTot ? eur(x.s.net) : '–'}</td><td>${x.s.minutes ? Math.round(x.s.minutes / 6) / 10 : '–'}</td></tr>`).join('')}
    </table></div>`;
}

/* ---------- Impostazioni promemoria ---------- */
function notifForm() {
  const n = notifS();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const body = `
    <div class="sec" style="margin:0 0 8px">Promemoria proposti per ogni nuovo lavoro</div>
    <div class="chips">${REM_OPTS.map(([m, l]) => `<label class="chipbox"><input type="checkbox" name="def_${m}" ${n.defaults.includes(m) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
    <p class="muted small">Si possono cambiare lavoro per lavoro.</p>
    <div class="sec" style="margin:18px 0 8px">Recap</div>
    <label class="check"><input type="checkbox" name="weekRecap" ${n.weekRecap ? 'checked' : ''}> Recap della prossima settimana</label><div style="height:8px"></div>
    <div class="row"><label>Giorno<select name="weekDay">${WEEKDAYS.map((d, i) => `<option value="${i}" ${i === n.weekDay ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Ora<input type="time" name="weekTime" value="${esc(n.weekTime)}"></label></div>
    <label class="check"><input type="checkbox" name="monthRecap" ${n.monthRecap ? 'checked' : ''}> Recap del prossimo mese (l'ultimo giorno del mese)</label><div style="height:8px"></div>
    <label>Ora<input type="time" name="monthTime" value="${esc(n.monthTime)}"></label>
    <div class="sec" style="margin:18px 0 8px">Avvisi anche ad app chiusa</div>
    <p class="small" style="margin-top:0">L'iPhone avvisa sempre per gli impegni salvati nel suo <b>Calendario</b>. Con questi pulsanti li aggiungi tutti insieme, con i promemoria scelti:</p>
    <button type="button" class="btn solid full" id="calAll">${ICON.calendar} Aggiungi i prossimi impegni al Calendario</button>
    <button type="button" class="btn full" id="calRecap">${ICON.calendar} Aggiungi gli avvisi dei recap al Calendario</button>
    <div class="sec" style="margin:18px 0 8px">Notifiche dell'app</div>
    <p class="small muted" style="margin-top:0">Mentre l'app è aperta o appena chiusa può mostrare una notifica. ${perm === 'granted' ? '<b class="in">Attive.</b>' : perm === 'denied' ? '<b class="out">Bloccate: si riattivano da Impostazioni dell\'iPhone → Notifiche → Idraulico.</b>' : perm === 'unsupported' ? 'Funzionano solo aprendo l\'app dall\'icona sulla schermata Home (iOS 16.4 o successivo).' : ''}</p>
    ${perm === 'default' ? '<button type="button" class="btn full" id="askPerm">Attiva le notifiche</button>' : ''}`;
  return openSheet('Promemoria e recap', body, {
    isNew: false, noDelete: true, empty: () => false, add: () => {}, remove: () => {},
    apply: d => Object.assign(n, {
      defaults: Object.keys(d).filter(k => /^def_\d+$/.test(k) && d[k]).map(k => +k.slice(4)).sort((a, b) => a - b),
      weekRecap: !!d.weekRecap, weekDay: +d.weekDay, weekTime: d.weekTime || '19:00', monthRecap: !!d.monthRecap, monthTime: d.monthTime || '19:00'
    }),
    init: f => {
      f.querySelector('#calAll').onclick = () => {
        const list = db.jobs.filter(j => j.status === 'programmato' && j.date >= today()).sort(byDateTime);
        if (!list.length) { toast('Nessun impegno in programma'); return; }
        openIcs(icsWrap(list.flatMap(jobVevent)), 'impegni-idraulico');
      };
      f.querySelector('#calRecap').onclick = () => {
        const ev = recapVevents(); if (!ev.length) { toast('Attiva almeno un recap'); return; }
        openIcs(icsWrap(ev), 'recap-idraulico');
      };
      const ask = f.querySelector('#askPerm');
      if (ask) ask.onclick = async () => {
        try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notifiche attivate' : 'Notifiche non attivate'); if (r === 'granted') pushDueNotifications(); ask.remove(); } catch (e) {}
      };
    }
  });
}

Object.assign(A, {
  seenRem: key => { notifS().seen[key] = 1; save(); render(); },
  openRecap: v => {
    const [kind, key] = v.split(':');
    if (key) notifS().seen[key] = 1, save();
    S.recap = kind; S.jobId = null; S.quoteId = null; render(); scrollTo(0, 0);
  },
  shareRecap: async kind => {
    const t = recapText(kind);
    if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(t); toast('Recap copiato'); } catch (e) { alert(t); }
  },
  addToCal: id => { const j = getJob(id); if (j) openIcs(icsWrap(jobVevent(j)), (j.title || 'lavoro')); },
  notifForm: () => notifForm(),
  statM: k => { S.statM = k; render(); },
  statN: v => { S.statN = +v; S.statSel = null; render(); },
  statSel: i => { S.statSel = +i; render(); }
});
