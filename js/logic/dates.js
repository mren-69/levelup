// 1日の区切りは朝3:00。日付は 'YYYY-MM-DD' の文字列キーで扱う。
export const DAY_START_HOUR = 3;

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // 正午にしておくと夏時間などでもずれない
};

export function dayKey(date = new Date()) {
  const d = new Date(date.getTime());
  d.setHours(d.getHours() - DAY_START_HOUR);
  return fmt(d);
}

export function addDays(key, n) {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

/** 0=日 … 6=土 */
export function weekday(key) {
  return parse(key).getDay();
}

/** その日を含む週の月曜日のキー */
export function weekKey(key) {
  const wd = weekday(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

/** a から b までの日数(b - a) */
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
