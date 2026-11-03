import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, addQuest, updateQuest, deleteQuest, todayQuests, toggleDone, setPaused, settle,
  useShield, shieldAvailable, missedYesterday, answerOffer, completeOffer, setUsage, totalXp,
} from '../js/logic/engine.js';

const D1 = '2026-11-02'; // 月曜
const day = (n) => {
  const d = new Date(2026, 10, 2 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const r0 = () => 0;

function withPushups() {
  let s = newState(D1);
  s = addQuest(s, { name: '腕立て', kind: 'amount', unit: '回', base: 5, xp: 5, days: [] }, D1);
  return [s, s.quests[0].id];
}
const req = (s, id, today) => todayQuests(s, today).find((t) => t.quest.id === id).required;

test('新しい状態は前日まで締め済み', () => {
  const s = newState(D1);
  assert.equal(s.settledThrough, day(-1));
  assert.equal(totalXp(s), 0);
});

test('経験値の枠にない値は登録できない', () => {
  const s = newState(D1);
  assert.throws(() => addQuest(s, { name: 'x', kind: 'check', base: 0, xp: 7, days: [] }, D1));
});

test('未達成の翌日は×1.25、続けて逃すと×1.5で止まる', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  assert.equal(req(s, id, day(1)), 6);
  assert.equal(s.offers[day(1)].length, 1);
  assert.equal(s.offers[day(1)][0].status, 'pending');
  assert.equal(s.offers[day(1)][0].xp, 1);
  s = settle(s, day(2), r0);
  assert.equal(req(s, id, day(2)), 8);
  s = settle(s, day(3), r0);
  assert.equal(req(s, id, day(3)), 8);
});

test('増えた量をこなせば、次の日から元に戻る', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  s = toggleDone(s, id, day(1));
  s = settle(s, day(2), r0);
  assert.equal(req(s, id, day(2)), 5);
  assert.equal(s.offers[day(2)], undefined);
});

test('何日も開かなくても倍率は1.5で止まる', () => {
  let [s, id] = withPushups();
  s = settle(s, day(10), r0);
  assert.equal(req(s, id, day(10)), 8);
  assert.equal(s.settledThrough, day(9));
});

test('チェックを付けて外すとXPは元に戻る', () => {
  let [s, id] = withPushups();
  s = toggleDone(s, id, D1);
  assert.equal(totalXp(s), 5);
  s = toggleDone(s, id, D1);
  assert.equal(totalXp(s), 0);
});

test('あとで経験値の枠を変えても、得たXPは変わらない', () => {
  let [s, id] = withPushups();
  s = toggleDone(s, id, D1);
  s = updateQuest(s, id, { xp: 45 });
  assert.equal(totalXp(s), 5);
});

test('クエストを消しても、得たXPは残る', () => {
  let [s, id] = withPushups();
  s = toggleDone(s, id, D1);
  s = deleteQuest(s, id);
  assert.equal(totalXp(s), 5);
  assert.equal(s.quests.length, 0);
});

test('お休み中の日は、ペナルティもリカバリーも出ない', () => {
  let [s, id] = withPushups();
  s = setPaused(s, id, true, D1);
  s = settle(s, day(1), r0);
  assert.equal(s.offers[day(1)], undefined);
  assert.equal(s.misses[D1], undefined);
  s = setPaused(s, id, false, day(1));
  s = settle(s, day(2), r0);
  // day(1) もお休み扱い(オンに戻した日はその日まで休み)
  assert.equal(req(s, id, day(2)), 5);
  s = settle(s, day(3), r0);
  assert.equal(req(s, id, day(3)), 6);
});

test('量のないクエストは逃してもペナルティもリカバリーもない', () => {
  let s = newState(D1);
  s = addQuest(s, { name: '自炊', kind: 'check', base: 0, xp: 30, days: [] }, D1);
  s = settle(s, day(1), r0);
  assert.equal(s.offers[day(1)], undefined);
  assert.equal(s.misses[D1], undefined);
});

test('曜日指定のクエストは、予定のない日は逃したことにならない', () => {
  let s = newState(D1);
  s = addQuest(s, { name: '懸垂', kind: 'amount', unit: '回', base: 10, xp: 15, days: [1, 3, 5] }, D1);
  const id = s.quests[0].id;
  s = toggleDone(s, id, D1); // 月曜は達成
  s = settle(s, day(2), r0); // 火曜は予定なし
  assert.equal(req(s, id, day(2)), 10);
  assert.equal(todayQuests(s, day(1)).length, 0);
});

test('シールド: 昨日逃した量ありクエストを帳消しにする', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  assert.deepEqual(missedYesterday(s, day(1)), [id]);
  assert.equal(shieldAvailable(s, day(1)), true);
  s = useShield(s, id, day(1));
  assert.equal(req(s, id, day(1)), 5);
  assert.equal((s.offers[day(1)] ?? []).length, 0);
  assert.deepEqual(missedYesterday(s, day(1)), []);
  assert.equal(shieldAvailable(s, day(1)), false);
});

test('シールドは週1回まで', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  s = useShield(s, id, day(1));
  s = settle(s, day(2), r0);
  assert.throws(() => useShield(s, id, day(2)));
});

test('シールドは月曜3:00に補充される', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  s = useShield(s, id, day(1));
  s = settle(s, day(7), r0); // 次の月曜
  assert.equal(shieldAvailable(s, day(7)), true);
});

test('シールドを使わなかった週は、日曜の締めで+20XP', () => {
  let [s, id] = withPushups();
  for (let i = 0; i < 7; i++) {
    s = settle(s, day(i), r0);
    s = toggleDone(s, id, day(i));
  }
  assert.equal(totalXp(s), 35);
  s = settle(s, day(7), r0);
  assert.equal(totalXp(s), 55);
});

test('シールドを使った週は、ボーナスなし', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  s = useShield(s, id, day(1));
  s = settle(s, day(7), r0);
  assert.equal(totalXp(s), 0);
});

test('一度も記録がない週は、ボーナスなし', () => {
  let s = newState(D1);
  s = settle(s, day(14), r0);
  assert.equal(totalXp(s), 0);
});

test('リカバリー: 拒否するとXPなし、承認してこなすとXPが入る', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  const rejected = answerOffer(s, id, day(1), 'reject');
  assert.equal(rejected.offers[day(1)][0].status, 'rejected');
  assert.throws(() => completeOffer(rejected, id, day(1)));
  s = answerOffer(s, id, day(1), 'accept');
  s = completeOffer(s, id, day(1));
  assert.equal(s.offers[day(1)][0].status, 'done');
  assert.equal(totalXp(s), 1);
});

test('リカバリーをやらなくても、増えた量をこなせば元に戻る', () => {
  let [s, id] = withPushups();
  s = settle(s, day(1), r0);
  s = answerOffer(s, id, day(1), 'reject');
  s = toggleDone(s, id, day(1));
  s = settle(s, day(2), r0);
  assert.equal(req(s, id, day(2)), 5);
});

test('使用時間: 基準以内なら昨日の「以内」クエストが達成になる', () => {
  let s = newState(D1);
  s = addQuest(s, { name: 'スマホ4時間以内', kind: 'limit', unit: '分', base: 240, xp: 45, days: [] }, D1);
  s = settle(s, day(1), r0);
  assert.equal(s.misses[D1], undefined); // 量なし扱い
  s = setUsage(s, 180, day(1));
  assert.equal(s.logs[D1].usage, 180);
  assert.equal(totalXp(s), 45);
  s = setUsage(s, 300, day(1));
  assert.equal(totalXp(s), 0);
});
