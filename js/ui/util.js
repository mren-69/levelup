export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

export function fmtAmount(v, unit) {
  return unit === '分' ? fmtMinutes(v) : `${v}${unit}`;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function fmtDays(days) {
  if (!days.length) return '毎日';
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WD[d]).join('・');
}
export const WEEKDAYS = WD;

export function fmtDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}月${d}日`;
}

export const SILHOUETTE = '<svg viewBox="0 0 100 120" aria-hidden="true"><circle cx="50" cy="38" r="22"/><path d="M6 120c3-34 22-50 44-50s41 16 44 50z"/></svg>';
