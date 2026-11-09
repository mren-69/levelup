import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, addUrgent, deleteUrgent, toggleUrgent, todayUrgent, settle, totalXp, addQuest, todayQuests,
} from '../js/logic/engine.js';

const D1 = '2026-11-02';
const day = (n) => {
  const d = new Date(2026, 10, 2 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const r0 = () => 0;

test('緊急クエストを追加すると、今日のぶんに出る', () => {
  let s = newState(D1);
  s = addUrgent(s, { name: 'お風呂掃除', xp: 20 }, D1);
  const list = todayUrgent(s, D1);
  assert.equal(list.length, 1);
  assert.equal(list[0].urgent.name, 'お風呂掃除');
  assert.equal(list[0].urgent.xp, 20);
  assert.equal(list[0].done, false);
});

test('経験値の枠にない値と空の名前は登録できない', () => {
  const s = newState(D1);
  assert.throws(() => addUrgent(s, { name: 'x', xp: 7 }, D1));
  assert.throws(() => addUrgent(s, { name: '  ', xp: 20 }, D1));
});

test('チェックで経験値が入り、外すと戻る', () => {
  let s = addUrgent(newState(D1), { name: 'お使い', xp: 15 }, D1);
  const id = s.urgent[0].id;
  s = toggleUrgent(s, id, D1);
  assert.equal(totalXp(s), 15);
  assert.equal(todayUrgent(s, D1)[0].done, true);
  s = toggleUrgent(s, id, D1);
  assert.equal(totalXp(s), 0);
});

test('1日にいくつでも追加できる', () => {
  let s = newState(D1);
  s = addUrgent(s, { name: 'A', xp: 5 }, D1);
  s = addUrgent(s, { name: 'B', xp: 10 }, D1);
  s = addUrgent(s, { name: 'C', xp: 30 }, D1);
  assert.equal(todayUrgent(s, D1).length, 3);
});

test('日が変わると(朝3時の締め)、できなかった緊急クエストは消える', () => {
  let s = addUrgent(newState(D1), { name: 'お使い', xp: 15 }, D1);
  s = settle(s, day(1), r0);
  assert.equal(todayUrgent(s, day(1)).length, 0);
  assert.equal(s.urgent.length, 0);
  assert.equal(totalXp(s), 0);
});

test('できなかった緊急クエストは、ペナルティもリカバリーも出さない', () => {
  let s = addUrgent(newState(D1), { name: 'お使い', xp: 15 }, D1);
  s = settle(s, day(1), r0);
  assert.equal(s.offers[day(1)], undefined);
  assert.equal(s.misses[D1], undefined);
});

test('できた緊急クエストの経験値は、消えたあとも残る', () => {
  let s = addUrgent(newState(D1), { name: 'お使い', xp: 15 }, D1);
  s = toggleUrgent(s, s.urgent[0].id, D1);
  s = settle(s, day(1), r0);
  assert.equal(s.urgent.length, 0);
  assert.equal(totalXp(s), 15);
});

test('何日も開かなくても、古い緊急クエストはまとめて消える', () => {
  let s = addUrgent(newState(D1), { name: 'A', xp: 5 }, D1);
  s = settle(s, day(10), r0);
  assert.equal(s.urgent.length, 0);
});

test('今日追加したものは、同じ日の締めでは消えない', () => {
  let s = newState(day(3));
  s = addUrgent(s, { name: '今日の分', xp: 10 }, day(3));
  s = settle(s, day(3), r0);
  assert.equal(todayUrgent(s, day(3)).length, 1);
});

test('削除できる。できたあとに削除しても経験値は残る', () => {
  let s = addUrgent(newState(D1), { name: 'A', xp: 10 }, D1);
  s = deleteUrgent(s, s.urgent[0].id);
  assert.equal(s.urgent.length, 0);
  s = addUrgent(s, { name: 'B', xp: 20 }, D1);
  s = toggleUrgent(s, s.urgent[0].id, D1);
  s = deleteUrgent(s, s.urgent[0].id);
  assert.equal(totalXp(s), 20);
});

test('前の日の緊急クエストは、今日のチェックでは動かせない', () => {
  let s = addUrgent(newState(D1), { name: 'A', xp: 10 }, D1);
  const id = s.urgent[0].id;
  assert.throws(() => toggleUrgent(s, id, day(1)));
});

test('緊急クエストは、普通のクエストの倍率や数に影響しない', () => {
  let s = newState(D1);
  s = addQuest(s, { name: '腕立て', kind: 'amount', unit: '回', base: 5, xp: 5, days: [] }, D1);
  s = addUrgent(s, { name: 'お使い', xp: 15 }, D1);
  s = settle(s, day(1), r0);
  assert.equal(todayQuests(s, day(1)).length, 1);
});

test('以前の保存データ(urgentなし)でも動く', () => {
  const old = newState(D1);
  delete old.urgent;
  assert.deepEqual(todayUrgent(old, D1), []);
  const s = addUrgent(old, { name: 'A', xp: 5 }, D1);
  assert.equal(s.urgent.length, 1);
  assert.doesNotThrow(() => settle(old, day(2), r0));
});

// ---- 明日の予約 ----
import { scheduledUrgent } from '../js/logic/engine.js';

test('明日の予約: 今日のクエストには出ず、予約の欄に出る', () => {
  let s = addUrgent(newState(D1), { name: '病院', xp: 30, when: 'tomorrow' }, D1);
  assert.equal(todayUrgent(s, D1).length, 0);
  const list = scheduledUrgent(s, D1);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, '病院');
  assert.equal(list[0].day, day(1));
});

test('明日の予約: 今日のうちはチェックできず、経験値も入らない', () => {
  let s = addUrgent(newState(D1), { name: '病院', xp: 30, when: 'tomorrow' }, D1);
  assert.throws(() => toggleUrgent(s, s.urgent[0].id, D1));
  assert.equal(totalXp(s), 0);
});

test('明日の予約: 今日の締めでは消えず、日が変わると緊急クエストとして出る', () => {
  let s = addUrgent(newState(D1), { name: '病院', xp: 30, when: 'tomorrow' }, D1);
  s = settle(s, D1, r0);
  assert.equal(scheduledUrgent(s, D1).length, 1);
  s = settle(s, day(1), r0);
  assert.equal(todayUrgent(s, day(1)).length, 1);
  assert.equal(scheduledUrgent(s, day(1)).length, 0);
  s = toggleUrgent(s, s.urgent[0].id, day(1));
  assert.equal(totalXp(s), 30);
});

test('明日の予約: そのまま日が変わって、さらにその翌日になると消える', () => {
  let s = addUrgent(newState(D1), { name: '病院', xp: 30, when: 'tomorrow' }, D1);
  s = settle(s, day(2), r0);
  assert.equal(s.urgent.length, 0);
  assert.equal(totalXp(s), 0);
});

test('明日の予約: 削除できる', () => {
  let s = addUrgent(newState(D1), { name: '病院', xp: 30, when: 'tomorrow' }, D1);
  s = deleteUrgent(s, s.urgent[0].id);
  assert.equal(scheduledUrgent(s, D1).length, 0);
});

test('明日の予約と今日の緊急クエストは同時に持てる', () => {
  let s = newState(D1);
  s = addUrgent(s, { name: '今日', xp: 5 }, D1);
  s = addUrgent(s, { name: '明日', xp: 10, when: 'tomorrow' }, D1);
  assert.equal(todayUrgent(s, D1).length, 1);
  assert.equal(scheduledUrgent(s, D1).length, 1);
});

test('以前の保存データ(urgentなし)でも予約の一覧が空で動く', () => {
  const old = newState(D1);
  delete old.urgent;
  assert.deepEqual(scheduledUrgent(old, D1), []);
});
