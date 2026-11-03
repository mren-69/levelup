import { putImage, deleteImage, resizeImage, exportBackup, importBackup } from '../store.js';
import { dayKey } from '../logic/dates.js';

export function view(ctx) {
  const { pics } = ctx;
  const imgRow = (kind, label) => `
    <div class="win card"><span>${label}：${pics[kind] ? '登録済み' : '未登録'}</span>
      <span class="row">
        <button class="mini gold" data-act="pick" data-kind="${kind}">${pics[kind] ? '変更' : '登録'}</button>
        ${pics[kind] ? `<button class="mini" data-act="unpick" data-kind="${kind}">外す</button>` : ''}
      </span></div>`;
  return `
  <h2>アバターと写真</h2>
  <p class="note">1回登録しておけば、ホームの「アバター」「写真」をタップするだけで切り替わります。写真は写真ライブラリやファイルから選べます。アバターが未登録のときはシルエットが出ます。</p>
  ${imgRow('avatar', 'アバター')}
  ${imgRow('photo', '写真')}
  <input type="file" id="file-img" accept="image/*" hidden>

  <h2>毎日の通知（ショートカット）</h2>
  <ol class="steps">
    <li>iPhoneの「ショートカット」アプリを開く</li>
    <li>下の「オートメーション」→ 右上の「＋」</li>
    <li>「時刻」を選び、通知したい時刻（例：21:00）と「毎日」を設定。「すぐに実行」を選ぶ</li>
    <li>アクションに「通知を表示」を追加し、「今日のクエストと使用時間を記録しよう」などと入れる</li>
    <li>続けて「URLを開く」を追加し、このアプリのアドレスを入れる（通知の代わりにアプリを直接開けます）</li>
  </ol>

  <h2>バックアップ</h2>
  <p class="note">データはこのiPhoneの中だけにあります。機種変更やもしもの時のために、ときどき書き出しておくと安心です。</p>
  <button class="btn sub" data-act="export">バックアップを書き出す</button>
  <button class="btn sub" data-act="import">バックアップから戻す</button>
  <input type="file" id="file-backup" accept="application/json,.json" hidden>

  <h2>ホーム画面に追加</h2>
  <p class="note">Safariでこのページを開き、共有ボタン →「ホーム画面に追加」。一度開けば、Wi-Fiがなくても使えます。</p>`;
}

let pickKind = 'avatar';

export const actions = {
  pick: (el) => {
    pickKind = el.dataset.kind;
    const input = document.getElementById('file-img');
    input.value = '';
    input.click();
  },
  unpick: async (el, ctx) => {
    if (!confirm('この画像を外しますか？')) return;
    await deleteImage(el.dataset.kind);
    await ctx.reloadPics();
    if (el.dataset.kind === 'photo' && ctx.s.view.pic === 'photo') ctx.commit({ ...ctx.s, view: { pic: 'avatar' } });
    else ctx.render();
  },
  export: async (el, ctx) => {
    const blob = await exportBackup(ctx.s);
    const name = `levelup-backup-${dayKey()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* キャンセル */ return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  import: () => {
    const input = document.getElementById('file-backup');
    input.value = '';
    input.click();
  },
};

/** ファイル選択(change)のつなぎ込み */
export function bindFiles(root, ctx) {
  root.querySelector('#file-img')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await putImage(pickKind, await resizeImage(f));
      await ctx.reloadPics();
      ctx.commit({ ...ctx.s, view: { pic: pickKind } });
      ctx.toast('登録しました');
    } catch { ctx.toast('画像を読み込めませんでした'); }
  });
  root.querySelector('#file-backup')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm('今のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
    try {
      const s = await importBackup(f);
      await ctx.reloadPics();
      ctx.replace(s);
      ctx.toast('戻しました');
    } catch (err) { ctx.toast(err.message || '読み込めませんでした'); }
  });
}
