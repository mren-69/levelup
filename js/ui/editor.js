import { addQuest, updateQuest, deleteQuest, addUrgent } from '../logic/engine.js';
import { XP_SLOTS } from '../logic/leveling.js';
import { esc, WEEKDAYS } from './util.js';

let draft = null;
let editingId = null;
let ctxRef = null;
let error = '';

const sheet = () => document.getElementById('sheet');

export function openEditor(ctx, id) {
  ctxRef = ctx;
  urgentMode = false;
  editingId = id;
  error = '';
  const q = id ? ctx.s.quests.find((x) => x.id === id) : null;
  draft = q
    ? { name: q.name, kind: q.kind, unit: q.unit, base: q.base, xp: q.xp, days: [...q.days] }
    : { name: '', kind: 'amount', unit: '回', base: 10, xp: 10, days: [] };
  render();
  sheet().hidden = false;
}

function close() {
  sheet().hidden = true;
  sheet().innerHTML = '';
}

// ---- 緊急クエスト用の入力シート ----
let urgentMode = false;

export function openUrgentEditor(ctx) {
  ctxRef = ctx;
  urgentMode = true;
  editingId = null;
  error = '';
  draft = { name: '', xp: 20 };
  renderUrgent();
  sheet().hidden = false;
}

function renderUrgent() {
  sheet().innerHTML = `<div class="panel em-panel">
    <h2 class="em-h" style="margin-top:0">緊急クエストを追加</h2>
    <p class="note">その日かぎりの1回きりのミッション。今日の朝3時になるとできていなくても消えます（ペナルティなし）。</p>
    <div class="field"><label>名前</label><input type="text" id="ed-name" maxlength="40" value="${esc(draft.name)}" placeholder="例：お風呂掃除、お使い"></div>
    <div class="field"><label>経験値の枠</label>${seg('xp', XP_SLOTS.map((v) => [v, v]), draft.xp)}</div>
    <div class="err">${esc(error)}</div>
    <button class="btn em-btn" data-ed="save">追加する</button>
    <button class="btn sub" data-ed="cancel">キャンセル</button>
  </div>`;
}

function seg(group, items, current) {
  return `<div class="seg ${group === 'xp' ? 'xp' : ''}">${items.map(([v, label]) =>
    `<button type="button" data-ed="${group}" data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

function amountField() {
  if (draft.kind === 'check') return '';
  const isTime = draft.kind === 'limit' || draft.unit === '分';
  const label = draft.kind === 'limit' ? '上限（この時間以内なら達成）' : '量（ペナルティ時はここから×1.25、×1.5）';
  const unitSeg = draft.kind === 'amount' ? `<div style="margin-top:8px">${seg('unit', [['回', '回数'], ['分', '時間']], draft.unit)}</div>` : '';
  const inputs = isTime
    ? `<div class="row"><input type="number" inputmode="numeric" min="0" id="ed-h" value="${Math.floor(draft.base / 60)}"><span>時間</span>
       <input type="number" inputmode="numeric" min="0" max="59" id="ed-m" value="${draft.base % 60}"><span>分</span></div>`
    : `<div class="row"><input type="number" inputmode="numeric" min="1" id="ed-n" value="${draft.base}"><span>回</span></div>`;
  return `<div class="field"><label>${label}</label>${inputs}${unitSeg}</div>`;
}

function render() {
  const everyday = draft.days.length === 0;
  sheet().innerHTML = `<div class="panel">
    <h2 style="margin-top:0">${editingId ? 'クエストを編集' : 'クエストを追加'}</h2>
    <div class="field"><label>名前</label><input type="text" id="ed-name" maxlength="40" value="${esc(draft.name)}" placeholder="例：腕立て、勉強、就寝 23:30まで"></div>
    <div class="field"><label>種類</label>${seg('kind', [['amount', '量あり（回数・時間）'], ['check', '量なし（できた/できない）'], ['limit', '〜以内（スマホ時間）']], draft.kind)}</div>
    ${amountField()}
    <div class="field"><label>経験値の枠</label>${seg('xp', XP_SLOTS.map((v) => [v, v]), draft.xp)}</div>
    <div class="field"><label>繰り返し</label>
      <div class="seg"><button type="button" data-ed="everyday" class="${everyday ? 'on' : ''}">毎日</button>
      ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-ed="day" data-v="${d}" class="${draft.days.includes(d) ? 'on' : ''}">${WEEKDAYS[d]}</button>`).join('')}</div></div>
    <div class="err">${esc(error)}</div>
    <button class="btn" data-ed="save">保存</button>
    ${editingId ? '<button class="btn danger" data-ed="delete">削除</button>' : ''}
    <button class="btn sub" data-ed="cancel">キャンセル</button>
  </div>`;
}

function readInputs() {
  const v = (id) => document.getElementById(id)?.value;
  draft.name = v('ed-name') ?? draft.name;
  if (document.getElementById('ed-n')) draft.base = parseInt(v('ed-n'), 10) || 0;
  if (document.getElementById('ed-h')) draft.base = (parseInt(v('ed-h'), 10) || 0) * 60 + (parseInt(v('ed-m'), 10) || 0);
}

function onClick(e) {
  if (e.target === sheet()) return close();
  const el = e.target.closest('[data-ed]');
  if (!el) return;
  readInputs();
  const a = el.dataset.ed;
  const v = el.dataset.v;
  if (urgentMode) {
    if (a === 'xp') draft.xp = Number(v);
    else if (a === 'cancel') return close();
    else if (a === 'save') {
      try {
        ctxRef.commit(addUrgent(ctxRef.s, draft, ctxRef.today));
        return close();
      } catch (err) { error = err.message; }
    }
    return renderUrgent();
  }
  if (a === 'kind') {
    if (v !== draft.kind) {
      draft.kind = v;
      if (v === 'limit') { draft.unit = '分'; draft.base = 240; }
      if (v === 'amount') { draft.unit = '回'; draft.base = 10; }
    }
  } else if (a === 'unit') {
    if (v !== draft.unit) { draft.unit = v; draft.base = v === '分' ? 60 : 10; }
  } else if (a === 'xp') draft.xp = Number(v);
  else if (a === 'everyday') draft.days = [];
  else if (a === 'day') {
    const d = Number(v);
    draft.days = draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d];
    if (draft.days.length === 7) draft.days = [];
  } else if (a === 'cancel') return close();
  else if (a === 'delete') {
    if (!confirm('このクエストを削除しますか？（これまでに得た経験値は残ります）')) return;
    ctxRef.commit(deleteQuest(ctxRef.s, editingId));
    return close();
  } else if (a === 'save') {
    try {
      const fields = { ...draft, unit: draft.kind === 'limit' ? '分' : draft.unit };
      const next = editingId ? updateQuest(ctxRef.s, editingId, fields) : addQuest(ctxRef.s, fields, ctxRef.today);
      ctxRef.commit(next);
      return close();
    } catch (err) { error = err.message; }
  }
  render();
}

export function initEditor() {
  sheet().addEventListener('click', onClick);
}
