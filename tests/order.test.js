import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, addQuest, moveQuest, moveToday, todayQuests, deleteQuest, setPaused, settle } from '../js/logic/engine.js';

const D1 = '2026-11-02'; // 月曜
const day = (n) => {
  const d = new Date(2026, 10, 2 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function withThree() {
  let s = newState(D1);
  for (const name of ['A', 'B', 'C']) {
    s = addQuest(s, { name, kind: 'check', base: 0, xp: 5, days: [] }, D1);
  }
  return s;
}
const names = (s) => s.quests.map((q) => q.name).join('');
const todayNames = (s, d) => todayQuests(s, d).map((t) => t.quest.name).join('');
const idOf = (s, name) => s.quests.find((q) => q.name === name).id;

test('新しいクエストは一番下に入る', () => {
  assert.equal(names(withThree()), 'ABC');
});

test('すべてのクエストの並べ替え: 先頭を末尾へ', () => {
  const s = withThree();
  assert.equal(names(moveQuest(s, idOf(s, 'A'), 2)), 'BCA');
});

test('すべてのクエストの並べ替え: 末尾を先頭へ', () => {
  const s = withThree();
  assert.equal(names(moveQuest(s, idOf(s, 'C'), 0)), 'CAB');
});

test('同じ位置へ動かしても変わらない', () => {
  const s = withThree();
  assert.equal(names(moveQuest(s, idOf(s, 'B'), 1)), 'ABC');
});

test('範囲外の位置は両端に丸める', () => {
  const s = withThree();
  assert.equal(names(moveQuest(s, idOf(s, 'A'), 99)), 'BCA');
  assert.equal(names(moveQuest(s, idOf(s, 'C'), -5)), 'CAB');
});

test('すべてのクエストの順番は、翌日になっても保たれる', () => {
  let s = withThree();
  s = moveQuest(s, idOf(s, 'C'), 0);
  s = settle(s, day(3));
  assert.equal(names(s), 'CAB');
  assert.equal(todayNames(s, day(3)), 'CAB');
});

test('今日のクエストは、最初はすべてのクエストの順番に従う', () => {
  let s = withThree();
  s = moveQuest(s, idOf(s, 'B'), 0);
  assert.equal(todayNames(s, D1), 'BAC');
});

test('今日のクエストを並べ替えても、すべてのクエストは変わらない', () => {
  let s = withThree();
  s = moveToday(s, idOf(s, 'C'), 0, D1);
  assert.equal(todayNames(s, D1), 'CAB');
  assert.equal(names(s), 'ABC');
});

test('今日の並べ替えは翌日には残らず、すべてのクエストの順番に戻る', () => {
  let s = withThree();
  s = moveToday(s, idOf(s, 'C'), 0, D1);
  assert.equal(todayNames(s, day(1)), 'ABC');
});

test('すべてのクエストを並べ替えると、今日の並べ替えは上書きされる', () => {
  let s = withThree();
  s = moveToday(s, idOf(s, 'C'), 0, D1);
  s = moveQuest(s, idOf(s, 'B'), 2);
  assert.equal(names(s), 'ACB');
  assert.equal(todayNames(s, D1), 'ACB');
});

test('今日の並べ替えのあとに追加したクエストは、今日の一番下に出る', () => {
  let s = withThree();
  s = moveToday(s, idOf(s, 'C'), 0, D1);
  s = addQuest(s, { name: 'D', kind: 'check', base: 0, xp: 5, days: [] }, D1);
  assert.equal(todayNames(s, D1), 'CABD');
});

test('今日の並べ替えのあとにクエストを消しても壊れない', () => {
  let s = withThree();
  s = moveToday(s, idOf(s, 'C'), 0, D1);
  s = deleteQuest(s, idOf(s, 'A'));
  assert.equal(todayNames(s, D1), 'CB');
});

test('今日の位置は、今日表示されているクエストの中での位置', () => {
  let s = newState(D1);
  s = addQuest(s, { name: 'A', kind: 'check', base: 0, xp: 5, days: [] }, D1);
  s = addQuest(s, { name: 'X', kind: 'check', base: 0, xp: 5, days: [2] }, D1); // 火曜だけ
  s = addQuest(s, { name: 'B', kind: 'check', base: 0, xp: 5, days: [] }, D1);
  s = addQuest(s, { name: 'C', kind: 'check', base: 0, xp: 5, days: [] }, D1);
  assert.equal(todayNames(s, D1), 'ABC');
  s = moveToday(s, idOf(s, 'C'), 1, D1);
  assert.equal(todayNames(s, D1), 'ACB');
});

test('お休み中のクエストも並べ替えられる', () => {
  let s = withThree();
  s = setPaused(s, idOf(s, 'A'), true, D1);
  s = moveToday(s, idOf(s, 'A'), 2, D1);
  assert.equal(todayNames(s, D1), 'BCA');
});

test('存在しないIDを動かしても何も起きない', () => {
  const s = withThree();
  assert.equal(names(moveQuest(s, 'nope', 0)), 'ABC');
  assert.equal(todayNames(moveToday(s, 'nope', 0, D1), D1), 'ABC');
});

test('以前の保存データ(todayOrderなし)でも動く', () => {
  const s = withThree();
  delete s.todayOrder;
  assert.equal(todayNames(s, D1), 'ABC');
  assert.equal(todayNames(moveToday(s, idOf(s, 'C'), 0, D1), D1), 'CAB');
});
