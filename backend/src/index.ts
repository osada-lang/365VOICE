import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import stream from 'stream';
import crypto from 'crypto';
import { google } from 'googleapis';
import { prisma } from './services/db';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Enable robust CORS middleware for frontend deployments (Vercel, localhost, etc.)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));

// Helper to get Google Auth Client
function getGoogleAuthClient() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectURI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientID || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, redirectURI);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// In-memory fallback mock drive files for when Google Drive credentials are not set up
interface MockFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  dataUrl?: string;
}

let mockDriveFiles: MockFile[] = [];

// ==========================================
// 🔓 Auth & Single Sign-On (SSO) Endpoints
// ==========================================

// POST /api/auth/login (Testing / Local dev backdoor login)
app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  try {
    const shop = await prisma.shop.findUnique({
      where: { email },
    });

    if (!shop || shop.password !== password) {
      return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません。' });
    }

    const token = `simulated_token_${shop.id}_${rememberMe ? 'long' : 'short'}`;

    return res.json({
      token,
      shop: {
        id: shop.id,
        name: shop.name,
        email: shop.email,
        role: shop.role,
        google_location_id: shop.google_location_id,
        google_drive_folder_id: shop.google_drive_folder_id,
        post_active: shop.post_active,
      }
    });
  } catch (error: any) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ error: 'サーバー内でエラーが発生しました。' });
  }
});

// GET /api/auth/me (Get profile from token - Handles Magic Token SSO from co-developer's dashboard)
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証トークンがありません。' });
  }

  const token = authHeader.split(' ')[1];
  let shopId: string | null = null;
  let newToken: string | null = null;

  if (token.startsWith('simulated_token_')) {
    const parts = token.split('_');
    if (parts.length < 3 || parts[0] !== 'simulated' || parts[1] !== 'token') {
      return res.status(401).json({ error: '無効な認証トークンです。' });
    }
    shopId = parts.slice(2, -1).join('_');
  } else {
    // Treat as cryptographically secure one-time magic link token
    try {
      const dbToken = await prisma.magicLinkToken.findUnique({
        where: { token: token },
      });

      if (!dbToken) {
        return res.status(401).json({ error: '無効または存在しない認証トークンです。' });
      }

      if (dbToken.is_used) {
        return res.status(401).json({ error: 'このマジックログインリンクは既に使用されています。' });
      }

      if (new Date() > dbToken.expires_at) {
        return res.status(401).json({ error: 'このマジックログインリンクの有効期限（24時間）が切れています。' });
      }

      // Valid magic token! Mark as used immediately to burn it
      await prisma.magicLinkToken.update({
        where: { id: dbToken.id },
        data: { is_used: true }
      });

      shopId = dbToken.shop_id;
      newToken = `simulated_token_${shopId}_long`; // Rotated persistent session token
      console.log(`🔥 [ワンタイムトークン認証成功] マジックリンクを無効化し、セッショントークンを発行しました。店舗ID: ${shopId}`);
    } catch (dbErr: any) {
      console.error('❌ Magic token lookup/use error:', dbErr.message || dbErr);
      return res.status(500).json({ error: '認証処理中にエラーが発生しました。' });
    }
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    return res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        email: shop.email,
        role: shop.role,
        google_location_id: shop.google_location_id,
        google_drive_folder_id: shop.google_drive_folder_id,
        post_active: shop.post_active,
      },
      ...(newToken ? { newToken } : {})
    });
  } catch (error) {
    console.error('❌ Auth validation error:', error);
    return res.status(500).json({ error: 'サーバー内でエラーが発生しました。' });
  }
});

// Helper to safely extract shopId from simulated Persistent token
function getShopIdFromToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  if (token.startsWith('simulated_token_')) {
    const parts = token.split('_');
    if (parts.length < 3 || parts[0] !== 'simulated' || parts[1] !== 'token') {
      return null;
    }
    return parts.slice(2, -1).join('_');
  }
  return null;
}

// POST /api/auth/magic-link-out (Generate an SSO token to jump back to co-developer's Reviews Dashboard)
app.post('/api/auth/magic-link-out', async (req, res) => {
  const authHeader = req.headers.authorization;
  const callerShopId = getShopIdFromToken(authHeader);

  if (!callerShopId) {
    return res.status(401).json({ error: '認証トークンが無効または見つかりません。' });
  }

  try {
    const shop = await prisma.shop.findUnique({ where: { id: callerShopId } });
    if (!shop) {
      return res.status(404).json({ error: '店舗情報が見つかりませんでした。' });
    }

    // Generate random secure token
    const token = `mlo_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    // Save to shared database MagicLinkToken table
    await prisma.magicLinkToken.create({
      data: {
        token,
        shop_id: shop.id,
        expires_at: expiresAt,
        is_used: false,
      }
    });

    const baseReviewsUrl = process.env.REVIEWS_APP_URL || 'http://localhost:5173/reviews';
    const redirectUrl = baseReviewsUrl.includes('?') 
      ? `${baseReviewsUrl}&token=${encodeURIComponent(token)}`
      : `${baseReviewsUrl}?token=${encodeURIComponent(token)}`;

    return res.json({ success: true, token, redirectUrl });
  } catch (err: any) {
    console.error('❌ Failed to generate magic link out:', err);
    return res.status(500).json({ error: '口コミ画面へのジャンプURL生成に失敗しました。' });
  }
});

// GET /api/shops (Get list of all stores - Master / Admin / Agency access)
app.get('/api/shops', async (req, res) => {
  const authHeader = req.headers.authorization;
  const callerShopId = getShopIdFromToken(authHeader);

  if (!callerShopId) {
    return res.status(401).json({ error: '認証トークンが無効または見つかりません。' });
  }

  try {
    const caller = await prisma.shop.findUnique({
      where: { id: callerShopId }
    });

    if (!caller) {
      return res.status(403).json({ error: '呼び出し元のアカウントが見つかりません。' });
    }

    if (caller.role === 'ADMIN') {
      const shops = await prisma.shop.findMany({
        where: { role: 'OWNER' },
        orderBy: { name: 'asc' }
      });
      const agencies = await prisma.shop.findMany({
        where: { role: 'AGENCY' },
        orderBy: { name: 'asc' }
      });
      return res.json({ shops, agencies });
    } else if (caller.role === 'AGENCY') {
      const agencyName = caller.agency_name || caller.name;
      const shops = await prisma.shop.findMany({
        where: {
          role: 'OWNER',
          agency_name: agencyName
        },
        orderBy: { name: 'asc' }
      });
      return res.json({ shops, agencies: [] });
    } else {
      return res.status(403).json({ error: '店舗一覧を閲覧する権限がありません。' });
    }
  } catch (error) {
    console.error('❌ Failed to fetch shops list:', error);
    return res.status(500).json({ error: '店舗一覧の取得に失敗しました。' });
  }
});

// ==========================================
// 📊 Dashboard & Settings Endpoints
// ==========================================

// GET /api/shops/:shopId/dashboard
app.get('/api/shops/:shopId/dashboard', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        keywords: true,
      }
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    // Determine photo stock count
    let imageCount = mockDriveFiles.length;
    let firstFileId = mockDriveFiles.length > 0 ? mockDriveFiles[0].id : null;
    let driveFileIds: string[] = mockDriveFiles.slice(0, 3).map(f => f.id);
    let driveFilesList: { id: string, name: string }[] = mockDriveFiles;

    const auth = getGoogleAuthClient();
    if (auth) {
      try {
        const drive = google.drive({ version: 'v3', auth });
        const driveRes = await drive.files.list({
          q: `parents in '${shop.google_drive_folder_id || 'root'}' and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
          fields: 'files(id, name)',
          pageSize: 1000,
        });
        if (driveRes.data.files) {
          imageCount = driveRes.data.files.length;
          driveFilesList = driveRes.data.files.map((f: any) => ({ id: f.id || '', name: f.name || '' }));
          if (driveRes.data.files.length > 0) {
            firstFileId = driveRes.data.files[0].id || null;
            driveFileIds = driveRes.data.files.slice(0, 3).map(f => f.id || '');
          } else {
            driveFileIds = [];
          }
        }
      } catch (e) {
        console.log('⚠️ Failed to fetch live Drive images for dashboard, using fallback count.');
      }
    }

    // Determine Posting Mode
    let postingMode = 'TEXT_ONLY';
    let postingModeLabel = '画像ストック0枚: テキストのみ投稿モード';
    if (imageCount >= 10) {
      postingMode = 'ALWAYS_IMAGE';
      postingModeLabel = '画像ストック10枚以上: 画像連続投稿モード';
    } else if (imageCount >= 1) {
      postingMode = 'ALTERNATING';
      postingModeLabel = `画像ストック${imageCount}枚（1〜9枚）: 交互投稿モード (画像とテキストを日替わり)`;
    }

    // Determine 3-day drafts
    let draftPostsArr = [];
    if (shop.keywords) {
      if (shop.keywords.draft_posts) {
        try {
          draftPostsArr = JSON.parse(shop.keywords.draft_posts);
        } catch (pErr) {
          console.error('❌ Failed to parse draft_posts JSON:', pErr);
        }
      }
      
      // Auto-clean old dayIndex === -1 if calendar day in JST has changed!
      const publishedItem = draftPostsArr.find((d: any) => d.dayIndex === -1);
      if (publishedItem) {
        try {
          if (!publishedItem.publishedAt) {
            console.log(`🧹 Found legacy posted draft without publishedAt. Cleaning it up.`);
            draftPostsArr = draftPostsArr.filter((d: any) => d.dayIndex !== -1);
            await prisma.shopKeywords.update({
              where: { shop_id: shopId },
              data: {
                draft_posts: JSON.stringify(draftPostsArr)
              }
            });
          } else {
            const formatter = new Intl.DateTimeFormat('ja-JP', {
              timeZone: 'Asia/Tokyo',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const todayDateStr = formatter.format(new Date());
            const pubDateStr = formatter.format(new Date(publishedItem.publishedAt));

            if (todayDateStr !== pubDateStr) {
              console.log(`🧹 Calendar day changed in JST! Removing previous day's posted draft (-1) from database.`);
              draftPostsArr = draftPostsArr.filter((d: any) => d.dayIndex !== -1);
              
              await prisma.shopKeywords.update({
                where: { shop_id: shopId },
                data: {
                  draft_posts: JSON.stringify(draftPostsArr)
                }
              });
            }
          }
        } catch (cleanErr: any) {
          console.error('⚠️ Failed to clean up previous day posted draft:', cleanErr.message || cleanErr);
        }
      }
      
      // If empty, auto-generate 3-day drafts using Gemini AI
      if (draftPostsArr.length === 0) {
        console.log(`🤖 First-time auto-generating 3-day drafts for shop: ${shop.name}`);
        try {
          const day0 = await generateSingleDraft(shop, 0, driveFilesList);
          const day1 = await generateSingleDraft(shop, 1, driveFilesList);
          const day2 = await generateSingleDraft(shop, 2, driveFilesList);

          draftPostsArr = [
            { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null },
            { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null },
            { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null },
          ];

          await prisma.shopKeywords.update({
            where: { shop_id: shopId },
            data: { draft_posts: JSON.stringify(draftPostsArr) },
          });
        } catch (genError) {
          console.error('❌ Failed to first-time generate drafts:', genError);
          draftPostsArr = [
            { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: `${shop.name}の本日のおしらせ下書きです。`, subKeywords: [] },
            { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: `${shop.name}の明日のおしらせ下書きです。`, subKeywords: [] },
            { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: `${shop.name}の明後日のおしらせ下書きです。`, subKeywords: [] },
          ];
        }
      }
    }

    const resolvedDrafts = draftPostsArr.map((d: any) => {
      return {
        ...d,
        imageFileId: d.imageFileId || null
      };
    });

    const day0Draft = resolvedDrafts.find((d: any) => d.dayIndex === 0);
    const day0ImageFileId = day0Draft ? day0Draft.imageFileId : null;

    const previewImage = day0ImageFileId
      ? `/api/shops/${shopId}/drive-images/${day0ImageFileId}/view`
      : (firstFileId ? `/api/shops/${shopId}/drive-images/${firstFileId}/view` : null);

    return res.json({
      shopName: shop.name,
      postActive: shop.post_active,
      imageCount,
      postingMode,
      postingModeLabel,
      nextPostTime: `本日 ${(shop.keywords as any)?.post_time_hour ?? 12}:00 予定`,
      previewImage,
      googleLocationId: shop.google_location_id,
      gbpActionUrl: shop.keywords?.gbp_action_url || null,
      draftPosts: resolvedDrafts,
    });
  } catch (error) {
    console.error('❌ Dashboard fetch error:', error);
    return res.status(500).json({ error: 'ダッシュボードの取得に失敗しました。' });
  }
});

// POST /api/shops/:shopId/toggle-post
app.post('/api/shops/:shopId/toggle-post', async (req, res) => {
  const { shopId } = req.params;
  const { active } = req.body;

  try {
    const updated = await prisma.shop.update({
      where: { id: shopId },
      data: { post_active: active },
    });

    return res.json({ success: true, postActive: updated.post_active });
  } catch (error) {
    console.error('❌ Toggle post error:', error);
    return res.status(500).json({ error: '自動投稿の切り替えに失敗しました。' });
  }
});

// GET /api/shops/:shopId/settings
app.get('/api/shops/:shopId/settings', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        keywords: true,
      }
    });

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    const mainKeywords = shop.keywords ? JSON.parse(shop.keywords.main_keywords) : [];
    const subKeywords = shop.keywords ? JSON.parse(shop.keywords.sub_keywords) : [];

    return res.json({
      shopId: shop.id,
      shopName: shop.name,
      postActive: shop.post_active,
      keywords: {
        mainKeywords,
        subKeywords,
        fixedFooter: shop.keywords?.fixed_footer || '',
        customPrompt: shop.keywords?.custom_prompt || '',
        hpUrl: shop.keywords?.hp_url || '',
        tabelogUrl: shop.keywords?.tabelog_url || '',
        hotpepperUrl: shop.keywords?.hotpepper_url || '',
        gurunaviUrl: shop.keywords?.gurunavi_url || '',
        gbpActionUrl: shop.keywords?.gbp_action_url || '',
        postTimeHour: (shop.keywords as any)?.post_time_hour ?? 12,
      }
    });
  } catch (error) {
    console.error('❌ Settings fetch error:', error);
    return res.status(500).json({ error: '設定情報の取得に失敗しました。' });
  }
});

// POST /api/shops/:shopId/settings
app.post('/api/shops/:shopId/settings', async (req, res) => {
  const { shopId } = req.params;
  const { postActive, keywords } = req.body;

  try {
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        post_active: typeof postActive === 'boolean' ? postActive : true,
      }
    });

    if (keywords) {
      const mainKeywordsStr = JSON.stringify(keywords.mainKeywords || []);
      const subKeywordsStr = JSON.stringify(keywords.subKeywords || []);

      await prisma.shopKeywords.upsert({
        where: { shop_id: shopId },
        update: {
          main_keywords: mainKeywordsStr,
          sub_keywords: subKeywordsStr,
          fixed_footer: keywords.fixedFooter,
          custom_prompt: keywords.customPrompt,
          hp_url: keywords.hpUrl,
          tabelog_url: keywords.tabelogUrl,
          hotpepper_url: keywords.hotpepperUrl,
          gurunavi_url: keywords.gurunaviUrl,
          gbp_action_url: keywords.gbpActionUrl,
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 12,
        },
        create: {
          shop_id: shopId,
          main_keywords: mainKeywordsStr,
          sub_keywords: subKeywordsStr,
          fixed_footer: keywords.fixedFooter,
          custom_prompt: keywords.customPrompt,
          hp_url: keywords.hpUrl,
          tabelog_url: keywords.tabelogUrl,
          hotpepper_url: keywords.hotpepperUrl,
          gurunavi_url: keywords.gurunaviUrl,
          gbp_action_url: keywords.gbpActionUrl,
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 12,
        }
      });
    }

    return res.json({ success: true, message: '設定を正常に保存しました。' });
  } catch (error) {
    console.error('❌ Settings save error:', error);
    return res.status(500).json({ error: '設定の保存に失敗しました。' });
  }
});

// ==========================================
// 📁 Google Drive API Endpoints
// ==========================================

// GET /api/shops/:shopId/drive-images
app.get('/api/shops/:shopId/drive-images', async (req, res) => {
  const { shopId } = req.params;

  let shop = null;
  let auth = null;
  try {
    shop = await prisma.shop.findUnique({ where: { id: shopId } });
    auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    if (!auth) {
      console.log('ℹ️ Google Drive Credentials not configured. Returning local mock image list.');
      return res.json({ files: mockDriveFiles, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    const folderId = shop.google_drive_folder_id || 'root';

    console.log(`📂 Scanning Google Drive folder: ${folderId}...`);
    const driveRes = await drive.files.list({
      q: `parents in '${folderId}' and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
      pageSize: 1000,
      fields: 'files(id, name, mimeType, size, createdTime)',
    });

    const files = (driveRes.data.files || []).map((file) => {
      const sizeBytes = parseInt(file.size || '0', 10);
      const sizeMB = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '不明';
      return {
        id: file.id || '',
        name: file.name || '無題の写真',
        mimeType: file.mimeType || 'image/jpeg',
        size: sizeMB,
        createdTime: file.createdTime || new Date().toISOString(),
      };
    });

    return res.json({ files, isMock: false });
  } catch (error: any) {
    console.error('❌ Failed to fetch Google Drive files:', error.message || error);
    
    if (auth && shop) {
      const folderId = shop.google_drive_folder_id || 'root';
      const errorMsg = error.message || '';
      const isFolderError = errorMsg.includes('File not found') || error.status === 404 || error.code === 404;
      const isPermissionError = errorMsg.toLowerCase().includes('permission') || error.status === 403 || error.code === 403;
      
      let clientError = 'Googleドライブから画像を同期できませんでした。';
      if (isFolderError) {
        clientError = `Googleドライブのフォルダが見つかりません。設定タブの「Google Drive フォルダID」（現在: "${folderId}"）が正しいか、またはフォルダがGoogleドライブのゴミ箱に削除されていないかご確認ください。`;
      } else if (isPermissionError) {
        clientError = `Googleドライブのフォルダ（ID: "${folderId}"）への読み込み権限がありません。Google Cloudのサービスアカウント、または認証アカウントに「共同編集者（編集者または閲覧者）」権限がお目当てのフォルダに付与されているかご確認ください。`;
      } else {
        clientError += ` (エラー詳細: ${errorMsg})`;
      }
      
      return res.status(error.status || error.code || 400).json({ error: clientError });
    }

    return res.json({ files: mockDriveFiles, isMock: true, error: 'Google Drive接続エラーのため、モック画像を表示しています。' });
  }
});

// GET /api/shops/:shopId/drive-images/:fileId/view
app.get('/api/shops/:shopId/drive-images/:fileId/view', async (req, res) => {
  const { shopId, fileId } = req.params;

  try {
    if (fileId.startsWith('mock-img-')) {
      const mockFile = mockDriveFiles.find(f => f.id === fileId);
      if (mockFile && mockFile.dataUrl) {
        const base64Content = mockFile.dataUrl.split(',')[1];
        const buffer = Buffer.from(base64Content, 'base64');
        res.setHeader('Content-Type', mockFile.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
      return res.redirect('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600');
    }

    const auth = getGoogleAuthClient();
    if (!auth) {
      console.log('⚠️ Google Auth not set up. Redirecting to default unsplash picture.');
      return res.redirect('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600');
    }

    const drive = google.drive({ version: 'v3', auth });

    const metadata = await drive.files.get({
      fileId,
      fields: 'mimeType',
    });

    res.setHeader('Content-Type', metadata.data.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const fileRes = await drive.files.get({
      fileId,
      alt: 'media',
    }, { responseType: 'stream' });

    fileRes.data.pipe(res);
  } catch (error: any) {
    console.error(`❌ Failed to stream Google Drive image ${fileId}:`, error.message || error);
    return res.redirect('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600');
  }
});

// POST /api/shops/:shopId/drive-images/upload (Upload raw base64 photo directly into Google Drive)
app.post('/api/shops/:shopId/drive-images/upload', async (req, res) => {
  const { shopId } = req.params;
  const { fileName, mimeType, base64Data } = req.body;

  if (!fileName || !mimeType || !base64Data) {
    return res.status(400).json({ error: '画像アップロードに必要なデータが不足しています。' });
  }

  let shop = null;
  let auth = null;
  try {
    shop = await prisma.shop.findUnique({ where: { id: shopId } });
    auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    const fileBuffer = Buffer.from(base64Data, 'base64');

    const lowerMime = mimeType.toLowerCase();
    const lowerName = fileName.toLowerCase();
    const isJpg = lowerMime === 'image/jpeg' || lowerMime === 'image/jpg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
    const isPng = lowerMime === 'image/png' || lowerName.endsWith('.png');

    if (!isJpg && !isPng) {
      return res.status(400).json({
        error: 'Googleマイビジネスの仕様上、MEO投稿に利用できる画像は JPEG (.jpg/.jpeg) または PNG (.png) 形式のみです。HEIC (iPhone標準形式) や WebP, GIF 形式の画像はアップロードできません。事前にJPEG/PNGに変換してから再度お試しください。'
      });
    }

    const maxBytes = 5 * 1024 * 1024; // 5MB
    if (fileBuffer.length > maxBytes) {
      return res.status(400).json({
        error: 'Googleマイビジネスの仕様上、アップロードできる画像の最大サイズは 5 MB です。これより容量の小さい画像を使用するか、画像を圧縮してからアップロードしてください。'
      });
    }

    if (!auth) {
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const newMockFile: MockFile = {
        id: `mock-img-${Date.now()}`,
        name: fileName,
        mimeType: mimeType,
        size: `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB`,
        createdTime: new Date().toISOString(),
        dataUrl,
      };
      mockDriveFiles.unshift(newMockFile);
      console.log(`🟢 [モックアップロード成功] ${fileName} がストックに追加されました。`);
      return res.json({ success: true, file: newMockFile, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    const folderId = shop.google_drive_folder_id || 'root';

    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    console.log(`🔄 Uploading file ${fileName} directly into Drive folder: ${folderId}...`);
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: bufferStream,
      },
      fields: 'id, name, mimeType, size, createdTime',
    });

    const file = uploadRes.data;
    const sizeBytes = parseInt(file.size || '0', 10);
    const sizeMB = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '不明';

    return res.json({
      success: true,
      isMock: false,
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: sizeMB,
        createdTime: file.createdTime,
      }
    });
  } catch (error: any) {
    console.error('❌ Image upload error:', error.message || error);
    
    if (auth && shop) {
      const folderId = shop.google_drive_folder_id || 'root';
      const errorMsg = error.message || '';
      const isFolderError = errorMsg.includes('File not found') || error.status === 404 || error.code === 404;
      const isPermissionError = errorMsg.toLowerCase().includes('permission') || error.status === 403 || error.code === 403;
      
      let clientError = 'Googleドライブへのアップロードに失敗しました。';
      if (isFolderError) {
        clientError = `Googleドライブのフォルダが見つかりません。設定タブの「Google Drive フォルダID」（現在: "${folderId}"）が正しいか、またはフォルダがGoogleドライブのゴミ箱に削除されていないかご確認ください。`;
      } else if (isPermissionError) {
        clientError = `Googleドライブのフォルダ（ID: "${folderId}"）への書き込み権限がありません。Google Cloudのサービスアカウント、または認証アカウントに「共同編集者（編集者）」権限が付与されているかご確認ください。`;
      } else {
        clientError += ` (エラー詳細: ${errorMsg})`;
      }
      
      return res.status(error.status || error.code || 400).json({ error: clientError });
    }

    try {
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      const newMockFile: MockFile = {
        id: `mock-img-${Date.now()}`,
        name: fileName,
        mimeType: mimeType,
        size: `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB`,
        createdTime: new Date().toISOString(),
        dataUrl,
      };
      mockDriveFiles.unshift(newMockFile);
      return res.json({
        success: true,
        file: newMockFile,
        isMock: true,
        warning: 'Google DriveのフォルダIDまたは認証が無効なため、代わりにローカルストレージ（モック）に保存しました。'
      });
    } catch (fallbackError: any) {
      return res.status(500).json({ error: '画像のアップロードおよびフォールバック処理に失敗しました。' });
    }
  }
});

// DELETE /api/shops/:shopId/drive-images/:fileId
app.delete('/api/shops/:shopId/drive-images/:fileId', async (req, res) => {
  const { shopId, fileId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    if (!auth || fileId.startsWith('mock-')) {
      mockDriveFiles = mockDriveFiles.filter((f) => f.id !== fileId);
      console.log(`🟢 [モック削除成功] ID: ${fileId} がストックから削除されました。`);
      return res.json({ success: true, fileId, isMock: true });
    }

    const drive = google.drive({ version: 'v3', auth });
    console.log(`🗑️ Deleting file with ID: ${fileId} from Google Drive...`);
    await drive.files.delete({ fileId });

    return res.json({ success: true, fileId, isMock: false });
  } catch (error: any) {
    console.error('❌ Image deletion error:', error.message || error);
    const isPermissionError = error.message?.toLowerCase().includes('permission') || error.status === 403 || error.code === 403;
    const errorMsg = isPermissionError
      ? 'この画像は別のGoogleアカウントが所有しているため、システムから削除できません。本人のGoogleドライブから直接削除してください。'
      : 'Google Driveからの画像削除に失敗しました。';
    return res.status(isPermissionError ? 403 : 500).json({ error: errorMsg });
  }
});

// Helper to generate a single day's MEO draft post using Google Gemini AI
export async function generateSingleDraft(
  shop: any,
  dayIndex: number,
  driveFiles?: { id: string, name: string }[],
  forceTextOnly: boolean = false
): Promise<{ text: string, subKeywords: string[], imageFileId: string | null }> {
  const mainKeywords: string[] = JSON.parse(shop.keywords?.main_keywords || '[]');
  const subKeywords: string[] = JSON.parse(shop.keywords?.sub_keywords || '[]');
  const customPrompt = shop.keywords?.custom_prompt || '';
  const fixedFooter = shop.keywords?.fixed_footer || '';

  let imageFileId: string | null = null;
  const selectedSubKeywords: string[] = [];

  const imageCount = driveFiles ? driveFiles.length : 0;
  const isAlternating = imageCount >= 1 && imageCount < 10;
  const shouldBeTextOnly = forceTextOnly || (isAlternating && dayIndex % 2 === 1);

  if (driveFiles && driveFiles.length > 0 && !shouldBeTextOnly) {
    const randomIndex = Math.floor(Math.random() * driveFiles.length);
    const selectedFile = driveFiles[randomIndex];
    imageFileId = selectedFile.id || null;
  }

  if (subKeywords.length > 0) {
    const shuffled = [...subKeywords].sort(() => 0.5 - Math.random());
    const count = Math.floor(Math.random() * 2) + 2; // 2 or 3
    selectedSubKeywords.push(...shuffled.slice(0, Math.min(count, shuffled.length)));
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

  // 日替わりで異なる「検索意図・文脈テーマ」を決定 (dayIndexを利用)
  const themes = [
    {
      name: "悩み解決型 (Trouble Resolution)",
      focus: "ターゲット層特有の具体的かつ代表的なお悩み（例：集客、美容、サービス選び、各種不便など、その店舗が解決できるお悩みや課題）を切り口にし、どのようなアプローチでそれを根本からケア・解決・サポートしていくのかを詳しく語る構成。"
    },
    {
      name: "サービス詳細紹介型 (Service / Menu Highlight)",
      focus: "特定の提供サービス、おすすめのメニュー、または主力商品について、その特徴、得られる効果、なぜそれが必要・おすすめなのかを専門的な事実を交えて深く解説する構成。"
    },
    {
      name: "利用シーン・シチュエーション型 (Situation & Context)",
      focus: "「〇〇な時に利用したい」「忙しい合間にリフレッシュしたい」「特別な日に利用したい」といった、具体的で魅力的な利用・来店シチュエーションに焦点を当て、店舗の利便性や環境、通いやすさをアピールする構成。"
    },
    {
      name: "よくある質問回答型 (FAQ / Q&A answering)",
      focus: "お客様からよく受ける代表的な疑問や質問（例：料金や利用の流れ、効果、準備するものなど）に対する、具体的で分かりやすい解説を提示して不安を解消する構成。"
    },
    {
      name: "選ばれる理由・こだわり提示型 (Unique Selling Proposition)",
      focus: "他店との違い、店舗独自の強みやこだわり（例：丁寧なカウンセリング、専門知識、独自の技術・こだわり素材、アフターフォローなど）について客観的な事実に基づいて解説する構成。"
    },
    {
      name: "特定ターゲット特化アピール型 (Target Audience Appeal)",
      focus: "「特定の目的を持つ方」「特定のお悩みを持つお客様」など、ターゲットを具体的に絞り込み、その層が店舗を利用することで得られるメリットや価値を具体的に語る構成。"
    }
  ];

  const selectedTheme = themes[dayIndex % themes.length];

  const todayJp = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const prompt = `
    あなたは店舗「${shop.name}」のオーナー代理として、Googleマップ（MEO）および生成AI検索（AIO/LLMO）向けに最適化された、日替わりの店舗投稿テキスト（おしらせ/最新情報）を自動作成してください。

    【今回の投稿テーマ・検索意図】
    - テーマ名: ${selectedTheme.name}
    - 執筆のフォーカス: ${selectedTheme.focus}
    ※必ずこのテーマの検索文脈・意図に完全に合致する内容で執筆してください。

    【店舗基本情報】
    - 店舗名: ${shop.name}
    - 所在地住所情報（固定フッターより抜粋）: ${fixedFooter || '未設定'}
    - ターゲット層へのアピール・トーンマナー: ${customPrompt || '親しみやすく誠実なトーン。'}
    - 今日の日付: ${todayJp}

    【作成の絶対ルール（厳守してください）】
    1. 結論ファースト（PREP法）の徹底:
       文章の冒頭（最初の一文、30〜50文字程度）で、時候の挨拶などを一切省き、「【主要キーワード/テーマ】店舗名＋エリア名＋主要サービス（結論）」を一発で言い切る形で書き出してください。
       また、この結論を言い切った最初の一文の直後には、必ず【空行を1行】挟んでから、次の文章（最寄り駅や詳細なアクセス情報など）を書き始めてください。（冒頭が1つの重たい段落にまとまるのを物理的に防ぎます）

    2. 主語・エリア・サービス名の明確化（5W1Hの網羅）:
       主語を「当店」や「当院」などの曖昧な言葉にせず、必ず「${shop.name}」という具体的な店舗名で表記してください。また、エリア名（店舗の所在地・地域）を一文の中に自然に含めてください。エリア名については、必ず「所在地住所情報（固定フッター）」に記載されている住所情報のみから正しい地域名（市区町村名や駅名など）を抽出し、それを使用してください。フッターに住所情報がない場合、あるいは未設定の場合は、具体的な地域名は出力せず、所在地を特定しない汎用的な表現にしてください。メインキーワードやその他の情報から地域名を取得したり、存在しない架空の地域名を捏造することは絶対に禁止します。

    3. メインキーワードの完全含有:
       指定されたメインキーワード [ ${mainKeywords.join(', ')} ] を、文章全体の自然な文脈にそって【すべて必ず】本文中に含めてください。単なるキーワードの羅列や強引な詰め込みは厳禁です。

    4. 本日のサブキーワード:
       本日の日替わりサブキーワード [ ${selectedSubKeywords.join(', ')} ] を、文章の中に自然に盛り込んでください。

    5. 曖昧な表現の排除と一次情報・数値の提示:
       抽象的な形容詞や曖昧なアピールを徹底的に排除してください。代わりに、店舗が実際に提供している客観的・専門的な事実や具体的なアプローチ（一次情報、独自のこだわり、サービス工程、実績など）を具体的に記述してください。

    6. 特徴・こだわりの箇条書き構造化（中盤）:
       文章の中盤部分で、今回のテーマに関連する店舗のこだわり・特徴・サービス内容を、必ず【3つの箇条書き（「・」マークを使用）】で簡潔に整理してください。
       箇条書きに入る直前の説明・移行文（例：「特徴を専門的な視点からご紹介します。」など）の直後には、必ず【空行を1行】挟んでから、箇条書きの1項目目を書き始めてください（移行文と箇条書きが同じ塊に連結するのを防ぎます）。LLMが最も要約・引用しやすい構造化テキストに仕上げてください。（マークダウンのアスタリスク「*」や「-」は崩れやすいため使用禁止です）
       （箇条書き例：
         ・〇〇：具体的かつ客観的な強みや内容を1文で。
         ・〇〇：具体的かつ客観的な強みや内容を1文で。
         ・〇〇：具体的かつ客観的な強みや内容を1文で。）

    7. アクション喚起（CTA）の自然な配置（後半）:
       文章の最後（箇条書きの後）の締めくくりのアクション喚起（CTA）として、必ず次の指定テキストを【一言一句違わずに固定の1文】としてそのまま出力してください。
       指定テキスト：「『詳細』ボタン、またはプロフィールのウェブサイトリンクからお気軽にお問い合わせください。」
       （※この指定テキスト以外の独自の行動喚起や売り込みの文章、連絡先などを追加することは【絶対に】禁止します）

    8. 段落分けと空行の徹底（スマートフォン可読性の最適化）:
       文章全体が視覚的に詰まって見苦しくなるのを防ぐため、一つの段落は必ず「1文〜最大2文程度（50文字〜100文字程度）」とし、各段落の間には【必ず空行を1行】挟んでください。中盤の説明文、後半のまとめ、最後のアクション喚起（CTA）の各箇所においても、文章が2文以上続く場合は積極的に改行・空行を挟んで複数の短い段落に分割してください。スマートフォン画面でのスクロール時の読みやすさを極限まで高めてください。

    9. 文字数制限:
       全体の本文は【500文字程度（改行を除く）】に収め、一般客が読んで親しみやすく自然な日本語で仕上げてください。

    10. 署名・連絡先・記号マークダウンの排除:
        本文の中には、ホームページURL、電話番号、アクションボタンの文言（「詳細はこちら」「今すぐ予約」など）、住所、店舗名のフッター署名、および絵文字やマークダウン記号（**、#、*など）は【絶対に】含めないでください。純粋な文章テキストと「・」マーク、改行のみで出力してください。

    返される内容は自動作成した完成本文のみとし、説明、挨拶、マークダウン装飾（\`\`\`など）は一切含めないでください。`;

  let generatedText = '';
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    generatedText = response.text().trim().replace(/```/g, '');
  } catch (err: any) {
    console.warn('⚠️ gemini-3.6-flash failed or was under heavy load. Falling back to stable gemini-3.5-flash:', err.message || err);
    try {
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await fallbackModel.generateContent(prompt);
      const response = await result.response;
      generatedText = response.text().trim().replace(/```/g, '');
    } catch (fallbackErr: any) {
      console.error('❌ Both gemini-3.6-flash and gemini-3.5-flash failed:', fallbackErr.message || fallbackErr);
      throw fallbackErr;
    }
  }

  return {
    text: generatedText,
    subKeywords: selectedSubKeywords,
    imageFileId,
  };
}

// POST /api/shops/:shopId/draft-posts
app.post('/api/shops/:shopId/draft-posts', async (req, res) => {
  const { shopId } = req.params;
  const { drafts } = req.body;

  try {
    await prisma.shopKeywords.update({
      where: { shop_id: shopId },
      data: {
        draft_posts: JSON.stringify(drafts),
      }
    });

    return res.json({ success: true, message: '下書きを保存しました。' });
  } catch (error: any) {
    console.error('❌ Draft posts save error:', error);
    return res.status(500).json({ error: error.message || '下書きの保存に失敗しました。' });
  }
});

// POST /api/shops/:shopId/draft-posts/regenerate
app.post('/api/shops/:shopId/draft-posts/regenerate', async (req, res) => {
  const { shopId } = req.params;
  const { dayIndex, all } = req.body;

  if (!all && typeof dayIndex === 'number' && dayIndex === -1) {
    return res.status(400).json({ error: '投稿済みの下書きは再作成できません。' });
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { keywords: true }
    });

    if (!shop || !shop.keywords) {
      return res.status(404).json({ error: '店舗情報、またはキーワード設定が見つかりませんでした。' });
    }

    let draftPostsArr = [];
    if (shop.keywords.draft_posts) {
      draftPostsArr = JSON.parse(shop.keywords.draft_posts);
    }

    let driveFilesList: any[] = [];
    const auth = getGoogleAuthClient();
    if (auth && shop.google_drive_folder_id) {
      try {
        const drive = google.drive({ version: 'v3', auth });
        const driveRes = await drive.files.list({
          q: `parents in '${shop.google_drive_folder_id}' and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
          fields: 'files(id, name)',
          pageSize: 1000,
        });
        if (driveRes.data.files) {
          driveFilesList = driveRes.data.files.map((f: any) => ({ id: f.id || '', name: f.name || '' }));
        }
      } catch (driveErr) {
        console.error('⚠️ Failed to fetch Drive files for regeneration:', driveErr);
      }
    }

    if (all) {
      const day0 = await generateSingleDraft(shop, 0, driveFilesList);
      const day1 = await generateSingleDraft(shop, 1, driveFilesList);
      const day2 = await generateSingleDraft(shop, 2, driveFilesList);

      const nextDrafts = [
        { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null },
        { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null },
        { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null },
      ];

      const publishedItem = draftPostsArr.find((d: any) => d.dayIndex === -1);
      if (publishedItem) {
        draftPostsArr = [publishedItem, ...nextDrafts];
      } else {
        draftPostsArr = nextDrafts;
      }
    } else {
      const targetIndex = typeof dayIndex === 'number' ? dayIndex : 0;
      const regenerated = await generateSingleDraft(shop, targetIndex, driveFilesList);

      const defaultTitles = [
        '今日投稿予定の下書き (Day 0)',
        '明日投稿予定の下書き (Day 1)',
        '明後日投稿予定の下書き (Day 2)'
      ];

      const existingIdx = draftPostsArr.findIndex((d: any) => d.dayIndex === targetIndex);
      const draftObj = {
        dayIndex: targetIndex,
        title: defaultTitles[targetIndex] || `下書き (Day ${targetIndex})`,
        text: regenerated.text,
        subKeywords: regenerated.subKeywords,
        imageFileId: regenerated.imageFileId || null,
      };

      if (existingIdx !== -1) {
        draftPostsArr[existingIdx] = draftObj;
      } else {
        draftPostsArr.push(draftObj);
      }
    }

    draftPostsArr.sort((a: any, b: any) => a.dayIndex - b.dayIndex);

    await prisma.shopKeywords.update({
      where: { shop_id: shopId },
      data: {
        draft_posts: JSON.stringify(draftPostsArr),
      }
    });

    return res.json({ success: true, drafts: draftPostsArr });
  } catch (error: any) {
    console.error('❌ Draft regenerate error:', error);
    return res.status(500).json({ error: error.message || 'AI下書きの再生成に失敗しました。' });
  }
});

// POST /api/shops/:shopId/draft-posts/clear-published
app.post('/api/shops/:shopId/draft-posts/clear-published', async (req, res) => {
  const { shopId } = req.params;
  try {
    const shopKeywords = await prisma.shopKeywords.findUnique({
      where: { shop_id: shopId }
    });

    if (shopKeywords && shopKeywords.draft_posts) {
      let draftPostsArr = JSON.parse(shopKeywords.draft_posts);
      draftPostsArr = draftPostsArr.filter((d: any) => d.dayIndex !== -1);

      await prisma.shopKeywords.update({
        where: { shop_id: shopId },
        data: {
          draft_posts: JSON.stringify(draftPostsArr)
        }
      });
      return res.json({ success: true, drafts: draftPostsArr });
    }
    return res.json({ success: true, drafts: [] });
  } catch (error: any) {
    console.error('❌ Clear published drafts error:', error);
    return res.status(500).json({ error: error.message || '投稿済み下書きの削除に失敗しました。' });
  }
});

// Helper to run daily post publication and draft sliding / generation
async function executeDailyPostRollover(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { keywords: true },
  });

  if (!shop) {
    throw new Error('店舗が見つかりませんでした。');
  }

  let draftPostsArr = [];
  if (shop.keywords && shop.keywords.draft_posts) {
    try {
      draftPostsArr = JSON.parse(shop.keywords.draft_posts);
    } catch (err) {
      console.error('❌ Failed to parse drafts:', err);
    }
  }

  const cleanDrafts = draftPostsArr.filter((d: any) => d.dayIndex !== -1);

  if (cleanDrafts.length === 0) {
    throw new Error('下書きが存在しないため、自動生成処理を実行できません。先にダッシュボードで初期下書きを作成してください。');
  }

  const publishedPost = cleanDrafts[0];

  let gbpPublished = false;
  let gbpResponse = null;

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const locationIdInput = shop.google_location_id || (shop.keywords && shop.keywords.gbp_action_url);

  let resolvedPath: string | null = null;
  if (clientID && clientSecret && refreshToken && locationIdInput) {
    try {
      const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      resolvedPath = await resolveGoogleLocationPath(oauth2Client, locationIdInput);
    } catch (resolveErr: any) {
      console.error('⚠️ Failed to resolve location path for rollover:', resolveErr.message || resolveErr);
    }
  }

  if (resolvedPath) {
    console.log(`📡 Attempting real GBP post creation for location: ${resolvedPath}`);
    try {
      const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      let mediaPayload = undefined;
      if (publishedPost.imageFileId) {
        const apiBaseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_API_BASE_URL || 'http://localhost:3000';
        const sourceUrl = `${apiBaseUrl}/api/shops/${shopId}/drive-images/${publishedPost.imageFileId}/view`;
        console.log(`📸 Attaching image to GBP post: ${sourceUrl}`);
        mediaPayload = [
          {
            mediaFormat: 'PHOTO',
            sourceUrl: sourceUrl,
          }
        ];
      }

      let finalPostText = publishedPost.text;
      if (shop.keywords && shop.keywords.fixed_footer) {
        finalPostText = `${finalPostText}\n\n━━━━━━━━━━━━━━━━\n${shop.keywords.fixed_footer}`;
      }

      let normalizedText = finalPostText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n');

      const gbpPostText = normalizedText
        .split('\n')
        .map((line: string) => {
          const trimmed = line.trim();
          if (trimmed === '') {
            return '　\u200B';
          }
          return trimmed;
        })
        .join('\n');

      let callToActionPayload = undefined;
      if (shop.keywords && shop.keywords.gbp_action_url) {
        console.log(`🔗 Attaching Call-to-Action button to GBP post: ${shop.keywords.gbp_action_url}`);
        callToActionPayload = {
          actionType: 'LEARN_MORE',
          url: shop.keywords.gbp_action_url
        };
      }

      const response = await oauth2Client.request({
        url: `https://mybusiness.googleapis.com/v4/${resolvedPath}/localPosts`,
        method: 'POST',
        data: {
          languageCode: 'ja-JP',
          summary: gbpPostText,
          topicType: 'STANDARD',
          ...(mediaPayload ? { media: mediaPayload } : {}),
          ...(callToActionPayload ? { callToAction: callToActionPayload } : {})
        }
      });

      gbpPublished = true;
      gbpResponse = response.data;
      console.log('✅ Successfully published real post to Google Business Profile!');
    } catch (gbpError: any) {
      console.error('⚠️ Real GBP publishing failed:', gbpError.message || gbpError);
    }
  }

  let driveFilesList: any[] = [];
  const auth = getGoogleAuthClient();
  if (auth && shop.google_drive_folder_id) {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const driveRes = await drive.files.list({
        q: `parents in '${shop.google_drive_folder_id}' and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000,
      });
      if (driveRes.data.files) {
        driveFilesList = driveRes.data.files.map((f: any) => ({ id: f.id || '', name: f.name || '' }));
      }
    } catch (driveErr) {
      console.error('⚠️ Failed to fetch Drive files for batch rollover:', driveErr);
    }
  }

  const nextDayMinus1 = {
    dayIndex: -1,
    title: '本日投稿済みの下書き',
    text: publishedPost.text,
    subKeywords: publishedPost.subKeywords,
    imageFileId: publishedPost.imageFileId || null,
    publishedAt: new Date().toISOString(),
  };

  const draft1 = cleanDrafts[1] || publishedPost;
  const draft2 = cleanDrafts[2] || publishedPost;

  const nextDay0 = {
    dayIndex: 0,
    title: '明日投稿予定の下書き (Day 0)',
    text: draft1.text,
    subKeywords: draft1.subKeywords,
    imageFileId: draft1.imageFileId || null,
  };

  const nextDay1 = {
    dayIndex: 1,
    title: '明後日投稿予定の下書き (Day 1)',
    text: draft2.text,
    subKeywords: draft2.subKeywords,
    imageFileId: draft2.imageFileId || null,
  };

  const imageCount = driveFilesList.length;
  const isAlternating = imageCount >= 1 && imageCount < 10;
  const forceTextOnlyForDay2 = isAlternating ? !!draft2.imageFileId : false;

  const newDay2Raw = await generateSingleDraft(shop, 2, driveFilesList, forceTextOnlyForDay2);
  const nextDay2 = {
    dayIndex: 2,
    title: '明々後日投稿予定の下書き (Day 2)',
    text: newDay2Raw.text,
    subKeywords: newDay2Raw.subKeywords,
    imageFileId: newDay2Raw.imageFileId || null,
  };

  const newDrafts = [nextDayMinus1, nextDay0, nextDay1, nextDay2];

  await prisma.shopKeywords.update({
    where: { shop_id: shopId },
    data: {
      draft_posts: JSON.stringify(newDrafts)
    }
  });

  return {
    publishedPost,
    gbpPublished,
    gbpResponse,
    newDrafts,
  };
}

// POST /api/shops/:shopId/batch/run-daily-post
app.post('/api/shops/:shopId/batch/run-daily-post', async (req, res) => {
  const { shopId } = req.params;

  try {
    const result = await executeDailyPostRollover(shopId);

    return res.json({
      success: true,
      message: '自動投稿およびスライド生成処理が正常に完了しました！',
      publishedPost: {
        text: result.publishedPost.text,
        subKeywords: result.publishedPost.subKeywords,
        simulated: !result.gbpPublished,
        gbpResponse: result.gbpResponse,
      },
      newDrafts: result.newDrafts,
    });

  } catch (error: any) {
    console.error('❌ Daily post rollover error:', error);
    return res.status(500).json({ error: error.message || '自動生成バッチ処理の実行に失敗しました。' });
  }
});

// Helper to dynamically resolve short/numeric GMB location ID into a full accounts/.../locations/... GMB path
async function resolveGoogleLocationPath(oauth2Client: any, locationIdInput: string): Promise<string | null> {
  if (!locationIdInput) return null;
  
  if (locationIdInput.startsWith('accounts/')) {
    return locationIdInput;
  }

  const numMatch = locationIdInput.match(/\d+/);
  if (!numMatch) return null;
  const numericalId = numMatch[0];

  try {
    const mybusiness = google.mybusinessaccountmanagement({
      version: 'v1',
      auth: oauth2Client
    });
    const accountsRes = await mybusiness.accounts.list();
    const accounts = accountsRes.data.accounts || [];
    
    for (const account of accounts) {
      if (account.name) {
        return `${account.name}/locations/${numericalId}`;
      }
    }
  } catch (err: any) {
    console.error('❌ Failed to resolve GMB location path prefix dynamically:', err.message || err);
  }
  return null;
}

const alreadyPostedToday = new Set<string>();

// ==============================================================================
// ⏱️ Background Automated Scheduler (Hourly execution check)
// ==============================================================================
async function runBackgroundScheduler() {
  console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Running 365ボイス background scheduler cycle...`);

  try {
    const shops = await prisma.shop.findMany({
      where: { role: 'OWNER' },
      include: { keywords: true },
    });

    const now = new Date();
    
    const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });
    const parts = jstFormatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;

    const todayStr = `${year}-${month}-${day}`;
    const currentHour = parseInt(hour || '0', 10);

    if (currentHour === 0) {
      alreadyPostedToday.clear();
      console.log('🧹 Midnight JST reached: Cleared scheduler memory set for the new day.');
    }

    for (const shop of shops) {
      if (shop.post_active && shop.keywords) {
        const postTimeHour = (shop.keywords as any).post_time_hour ?? 12;

        if (currentHour === postTimeHour) {
          const memoryKey = `${shop.id}_${todayStr}`;
          if (!alreadyPostedToday.has(memoryKey)) {
            console.log(`⏱️ Daily post triggered for store: "${shop.name}" at ${postTimeHour}:00 (Current Hour: ${currentHour})`);
            alreadyPostedToday.add(memoryKey);

            try {
              await executeDailyPostRollover(shop.id);
              console.log(`✅ Automatically completed daily post & slide for store: "${shop.name}"`);
            } catch (postErr: any) {
              console.error(`❌ Background daily post failed for store "${shop.name}":`, postErr.message || postErr);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Scheduler error:', err);
  }
}

// POST /api/batch/trigger-scheduler
app.post('/api/batch/trigger-scheduler', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('❌ CRON_SECRET environment variable is not set on the server!');
    return res.status(500).json({ error: 'サーバー側でCronセキュリティキーが設定されていません。' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証キーが提供されていません。' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== cronSecret) {
    return res.status(403).json({ error: '認証キーが一致しません。アクセスが拒否されました。' });
  }

  console.log('📡 [セキュアCronリクエスト受信] バックグラウンドバッチ同期スケジュールを起動します...');
  
  runBackgroundScheduler()
    .then(() => console.log('✅ Secure background scheduler execution completed successfully.'))
    .catch((err) => console.error('❌ Secure background scheduler execution failed:', err.message || err));

  return res.json({ success: true, message: 'バックグラウンドバッチ処理（自動投稿＆自動スライド）を正常に起動しました！' });
});

// Start express server
app.listen(port, () => {
  console.log(`\n================================================================================`);
  console.log(`🚀 365ボイス - Express API Server running on: http://localhost:${port}`);
  console.log(`📅 Started on: ${new Date().toLocaleString()}`);
  console.log(`================================================================================\n`);

  console.log('⏱️ [Internal Scheduler] Initializing internal fallback scheduler (10-minute intervals)...');
  setInterval(async () => {
    console.log('⏰ [Internal Scheduler] Executing automatic background sync cycle...');
    try {
      await runBackgroundScheduler();
      console.log('✅ [Internal Scheduler] Completed background sync cycle successfully.');
    } catch (err: any) {
      console.error('❌ [Internal Scheduler] Background sync cycle failed:', err.message || err);
    }
  }, 10 * 60 * 1000);

  setTimeout(async () => {
    console.log('⏰ [Internal Scheduler] Executing initial startup background sync...');
    try {
      await runBackgroundScheduler();
      console.log('✅ [Internal Scheduler] Completed initial startup background sync.');
    } catch (err: any) {
      console.error('❌ [Internal Scheduler] Initial startup background sync failed:', err.message || err);
    }
  }, 15 * 1000);
});
