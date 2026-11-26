'use strict';
/* =====================================================================
   DA COMPRARE: note dei materiali che serviranno per lavori futuri
   - si scrivono in Materiali → Da comprare (o dalla scheda del lavoro)
   - si spuntano quando sono stati presi
   - una volta presi si può registrare la spesa con un tocco (diventa un materiale del lavoro)
   ===================================================================== */
const getTodo = id => db.todo.find(t => t.id === id);
const todoOpen = () => db.todo.filter(t => !t.done);

function todoItem(t, showJob = true) {
  const j = t.jobId && getJob(t.jobId);
  const det = [t.qty && `${numIn(num(t.qty))} ${t.unit || 'pz'}`, t.brand, t.notes].filter(Boolean).map(esc).join(' · ');
  return `<div class="item todo ${t.done ? 'done' : ''}">
    <button class="tick" data-a="todoTick" data-id="${t.id}" aria-label="${t.done ? 'Segna come da prendere' : 'Segna come preso'}">${t.done ? ICON.check : ''}</button>
    <button class="main" data-a="todoEdit" data-id="${t.id}" style="text-align:left">
      <div class="t">${esc(t.text)}</div>
      ${det || (showJob && j) ? `<div class="s">${det}${det && showJob && j ? ' · ' : ''}${showJob && j ? '🔧 ' + esc(j.title || 'Lavoro') + ' · ' + esc(fmtDate(j.date, { day: 'numeric', month: 'short' })) : ''}</div>` : ''}
    </button>
    ${t.done && !t.matId ? `<button class="btn small-btn" data-a="todoBuy" data-id="${t.id}">Registra spesa</button>` : ''}
    ${t.matId ? '<span class="chip green">Spesa registrata</span>' : ''}
  </div>`;
}
function quickAdd(jobId) {
  return `<div class="quickadd"><input id="tdq" ${jobId ? `data-job="${jobId}"` : ''} placeholder="Cosa ti serve?" enterkeyhint="done" autocomplete="off">
    <button class="btn solid" data-a="todoQuick" data-id="${jobId || ''}">Aggiungi</button></div>`;
}
/** Elenco in Materiali → Da comprare, diviso per lavoro */
function todoList() {
  const q = (S.mq || '').trim().toLowerCase();
  let list = db.todo.slice();
  if (q) list = list.filter(t => [t.text, t.brand, t.notes, (getJob(t.jobId) || {}).title].join(' ').toLowerCase().includes(q));
  const open = list.filter(t => !t.done), done = list.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const groups = new Map();
  open.forEach(t => { const k = getJob(t.jobId) ? t.jobId : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const keys = [...groups.keys()].sort((a, b) => !a ? 1 : !b ? -1 : byDateTime(getJob(a), getJob(b)));
  let html = quickAdd('');
  if (!open.length) html += `<div class="list"><div class="empty">${db.todo.length ? 'Niente da comprare. 👍' : 'Segna qui il materiale da prendere per i prossimi lavori.<br>Puoi collegarlo a un lavoro.'}</div></div>`;
  keys.forEach(k => {
    const j = k && getJob(k);
    html += `<div class="sec">${j ? `🔧 <button class="link" data-a="openJob" data-id="${j.id}" style="font-size:inherit;font-weight:inherit;letter-spacing:inherit;text-transform:inherit">${esc(j.title || 'Lavoro')}${j.client ? ' · ' + esc(j.client) : ''}</button> · ${esc(fmtDate(j.date, { day: 'numeric', month: 'short' }))}` : 'Senza lavoro'}</div>
      <div class="list">${groups.get(k).map(t => todoItem(t, false)).join('')}</div>`;
  });
  if (done.length) html += `<div class="sec">Già presi</div><div class="list">${done.slice(0, 30).map(t => todoItem(t)).join('')}</div>
    <button class="btn full" data-a="todoClear" style="background:var(--line);color:var(--text)">Togli dall'elenco quelli già presi</button>`;
  return html;
}
/** Sezione nella scheda del lavoro */
function jobTodoSection(j) {
  const list = db.todo.filter(t => t.jobId === j.id).sort((a, b) => (a.done - b.done) || (a.created - b.created));
  return `<div class="sec">Da comprare per questo lavoro${list.filter(t => !t.done).length ? ' (' + list.filter(t => !t.done).length + ')' : ''}</div>
    ${quickAdd(j.id)}
    ${list.length ? `<div class="list">${list.map(t => todoItem(t, false)).join('')}</div>` : ''}`;
}

function todoForm(t, jobId) {
  const isNew = !t;
  t = t || { id: uid(), created: Date.now(), text: '', qty: '', unit: 'pz', brand: '', jobId: jobId || '', notes: '', done: false };
  const jobs = db.jobs.filter(x => x.status === 'programmato' && x.date >= today()).sort(byDateTime);
  if (t.jobId && !jobs.find(x => x.id === t.jobId) && getJob(t.jobId)) jobs.unshift(getJob(t.jobId));
  const body = `
    <label>Cosa serve<input name="text" list="dlN" placeholder="Es. Rubinetto a sfera 3/4&quot;" value="${esc(t.text)}"></label>${datalist('dlN', db.materials.map(x => x.name).concat(db.todo.map(x => x.text)))}
    <div class="row"><label>Quantità<input name="qty" inputmode="decimal" placeholder="—" value="${numIn(num(t.qty))}"></label>
      <label>Unità<select name="unit">${['pz', 'm', 'kg', 'l', 'conf', 'rotolo', 'set'].map(u => opt(u, t.unit || 'pz')).join('')}</select></label></div>
    <label>Marca (facoltativa)<input name="brand" list="dlB" value="${esc(t.brand)}"></label>${datalist('dlB', db.materials.map(x => x.brand))}
    <label>Per il lavoro<select name="jobId">${opt('', t.jobId || '', '— Nessuno —')}${jobs.map(x => opt(x.id, t.jobId, `${fmtDate(x.date, { day: 'numeric', month: 'short' })} · ${x.title || 'Lavoro'}${x.client ? ' · ' + x.client : ''}`)).join('')}</select></label>
    <label>Note<textarea name="notes" placeholder="Misure, codice, dove comprarlo…">${esc(t.notes)}</textarea></label>
    <label class="check"><input type="checkbox" name="done" ${t.done ? 'checked' : ''}> Già preso</label>`;
  return openSheet(isNew ? 'Da comprare' : 'Modifica nota', body, {
    isNew,
    apply: d => Object.assign(t, { text: d.text.trim(), qty: num(d.qty) || '', unit: d.unit, brand: d.brand.trim(), jobId: d.jobId, notes: d.notes.trim(), done: !!d.done, doneAt: d.done ? (t.doneAt || Date.now()) : 0 }),
    empty: () => !(t.text || t.notes || t.brand),
    add: () => db.todo.push(t),
    remove: () => { db.todo = db.todo.filter(x => x !== t); },
    delTitle: 'Eliminare questa nota?', delMsg: () => `"${t.text || 'Nota'}" verrà tolta dall'elenco.`
  });
}

Object.assign(A, {
  todoQuick: jobId => {
    const inp = $('#tdq'), v = inp ? inp.value.trim() : '';
    if (!v) { inp && inp.focus(); return; }
    db.todo.push({ id: uid(), created: Date.now(), text: v, qty: '', unit: 'pz', brand: '', jobId: jobId || '', notes: '', done: false });
    save(); render();
    const n = $('#tdq'); if (n) n.focus(); // pronto per scriverne un altro
    toast('Aggiunto: ' + v);
  },
  todoTick: id => {
    const t = getTodo(id); if (!t) return;
    t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; save(); render();
    if (t.done && !t.matId) toast('Preso! Tocca "Registra spesa" per segnare quanto l\'hai pagato');
  },
  todoEdit: id => todoForm(getTodo(id)),
  todoBuy: id => {
    const t = getTodo(id); if (!t) return;
    const before = new Set(db.materials.map(m => m.id));
    const f = matForm(null, getJob(t.jobId) ? t.jobId : '');
    f.name.value = t.text; f.brand.value = t.brand || ''; if (num(t.qty)) f.qty.value = numIn(num(t.qty)); f.unit.value = t.unit || 'pz';
    if (t.notes) f.notes.value = t.notes;
    // stesso articolo già comprato: propone l'ultimo prezzo
    f.name.dispatchEvent(new Event('change', { bubbles: true }));
    const obs = setInterval(() => { // quando il materiale viene salvato lo collega alla nota
      const m = db.materials.find(x => !before.has(x.id));
      if (m) { t.matId = m.id; save(); clearInterval(obs); }
      if (!document.querySelector('.sheet-wrap')) { clearInterval(obs); render(); }
    }, 300);
    f.unitCost.focus();
  },
  todoClear: async () => {
    if (!(await askConfirm('Togliere quelli già presi?', 'Le note dei materiali già presi verranno tolte dall\'elenco. Le spese registrate restano.', 'Togli', 'Annulla'))) return;
    db.todo = db.todo.filter(t => !t.done); save(); render();
  }
});
document.addEventListener('keydown', e => { if (e.target.id === 'tdq' && e.key === 'Enter') { e.preventDefault(); A.todoQuick(e.target.dataset.job || ''); } });
