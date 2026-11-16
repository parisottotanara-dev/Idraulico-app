'use strict';
/* =====================================================================
   PREVENTIVI
   - si creano dal "+" (Agenda o Lavori) o da Lavori → Preventivi
   - si condividono / scaricano in PDF da mandare al cliente
   - quando il cliente accetta si crea il lavoro con tutti i dati già compilati
   ===================================================================== */
const QSTATUS = { bozza: ['Da inviare', ''], inviato: ['Inviato', 'blue'], accettato: ['Accettato', 'green'], rifiutato: ['Rifiutato', 'red'] };
const IVA_OPTS = [
  ['22', 'IVA 22% – aziende, negozi, uffici, casi normali'],
  ['10', 'IVA 10% – manutenzione/riparazione in casa di privati'],
  ['4', 'IVA 4% – impianti nella costruzione di prima casa'],
  ['forf', 'Senza IVA – regime forfettario'],
  ['0', 'Senza IVA (altro motivo)']];
const IVA_HINT = `<p class="muted small" style="margin:-6px 0 12px">10% solo per manutenzione e riparazioni in abitazioni di privati (per caldaie, sanitari e rubinetteria il 10% vale fino al valore della manodopera). Nel dubbio chiedi al commercialista.</p>`;
const UNITS_Q = ['pz', 'm', 'h', 'a corpo', 'kg', 'l', 'conf'];
const BIZ_DEFAULTS = {
  iva: '22', validity: 30, rate: '',
  payment: 'Saldo a fine lavori',
  notes: 'Eventuali lavori non previsti nel presente preventivo saranno concordati e quotati a parte.'
};
function biz() {
  const b = db.settings.biz || (db.settings.biz = {});
  for (const k in BIZ_DEFAULTS) if (b[k] === undefined) b[k] = BIZ_DEFAULTS[k];
  delete b.logo; // il logo per ora non si usa
  return b;
}
const getQuote = id => db.quotes.find(q => q.id === id);
const quoteJob = q => db.jobs.find(j => j.quoteId === q.id);
const ivaRate = q => (q.iva === 'forf' || q.iva === '0') ? 0 : num(q.iva);
const lineTotal = l => num(l.qty) * num(l.price);
function quoteTotals(q) {
  const imp = sum((q.lines || []).map(lineTotal));
  const disc = Math.min(Math.max(0, num(q.discount)), imp);
  const base = imp - disc, iva = Math.round(base * ivaRate(q)) / 100;
  return { imp, disc, base, iva, tot: base + iva };
}
function nextQuoteNumber() {
  const y = new Date().getFullYear();
  const n = db.quotes.map(q => String(q.number || '')).filter(s => s.startsWith(y + '/')).map(s => parseInt(s.split('/')[1], 10) || 0);
  return `${y}/${(n.length ? Math.max(...n) : 0) + 1}`;
}
const fmtD = s => s ? s.split('-').reverse().join('/') : '';

/* ---------- Liste ---------- */
function quoteItem(q) {
  const t = quoteTotals(q), [lab, col] = QSTATUS[q.status] || QSTATUS.bozza;
  return `<button class="item" data-a="openQuote" data-id="${q.id}">
    <div class="time qnum">${esc(q.number || '—')}</div>
    <div class="main"><div class="t">${esc(q.title || 'Preventivo')}</div>
      <div class="s">${q.client ? esc(q.client) + ' · ' : ''}<span class="chip ${col}">${lab}</span>${quoteJob(q) ? ' <span class="chip green">Lavoro creato</span>' : ''}</div></div>
    <div class="r num">${eur(t.tot)}<small>${q.date ? esc(fmtDate(q.date, { day: 'numeric', month: 'short' })) : 'senza data'}</small></div></button>`;
}
function quotesList() {
  const s = (S.qq || '').trim().toLowerCase();
  let list = db.quotes.slice();
  if (S.qf && S.qf !== 'tutti') list = list.filter(q => (q.status || 'bozza') === S.qf);
  if (s) list = list.filter(q => [q.number, q.title, q.client, q.address, q.description].join(' ').toLowerCase().includes(s));
  list.sort((a, b) => (b.created || 0) - (a.created || 0));
  if (!list.length) return `<div class="list"><div class="empty">${db.quotes.length ? 'Nessun preventivo trovato.' : 'Nessun preventivo ancora.<br>Tocca + per farne uno.'}</div></div>`;
  return `<div class="list">${list.map(quoteItem).join('')}</div>`;
}
function viewQuotes() {
  const f = [['tutti', 'Tutti'], ['bozza', 'Da inviare'], ['inviato', 'Inviati'], ['accettato', 'Accettati'], ['rifiutato', 'Rifiutati']];
  return `<input id="qq" class="search" type="search" placeholder="Cerca cliente, numero, lavoro…" value="${esc(S.qq || '')}">
    <div class="seg">${f.map(([k, l]) => `<button class="${(S.qf || 'tutti') === k ? 'on' : ''}" data-a="qFilter" data-id="${k}">${l}</button>`).join('')}</div>
    <div id="list">${quotesList()}</div>`;
}

/* ---------- Pagina del preventivo ---------- */
function viewQuote(q) {
  const t = quoteTotals(q), [lab, col] = QSTATUS[q.status] || QSTATUS.bozza, job = quoteJob(q);
  const lines = (q.lines || []).filter(l => l.desc || num(l.price));
  loadJsPdf().catch(() => {}); // prepara il PDF in anticipo
  return {
    title: 'Preventivo',
    html: `<div class="card jh">
      <div class="muted small">Preventivo N. ${esc(q.number || '—')} · ${q.date ? esc(fmtDateLong(q.date)) : 'senza data'}</div>
      <h2 style="margin-top:4px">${esc(q.title || 'Preventivo')}</h2>
      <div style="margin-top:6px"><span class="chip ${col}">${lab}</span>${job ? ' <span class="chip green">Lavoro creato</span>' : ''}</div>
      ${q.client ? `<div style="margin-top:10px;font-weight:600">${esc(q.client)}</div>` : ''}
      ${q.address ? `<div class="muted small">${esc(q.address)}</div>` : ''}
      <div class="actions">
        <button class="btn solid" data-a="shareQuote" data-id="${q.id}">${ICON.share} Invia al cliente</button>
        <button class="btn" data-a="downloadQuote" data-id="${q.id}">${ICON.download} Scarica PDF</button>
        <button class="btn" data-a="editQuote" data-id="${q.id}">${ICON.edit} Modifica</button>
        ${q.phone ? `<a class="btn" href="tel:${esc(q.phone.replace(/[^\d+]/g, ''))}">${ICON.phone} Chiama</a>` : ''}
      </div>
      ${job ? `<button class="btn green full" data-a="openJob" data-id="${job.id}">Apri il lavoro collegato →</button>`
        : `<button class="btn green full" data-a="jobFromQuote" data-id="${q.id}">${ICON.check} Il cliente ha accettato: crea il lavoro</button>`}
    </div>

    <div class="sec">Stato</div>
    <div class="seg">${Object.entries(QSTATUS).map(([k, [l]]) => `<button class="${(q.status || 'bozza') === k ? 'on' : ''}" data-a="qStatus" data-id="${q.id}:${k}">${l}</button>`).join('')}</div>

    ${q.description ? `<div class="card"><h3>Descrizione dei lavori</h3><div style="white-space:pre-wrap">${esc(q.description)}</div></div>` : ''}
    <div class="sec">Voci</div>
    <div class="list">${lines.map(l => `<div class="item"><div class="main"><div class="t" style="white-space:normal">${esc(l.desc || '—')}</div>
      <div class="s">${numIn(num(l.qty)) || 0} ${esc(l.unit || '')} × ${eur(l.price)}</div></div><div class="r num">${eur(lineTotal(l))}</div></div>`).join('') || '<div class="empty">Nessuna voce. Aggiungile in "Modifica".</div>'}</div>
    <div class="card">
      <div class="kv"><span>Imponibile</span><span>${eur(t.imp)}</span></div>
      ${t.disc ? `<div class="kv"><span>Sconto</span><span class="out">−${eur(t.disc)}</span></div>` : ''}
      <div class="kv"><span>${ivaRate(q) ? 'IVA ' + ivaRate(q) + '%' : (q.iva === 'forf' ? 'Regime forfettario (senza IVA)' : 'Senza IVA')}</span><span>${eur(t.iva)}</span></div>
      <div class="kv" style="font-size:19px"><span><b>Totale</b></span><span><b>${eur(t.tot)}</b></span></div>
    </div>
    <div class="card"><h3>Condizioni</h3>
      ${q.validity ? `<div class="kv"><span>Validità offerta</span><span>${esc(q.validity)} giorni</span></div>` : ''}
      ${q.timing ? `<div class="kv"><span>Tempi di esecuzione</span><span>${esc(q.timing)}</span></div>` : ''}
      ${q.payment ? `<div class="kv"><span>Pagamento</span><span>${esc(q.payment)}</span></div>` : ''}
      ${q.notes ? `<div style="white-space:pre-wrap;margin-top:8px" class="small">${esc(q.notes)}</div>` : ''}
    </div>
    ${!biz().name ? `<div class="hint"><b>Manca la tua intestazione.</b> Inserisci nome, P.IVA e contatti: compariranno in alto nel PDF. <button class="link" style="font-size:15px" data-a="bizForm">Inserisci i miei dati</button></div>` : ''}
    <button class="btn danger full" data-a="delQuote" data-id="${q.id}">Elimina preventivo</button>`
  };
}

/* ---------- Modulo del preventivo ---------- */
function lineRow(l, i) {
  return `<div class="qline" data-i="${i}">
    <div class="qline-h"><b>Voce ${i + 1}</b><span class="qline-t" data-lt>${eur(lineTotal(l))}</span><button type="button" class="link small qdel" data-rm="${i}" aria-label="Togli voce">Togli</button></div>
    <input name="ld_${i}" list="dlQ" placeholder="Descrizione (es. Miscelatore lavabo Grohe)" value="${esc(l.desc)}" style="margin-top:0">
    <div class="row" style="margin-top:8px">
      <label style="margin:0">Q.tà<input name="lq_${i}" inputmode="decimal" value="${numIn(l.qty) || ''}" placeholder="1"></label>
      <label style="margin:0">Unità<select name="lu_${i}">${UNITS_Q.map(u => opt(u, l.unit || 'pz')).join('')}</select></label>
      <label style="margin:0">Prezzo €<input name="lp_${i}" inputmode="decimal" value="${numIn(l.price)}" placeholder="0,00"></label>
    </div></div>`;
}
function quoteForm(q) {
  const isNew = !q, B = biz();
  q = q || {
    id: uid(), created: Date.now(), number: nextQuoteNumber(), date: '', status: 'bozza',
    lines: [], iva: B.iva, discount: 0, validity: B.validity, timing: '', payment: B.payment, notes: B.notes
  };
  if (!q.lines) q.lines = [];
  const descs = db.quotes.flatMap(x => (x.lines || []).map(l => l.desc)).concat(db.materials.map(m => m.name + (m.brand ? ' ' + m.brand : '')));
  const body = `
    <div class="row"><label>Numero<input name="number" value="${esc(q.number)}"></label>
      <label>Data <span class="muted">(facoltativa)</span><input type="date" name="date" value="${esc(q.date)}"></label></div>
    <label class="ac-wrap">Cliente<input name="client" placeholder="Nome e cognome / ditta" value="${esc(q.client)}"></label>
    <div class="row"><label>Telefono<input name="phone" type="tel" value="${esc(q.phone)}"></label>
      <label>Email<input name="email" type="email" inputmode="email" value="${esc(q.email)}"></label></div>
    <label>Indirizzo del lavoro<input name="address" placeholder="Via, numero, città" value="${esc(q.address)}"></label>
    <label>Oggetto<input name="title" placeholder="Es. Rifacimento impianto bagno" value="${esc(q.title)}"></label>
    <label>Descrizione dei lavori<textarea name="description" placeholder="Cosa comprende il lavoro: smontaggio, fornitura e posa, collaudo…">${esc(q.description)}</textarea></label>

    <div class="sec" style="margin:18px 0 8px">Voci del preventivo</div>
    ${datalist('dlQ', descs)}
    <div id="qLines">${q.lines.map(lineRow).join('')}</div>
    <div class="quick" style="grid-template-columns:repeat(3,1fr);margin:0 0 14px">
      <button type="button" class="btn" data-add="mat">+ Materiale</button>
      <button type="button" class="btn" data-add="lab">+ Manodopera</button>
      <button type="button" class="btn" data-add="oth">+ Altra voce</button></div>

    <div class="row"><label>Sconto (€)<input name="discount" inputmode="decimal" placeholder="0,00" value="${numIn(q.discount)}"></label>
      <label>IVA<select name="iva">${IVA_OPTS.map(([v, l]) => opt(v, q.iva, l)).join('')}</select></label></div>${IVA_HINT}
    <div class="totbox"><span>Totale preventivo</span><span id="qTot">${eur(quoteTotals(q).tot)}</span></div>

    <div class="row"><label>Validità (giorni)<input name="validity" inputmode="numeric" value="${esc(q.validity)}"></label>
      <label>Tempi di esecuzione<input name="timing" placeholder="Es. 2 giorni" value="${esc(q.timing)}"></label></div>
    <label>Pagamento<input name="payment" list="dlPay" value="${esc(q.payment)}"></label>${datalist('dlPay', ['Saldo a fine lavori', '50% all\'accettazione, saldo a fine lavori', '30% all\'accettazione, saldo a fine lavori', 'Bonifico a 30 giorni', 'Contanti o bonifico a fine lavori'])}
    <label>Note per il cliente<textarea name="notes">${esc(q.notes)}</textarea></label>
    <label>Stato<select name="status">${Object.entries(QSTATUS).map(([k, [l]]) => opt(k, q.status || 'bozza', l)).join('')}</select></label>`;

  return openSheet(isNew ? 'Nuovo preventivo' : 'Modifica preventivo', body, {
    isNew,
    apply: d => {
      const n = document.querySelectorAll('#qLines .qline').length;
      const lines = [];
      for (let i = 0; i < n; i++) lines.push({ desc: (d['ld_' + i] || '').trim(), qty: num(d['lq_' + i]) || (d['lq_' + i] ? 0 : 1), unit: d['lu_' + i] || 'pz', price: num(d['lp_' + i]) });
      Object.assign(q, {
        number: d.number.trim(), date: d.date, client: d.client.trim(), phone: d.phone.trim(), email: d.email.trim(), address: d.address.trim(),
        title: d.title.trim(), description: d.description.trim(), lines, discount: num(d.discount), iva: d.iva,
        validity: d.validity.trim(), timing: d.timing.trim(), payment: d.payment.trim(), notes: d.notes.trim(), status: d.status
      });
    },
    empty: () => !(q.client || q.title || q.description || q.phone || q.address || q.lines.some(l => l.desc || l.price)),
    add: () => db.quotes.push(q),
    remove: () => { db.quotes = db.quotes.filter(x => x !== q); db.jobs.forEach(j => { if (j.quoteId === q.id) j.quoteId = ''; }); if (S.quoteId === q.id) S.quoteId = null; },
    delTitle: 'Eliminare questo preventivo?',
    delMsg: () => `Preventivo N. ${q.number}${q.client ? ' per ' + q.client : ''}. Non si potrà più recuperare.`,
    init: f => {
      const box = f.querySelector('#qLines');
      const refresh = () => setTimeout(() => {
        if (!box.isConnected) return;
        $('#qTot').textContent = eur(quoteTotals(q).tot);
        box.querySelectorAll('.qline').forEach((row, i) => { const l = q.lines[i]; if (l) row.querySelector('[data-lt]').textContent = eur(lineTotal(l)); });
      }, 0);
      f.addEventListener('input', refresh); f.addEventListener('change', refresh);
      const redraw = focusLast => {
        box.innerHTML = q.lines.map(lineRow).join('');
        f.dispatchEvent(new Event('change'));
        if (focusLast) { const last = box.querySelector('.qline:last-child input'); if (last) last.focus(); }
      };
      f.addEventListener('click', e => {
        const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]');
        if (add) {
          const k = add.dataset.add;
          q.lines.push(k === 'lab' ? { desc: 'Manodopera', qty: 1, unit: 'h', price: num(biz().rate) }
            : k === 'mat' ? { desc: '', qty: 1, unit: 'pz', price: 0 } : { desc: '', qty: 1, unit: 'a corpo', price: 0 });
          redraw(k !== 'lab');
        }
        if (rm) { q.lines.splice(+rm.dataset.rm, 1); redraw(false); }
      });
      // Descrizione già usata in un altro preventivo → propone unità e prezzo
      box.addEventListener('change', e => {
        const m = /^ld_(\d+)$/.exec(e.target.name || ''); if (!m) return;
        const i = m[1], v = e.target.value.trim().toLowerCase(); if (!v) return;
        const prev = db.quotes.filter(x => x !== q).flatMap(x => (x.lines || []).map(l => ({ ...l, c: x.created || 0 })))
          .filter(l => (l.desc || '').trim().toLowerCase() === v && num(l.price)).sort((a, b) => b.c - a.c)[0];
        if (prev && !f['lp_' + i].value) { f['lp_' + i].value = numIn(prev.price); f['lu_' + i].value = prev.unit || 'pz'; }
      });
      clientPicker(f, q);
      // Cliente già noto → telefono, email e indirizzo
      f.client.addEventListener('change', () => {
        const name = f.client.value.trim().toLowerCase(); if (!name) return;
        const prev = db.quotes.filter(x => x !== q).concat(db.jobs).filter(x => (x.client || '').trim().toLowerCase() === name).pop();
        if (prev) { ['phone', 'address', 'email'].forEach(k => { if (!f[k].value && prev[k]) f[k].value = prev[k]; }); }
      });
      if (isNew && !q.lines.length) { q.lines.push({ desc: '', qty: 1, unit: 'pz', price: 0 }); box.innerHTML = q.lines.map(lineRow).join(''); }
    }
  });
}

/* ---------- I tuoi dati (intestazione del PDF) ---------- */
function bizForm() {
  const B = biz();
  const body = `
    <p class="muted small" style="margin-top:0">Questi dati compaiono in alto in ogni preventivo.</p>
    <label>Nome / ditta<input name="name" placeholder="Es. Mario Rossi Idraulica" value="${esc(B.name)}"></label>
    <label>Indirizzo<input name="address" placeholder="Via, numero, CAP, città" value="${esc(B.address)}"></label>
    <div class="row"><label>Partita IVA<input name="piva" inputmode="numeric" value="${esc(B.piva)}"></label>
      <label>Codice fiscale<input name="cf" value="${esc(B.cf)}" style="text-transform:uppercase"></label></div>
    <div class="row"><label>Telefono<input name="phone" type="tel" value="${esc(B.phone)}"></label>
      <label>Email<input name="email" type="email" inputmode="email" value="${esc(B.email)}"></label></div>
    <label>IBAN (per i bonifici)<input name="iban" value="${esc(B.iban)}" style="text-transform:uppercase"></label>
    <div class="sec" style="margin:18px 0 8px">Valori proposti nei nuovi preventivi</div>
    <div class="row"><label>Tariffa oraria (€/h)<input name="rate" inputmode="decimal" placeholder="Es. 35" value="${numIn(B.rate)}"></label>
      <label>Validità (giorni)<input name="validity" inputmode="numeric" value="${esc(B.validity)}"></label></div>
    <label>IVA<select name="iva">${IVA_OPTS.map(([v, l]) => opt(v, B.iva, l)).join('')}</select></label>
    <label>Pagamento<input name="payment" value="${esc(B.payment)}"></label>
    <label>Note<textarea name="notes">${esc(B.notes)}</textarea></label>`;
  return openSheet('I tuoi dati', body, {
    isNew: false, noDelete: true,
    apply: d => Object.assign(biz(), {
      name: d.name.trim(), address: d.address.trim(), piva: d.piva.trim(), cf: d.cf.trim().toUpperCase(), phone: d.phone.trim(), email: d.email.trim(),
      iban: d.iban.replace(/\s+/g, ' ').trim().toUpperCase(), rate: num(d.rate), validity: d.validity.trim(), iva: d.iva, payment: d.payment.trim(), notes: d.notes.trim()
    }),
    empty: () => false, add: () => {}, remove: () => {}
  });
}

/* ---------- PDF ---------- */
let jsPdfP = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return jsPdfP || (jsPdfP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = () => { jsPdfP = null; s.remove(); rej(new Error('pdf')); };
    document.head.appendChild(s);
  }));
}
// i caratteri non stampabili dal font del PDF (es. emoji) vengono tolti
const pdfTx = s => String(s ?? '').replace(/[   ]/g, ' ').replace(/[^\n\x20-\x7E\xA1-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '');
const pdfMoney = n => pdfTx(eur(n));
function quotePdf(q, jspdf) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const B = biz(), T = quoteTotals(q);
  const M = 15, R = 195, BOTTOM = 277, ACC = [11, 99, 206];
  let y = M;
  const font = (style, size, color) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...(Array.isArray(color) ? color : [color, color, color])); };
  const wrap = (s, w) => doc.splitTextToSize(pdfTx(s), w);
  const need = h => { if (y + h > BOTTOM) { doc.addPage(); y = M + 4; return true; } return false; };

  // Intestazione: chi fa il preventivo
  const headW = 180;
  font('bold', 15, 20); const nameL = wrap(B.name || 'Il tuo nome / ditta', headW); doc.text(nameL, M, y + 6);
  let hy = y + 6 + nameL.length * 6;
  font('normal', 9, 90);
  [B.address, [B.piva && 'P.IVA ' + B.piva, B.cf && 'C.F. ' + B.cf].filter(Boolean).join('  ·  '), [B.phone && 'Tel. ' + B.phone, B.email].filter(Boolean).join('  ·  ')]
    .filter(Boolean).forEach(l => { wrap(l, headW).forEach(t => { doc.text(t, M, hy); hy += 4.3; }); });
  y = hy + 3;
  doc.setDrawColor(...ACC); doc.setLineWidth(0.7); doc.line(M, y, R, y); y += 10;

  // Titolo e cliente
  const bx = 112, bw = R - bx;
  const cl = [];
  if (q.client) cl.push(['bold', q.client]);
  if (q.address) cl.push(['normal', q.address]);
  if (q.phone) cl.push(['normal', 'Tel. ' + q.phone]);
  if (q.email) cl.push(['normal', q.email]);
  font('normal', 10, 20);
  const clW = cl.map(([st, t]) => [st, wrap(t, bw - 8)]);
  const boxH = 9 + clW.reduce((a, [, l]) => a + l.length * 4.8, 0) + 3;
  doc.setFillColor(243, 245, 249); doc.roundedRect(bx, y - 6, bw, Math.max(boxH, 20), 2, 2, 'F');
  font('bold', 7.5, 120); doc.text('SPETT.LE CLIENTE', bx + 4, y - 1);
  let cy = y + 4.5;
  clW.forEach(([st, l]) => { font(st, 10, 25); l.forEach(t => { doc.text(t, bx + 4, cy); cy += 4.8; }); });

  font('bold', 22, ACC); doc.text('PREVENTIVO', M, y + 2);
  font('normal', 10, 50);
  let ly = y + 10;
  if (q.number) { doc.text(pdfTx('N. ' + q.number), M, ly); ly += 5; }
  if (q.date) { doc.text('Data: ' + fmtD(q.date), M, ly); ly += 5; }
  y = Math.max(ly, y - 6 + Math.max(boxH, 20)) + 8;

  // Oggetto e descrizione
  if (q.title) {
    font('bold', 11, 20); const l = wrap('Oggetto: ' + q.title, R - M); need(l.length * 5.2); doc.text(l, M, y); y += l.length * 5.2 + 2;
  }
  if (q.description) {
    font('normal', 10, 40);
    wrap(q.description, R - M).forEach(t => { need(5); doc.text(t, M, y); y += 4.8; });
    y += 3;
  }

  // Tabella delle voci
  const lines = (q.lines || []).filter(l => (l.desc || '').trim() || num(l.price));
  const X = { d: M + 2, q: 128, u: 131, p: 166, t: R - 2 };
  const head = () => {
    doc.setFillColor(...ACC); doc.rect(M, y, R - M, 8, 'F');
    font('bold', 9, 255);
    doc.text('DESCRIZIONE', X.d, y + 5.3); doc.text('Q.TÀ', X.q, y + 5.3, { align: 'right' }); doc.text('U.M.', X.u, y + 5.3);
    doc.text('PREZZO', X.p, y + 5.3, { align: 'right' }); doc.text('IMPORTO', X.t, y + 5.3, { align: 'right' });
    y += 8;
  };
  y += 2; need(20); head();
  if (!lines.length) { font('italic', 10, 120); doc.text('Nessuna voce', X.d, y + 6); y += 9; }
  lines.forEach((l, i) => {
    font('normal', 10, 25);
    const dl = wrap(l.desc || '—', 98), h = dl.length * 4.6 + 3.6;
    if (need(h)) head();
    if (i % 2) { doc.setFillColor(248, 249, 252); doc.rect(M, y, R - M, h, 'F'); }
    font('normal', 10, 25);
    doc.text(dl, X.d, y + 5);
    doc.text(pdfTx(numIn(num(l.qty)) || '0'), X.q, y + 5, { align: 'right' });
    doc.text(pdfTx(l.unit || ''), X.u, y + 5);
    doc.text(pdfMoney(l.price), X.p, y + 5, { align: 'right' });
    doc.text(pdfMoney(lineTotal(l)), X.t, y + 5, { align: 'right' });
    y += h;
  });
  doc.setDrawColor(210); doc.setLineWidth(0.3); doc.line(M, y, R, y); y += 6;

  // Totali
  need(34);
  const tl = 120, row = (label, val, bold) => { font(bold ? 'bold' : 'normal', 10, 40); doc.text(label, tl, y); doc.text(val, R - 2, y, { align: 'right' }); y += 5.5; };
  row('Imponibile', pdfMoney(T.imp));
  if (T.disc) row('Sconto', '- ' + pdfMoney(T.disc));
  if (T.disc) row('Imponibile scontato', pdfMoney(T.base));
  if (ivaRate(q)) row('IVA ' + ivaRate(q) + '%', pdfMoney(T.iva));
  else row(q.iva === 'forf' ? 'IVA (regime forfettario)' : 'IVA', pdfMoney(0));
  y += 1;
  doc.setFillColor(...ACC); doc.roundedRect(tl - 4, y - 5, R - tl + 4, 10, 1.5, 1.5, 'F');
  font('bold', 12, 255); doc.text('TOTALE', tl, y + 1.6); doc.text(pdfMoney(T.tot), R - 2, y + 1.6, { align: 'right' });
  y += 13;

  // Condizioni
  const cond = [];
  if (q.iva === 'forf') cond.push('Operazione in franchigia da IVA ai sensi dell\'art. 1, commi 54-89, Legge n. 190/2014 (regime forfettario).');
  if (q.validity) cond.push(`Validità dell'offerta: ${q.validity} giorni${q.date ? ' dalla data del preventivo' : ''}.`);
  if (q.timing) cond.push('Tempi di esecuzione: ' + q.timing + '.');
  if (q.payment) cond.push('Modalità di pagamento: ' + q.payment + '.');
  if (B.iban) cond.push('IBAN: ' + B.iban + (B.name ? ' intestato a ' + B.name : ''));
  if (cond.length || q.notes) {
    need(14); font('bold', 10, 20); doc.text('Condizioni', M, y); y += 5.5;
    font('normal', 9.5, 50);
    cond.forEach(c => { wrap('• ' + c, R - M).forEach(t => { need(4.6); doc.text(t, M, y); y += 4.6; }); });
    if (q.notes) { y += 1; wrap(q.notes, R - M).forEach(t => { need(4.6); doc.text(t, M, y); y += 4.6; }); }
    y += 4;
  }

  // Accettazione
  need(30); y += 4;
  font('bold', 10, 20); doc.text('Per accettazione del preventivo', M, y); y += 14;
  doc.setDrawColor(120); doc.setLineWidth(0.3);
  font('normal', 9, 90);
  doc.line(M, y, M + 55, y); doc.text('Data', M, y + 4.5);
  doc.line(R - 80, y, R, y); doc.text('Firma del cliente', R - 80, y + 4.5);

  // Piè di pagina
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); font('normal', 8, 140);
    doc.text(pdfTx([B.name, q.number && 'Preventivo N. ' + q.number].filter(Boolean).join(' · ')), M, 289);
    doc.text(`Pagina ${i} di ${n}`, R, 289, { align: 'right' });
  }
  return doc.output('blob');
}
const quoteFileName = q => pdfTx(`Preventivo ${String(q.number || '').replace(/\//g, '-')}${q.client ? ' ' + q.client : ''}`).replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';

/** Condivide un file (WhatsApp, Mail, File…). Se il telefono blocca la condivisione chiede un tocco in più. */
async function shareBlob(blob, name, mime) {
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'ok'; }
    catch (e) {
      if (e.name === 'AbortError') return 'abort';
      if (e.name === 'NotAllowedError') {
        return new Promise(resolve => {
          const el = document.createElement('div'); el.className = 'ask-wrap';
          el.innerHTML = `<div class="ask"><div class="ask-icon" style="background:var(--green-soft);color:var(--green)">✓</div><h2>PDF pronto</h2><p>${esc(name)}</p>
            <button class="btn solid full" data-ok>Condividi</button><button class="btn full" data-no>Chiudi</button></div>`;
          document.body.appendChild(el);
          el.querySelector('[data-ok]').onclick = async () => { el.remove(); try { await navigator.share({ files: [file], title: name }); resolve('ok'); } catch (er) { resolve('abort'); } };
          el.querySelector('[data-no]').onclick = () => { el.remove(); resolve('abort'); };
        });
      }
    }
  }
  downloadBlob(blob, name);
  return 'download';
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function makeQuotePdf(q) {
  let lib;
  try { lib = await loadJsPdf(); } catch (e) { alert('Non riesco a preparare il PDF. Apri l\'app una volta con internet attivo e riprova.'); return null; }
  return quotePdf(q, lib);
}

/* ---------- Azioni ---------- */
function chooseCreate() {
  const el = document.createElement('div'); el.className = 'ask-wrap';
  el.innerHTML = `<div class="ask"><h2>Cosa vuoi creare?</h2><p></p>
    <button class="btn solid full" data-k="job">${ICON.calendar} Nuovo lavoro / appuntamento</button>
    <button class="btn full" data-k="quote">${ICON.doc} Nuovo preventivo</button>
    <button class="btn full" data-k="" style="background:var(--line);color:var(--text)">Annulla</button></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b && e.target !== el) return;
    el.remove();
    if (b && b.dataset.k === 'job') jobForm(null, S.tab === 'agenda' ? S.day : today());
    if (b && b.dataset.k === 'quote') quoteForm();
  });
}
Object.assign(A, {
  lavMode: id => { S.lavMode = id; render(); },
  qFilter: id => { S.qf = id; render(); },
  openQuote: id => { S.quoteId = id; render(); scrollTo(0, 0); },
  editQuote: id => quoteForm(getQuote(id)),
  bizForm: () => bizForm(),
  qStatus: v => { const [id, st] = v.split(':'); const q = getQuote(id); if (q) { q.status = st; save(); render(); } },
  delQuote: async id => {
    const q = getQuote(id); if (!q) return;
    if (!(await askConfirm('Eliminare questo preventivo?', `Preventivo N. ${q.number}${q.client ? ' per ' + q.client : ''}. Non si potrà più recuperare.`))) return;
    db.quotes = db.quotes.filter(x => x !== q); db.jobs.forEach(j => { if (j.quoteId === id) j.quoteId = ''; });
    S.quoteId = null; save(); render(); toast('Preventivo eliminato');
  },
  shareQuote: async id => {
    const q = getQuote(id); if (!q) return;
    const blob = await makeQuotePdf(q); if (!blob) return;
    const r = await shareBlob(blob, quoteFileName(q), 'application/pdf');
    if (r !== 'abort' && (q.status || 'bozza') === 'bozza') { q.status = 'inviato'; save(); render(); }
  },
  downloadQuote: async id => {
    const q = getQuote(id); if (!q) return;
    const blob = await makeQuotePdf(q); if (!blob) return;
    downloadBlob(blob, quoteFileName(q));
  },
  jobFromQuote: id => { jobForm(null, today(), id); }
});
