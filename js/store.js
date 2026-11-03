// 端末内の保存: 状態は localStorage、画像は IndexedDB。
const KEY = 'levelup.state.v1';
const DB = 'levelup';
const STORE = 'images';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export async function requestPersist() {
  try { await navigator.storage?.persist?.(); } catch { /* 対応していない端末は無視 */ }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const putImage = (kind, blob) => tx('readwrite', (st) => st.put(blob, kind));
export const getImage = (kind) => tx('readonly', (st) => st.get(kind));
export const deleteImage = (kind) => tx('readwrite', (st) => st.delete(kind));

const urls = {};
export async function getImageURL(kind) {
  const blob = await getImage(kind);
  if (urls[kind]) URL.revokeObjectURL(urls[kind]);
  urls[kind] = blob ? URL.createObjectURL(blob) : null;
  return urls[kind];
}

/** 長い辺を max px に縮めてJPEGにする(保存容量の節約) */
async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    // createImageBitmap が読めない形式(HEICなど)は <img> で読む
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function resizeImage(file, max = 600) {
  const bmp = await decode(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
}

const toDataURL = (blob) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.readAsDataURL(blob);
});

export async function exportBackup(s) {
  const images = {};
  for (const k of ['avatar', 'photo']) {
    const b = await getImage(k);
    if (b) images[k] = await toDataURL(b);
  }
  return new Blob([JSON.stringify({ app: 'levelup', state: s, images })], { type: 'application/json' });
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'levelup' || !data.state?.quests) throw new Error('このアプリのバックアップではありません');
  for (const k of ['avatar', 'photo']) {
    if (data.images?.[k]) await putImage(k, await (await fetch(data.images[k])).blob());
    else await deleteImage(k);
  }
  return data.state;
}
