# 365VOICE ↔ 口コミ管理システム 統合（がっちゃんこ）連携ガイド (INTEGRATION_GUIDE.md)

本ドキュメントは、「365VOICE（最新情報・毎日自動投稿システム）」と「先方システム（口コミ収集・アンケート・アカウント管理）」を、**1つの共通データベース（PostgreSQL / Supabase等）を通じて双方向シングルサインオン（SSO）連携するための技術仕様・実装ガイド**です。

---

## 🏗️ システム全体像・双方向連携フロー

```
[ 先方システム（口コミ・アカウント管理） ]                     [ 365VOICE（毎日自動投稿） ]
             │                                                          │
             │ ①「毎日投稿へ」ボタン押下                                 │
             │    ➔ MagicLinkToken にレコード作成                         │
             │    ➔ 365VOICEへリダイレクト (?token=xxx) ────────────────>│
             │                                                          │ ② トークンを検証して自動ログイン
             │                                                          │    （パスワード入力不要！）
             │                                                          │
             │<─────────────────────────────────────────────────────────┤ ③「口コミ管理画面へ」ボタン押下
             │                                                          │    ➔ MagicLinkToken に新規トークン作成
             │ ④ トークンを検証して自動ログイン                          │    ➔ 先方URLへリダイレクト (?token=yyy)
             │    （パスワード入力不要！）                               │
```

---

## 🗄️ 1. 共通データベース定義（Prismaスキーマ）

先方のデータベース定義（`schema.prisma`）に、以下の3つのモデルを追加・マージしてください。

```prisma
model Shop {
  id                     String           @id @default(uuid())
  name                   String
  email                  String           @unique
  password               String
  role                   String           @default("OWNER")
  agency_name            String?
  google_location_id     String?
  google_drive_folder_id String?
  post_active            Boolean          @default(true)
  created_at             DateTime         @default(now())
  updated_at             DateTime         @updatedAt

  keywords               ShopKeywords?
  magic_tokens           MagicLinkToken[]
}

model ShopKeywords {
  id             String   @id @default(uuid())
  shop_id        String   @unique
  main_keywords  String   // JSON文字列 (メインKW配列 e.g. '["名古屋 美容室", "髪質改善"]')
  sub_keywords   String   // JSON文字列 (サブKW配列 e.g. '["完全個室", "縮毛矯正"]')
  fixed_footer   String?
  custom_prompt  String?
  hp_url         String?
  tabelog_url    String?
  hotpepper_url  String?
  gurunavi_url   String?
  gbp_action_url String?
  draft_posts    String?  // JSON文字列 (AIが生成した3日分のお知らせ下書き)
  post_time_hour Int      @default(12)
  updated_at     DateTime @updatedAt

  shop           Shop     @relation(fields: [shop_id], references: [id], onDelete: Cascade)
}

model MagicLinkToken {
  id         String   @id @default(uuid())
  token      String   @unique
  shop_id    String
  expires_at DateTime
  is_used    Boolean  @default(false)
  created_at DateTime @default(now())

  shop       Shop     @relation(fields: [shop_id], references: [id], onDelete: Cascade)
}
```

---

## 💻 2. 先方側で実装いただくコード例（Next.js / Vercel用）

### ① 先方 ➔ 365VOICE（毎日投稿）へジャンプする処理
先方の管理画面で「毎日投稿機能」ボタンが押された際に、暗号トークンを発行して365VOICEへリダイレクトします。

#### 【Server Action または API Route の実装例】:
```typescript
import { prisma } from '@/lib/prisma'; // 先方のPrismaクライアント
import crypto from 'crypto';
import { redirect } from 'next/navigation';

export async function jumpToVoiceDashboard(shopId: string) {
  // 1. 使い捨ての安全な暗号トークンを生成 (有効期限: 15分)
  const token = `mlo_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // 2. 共通DBの MagicLinkToken に保存
  await prisma.magicLinkToken.create({
    data: {
      token,
      shop_id: shopId,
      expires_at: expiresAt,
      is_used: false,
    },
  });

  // 3. 365VOICEのURLにトークンを付与してリダイレクト
  const voiceAppUrl = process.env.VOICE_APP_URL || 'https://post.365voice.com';
  redirect(`${voiceAppUrl}/?token=${encodeURIComponent(token)}`);
}
```

---

### ② 365VOICE ➔ 先方（口コミ管理）へ戻ってきた時のログイン処理
ユーザーが365VOICEの「口コミ管理画面へ」ボタンを押して戻ってきた際、URLの `?token=...` を検証して自動ログインさせます。

#### 【Next.js Page または API Route での検証例】:
```typescript
import { prisma } from '@/lib/prisma';

export async function verifyIncomingMagicToken(token: string) {
  if (!token) {
    return { success: false, error: 'トークンがありません' };
  }

  // 1. 共通DBからトークンを検索
  const dbToken = await prisma.magicLinkToken.findUnique({
    where: { token },
  });

  if (!dbToken) {
    return { success: false, error: '無効または存在しないトークンです' };
  }

  if (dbToken.is_used) {
    return { success: false, error: 'このログインリンクは既に使用されています' };
  }

  if (new Date() > dbToken.expires_at) {
    return { success: false, error: 'ログインリンクの有効期限が切れています' };
  }

  // 2. トークンを使用済みに更新（ワンタイム化）
  await prisma.magicLinkToken.update({
    where: { id: dbToken.id },
    data: { is_used: true },
  });

  // 3. 該当する店舗（shop_id）のセッション/Cookieを確立してログイン完了！
  const shop = await prisma.shop.findUnique({
    where: { id: dbToken.shop_id },
  });

  return { success: true, shop };
}
```

---

## 🔒 3. 環境変数 (.env) 設定

### 365VOICE（こちら側・Render）に設定する環境変数
* `DATABASE_URL`: 先方と共有するPostgreSQL接続URL
* `REVIEWS_APP_URL`: 先方の口コミ管理画面URL（例: `https://reviews.365voice.com`）
* `GEMINI_API_KEY`: Google AI Studio APIキー
* `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`: GCP OAuth 2.0 接続情報

### 先方（Vercel）側に追加いただく環境変数
* `DATABASE_URL`: 共通のPostgreSQL接続URL
* `VOICE_APP_URL`: こちらの365VOICE画面URL（例: `https://post.365voice.com`）
