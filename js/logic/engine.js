// ゲームの状態を更新する純粋関数。どの関数も新しい状態を返す(引数は変更しない)。
import { addDays, weekday, weekKey } from './dates.js';
import { XP_SLOTS } from './leveling.js';
import { MAX_STAGE, requiredAmount } from './penalty.js';
import { recoveryXp, pickTask } from './recovery.js';

export const WEEK_BONUS_XP = 20;

const clone = (s) => structuredClone(s);
const log = (s, key) => (s.logs[key] ??= { done: {}, usage: null, rec: {} });
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newState(today) {
  return {
    v: 1,
    quests: [],
    logs: {},
    pen: {},
    offers: {},
    shields: {},
    misses: {},
    urgent: [],
    settledThrough: addDays(today, -1),
    seenLevel: 1,
    view: { pic: 'avatar' },
  };
}

// ---- クエストの登録・編集 ----

function validate(q) {
  if (!q.name || !String(q.name).trim()) throw new Error('名前を入れてください');
  if (!['amount', 'check', 'limit'].includes(q.kind)) throw new Error('種類が不正です');
  if (!XP_SLOTS.includes(q.xp)) throw new Error('経験値は決められた枠から選んでください');
  if (q.kind !== 'check' && !(Number.isFinite(q.base) && q.base > 0)) throw new Error('量を1以上で入れてください');
}

export function addQuest(s, fields, today) {
  const q = {
    id: newId(),
    name: String(fields.name ?? '').trim(),
    kind: fields.kind,
    unit: fields.kind === 'limit' ? '分' : (fields.unit ?? '回'),
    base: fields.kind === 'check' ? 0 : Number(fields.base),
    xp: Number(fields.xp),
    days: [...(fields.days ?? [])],
    paused: [],
    created: today,
  };
  validate(q);
  const n = clone(s);
  n.quests.push(q);
  return n;
}

export function updateQuest(s, id, fields) {
  const n = clone(s);
  const q = n.quests.find((x) => x.id === id);
  if (!q) throw new Error('クエストが見つかりません');
  Object.assign(q, fields);
  if (q.kind === 'check') q.base = 0;
  if (q.kind === 'limit') q.unit = '分';
  validate(q);
  return n;
}

export function deleteQuest(s, id) {
  const n = clone(s);
  n.quests = n.quests.filter((q) => q.id !== id);
  delete n.pen[id];
  return n;
}

// ---- 1日の判定 ----

export function isScheduled(q, key) {
  if (key < q.created) return false;
  return q.days.length === 0 || q.days.includes(weekday(key));
}

export function isPaused(q, key) {
  return q.paused.some((r) => r.from <= key && (r.to === null || key <= r.to));
}

export function isPausedNow(q) {
  return q.paused.some((r) => r.to === null);
}

export function todayQuests(s, today) {
  return s.quests
    .filter((q) => isScheduled(q, today))
    .map((q) => {
      const stage = q.kind === 'amount' ? (s.pen[q.id] ?? 0) : 0;
      return {
        quest: q,
        stage,
        required: q.kind === 'amount' ? requiredAmount(q.base, stage) : q.base,
        done: s.logs[today]?.done?.[q.id] !== undefined,
        paused: isPausedNow(q),
      };
    });
}

export function toggleDone(s, questId, today) {
  const q = s.quests.find((x) => x.id === questId);
  if (!q || q.kind === 'limit') return s;
  const n = clone(s);
  const l = log(n, today);
  if (l.done[questId] !== undefined) delete l.done[questId];
  else l.done[questId] = q.xp; // 付けた時点のXPを記録
  return n;
}

export function setPaused(s, questId, paused, today) {
  const n = clone(s);
  const q = n.quests.find((x) => x.id === questId);
  if (!q) return s;
  const open = q.paused.find((r) => r.to === null);
  if (paused && !open) q.paused.push({ from: today, to: null });
  if (!paused && open) open.to = today; // オンに戻した日も休み扱い
  return n;
}

// ---- 締め処理 ----

function weekHasActivity(s, sunday) {
  for (let i = 0; i < 7; i++) {
    const l = s.logs[addDays(sunday, -i)];
    if (!l) continue;
    if (Object.keys(l.done).length || Object.keys(l.rec).length || l.usage !== null) return true;
  }
  return false;
}

/** settledThrough の翌日から today の前日まで、1日ずつ締める */
export function settle(s, today, rand = Math.random) {
  let d = addDays(s.settledThrough, 1);
  if (d >= today) return s;
  const n = clone(s);
  for (; d < today; d = addDays(d, 1)) {
    for (const q of n.quests) {
      if (q.kind !== 'amount' || !isScheduled(q, d) || isPaused(q, d)) continue;
      if (n.logs[d]?.done?.[q.id] !== undefined) {
        n.pen[q.id] = 0;
      } else {
        n.pen[q.id] = Math.min((n.pen[q.id] ?? 0) + 1, MAX_STAGE);
        (n.misses[d] ??= []).push(q.id);
        (n.offers[addDays(d, 1)] ??= []).push({
          questId: q.id, xp: recoveryXp(q.xp), task: pickTask(rand), status: 'pending',
        });
      }
    }
    if (weekday(d) === 0 && !n.shields[weekKey(d)]?.used && weekHasActivity(n, d)) {
      log(n, d).bonus = WEEK_BONUS_XP;
    }
    // 緊急クエストは、追加した日が終わる(朝3時)と消える。得た経験値はlogsに残る
    if (n.urgent) n.urgent = n.urgent.filter((u) => u.day > d);
    n.settledThrough = d;
  }
  return n;
}

// ---- 緊急クエスト(その日かぎりの1回きりミッション) ----

export function addUrgent(s, fields, today) {
  const name = String(fields.name ?? '').trim();
  if (!name) throw new Error('名前を入れてください');
  if (!XP_SLOTS.includes(Number(fields.xp))) throw new Error('経験値は決められた枠から選んでください');
  const n = clone(s);
  (n.urgent ??= []).push({ id: newId(), name, xp: Number(fields.xp), day: today });
  return n;
}

export function deleteUrgent(s, id) {
  const n = clone(s);
  n.urgent = (n.urgent ?? []).filter((u) => u.id !== id);
  return n;
}

export function todayUrgent(s, today) {
  return (s.urgent ?? [])
    .filter((u) => u.day === today)
    .map((u) => ({ urgent: u, done: s.logs[today]?.done?.[u.id] !== undefined }));
}

export function toggleUrgent(s, id, today) {
  const u = (s.urgent ?? []).find((x) => x.id === id);
  if (!u || u.day !== today) throw new Error('この緊急クエストは今日のものではありません');
  const n = clone(s);
  const l = log(n, today);
  if (l.done[id] !== undefined) delete l.done[id];
  else l.done[id] = u.xp;
  return n;
}

// ---- お休みシールド ----

export function shieldAvailable(s, today) {
  return !s.shields[weekKey(today)]?.used;
}

export function missedYesterday(s, today) {
  return [...(s.misses[addDays(today, -1)] ?? [])];
}

export function useShield(s, questId, today) {
  const y = addDays(today, -1);
  if (!shieldAvailable(s, today)) throw new Error('今週のシールドは使用済みです');
  if (!(s.misses[y] ?? []).includes(questId)) throw new Error('昨日逃したクエストにだけ使えます');
  const n = clone(s);
  n.pen[questId] = Math.max(0, (n.pen[questId] ?? 0) - 1);
  n.misses[y] = n.misses[y].filter((id) => id !== questId);
  if (n.offers[today]) n.offers[today] = n.offers[today].filter((o) => o.questId !== questId);
  n.shields[weekKey(today)] = { used: true, questId, day: y };
  return n;
}

// ---- リカバリークエスト ----

export function answerOffer(s, questId, today, answer) {
  const n = clone(s);
  const o = (n.offers[today] ?? []).find((x) => x.questId === questId);
  if (!o || o.status !== 'pending') return s;
  o.status = answer === 'accept' ? 'accepted' : 'rejected';
  return n;
}

export function completeOffer(s, questId, today) {
  const n = clone(s);
  const o = (n.offers[today] ?? []).find((x) => x.questId === questId);
  if (!o || o.status !== 'accepted') throw new Error('承認したリカバリークエストだけ完了できます');
  o.status = 'done';
  log(n, today).rec[questId] = o.xp;
  return n;
}

// ---- スマホ使用時間 ----

/** 昨日の使用時間(分)を記録し、「以内」クエストを判定する */
export function setUsage(s, minutes, today) {
  const y = addDays(today, -1);
  const n = clone(s);
  const l = log(n, y);
  l.usage = minutes;
  for (const q of n.quests) {
    if (q.kind !== 'limit' || !isScheduled(q, y) || isPaused(q, y)) continue;
    if (minutes !== null && minutes <= q.base) l.done[q.id] = q.xp;
    else delete l.done[q.id];
  }
  return n;
}

// ---- 経験値 ----

export function totalXp(s) {
  let sum = 0;
  for (const l of Object.values(s.logs)) {
    for (const v of Object.values(l.done)) sum += v;
    for (const v of Object.values(l.rec)) sum += v;
    sum += l.bonus ?? 0;
  }
  return sum;
}
