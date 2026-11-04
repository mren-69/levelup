// 長押ししてドラッグで並べ替える。
//   並べ替えたい一覧:   <div data-sortable="today|all"> … </div>
//   動かせる1行:        <div data-sort="ID"> … </div>(一覧の直下)
// 指を置いて HOLD_MS 動かさずにいると持ち上がる(短いとスクロールと混ざるため、少し長め)。
export const HOLD_MS = 450;
const MOVE_CANCEL_PX = 10;
const EDGE_PX = 70;

export function initSortable(root, onDrop) {
  let st = null;

  const items = (box) => [...box.children].filter((el) => el.hasAttribute('data-sort'));

  function cleanup() {
    if (!st) return;
    clearTimeout(st.timer);
    cancelAnimationFrame(st.raf);
    st.item.classList.remove('lifting', 'dragging');
    st.box.classList.remove('sorting');
    document.body.classList.remove('is-sorting');
    st = null;
  }

  function lift() {
    st.active = true;
    st.item.classList.add('dragging');
    st.box.classList.add('sorting');
    document.body.classList.add('is-sorting');
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15);
    autoscroll();
  }

  function place() {
    // 指のY座標に合わせて、持ち上げた行を前後に差し込む
    for (const el of items(st.box)) {
      if (el === st.item) continue;
      const r = el.getBoundingClientRect();
      if (st.y < r.top || st.y > r.bottom) continue;
      const before = st.y < r.top + r.height / 2;
      const ref = before ? el : el.nextSibling;
      if (ref !== st.item && st.item.nextSibling !== ref) st.box.insertBefore(st.item, ref);
      break;
    }
  }

  function autoscroll() {
    if (!st?.active) return;
    const h = window.innerHeight;
    if (st.y < EDGE_PX) window.scrollBy(0, -12);
    else if (st.y > h - EDGE_PX) window.scrollBy(0, 12);
    place();
    st.raf = requestAnimationFrame(autoscroll);
  }

  root.addEventListener('pointerdown', (e) => {
    if (st || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const item = e.target.closest('[data-sort]');
    const box = item?.closest('[data-sortable]');
    if (!item || !box || e.target.closest('input,select,textarea')) return;
    st = { item, box, kind: box.dataset.sortable, id: item.dataset.sort, x: e.clientX, y: e.clientY, pid: e.pointerId, active: false, moved: false };
    st.timer = setTimeout(() => { if (st) lift(); }, HOLD_MS);
  });

  root.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > MOVE_CANCEL_PX) cleanup(); // スクロールのつもり
      return;
    }
    st.y = e.clientY;
    st.moved = true;
    place();
  });

  const finish = (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const { active, box, item, kind, id } = st;
    if (active) {
      const index = items(box).indexOf(item);
      // 離した直後に出る「タップ」を打ち消す(チェックが付いてしまわないように)
      const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
      cleanup();
      onDrop(kind, id, index);
    } else {
      cleanup();
    }
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', (e) => {
    // 持ち上げる前にブラウザがスクロールを始めたとき。持ち上げたあとは何もしない(元に戻す)
    if (!st || e.pointerId !== st.pid) return;
    if (st.active) { cleanup(); onDrop(null); } else cleanup();
  });

  // 持ち上げたあとは、画面がスクロールしないようにする(iOS対策)
  document.addEventListener('touchmove', (e) => { if (st?.active) e.preventDefault(); }, { passive: false });
  // 長押しで出る「コピー」などのメニューを出さない
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-sort]')) e.preventDefault(); });
}
