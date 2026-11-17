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

/** 今日の表示順: 今日だけの並べ替えがあればそれ、なければ(明日以降も)すべてのクエストの順番 */
function todayOrdered(s, today) {
  const list = s.quests.filter((q) => isScheduled(q, today));
  const o = s.todayOrder;
  if (!o || o.day !== today) return list;
  const rank = new Map(o.ids.map((id, i) => [id, i]));
  const known = list.filter((q) => rank.has(q.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...known, ...list.filter((q) => !rank.has(q.id))]; // 後から増えたものは一番下
}

function moved(arr, from, to) {
  const out = [...arr];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item);
  return out;
}

/** すべてのクエストの並べ替え(順番はずっと保存される。今日だけの並べ替えは上書きされる) */
export function moveQuest(s, id, toIndex) {
  const from = s.quests.findIndex((q) => q.id === id);
  if (from < 0) return s;
  const n = clone(s);
  n.quests = moved(n.quests, from, toIndex);
  delete n.todayOrder;
  return n;
}

/** 今日のクエストだけの並べ替え(今日かぎり。翌日からはすべてのクエストの順番に戻る) */
export function moveToday(s, id, toIndex, today) {
  const ids = todayOrdered(s, today).map((q) => q.id);
  const from = ids.indexOf(id);
  if (from < 0) return s;
  const n = clone(s);
  n.todayOrder = { day: today, ids: moved(ids, from, toIndex) };
  return n;
}

export function todayQuests(s, today) {
  return todayOrdered(s, today)
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

// ---- 昨日の振り返り(「量なし」だけ。量あり・以内は締めで確定済みなので対象外) ----

function reviewable(s, key) {
  return s.quests.filter((q) => q.kind === 'check' && isScheduled(q, key) && !isPaused(q, key));
}

/** 昨日できなかった「量なし」クエスト */
export function yesterdayReview(s, today) {
  const y = addDays(today, -1);
  return reviewable(s, y).filter((q) => s.logs[y]?.done?.[q.id] === undefined);
}

/** 昨日の分としてチェックを付ける(外す)。ペナルティ・リカバリー・シールドには影響しない */
export function toggleYesterday(s, questId, today) {
  const y = addDays(today, -1);
  if (!reviewable(s, y).some((q) => q.id === questId)) throw new Error('昨日の分としてチェックできないクエストです');
  return toggleDone(s, questId, y);
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
  pruneOld(n, today);
  return n;
}

// ---- 緊急クエスト(その日かぎりの1回きりミッション) ----

export function addUrgent(s, fields, today) {
  const name = String(fields.name ?? '').trim();
  if (!name) throw new Error('名前を入れてください');
  if (!XP_SLOTS.includes(Number(fields.xp))) throw new Error('経験値は決められた枠から選んでください');
  const n = clone(s);
  // when: 'tomorrow' なら予約(明日の朝3時から発動)。それ以外は今日
  const day = fields.when === 'tomorrow' ? addDays(today, 1) : today;
  (n.urgent ??= []).push({ id: newId(), name, xp: Number(fields.xp), day });
  return n;
}

/** 今日のまだ終わっていない緊急クエストを、明日に持ち越す(明日の朝3時にまた出る。何回でも可) */
export function postponeUrgent(s, id, today) {
  const u = (s.urgent ?? []).find((x) => x.id === id);
  if (!u || u.day !== today) throw new Error('今日の緊急クエストだけ持ち越せます');
  if (s.logs[today]?.done?.[id] !== undefined) throw new Error('終わった緊急クエストは持ち越せません');
  const n = clone(s);
  n.urgent.find((x) => x.id === id).day = addDays(today, 1);
  return n;
}

/** 明日の予約を、今日の緊急クエストに戻す(持ち越しの押し間違い用) */
export function bringBackUrgent(s, id, today) {
  const u = (s.urgent ?? []).find((x) => x.id === id);
  if (!u || u.day !== addDays(today, 1)) throw new Error('明日の予約だけ今日に戻せます');
  const n = clone(s);
  n.urgent.find((x) => x.id === id).day = today;
  return n;
}

/** 明日に予約してある緊急クエスト(まだ発動していない) */
export function scheduledUrgent(s, today) {
  const tomorrow = addDays(today, 1);
  return (s.urgent ?? []).filter((u) => u.day === tomorrow);
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

/** 1日分の獲得ポイント(クエスト・緊急・リカバリー・週のボーナスすべて) */
function dayXp(l) {
  if (!l) return 0;
  let sum = l.bonus ?? 0;
  for (const v of Object.values(l.done)) sum += v;
  for (const v of Object.values(l.rec)) sum += v;
  return sum;
}

/** 累計経験値 = 30日より前に整理した分 + 残っている日ごとの記録 */
export function totalXp(s) {
  let sum = s.archivedXp ?? 0;
  for (const l of Object.values(s.logs)) sum += dayXp(l);
  return sum;
}

// ---- 日ごとの獲得ポイント(直近30日だけ残す) ----

export const KEEP_DAYS = 30;

/** 30日より前の日ごとの記録を消す。消す前にその経験値を archivedXp に移すので、累計とレベルは変わらない */
function pruneOld(n, today) {
  const cutoff = addDays(today, -(KEEP_DAYS - 1));
  for (const key of Object.keys(n.logs)) {
    if (key >= cutoff) continue;
    n.archivedXp = (n.archivedXp ?? 0) + dayXp(n.logs[key]);
    delete n.logs[key];
  }
  for (const map of [n.misses, n.offers]) {
    for (const key of Object.keys(map)) if (key < cutoff) delete map[key];
  }
}

/** 今日から30日前まで、新しい日から順に {day, xp, partial, drop}。drop は前の日より減った分(なければ null) */
export function dailyPoints(s, today) {
  const cutoff = addDays(today, -(KEEP_DAYS - 1));
  const starts = [today, ...Object.keys(s.logs), ...s.quests.map((q) => q.created), ...(s.urgent ?? []).map((u) => u.day)];
  const first = starts.reduce((a, b) => (b < a ? b : a));
  const from = first > cutoff ? first : cutoff;
  const out = [];
  for (let d = today; d >= from; d = addDays(d, -1)) {
    const xp = dayXp(s.logs[d]);
    const prev = addDays(d, -1);
    const comparable = d !== today && prev >= from;
    const prevXp = dayXp(s.logs[prev]);
    out.push({ day: d, xp, partial: d === today, drop: comparable && xp < prevXp ? prevXp - xp : null });
  }
  return out;
}
