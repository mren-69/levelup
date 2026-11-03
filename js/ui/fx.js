import { roleFor } from '../logic/leveling.js';
import { esc } from './util.js';

/** レベルアップ演出。役職が変わったら一緒に知らせる */
export function showLevelUp(from, to) {
  const el = document.getElementById('fx');
  const oldRole = roleFor(from);
  const newRole = roleFor(to);
  el.innerHTML = `
    <div class="big">LEVEL UP</div>
    <div class="lvnum">${to}</div>
    ${oldRole !== newRole ? `<div class="rolechg">役職昇格<b>${esc(newRole)}</b></div>` : ''}
    <div class="tap">タップで閉じる</div>`;
  el.hidden = false;
  el.onclick = () => { el.hidden = true; };
}

let timer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { el.hidden = true; }, 2200);
}
