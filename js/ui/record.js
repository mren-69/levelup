import { addDays } from '../logic/dates.js';
import { setUsage, isScheduled, isPaused } from '../logic/engine.js';
import { esc, fmtDate, fmtMinutes } from './util.js';

export function view(ctx) {
  const { s, today } = ctx;
  const y = addDays(today, -1);
  const usage = s.logs[y]?.usage ?? null;
  const limits = s.quests.filter((q) => q.kind === 'limit' && isScheduled(q, y) && !isPaused(q, y));
  const h = usage === null ? '' : Math.floor(usage / 60);
  const m = usage === null ? '' : usage % 60;

  const results = usage === null ? '' : limits.map((q) => {
    const ok = usage <= q.base;
    return `<div class="win card"><span>${esc(q.name)}（${fmtMinutes(q.base)}以内）</span>
      <b>${ok ? `達成 +${q.xp} XP` : '<span class="ng">未達成</span>'}</b></div>`;
  }).join('');

  return `
  <h2>昨日のスマホ使用時間</h2>
  <p class="note">${fmtDate(y)}の分です。iPhoneの「設定 → スクリーンタイム」の数字を入れてください。YouTubeの流しっぱなしなど、数えたくない分は引いてOK。</p>
  <div class="win usage">
    <div class="inputs">
      <input type="number" inputmode="numeric" min="0" max="24" id="u-h" value="${h}" placeholder="0"><span>時間</span>
      <input type="number" inputmode="numeric" min="0" max="59" id="u-m" value="${m}" placeholder="0"><span>分</span>
    </div>
    <button class="btn" data-act="usage">記録する</button>
    ${usage !== null ? `<p class="note" style="margin-top:12px">記録済み：${fmtMinutes(usage)}（入れ直すと上書きされます）</p>` : ''}
  </div>
  ${limits.length ? `<h2>判定</h2>${results || '<div class="empty">記録すると、ここに結果が出ます</div>'}` : '<p class="note">「〜以内」のクエストを作ると、ここで自動で判定されます。</p>'}`;
}

export const actions = {
  usage: (el, ctx) => {
    const h = parseInt(document.getElementById('u-h').value, 10) || 0;
    const m = parseInt(document.getElementById('u-m').value, 10) || 0;
    if (h < 0 || m < 0 || m > 59 || h > 24 || h * 60 + m > 1440) {
      ctx.toast('時間は0〜24時間、分は0〜59で入れてください');
      return;
    }
    ctx.commit(setUsage(ctx.s, h * 60 + m, ctx.today));
    ctx.toast('記録しました');
  },
};
