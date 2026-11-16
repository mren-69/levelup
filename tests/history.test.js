import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, addQuest, toggleDone, settle, totalXp, dailyPoints, addUrgent, toggleUrgent, toggleYesterday, KEEP_DAYS,
} from '../js/logic/engine.js';
import { levelInfo } from '../js/logic/leveling.js';

const D1 = '2026-11-02'; // 月曜
const day = (n) => {
  const d = new Date(2026, 10, 2 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const r0 = () => 0;

function twoQuests(start = D1) {
  let s = newState(start);
  s = addQuest(s, { name: '就寝', kind: 'check', base: 0, xp: 20, days: [] }, start);
  s = addQuest(s, { name: '腕立て', kind: 'amount', unit: '回', base: 5, xp: 5, days: [] }, start);
  return s;
}
const ids = (s) => s.quests.map((q) => q.id);

test('残すのは30日分', () => {
  assert.equal(KEEP_DAYS, 30);
});

test('日ごとの合計を、新しい日から順に出す。今日は「途中」', () => {
  let s = twoQuests();
  const [a, b] = ids(s);
  s = toggleDone(s, a, D1); s = toggleDone(s, b, D1);          // 25
  s = settle(s, day(1), r0); s = toggleDone(s, a, day(1));     // 20
  s = settle(s, day(2), r0); s = toggleDone(s, b, day(2));     // 今日 6回(×1.25) でも XPは5
  const list = dailyPoints(s, day(2));
  assert.deepEqual(list.map((d) => [d.day, d.xp, d.partial]), [
    [day(2), 5, true], [day(1), 20, false], [D1, 25, false],
  ]);
});

test('前の日より減った日には、減った分が付く(今日・増えた日・同じ日には付かない)', () => {
  let s = twoQuests();
  const [a, b] = ids(s);
  s = toggleDone(s, a, D1); s = toggleDone(s, b, D1);          // 25
  s = settle(s, day(1), r0); s = toggleDone(s, a, day(1));     // 20 → -5
  s = settle(s, day(2), r0); s = toggleDone(s, a, day(2));     // 20 → 同じ
  s = toggleDone(s, b, day(2));                                // 25 → 増えた
  s = settle(s, day(3), r0);                                   // 今日 0(途中)
  const m = Object.fromEntries(dailyPoints(s, day(3)).map((d) => [d.day, d.drop]));
  assert.equal(m[day(1)], 5);
  assert.equal(m[day(2)], null);
  assert.equal(m[D1], null);   // それより前の記録がない
  assert.equal(m[day(3)], null); // 今日は途中なので付けない
});

test('何もしなかった日は 0 として出て、減った印も付く', () => {
  let s = twoQuests();
  s = toggleDone(s, ids(s)[0], D1);
  s = settle(s, day(2), r0);
  const list = dailyPoints(s, day(2));
  assert.deepEqual(list.map((d) => [d.day, d.xp, d.drop]), [[day(2), 0, null], [day(1), 0, 20], [D1, 20, null]]);
});

test('使い始める前の日は出さない', () => {
  const s = twoQuests(day(5));
  assert.deepEqual(dailyPoints(s, day(5)).map((d) => d.day), [day(5)]);
});

test('ボーナス・リカバリー・緊急・昨日の分のチェックも、その日の合計に入る', () => {
  let s = twoQuests();
  const [a] = ids(s);
  s = addUrgent(s, { name: 'お使い', xp: 10 }, D1);
  s = toggleUrgent(s, s.urgent[0].id, D1);          // D1 +10
  s = settle(s, day(1), r0);
  s = toggleYesterday(s, a, day(1));                // D1 +20(昨日の分)
  s.logs[day(1)] = { done: {}, usage: null, rec: { x: 1 }, bonus: 20 }; // リカバリー1 + ボーナス20
  const m = Object.fromEntries(dailyPoints(s, day(1)).map((d) => [d.day, d.xp]));
  assert.equal(m[D1], 30);
  assert.equal(m[day(1)], 21);
});

test('30日より前の記録は消えるが、経験値とレベルはそのまま', () => {
  let s = twoQuests();
  const [a] = ids(s);
  for (let i = 0; i < 40; i++) {
    s = settle(s, day(i), r0);
    s = toggleDone(s, a, day(i));
  }
  const before = totalXp(s);       // 40日 × 20 + 週のボーナス
  const lvBefore = levelInfo(before).level;
  s = settle(s, day(40), r0);      // day(39) は金曜なのでボーナスは増えない
  assert.equal(totalXp(s), before);
  assert.equal(levelInfo(totalXp(s)).level, lvBefore);
  const keys = Object.keys(s.logs).sort();
  assert.ok(keys[0] >= day(40 - (KEEP_DAYS - 1)));
  assert.equal(dailyPoints(s, day(40)).length, KEEP_DAYS);
});

test('消しても累計の経験値は1も減らない(ボーナスなしで厳密に)', () => {
  let s = newState(D1);
  s.logs[D1] = { done: { a: 45 }, usage: null, rec: { b: 3 }, bonus: 20 };
  s.logs[day(1)] = { done: { a: 10 }, usage: 120, rec: {} };
  s.shields[D1] = { used: true }; // この週のボーナスが途中で入らないように
  const before = totalXp(s);
  s = settle(s, day(31), r0);
  assert.equal(totalXp(s), before);
  assert.equal(s.logs[D1], undefined);
  assert.equal(s.logs[day(1)], undefined);
  assert.equal(s.archivedXp, 78);
});

test('一番古い日(30日目)には、減った印を付けない(比べる前日の記録がない)', () => {
  let s = twoQuests();
  for (let i = 0; i < 35; i++) { s = settle(s, day(i), r0); s = toggleDone(s, ids(s)[0], day(i)); }
  const list = dailyPoints(s, day(34));
  assert.equal(list.length, 30);
  assert.equal(list.at(-1).drop, null);
});
