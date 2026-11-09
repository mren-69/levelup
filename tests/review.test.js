import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newState, addQuest, setPaused, settle, totalXp, yesterdayReview, toggleYesterday, todayQuests, missedYesterday,
} from '../js/logic/engine.js';

const D1 = '2026-11-02'; // 月曜
const day = (n) => {
  const d = new Date(2026, 10, 2 + n, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const r0 = () => 0;
const add = (s, f, d = D1) => addQuest(s, { days: [], base: 0, xp: 10, ...f }, d);

function base() {
  let s = newState(D1);
  s = add(s, { name: '就寝', kind: 'check', xp: 20 });
  s = add(s, { name: '自慰控え', kind: 'check', xp: 30 });
  s = add(s, { name: '腕立て', kind: 'amount', unit: '回', base: 5, xp: 5 });
  s = add(s, { name: 'スマホ4時間以内', kind: 'limit', unit: '分', base: 240, xp: 45 });
  return s;
}
const names = (list) => list.map((q) => q.name).join(',');

test('昨日できなかった「量なし」だけが出る(量あり・以内は出ない)', () => {
  const s = settle(base(), day(1), r0);
  assert.equal(names(yesterdayReview(s, day(1))), '就寝,自慰控え');
});

test('昨日できたものは出ない', () => {
  let s = base();
  s = toggleYesterday(settle(s, day(1), r0), s.quests[0].id, day(1)); // 就寝を昨日の分として達成
  assert.equal(names(yesterdayReview(s, day(1))), '自慰控え');
});

test('昨日お休み中だったものは出ない', () => {
  let s = base();
  s = setPaused(s, s.quests[0].id, true, D1);
  s = settle(s, day(1), r0);
  assert.equal(names(yesterdayReview(s, day(1))), '自慰控え');
});

test('昨日予定がなかったもの(曜日指定)・まだなかったものは出ない', () => {
  let s = newState(D1);
  s = add(s, { name: '火曜だけ', kind: 'check', days: [2] });
  s = add(s, { name: '月曜だけ', kind: 'check', days: [1] });
  s = settle(s, day(1), r0); // 昨日=月曜
  assert.equal(names(yesterdayReview(s, day(1))), '月曜だけ');
  let t = newState(day(1));
  t = add(t, { name: '今日作った', kind: 'check' }, day(1));
  assert.equal(yesterdayReview(t, day(1)).length, 0);
});

test('昨日の分としてチェックすると、昨日の経験値として入る', () => {
  let s = settle(base(), day(1), r0);
  const id = s.quests[0].id;
  s = toggleYesterday(s, id, day(1));
  assert.equal(totalXp(s), 20);
  assert.equal(s.logs[D1].done[id], 20);
  assert.equal(s.logs[day(1)]?.done?.[id], undefined); // 今日の分には入らない
  assert.equal(todayQuests(s, day(1)).find((t) => t.quest.id === id).done, false);
});

test('昨日の分のチェックは、ペナルティ・リカバリー・シールドに影響しない', () => {
  let s = settle(base(), day(1), r0);
  const before = JSON.stringify({ pen: s.pen, offers: s.offers, misses: s.misses, shields: s.shields });
  s = toggleYesterday(s, s.quests[0].id, day(1));
  s = toggleYesterday(s, s.quests[1].id, day(1));
  assert.equal(JSON.stringify({ pen: s.pen, offers: s.offers, misses: s.misses, shields: s.shields }), before);
  assert.deepEqual(missedYesterday(s, day(1)), [s.quests[2].id]); // 量ありの未達成は今までどおり
});

test('量あり・「以内」・予定のないクエストは、昨日の分としてチェックできない', () => {
  const s = settle(base(), day(1), r0);
  assert.throws(() => toggleYesterday(s, s.quests[2].id, day(1)));
  assert.throws(() => toggleYesterday(s, s.quests[3].id, day(1)));
  assert.throws(() => toggleYesterday(s, 'nope', day(1)));
});

test('2日前の分は見返せない(昨日だけ)', () => {
  const s = settle(base(), day(2), r0);
  // 昨日(=day(1))には誰も記録がないが、day(1)分は出る。day(0)=2日前の分は出ない
  assert.equal(names(yesterdayReview(s, day(2))), '就寝,自慰控え');
  assert.equal(s.logs[D1], undefined);
});

test('以前の保存データでも動く', () => {
  const s = settle(base(), day(1), r0);
  delete s.urgent;
  assert.doesNotThrow(() => yesterdayReview(s, day(1)));
});
