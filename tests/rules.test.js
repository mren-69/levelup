import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, addDays, weekKey, weekday } from '../js/logic/dates.js';
import { XP_SLOTS, xpToNext, levelInfo, roleFor } from '../js/logic/leveling.js';
import { MULTS, requiredAmount } from '../js/logic/penalty.js';
import { recoveryXp, pickTask } from '../js/logic/recovery.js';
import { RECOVERY_POOL } from '../js/logic/recovery-pool.js';

test('1日の区切りは朝3:00', () => {
  assert.equal(dayKey(new Date(2026, 10, 4, 2, 59)), '2026-11-03');
  assert.equal(dayKey(new Date(2026, 10, 4, 3, 0)), '2026-11-04');
  assert.equal(dayKey(new Date(2026, 10, 4, 23, 59)), '2026-11-04');
});

test('日付の加算と曜日', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(weekday('2026-11-04'), 3);
});

test('週は月曜はじまり', () => {
  assert.equal(weekKey('2026-11-04'), '2026-11-02');
  assert.equal(weekKey('2026-11-08'), '2026-11-02');
  assert.equal(weekKey('2026-11-09'), '2026-11-09');
});

test('経験値の枠', () => {
  assert.deepEqual(XP_SLOTS, [5, 10, 15, 20, 30, 45, 60, 80, 100]);
});

test('必要経験値は170から8ずつ増える', () => {
  assert.equal(xpToNext(1), 170);
  assert.equal(xpToNext(2), 178);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(169).level, 1);
  assert.equal(levelInfo(170).level, 2);
  assert.equal(levelInfo(17737).level, 49);
  assert.equal(levelInfo(17738).level, 50);
  const i = levelInfo(200);
  assert.deepEqual(i, { level: 2, into: 30, need: 178, remaining: 148 });
});

test('役職', () => {
  const cases = [[1, '戦士'], [2, '戦士'], [3, 'スパルティアタイ'], [5, 'スパルティアタイ'], [6, '麒麟児'], [10, '麒麟児'],
    [11, '闘将'], [16, '闘将'], [17, '万能の天才'], [20, '万能の天才'], [21, '怪物'], [30, '怪物'], [31, '英雄'], [36, '英雄'],
    [37, '皇帝'], [40, '皇帝'], [41, '一族の最高傑作'], [55, '一族の最高傑作'], [56, '人類の最高到達点'], [120, '人類の最高到達点']];
  for (const [lv, name] of cases) assert.equal(roleFor(lv), name, `Lv${lv}`);
});

test('ペナルティの量', () => {
  assert.deepEqual(MULTS, [1, 1.25, 1.5]);
  assert.equal(requiredAmount(5, 0), 5);
  assert.equal(requiredAmount(5, 1), 6);
  assert.equal(requiredAmount(5, 2), 8);
  assert.equal(requiredAmount(120, 1), 150);
  assert.equal(requiredAmount(1, 1), 2);
});

test('リカバリー経験値', () => {
  assert.equal(recoveryXp(5), 1);
  assert.equal(recoveryXp(15), 3);
  assert.equal(recoveryXp(20), 2);
  assert.equal(recoveryXp(45), 5);
  assert.equal(recoveryXp(100), 10);
});

test('リカバリー候補は30個以上で、ランダムに1つ選ぶ', () => {
  assert.ok(RECOVERY_POOL.length >= 30);
  assert.ok(RECOVERY_POOL.every((t) => typeof t === 'string' && t.length > 0));
  assert.equal(pickTask(() => 0), 0);
  assert.equal(pickTask(() => 0.9999), RECOVERY_POOL.length - 1);
});
