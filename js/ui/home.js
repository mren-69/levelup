import { levelInfo, roleFor } from '../logic/leveling.js';
import { totalXp, todayQuests, shieldAvailable, missedYesterday, todayUrgent } from '../logic/engine.js';
import { addDays } from '../logic/dates.js';
import { MULTS } from '../logic/penalty.js';
import { esc, SILHOUETTE } from './util.js';

function segs(into, need) {
  const n = 10;
  const ratio = into / need;
  let out = '';
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, Math.max(0, ratio * n - i));
    if (f >= 1) out += '<i class="on"></i>';
    else if (f > 0) out += `<i class="part" style="--p:${Math.round(f * 100)}%"></i>`;
    else out += '<i></i>';
  }
  return out;
}

export function view(ctx) {
  const { s, today, pics } = ctx;
  const info = levelInfo(totalXp(s));
  const pic = s.view.pic === 'photo' && pics.photo ? `<img src="${pics.photo}" alt="">`
    : pics.avatar && s.view.pic !== 'photo' ? `<img src="${pics.avatar}" alt="">` : SILHOUETTE;

  const list = todayQuests(s, today).filter((t) => !t.paused);
  const checkable = list.filter((t) => t.quest.kind !== 'limit');
  const penalized = list.filter((t) => t.stage > 0);
  const offers = (s.offers[today] ?? []).filter((o) => o.status === 'pending' || o.status === 'accepted');
  const missed = missedYesterday(s, today);
  const usageMissing = (s.logs[addDays(today, -1)]?.usage ?? null) === null;

  const urgent = todayUrgent(s, today);
  const urgentLeft = urgent.filter((t) => !t.done).length;

  let cards = '';
  if (urgent.length) {
    cards += `<div class="win card emergency link" data-act="go" data-tab="quests"><span><span class="tag">EMERGENCY</span>緊急クエスト</span><b>${urgentLeft ? `あと${urgentLeft}件` : '全部完了'}</b></div>`;
  }
  cards += `<div class="win card"><span>お休みシールド</span><b style="color:var(--accent)">今週 ${shieldAvailable(s, today) ? 1 : 0} / 1</b></div>`;
  if (penalized.length) {
    cards += `<div class="win card warn link" data-act="go" data-tab="quests"><span>ペナルティ中：${penalized.map((t) => esc(t.quest.name)).join('、')}</span><b>×${maxMult(penalized)}</b></div>`;
  }
  if (offers.length) cards += `<div class="win card link" data-act="go" data-tab="quests" style="border-color:var(--violet)"><span>リカバリークエストが届いています</span><b style="color:#c9b6ff">${offers.length}件</b></div>`;
  if (missed.length && shieldAvailable(s, today)) cards += `<div class="win card link" data-act="go" data-tab="quests"><span>昨日の未達成にシールドを使えます</span><b style="color:var(--accent)">${missed.length}件</b></div>`;
  cards += `<div class="win card link" data-act="go" data-tab="quests"><span>今日のクエスト</span><b>${checkable.filter((t) => t.done).length} / ${checkable.length} 完了</b></div>`;
  cards += `<div class="win card link" data-act="go" data-tab="record"><span>使用時間（昨日）</span><b${usageMissing ? ' style="color:#ff8a82"' : ''}>${usageMissing ? '未入力' : '記入済み'}</b></div>`;

  return `
  <div class="win status">
    <div class="left">
      <div class="role">${esc(roleFor(info.level))}</div>
      <div class="lvlabel">LV</div>
      <div class="lv">${info.level}</div>
      <div class="segs">${segs(info.into, info.need)}</div>
      <div class="xptext">あと ${info.remaining} XPでレベル${info.level + 1}へ</div>
    </div>
    <div class="pic">${pic}</div>
  </div>
  <div class="picswitch">
    <button data-act="pic" data-pic="avatar" class="${s.view.pic !== 'photo' ? 'on' : ''}">アバター</button>
    <button data-act="pic" data-pic="photo" class="${s.view.pic === 'photo' ? 'on' : ''}">写真</button>
  </div>
  ${cards}`;
}

function maxMult(list) {
  return Math.max(...list.map((t) => MULTS[t.stage]));
}

export const actions = {
  go: (el, ctx) => ctx.go(el.dataset.tab),
  pic: (el, ctx) => {
    const p = el.dataset.pic;
    if (p === 'photo' && !ctx.pics.photo) {
      ctx.toast('写真がまだありません。設定タブで登録してください');
      return;
    }
    ctx.commit({ ...ctx.s, view: { ...ctx.s.view, pic: p } });
  },
};
