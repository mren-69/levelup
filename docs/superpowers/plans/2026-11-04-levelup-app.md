# リアル・レベルアップ PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhoneのホーム画面に追加して使う、オフライン対応の自分専用レベルアップ習慣アプリを作る。

**Architecture:** ビルド不要の素のHTML/CSS/JS(ESモジュール)。ゲームの規則はすべて `js/logic/` の純粋関数にまとめ、Nodeの組み込みテスト(`node --test`)で検証する。画面(`js/ui/`)は状態を読んで描画するだけ。状態はlocalStorage、画像はIndexedDBに保存する。Service Workerでオフラインで動かす。

**Tech Stack:** HTML / CSS / Vanilla JS (ES2022 modules), Node 24 `node:test`(テストのみ), Service Worker, Web App Manifest。外部依存なし。

**Spec:** `docs/design.md`

## Global Constraints
- 経験値の枠: `[5,10,15,20,30,45,60,80,100]` のみ。自由入力は不可。
- 必要XP: Lv n→n+1 = `170 + 8*(n-1)`。レベルは下がらない。
- 役職: 1-2 戦士 / 3-5 スパルティアタイ / 6-10 麒麟児 / 11-16 闘将 / 17-20 万能の天才 / 21-30 怪物 / 31-36 英雄 / 37-40 皇帝 / 41-55 一族の最高傑作 / 56+ 人類の最高到達点。
- 1日の区切りは朝3:00。週は月曜3:00から。
- ペナルティ倍率: 1 → 1.25 → 1.5(上限)。量 = `max(base+1, round(base*m))`(m>1のとき)。量のあるクエストのみ。
- リカバリーXP: 逃したXPが20未満なら2割、20以上なら1割、四捨五入、最低1。
- シールド: 週1回。未使用で週が終わったら+20XP。
- リカバリー候補は30個以上。中身はユーザーに見せない(チャット・設計書・計画に書かない)。
- 選択ボタンの文字は「承認」「拒否」。
- デザインは `mockups/mockup-b2.html` の配色・フォント・装飾に揃える。名前表示なし。
- UIの文言はすべて日本語。

## Review Focus
1. 3:00をまたぐ時刻(例: 2:59に付けたチェックは前日分になる)— `dates.test.js` で固定。
2. 何日もアプリを開かなかった後の初回起動 — 間の日を順に締めて、倍率が1.5で止まることを `engine.test.js` で固定。
3. チェックを付けて外す — XPが二重に入ったり負になったりしない(`engine.test.js`)。
4. クエストの経験値の枠をあとで変えた — 過去に得たXPは変わらない(付けた時点のXPを記録する)。`engine.test.js` で固定。
5. お休み(オフ)中の日は未達成にならず、ペナルティもリカバリーも発生しない(`engine.test.js`)。

---

## ファイル構成
```
levelup-app/
  index.html               画面の骨組み(タブ4つ: ホーム/クエスト/記録/設定)
  styles.css               案B2のデザイン
  manifest.webmanifest     ホーム画面追加用
  sw.js                    オフライン用キャッシュ
  icons/icon-180.png, icon-512.png
  package.json             {"type":"module","scripts":{"test":"node --test tests/"}}
  js/logic/dates.js        日付キー(3:00区切り)
  js/logic/leveling.js     レベル・役職
  js/logic/penalty.js      倍率と量
  js/logic/recovery.js     リカバリーXP・抽選
  js/logic/recovery-pool.js リカバリー候補(非公開)
  js/logic/engine.js       状態の更新(チェック、締め処理、シールド、使用時間)
  js/store.js              localStorage / IndexedDB / バックアップ
  js/ui/*.js               各画面
  js/app.js                起動・タブ切替・定期的な締め処理
  tests/*.test.js
  tools/serve.js           ローカル確認用の静的サーバー
  tools/make-icons.js      PNGアイコン生成
```

## 状態の形(engine.js が扱う)
```js
State = {
  v: 1,
  quests: Quest[],
  logs: { [dayKey]: { done: {[questId]: xp}, usage: number|null /*分*/, rec: {[questId]: xp} } },
  pen: { [questId]: 0|1|2 },           // 今日の倍率段階
  offers: { [dayKey]: Offer[] },       // その日に出ているリカバリー
  shields: { [weekKey]: { used: boolean, questId?: string, bonusGiven?: boolean } },
  misses: { [dayKey]: string[] },      // 締めで確定した未達成(量あり)
  settledThrough: dayKey,              // ここまで締めた
  seenLevel: number,
  view: { pic: 'avatar'|'photo' }
}
Quest = { id, name, kind: 'amount'|'check'|'limit', unit: '回'|'分', base: number, xp: number,
          days: number[] /*0=日..6=土, 空=毎日*/, paused: {from: dayKey, to: dayKey|null}[], created: dayKey }
Offer = { questId, xp, task: number /*プール添字*/, status: 'pending'|'accepted'|'rejected'|'done' }
```
- `amount`: 回数(`回`)か時間(`分`)。`check`: 量なし。`limit`: 「◯分以内」(使用時間入力で自動判定、量なし扱い)。

---

### Task 1: 日付・レベル・ペナルティ・リカバリーの規則

**Files:** Create `package.json`, `js/logic/dates.js`, `js/logic/leveling.js`, `js/logic/penalty.js`, `js/logic/recovery.js`, `js/logic/recovery-pool.js`, `tests/rules.test.js`

**Interfaces (Produces):**
- `dayKey(date: Date): string` — 3時間引いたローカル日付の `YYYY-MM-DD`
- `addDays(key: string, n: number): string`, `weekKey(key: string): string`(その日を含む週の月曜のdayKey), `weekday(key): 0..6`
- `XP_SLOTS: number[]`, `xpToNext(level: number): number`, `levelInfo(totalXp: number): {level, into, need, remaining}`, `roleFor(level: number): string`
- `MULTS = [1, 1.25, 1.5]`, `requiredAmount(base: number, stage: 0|1|2): number`
- `recoveryXp(missedXp: number): number`, `pickTask(rand = Math.random): number`
- `RECOVERY_POOL: string[]`(30件以上)

- [ ] **Step 1: 失敗するテストを書く** (`tests/rules.test.js`)
  - `dayKey(new Date(2026,10,4,2,59)) === '2026-11-03'`、`dayKey(new Date(2026,10,4,3,0)) === '2026-11-04'`
  - `weekKey('2026-11-04') === '2026-11-02'`(水→月)、`weekKey('2026-11-08') === '2026-11-02'`(日)、`weekKey('2026-11-09') === '2026-11-09'`
  - `xpToNext(1) === 170`、`xpToNext(2) === 178`;`levelInfo(0).level === 1`;`levelInfo(170).level === 2`;Lv50到達の累計 `17738` で `levelInfo(17738).level === 50`、`levelInfo(17737).level === 49`
  - `roleFor(2)==='戦士'`, `roleFor(3)==='スパルティアタイ'`, `roleFor(10)==='麒麟児'`, `roleFor(16)==='闘将'`, `roleFor(20)==='万能の天才'`, `roleFor(30)==='怪物'`, `roleFor(36)==='英雄'`, `roleFor(40)==='皇帝'`, `roleFor(55)==='一族の最高傑作'`, `roleFor(56)==='人類の最高到達点'`
  - `requiredAmount(5,0)===5`, `requiredAmount(5,1)===6`, `requiredAmount(5,2)===8`, `requiredAmount(120,1)===150`, `requiredAmount(1,1)===2`
  - `recoveryXp(5)===1`, `recoveryXp(15)===3`, `recoveryXp(20)===2`, `recoveryXp(45)===5`, `recoveryXp(100)===10`
  - `RECOVERY_POOL.length >= 30`;`pickTask(()=>0)===0`;`pickTask(()=>0.9999)===RECOVERY_POOL.length-1`
- [ ] **Step 2:** `npm test` → FAIL(モジュールなし)
- [ ] **Step 3:** 実装。プールの中身はチャットに出さない。
- [ ] **Step 4:** `npm test` → PASS

### Task 2: 状態の更新(engine)

**Files:** Create `js/logic/engine.js`, `tests/engine.test.js`

**Interfaces:**
- Consumes: Task 1 の全関数
- Produces:
  - `newState(today: string): State`(`settledThrough = addDays(today,-1)`)
  - `isScheduled(q, key): boolean`(作成日以降・曜日一致)、`isPaused(q, key): boolean`(rangeの `from<=key<=to??∞`)
  - `todayQuests(s, today): {quest, required, done, paused, stage}[]`
  - `toggleDone(s, questId, today): State`(量あり・量なしのみ。付けた時点の `q.xp` を `logs[today].done` に記録/外すと削除)
  - `setPaused(s, questId, paused: boolean, today): State`(オフ: `{from: today, to: null}` 追加。オン: 開いているrangeの `to = today`)
  - `settle(s, today): State` — `settledThrough+1` から `today-1` まで1日ずつ:
    - その日予定されていて、お休み中でない `amount` クエスト: 達成なら `pen=0`。未達成なら `misses[day]` に追加、`pen=min(pen+1,2)`、`offers[day+1]` に `{questId, xp: recoveryXp(q.xp), task: pickTask(), status:'pending'}`。
    - 予定がない日・お休みの日は `pen` を変えない。
    - 締めた日が日曜(週の最終日)なら、その週の `shields[week].used` が false で、その週に1件でもlogがあれば `logs[その日].bonus = 20`(XP合計に含める)。
  - `useShield(s, questId, today): State|Error` — 昨日の `misses` にある量ありクエストのみ。今週未使用であること。`pen` を1段戻し(最低0)、今日のそのクエストのofferを削除、`shields[weekKey(today)] = {used:true, questId}`
  - `answerOffer(s, questId, today, 'accept'|'reject')`, `completeOffer(s, questId, today)` → `logs[today].rec[questId] = offer.xp`
  - `setUsage(s, minutes, today)` → `logs[昨日].usage = minutes`、昨日予定の `limit` クエスト(お休み中でない)で `minutes <= q.base` なら `logs[昨日].done[q.id] = q.xp`、超えていれば削除
  - `totalXp(s): number`(全logsの done + rec + bonus の合計)
- [ ] **Step 1: 失敗するテストを書く**
  - 腕立て(base 5, xp 5)を作り、1日目未達成で締める → 2日目 `todayQuests` の required が 6、offer が1件 pending
  - 2日目も未達成 → 3日目 required 8;さらに未達成 → 4日目も 8(上限)
  - 3日目に達成 → 4日目 required 5
  - 10日開かずに `settle` → 倍率は1.5で止まり、例外なし
  - `toggleDone` を2回 → `totalXp` が元に戻る。付けたあと `q.xp` を 45 に変えても `totalXp` は 5 のまま
  - お休み中の日に未達成 → pen 変化なし、offer なし、misses なし
  - `check` クエストの未達成 → pen・offer なし
  - シールド: 昨日未達成の腕立てに使う → 今日の required が 5 に戻り、offer 消える。同じ週に2回目は Error。シールドを使った週はボーナスなし、使わなかった週の日曜締めで +20
  - `answerOffer reject` → XPなし。`accept`→`completeOffer` で xp 1(5XPの2割)が加算
  - `setUsage(180)` で base 240 の limit クエストが達成、`setUsage(300)` で取り消し
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装(状態は複製して返す。`structuredClone`)
- [ ] **Step 4:** `npm test` → PASS

### Task 3: 保存・画像・バックアップ

**Files:** Create `js/store.js`

**Interfaces (Produces):** `loadState(): State|null`, `saveState(s)`, `putImage(kind: 'avatar'|'photo', blob)`, `getImageURL(kind): Promise<string|null>`, `resizeImage(file, max=600): Promise<Blob>`, `exportBackup(s): Promise<Blob>`(画像はdataURL込みのJSON), `importBackup(file): Promise<State>`
- [ ] **Step 1:** 実装。起動時に `navigator.storage.persist()` を呼ぶ。
- [ ] **Step 2:** ブラウザで書き出し→読み込みを手で確認(Task 5で)

### Task 4: 画面とデザイン

**Files:** Create `index.html`, `styles.css`, `js/app.js`, `js/ui/home.js`, `js/ui/quests.js`, `js/ui/record.js`, `js/ui/settings.js`, `js/ui/editor.js`, `js/ui/fx.js`

- ホーム: アバター/写真の画像、「アバター」「写真」切替、LV(金グラデ)、役職、区切りのある経験値バー、「あとNXPでLv.n+1へ」、シールド残数、ペナルティ中の表示、今日の進み具合、昨日の使用時間が未入力なら案内。
- クエスト: 今日のクエスト(チェック・必要量・XP・オンオフ)、リカバリー(「承認」「拒否」→承認後チェック)、昨日の未達成に対する「シールドを使う」、追加・編集(名前、種類、量と単位、XP枠の選択ボタン、曜日)、削除。
- 記録: 昨日の使用時間(時間・分)入力、該当クエストの達成表示。
- 設定: アバター画像・写真の登録、バックアップ書き出し/読み込み、ショートカットで毎日通知する手順、ホーム画面への追加方法。
- fx: レベルアップ・役職変更の演出(全画面オーバーレイ、金の光)。
- app.js: 起動時と `visibilitychange` と1分ごとに `settle`。`seenLevel` と比較して演出。
- [ ] **Step 1:** 実装
- [ ] **Step 2:** `node tools/serve.js` で開き、iPhoneサイズ(390×844)で全タブを操作して確認

### Task 5: オフライン・ホーム画面追加

**Files:** Create `manifest.webmanifest`, `sw.js`, `tools/make-icons.js`, `icons/*.png`, `tools/serve.js`, `README.md`(使い方・公開手順)
- [ ] **Step 1:** 実装(SWはアプリの全ファイルをキャッシュ、キャッシュ名にバージョン)
- [ ] **Step 2:** サーバーを止めてもページが再読み込みできることをブラウザで確認
- [ ] **Step 3:** `npm test` 全PASSを最終確認
