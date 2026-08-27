# 365VOICE (365ボイス) - 毎日投稿システム 開発ガイド (AGENTS.md)

本ドキュメントは、「365MEO」から**口コミ返信・LINE通知機能を完全に削除し、毎日投稿機能（最新情報）に特化・スリム化**させた「365VOICE」のローカル開発・動作検証、および他システム（共同開発者様のアカウント管理側）との結合テストに関するガイドです。

---

## 🛠️ 基本コマンド一覧

### 1. 依存ライブラリのインストール
フロントエンド・バックエンドそれぞれでインストールが必要です。
```bash
# バックエンド
cd backend
npm install

# フロントエンド
cd ../frontend
npm install
```

### 2. データベースのセットアップとシード投入 (Prisma)
開発・検証をPC単体ですぐに始められるよう、**デフォルトでローカルSQLite（dev.db）が作動するよう構築されています。**

```bash
cd backend
# データベーススキーマの反映（自動でローカル SQLiteファイル 'dev.db' が作成されます）
npx prisma db push

# 365VOICE用テスト初期データの投入（マジックログインテスト用トークンも含みます）
npx prisma db seed
```

#### 💡 本番環境（PostgreSQL）に移行する場合
本番環境でPostgreSQLを使う場合、`backend/prisma/schema.prisma` 内の `datasource db` を以下のように書き戻してください。
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
その後、`.env` ファイル内の `DATABASE_URL` にPostgreSQLの接続アドレスを設定し、`npx prisma db push` を実行してください。

### 3. アプリケーションの起動
```bash
# バックエンド開発サーバー起動 (localhost:3000)
cd backend
npm run dev

# フロントエンド開発サーバー起動 (localhost:5173)
cd frontend
npm run dev
```

### 4. ビルド（本番用コンパイルチェック）
本番環境にデプロイする前の型チェックおよびコンパイルが正常に通るか確認するコマンドです。
```bash
# バックエンドビルド
cd backend
npm run build

# フロントエンドビルド
cd frontend
npm run build
```

---

## 🔑 マジックリンク（自動ログイン）のテスト方法

共同開発者様が用意するログイン画面・アカウント管理システムとの連携テストを、本番環境を待たずにローカルPC単体で検証できます。

1. 上記の `npx prisma db seed` を実行すると、DBにテスト用の暗号トークン `test-magic-token` が自動登録されます。
2. フロントエンドとバックエンドを起動した状態で、ブラウザから以下のURLに直接アクセスします。
   ➔ **`http://localhost:5173/?token=test-magic-token`**
3. 認証が自動で通り、デモ店舗「美髪改善サロン Avenir Hair」のダッシュボードへ**パスワード入力なしで一瞬でログイン**できます。

※ 通常のログイン（パスワード入力）テストを行いたい場合は、以下のデモ用アカウントでログイン可能です：
* メールアドレス: `meoseiha@avenir`
* パスワード: `meoseiha@avenir`

---

## 🔒 必要な環境変数 (.env) 設定
LINE Developersに関するすべての環境変数は不要になりました。
Googleドライブからストック写真を同期し、Googleマップに毎日投稿するために、以下のキーを `backend/.env` に記述してください。

* `GEMINI_API_KEY`: Google AI Studio APIキー（AIによる毎日投稿の文章作成に利用します）
* `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`: GCP OAuth 2.0 接続情報（Googleドライブの写真取得、GBPへの投稿に利用します）
