export const XP_SLOTS = [5, 10, 15, 20, 30, 45, 60, 80, 100];

/** Lv n → n+1 に必要な経験値 */
export function xpToNext(level) {
  return 170 + 8 * (level - 1);
}

/** 累計経験値からレベルと進み具合を出す */
export function levelInfo(totalXp) {
  let level = 1;
  let rest = Math.max(0, totalXp);
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const need = xpToNext(level);
  return { level, into: rest, need, remaining: need - rest };
}

const ROLES = [
  [56, '人類の最高到達点'],
  [41, '一族の最高傑作'],
  [37, '皇帝'],
  [31, '英雄'],
  [21, '怪物'],
  [17, '万能の天才'],
  [11, '闘将'],
  [6, '麒麟児'],
  [3, 'スパルティアタイ'],
  [1, '戦士'],
];

export function roleFor(level) {
  return ROLES.find(([min]) => level >= min)[1];
}
