import {
  todayQuests, toggleDone, setPaused, isPausedNow, answerOffer, completeOffer,
  missedYesterday, shieldAvailable, useShield, todayUrgent, scheduledUrgent, toggleUrgent, deleteUrgent, moveQuest, moveToday,
} from '../logic/engine.js';
import { MULTS } from '../logic/penalty.js';
import { taskText } from '../logic/recovery.js';
import { esc, fmtAmount, fmtDays } from './util.js';
import { openEditor, openUrgentEditor } from './editor.js';

const KIND = { amount: '量あり', check: '量なし', limit: '以内' };

function offerHTML(s, o) {
  const q = s.quests.find((x) => x.id === o.questId);
  const from = q ? `「${esc(q.name)}」の未達成から` : '';
  if (o.status === 'pending') {
    return `<div class="win offer">
      <div class="label">RECOVERY QUEST</div>
      <div class="task">${esc(taskText(o.task))}</div>
      <div class="sub">${from}・こなすと +${o.xp} XP</div>
      <div class="choice">
        <button class="yes" data-act="offer" data-q="${o.questId}" data-a="accept">承認</button>
        <button class="no" data-act="offer" data-q="${o.questId}" data-a="reject">拒否</button>
      </div></div>`;
  }
  const done = o.status === 'done';
  return `<div class="win q rec ${done ? 'done' : ''}">
    <button class="chk" data-act="offerDone" data-q="${o.questId}" ${done ? 'disabled' : ''}>${done ? '✓' : ''}</button>
    <div class="qt"><b>${esc(taskText(o.task))}</b><small>リカバリークエスト</small></div>
    <div class="xp">+${o.xp}</div></div>`;
}

function rowHTML(t) {
  const q = t.quest;
  let sub = '';
  if (q.kind === 'amount') {
    sub = t.stage ? `<span class="up">${fmtAmount(t.required, q.unit)}（×${MULTS[t.stage]}）</span>` : fmtAmount(t.required, q.unit);
  } else if (q.kind === 'limit') sub = `${fmtAmount(q.base, '分')}以内・記録タブで自動判定`;
  else sub = '達成したらチェック';
  if (t.paused) sub = 'お休み中';
  const chk = q.kind === 'limit'
    ? '<div class="chk auto">自動</div>'
    : `<button class="chk" data-act="done" data-q="${q.id}" ${t.paused ? 'disabled' : ''}>${t.done ? '✓' : ''}</button>`;
  return `<div class="win q ${t.done ? 'done' : ''} ${t.paused ? 'off' : ''}" data-sort="${q.id}">
    ${chk}<div class="qt"><b>${esc(q.name)}</b><small>${sub}</small></div><div class="xp">+${q.xp}</div></div>`;
}

function urgentHTML(t) {
  const u = t.urgent;
  return `<div class="win q emergency ${t.done ? 'done' : ''}">
    <button class="chk" data-act="urgentDone" data-q="${u.id}">${t.done ? '✓' : ''}</button>
    <div class="qt"><span class="tag">EMERGENCY</span><b>${esc(u.name)}</b><small>今日の朝3時まで・1回きり</small></div>
    <div class="xp">+${u.xp}</div>
    <button class="mini" data-act="urgentDelete" data-q="${u.id}" aria-label="削除">削除</button></div>`;
}

export function view(ctx) {
  const { s, today } = ctx;
  let html = '';

  const urgent = todayUrgent(s, today);
  if (urgent.length) html += `<h2 class="em-h">緊急クエスト</h2>${urgent.map(urgentHTML).join('')}`;
  html += '<button class="btn em-btn" data-act="newUrgent">＋ 緊急クエストを追加</button>';

  const scheduled = scheduledUrgent(s, today);
  if (scheduled.length) {
    html += `<h2 class="em-h sch-h">明日の予約</h2><p class="note">明日の朝3時になると、緊急クエストとして出ます。</p>${scheduled.map((u) => `
      <div class="win q scheduled"><div class="qt"><span class="tag">予約</span><b>${esc(u.name)}</b><small>明日の朝3時から</small></div>
      <div class="xp">+${u.xp}</div>
      <button class="mini" data-act="urgentDelete" data-q="${u.id}" aria-label="削除">削除</button></div>`).join('')}`;
  }

  const offers = (s.offers[today] ?? []).filter((o) => o.status !== 'rejected');
  if (offers.length) html += `<h2>リカバリークエスト</h2>${offers.map((o) => offerHTML(s, o)).join('')}`;

  const missed = missedYesterday(s, today);
  if (missed.length) {
    const avail = shieldAvailable(s, today);
    html += `<h2>昨日の未達成</h2><p class="note">お休みシールド（週1回）を使うと、1つだけ帳消しにできます。${avail ? '' : '今週はもう使いました。'}</p>`;
    html += missed.map((id) => {
      const q = s.quests.find((x) => x.id === id);
      if (!q) return '';
      return `<div class="win card"><span>${esc(q.name)}</span>${avail ? `<button class="mini" data-act="shield" data-q="${id}">シールドを使う</button>` : '<b style="color:var(--dim)">使用不可</b>'}</div>`;
    }).join('');
  }

  const list = todayQuests(s, today);
  html += '<h2>今日のクエスト</h2>';
  if (list.length) {
    html += '<p class="note">長押ししてドラッグで並べ替え（今日だけ。明日は「すべてのクエスト」の順番に戻ります）。</p>';
    html += `<div data-sortable="today">${list.map(rowHTML).join('')}</div>`;
  } else html += '<div class="empty">今日のクエストはありません</div>';

  html += '<h2>すべてのクエスト</h2><p class="note">スイッチをオフにすると、その間はお休み（ペナルティなし）。旅行や体調不良のときに。長押ししてドラッグで並べ替え（この順番はずっと残ります）。</p>';
  html += `<div data-sortable="all">${s.quests.map((q) => {
    const on = !isPausedNow(q);
    const amount = q.kind === 'check' ? '' : `・${fmtAmount(q.base, q.unit)}${q.kind === 'limit' ? '以内' : ''}`;
    return `<div class="win q ${on ? '' : 'off'}" style="opacity:1" data-sort="${q.id}">
      <div class="qt"><b>${esc(q.name)}</b><small>${KIND[q.kind]}${amount}・${fmtDays(q.days)}・${q.xp}XP</small></div>
      <button class="mini" data-act="edit" data-q="${q.id}">編集</button>
      <button class="toggle ${on ? 'on' : ''}" data-act="pause" data-q="${q.id}" aria-label="オン/オフ"></button></div>`;
  }).join('')}</div>`;
  html += '<button class="btn" data-act="new" style="margin-top:14px">＋ クエストを追加</button>';
  return html;
}

/** ドラッグを離したとき。kind: 'today' | 'all'。index は一覧の中での新しい位置 */
export function onSort(ctx, kind, id, index) {
  if (kind === 'all') ctx.commit(moveQuest(ctx.s, id, index));
  else if (kind === 'today') ctx.commit(moveToday(ctx.s, id, index, ctx.today));
  else ctx.render(); // 中断: 元の並びに戻す
}

export const actions = {
  done: (el, ctx) => ctx.commit(toggleDone(ctx.s, el.dataset.q, ctx.today)),
  pause: (el, ctx) => {
    const q = ctx.s.quests.find((x) => x.id === el.dataset.q);
    ctx.commit(setPaused(ctx.s, q.id, !isPausedNow(q), ctx.today));
  },
  offer: (el, ctx) => ctx.commit(answerOffer(ctx.s, el.dataset.q, ctx.today, el.dataset.a)),
  offerDone: (el, ctx) => {
    if (!confirm('リカバリークエストを完了にしますか？')) return;
    ctx.commit(completeOffer(ctx.s, el.dataset.q, ctx.today));
  },
  shield: (el, ctx) => {
    if (!confirm('今週のお休みシールドを使って帳消しにしますか？（週1回）')) return;
    try {
      ctx.commit(useShield(ctx.s, el.dataset.q, ctx.today));
      ctx.toast('シールドを使いました');
    } catch (e) { ctx.toast(e.message); }
  },
  edit: (el, ctx) => openEditor(ctx, el.dataset.q),
  new: (el, ctx) => openEditor(ctx, null),
  newUrgent: (el, ctx) => openUrgentEditor(ctx),
  urgentDone: (el, ctx) => ctx.commit(toggleUrgent(ctx.s, el.dataset.q, ctx.today)),
  urgentDelete: (el, ctx) => {
    if (!confirm('この緊急クエストを削除しますか？')) return;
    ctx.commit(deleteUrgent(ctx.s, el.dataset.q));
  },
};
