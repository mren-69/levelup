import { dayKey } from './logic/dates.js';
import { levelInfo } from './logic/leveling.js';
import { newState, settle, totalXp } from './logic/engine.js';
import { loadState, saveState, getImageURL, requestPersist } from './store.js';
import * as home from './ui/home.js';
import * as quests from './ui/quests.js';
import * as record from './ui/record.js';
import * as settings from './ui/settings.js';
import { initEditor } from './ui/editor.js';
import { showLevelUp, toast } from './ui/fx.js';

const VIEWS = { home, quests, record, settings };
const ACTIONS = { ...home.actions, ...quests.actions, ...record.actions, ...settings.actions };

const root = document.getElementById('view');
let tab = 'home';
let today = dayKey();
let s = loadState() ?? newState(today);
const pics = { avatar: null, photo: null };

const ctx = {
  get s() { return s; },
  get today() { return today; },
  pics,
  commit(next) {
    s = next;
    checkLevelUp();
    saveState(s);
    render();
  },
  replace(next) {
    s = settle(next, today);
    s = { ...s, seenLevel: levelInfo(totalXp(s)).level };
    saveState(s);
    render();
  },
  go(t) { tab = t; render(); window.scrollTo(0, 0); },
  toast,
  render: () => render(),
  async reloadPics() {
    pics.avatar = await getImageURL('avatar');
    pics.photo = await getImageURL('photo');
  },
};

function checkLevelUp() {
  const now = levelInfo(totalXp(s)).level;
  if (now > s.seenLevel) {
    showLevelUp(s.seenLevel, now);
    s = { ...s, seenLevel: now };
  }
}

function render() {
  root.innerHTML = VIEWS[tab].view(ctx);
  if (tab === 'settings') settings.bindFiles(root, ctx);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
}

/** 日付が変わっていたら締める(朝3:00区切り) */
function tick() {
  const now = dayKey();
  if (now === today) return;
  today = now;
  s = settle(s, today);
  saveState(s);
  render();
}

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) await fn(el, ctx);
});
document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) ctx.go(b.dataset.tab);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
setInterval(tick, 60_000);

async function start() {
  initEditor();
  s = settle(s, today);
  saveState(s);
  await ctx.reloadPics();
  render();
  requestPersist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
start();
