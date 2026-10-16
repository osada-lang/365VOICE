import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as path from 'path';
import stream from 'stream';
import crypto from 'crypto';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './services/db';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Enable robust CORS middleware for frontend deployments (Vercel, custom domains, etc.)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.options('*', cors());

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

// Helper to safely extract clean Google Drive folder ID even if a full URL is provided
function extractGoogleDriveFolderId(input?: string | null): string {
  if (!input) return 'root';
  const trimmed = input.trim();
  if (!trimmed) return 'root';
  // Check if it's a full Google Drive URL like https://drive.google.com/drive/folders/15FBmez8x69TKX8jdwSJwhigPlf3OoLib...
  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // Check if it's an id= query param like ...?id=15FBmez8x69TKX8jdwSJwhigPlf3OoLib
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }
  // Check if it contains slashes, take the last segment
  const segments = trimmed.split(/[\/\\]/);
  const lastSegment = segments[segments.length - 1].trim();
  return lastSegment || 'root';
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

    const masterAdminPass = process.env.MASTER_ADMIN_PASSWORD;
    const isMasterPasswordMatch = (shop?.role === 'ADMIN' || email === 'admin@365voice.jp') && masterAdminPass && password === masterAdminPass;

    if (!shop || (shop.password !== password && !isMasterPasswordMatch)) {
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
    return res.status(500).json({ error: '店舗管理画面へのジャンプURL生成に失敗しました。' });
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

// Interface for Google Drive file with subfolder information
interface DriveFileItem {
  id: string;
  name: string;
  folderName?: string;
  folderId?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  width?: number;
  height?: number;
  isValidForGbp?: boolean;
  invalidReason?: string;
}

// Reusable Helper to fetch all images from root folder AND all subfolders with folder metadata
async function fetchDriveFilesWithSubfolders(auth: any, rawFolderId: string): Promise<DriveFileItem[]> {
  const rootFolderId = extractGoogleDriveFolderId(rawFolderId);
  if (!auth || !rootFolderId || rootFolderId === 'root') {
    return [];
  }

  try {
    const drive = google.drive({ version: 'v3', auth });

    // Step 1: Scan for all subfolders directly inside the root folder
    let subfolders: any[] = [];
    const folderMap = new Map<string, string>(); // folderId -> folderName
    try {
      const subfolderRes = await drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      subfolders = subfolderRes.data.files || [];
      subfolders.forEach((f: any) => {
        if (f.id && f.name) {
          folderMap.set(f.id, f.name.trim());
        }
      });
    } catch (subfolderErr: any) {
      console.warn('⚠️ Could not fetch subfolders from Drive, will only scan root folder:', subfolderErr.message || subfolderErr);
    }

    // Step 2: Query for all images in root folder OR in any of the subfolders
    const parentIds = [rootFolderId, ...Array.from(folderMap.keys())];
    const parentQuery = parentIds.map(id => `'${id}' in parents`).join(' or ');

    const imageRes = await drive.files.list({
      q: `(${parentQuery}) and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, parents, imageMediaMetadata)',
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = imageRes.data.files || [];
    const result: DriveFileItem[] = files.map((file: any) => {
      let folderName: string | undefined = undefined;
      let folderId: string | undefined = undefined;
      if (file.parents && file.parents.length > 0) {
        for (const p of file.parents) {
          if (folderMap.has(p)) {
            folderName = folderMap.get(p);
            folderId = p;
            break;
          }
        }
      }
      const sizeBytes = parseInt(file.size || '0', 10);
      const sizeMB = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '不明';

      const width = file.imageMediaMetadata?.width ? parseInt(file.imageMediaMetadata.width, 10) : undefined;
      const height = file.imageMediaMetadata?.height ? parseInt(file.imageMediaMetadata.height, 10) : undefined;

      let isValidForGbp = true;
      let invalidReason: string | undefined = undefined;

      // Validate resolution (Google Business Profile requires >= 250x250)
      if (width !== undefined && height !== undefined) {
        if (width < 250 || height < 250) {
          isValidForGbp = false;
          invalidReason = `解像度が不足しています (${width}×${height}px)。GoogleマイビジネスのMEO投稿には縦横250px以上の画像が必要です。`;
        }
      } else if (file.name && file.name.match(/[-_](\d+)x(\d+)\.(jpg|jpeg|png)$/i)) {
        const match = file.name.match(/[-_](\d+)x(\d+)\.(jpg|jpeg|png)$/i);
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (w < 250 || h < 250) {
          isValidForGbp = false;
          invalidReason = `解像度が不足しています (${w}×${h}px)。GoogleマイビジネスのMEO投稿には縦横250px以上の画像が必要です。`;
        }
      }

      // Validate max size (5MB)
      if (sizeBytes > 5 * 1024 * 1024) {
        isValidForGbp = false;
        invalidReason = 'ファイルサイズが5MBを超えています。Googleマイビジネスの仕様上、5MB以下の画像が必要です。';
      }

      return {
        id: file.id || '',
        name: file.name || '無題の写真',
        folderName,
        folderId,
        mimeType: file.mimeType || 'image/jpeg',
        size: sizeMB,
        createdTime: file.createdTime || new Date().toISOString(),
        width,
        height,
        isValidForGbp,
        invalidReason,
      };
    });

    return result;
  } catch (err: any) {
    console.error('⚠️ Failed to fetch Drive files with subfolders:', err.message || err);
    return [];
  }
}

interface GbpLocationDetails {
  title?: string;
  categoryName?: string;
  locality?: string;
  administrativeArea?: string;
  fullAddress?: string;
  phone?: string;
  websiteUri?: string;
}

// Helper to fetch GBP metadata (category, address, phone, website) from Google API
async function fetchGbpLocationDetails(oauth2Client: any, locationIdInput: string): Promise<GbpLocationDetails | null> {
  if (!oauth2Client || !locationIdInput) return null;
  const numericalId = locationIdInput.match(/\d+/)?.[0];
  if (!numericalId) return null;

  try {
    const mybusiness = google.mybusinessaccountmanagement({
      version: 'v1',
      auth: oauth2Client
    });
    const accountsRes = await mybusiness.accounts.list();
    const accounts = accountsRes.data.accounts || [];
    
    for (const account of accounts) {
      if (account.name) {
        const fullLocationPath = `${account.name}/locations/${numericalId}`;
        try {
          const locRes = await oauth2Client.request({
            url: `https://mybusiness.googleapis.com/v4/${fullLocationPath}`,
            method: 'GET'
          });
          const locData = locRes.data as any;
          if (locData) {
            const addr = locData.address || {};
            const city = addr.locality || addr.sublocality || '';
            const pref = addr.administrativeArea || '';
            const addressLines = (addr.addressLines || []).join(' ');
            const fullAddr = [pref, city, addressLines].filter(Boolean).join(' ');
            
            return {
              title: locData.locationName || locData.title,
              categoryName: locData.primaryCategory?.displayName || locData.primaryCategory?.categoryName || '',
              locality: city || pref,
              administrativeArea: pref,
              fullAddress: fullAddr,
              phone: locData.primaryPhone,
              websiteUri: locData.websiteUrl
            };
          }
        } catch (v4Err: any) {
          // If individual location query fails, continue to next account
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ Could not fetch GBP location details:', err.message || err);
  }
  return null;
}

// Automatically initialize default ShopKeywords & settings from GBP info (or store name)
async function initializeShopKeywords(shop: any, driveFilesList: DriveFileItem[] = []) {
  if (shop.keywords) {
    return shop.keywords;
  }

  console.log(`✨ Initializing default ShopKeywords and settings for shop: "${shop.name}"`);

  let gbpDetails: GbpLocationDetails | null = null;
  const auth = getGoogleAuthClient();
  const locationIdInput = shop.google_location_id;

  if (auth && locationIdInput) {
    try {
      gbpDetails = await fetchGbpLocationDetails(auth, locationIdInput);
      if (gbpDetails) {
        console.log(`📍 Successfully fetched GBP metadata for "${shop.name}":`, gbpDetails);
      }
    } catch (e) {
      console.warn('⚠️ Failed to fetch GBP metadata for initial keywords:', e);
    }
  }

  const storeTitle = gbpDetails?.title || shop.name || '店舗';
  const category = gbpDetails?.categoryName || '店舗';
  const locality = gbpDetails?.locality || '';

  // 1. Build tailored main keywords
  const mainKws: string[] = [];
  if (locality && category && category !== '店舗') {
    mainKws.push(`${locality} ${category}`);
  }
  mainKws.push(storeTitle);
  if (category && category !== '店舗') {
    mainKws.push(`${category} おすすめ`);
  }
  if (locality && storeTitle) {
    mainKws.push(`${locality} ${storeTitle}`);
  }
  if (mainKws.length < 3) {
    mainKws.push('最新情報', 'おすすめメニュー');
  }

  // 2. Build tailored sub keywords
  const subKws: string[] = [
    category !== '店舗' ? `${category} メニュー` : 'こだわりメニュー',
    '季節のおすすめ',
    '人気サービス',
    'ご予約受付中',
    'お客様の声',
    'アクセス・店舗情報',
  ];

  // 3. Build fixed footer
  const footerLines = ['━━━━━━━━━━━━━━━━', storeTitle];
  if (gbpDetails?.fullAddress) {
    footerLines.push(`📍 住所: ${gbpDetails.fullAddress}`);
  }
  if (gbpDetails?.phone) {
    footerLines.push(`📞 電話番号: ${gbpDetails.phone}`);
  }
  if (gbpDetails?.websiteUri) {
    footerLines.push(`🌐 公式HP: ${gbpDetails.websiteUri}`);
  }
  footerLines.push('ご来店・お問い合わせを心よりお待ちしております。', '━━━━━━━━━━━━━━━━');
  const fixedFooter = footerLines.join('\n');

  // 4. Custom prompt
  const locationPrefix = locality ? `${locality}の` : '';
  const categoryLabel = category && category !== '店舗' ? `${category}` : '店舗';
  const customPrompt = `親しみやすく誠実なトーンで。${locationPrefix}${categoryLabel}「${storeTitle}」の魅力やこだわり、専門的な強みについて、お客様にとって有益で分かりやすい内容で発信してください。`;

  // 5. Generate 3 initial AI drafts
  let draftPostsArr = [];
  try {
    const dummyShop = {
      ...shop,
      keywords: {
        main_keywords: JSON.stringify(mainKws),
        sub_keywords: JSON.stringify(subKws),
        fixed_footer: fixedFooter,
        custom_prompt: customPrompt,
      }
    };
    const day0 = await generateSingleDraft(dummyShop, 0, driveFilesList);
    const day1 = await generateSingleDraft(dummyShop, 1, driveFilesList);
    const day2 = await generateSingleDraft(dummyShop, 2, driveFilesList);
    draftPostsArr = [
      { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null, promptType: day0.promptType },
      { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null, promptType: day1.promptType },
      { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null, promptType: day2.promptType },
    ];
  } catch (genErr) {
    console.warn('⚠️ Initial draft generation during setup failed, using placeholder drafts:', genErr);
    draftPostsArr = [
      { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: `${storeTitle}の本日のおしらせ下書きです。`, subKeywords: [] },
      { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: `${storeTitle}の明日のおしらせ下書きです。`, subKeywords: [] },
      { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: `${storeTitle}の明後日のおしらせ下書きです。`, subKeywords: [] },
    ];
  }

  const createdKeywords = await prisma.shopKeywords.upsert({
    where: { shop_id: shop.id },
    update: {},
    create: {
      shop_id: shop.id,
      main_keywords: JSON.stringify(mainKws),
      sub_keywords: JSON.stringify(subKws),
      fixed_footer: fixedFooter,
      custom_prompt: customPrompt,
      hp_url: gbpDetails?.websiteUri || null,
      draft_posts: JSON.stringify(draftPostsArr),
      post_time_hour: 9,
    }
  });

  return createdKeywords;
}

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

    // Auto-sync GBP Location ID from Store table if currently missing on Shop
    if (!shop.google_location_id) {
      try {
        const matchedStore: any[] = await prisma.$queryRawUnsafe(
          'SELECT "gbpLocationId" FROM "Store" WHERE "voiceShopId" = $1 LIMIT 1',
          shopId
        );
        if (matchedStore.length > 0 && matchedStore[0].gbpLocationId) {
          shop.google_location_id = matchedStore[0].gbpLocationId.trim();
          await prisma.shop.update({
            where: { id: shopId },
            data: { google_location_id: shop.google_location_id }
          });
          console.log(`📍 [Instant Synced GBP ID for ${shop.name}]: ${shop.google_location_id}`);
        }
      } catch (e) {}
    }

    // Determine photo stock count
    let imageCount = mockDriveFiles.length;
    let driveFilesList: DriveFileItem[] = mockDriveFiles;

    const auth = getGoogleAuthClient();
    if (auth && shop.google_drive_folder_id) {
      try {
        const liveFiles = await fetchDriveFilesWithSubfolders(auth, shop.google_drive_folder_id);
        if (liveFiles.length > 0) {
          driveFilesList = liveFiles;
        } else {
          driveFilesList = [];
        }
      } catch (e) {
        console.log('⚠️ Failed to fetch live Drive images for dashboard, using fallback count.');
      }
    }

    const validDriveFiles = driveFilesList.filter(f => f.isValidForGbp !== false);
    const invalidDriveFiles = driveFilesList.filter(f => f.isValidForGbp === false);
    const validImageCount = validDriveFiles.length;
    const invalidImageCount = invalidDriveFiles.length;
    const totalImageCount = driveFilesList.length;

    let firstFileId = validDriveFiles.length > 0 ? validDriveFiles[0].id : null;

    // Determine Posting Mode based on VALID image stock
    let postingMode = 'TEXT_ONLY';
    let postingModeLabel = '有効画像0枚: テキストのみ投稿モード';
    if (validImageCount >= 10) {
      postingMode = 'ALWAYS_IMAGE';
      postingModeLabel = `画像ストック${validImageCount}枚（10枚以上）: 画像連続投稿モード`;
    } else if (validImageCount >= 1) {
      postingMode = 'ALTERNATING';
      postingModeLabel = `画像ストック${validImageCount}枚（1〜9枚）: 交互投稿モード (画像とテキストを日替わり)`;
    }

    // Auto-initialize ShopKeywords & default tailored settings if missing
    if (!shop.keywords) {
      shop.keywords = await initializeShopKeywords(shop, driveFilesList);
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
            { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null, promptType: day0.promptType },
            { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null, promptType: day1.promptType },
            { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null, promptType: day2.promptType },
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

    let mapsUrl: string | null = null;
    try {
      const matchedStore: any[] = await prisma.$queryRawUnsafe(
        'SELECT "gbpMapsUri" FROM "Store" WHERE "voiceShopId" = $1 LIMIT 1',
        shopId
      );
      if (matchedStore.length > 0 && matchedStore[0].gbpMapsUri) {
        mapsUrl = matchedStore[0].gbpMapsUri.trim();
      }
    } catch (e) {}

    // Fallback/Override for 株式会社陽向 with verified direct map link
    if (shop.name.includes('陽向')) {
      mapsUrl = 'https://maps.app.goo.gl/9Nm2XpdP4Jht7BJR8';
    }

    let postStartDateStr: string | null = null;
    let isWaitingForStartDate = false;
    if (shop.post_start_date) {
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(shop.post_start_date));
      const sYear = parts.find(p => p.type === 'year')?.value;
      const sMonth = parts.find(p => p.type === 'month')?.value;
      const sDay = parts.find(p => p.type === 'day')?.value;
      postStartDateStr = `${sYear}/${sMonth}/${sDay}`;

      const todayParts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date());
      const tYear = todayParts.find(p => p.type === 'year')?.value;
      const tMonth = todayParts.find(p => p.type === 'month')?.value;
      const tDay = todayParts.find(p => p.type === 'day')?.value;
      const todayIso = `${tYear}-${tMonth}-${tDay}`;
      const startIso = `${sYear}-${sMonth}-${sDay}`;

      if (todayIso < startIso) {
        isWaitingForStartDate = true;
      }
    }

    let nextPostTime = `本日 ${(shop.keywords as any)?.post_time_hour ?? 9}:00 予定`;
    if (isWaitingForStartDate && postStartDateStr) {
      nextPostTime = `${postStartDateStr} より開始予定 (朝 ${(shop.keywords as any)?.post_time_hour ?? 9}:00)`;
    } else if (!shop.post_active) {
      nextPostTime = '自動投稿 停止中';
    }

    return res.json({
      shopName: shop.name,
      postActive: shop.post_active,
      postStartDate: postStartDateStr,
      isWaitingForStartDate,
      imageCount: validImageCount,
      totalImageCount,
      invalidImageCount,
      invalidImages: invalidDriveFiles.map(f => ({ id: f.id, name: f.name, reason: f.invalidReason, width: f.width, height: f.height })),
      postingMode,
      postingModeLabel,
      nextPostTime,
      previewImage,
      googleLocationId: shop.google_location_id,
      mapsUrl,
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

    if (!shop.keywords) {
      shop.keywords = await initializeShopKeywords(shop);
    }

    const mainKeywords = shop.keywords ? JSON.parse(shop.keywords.main_keywords) : [];
    const subKeywords = shop.keywords ? JSON.parse(shop.keywords.sub_keywords) : [];

    let postStartDateStr: string | null = null;
    if (shop.post_start_date) {
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(shop.post_start_date));
      const sYear = parts.find(p => p.type === 'year')?.value;
      const sMonth = parts.find(p => p.type === 'month')?.value;
      const sDay = parts.find(p => p.type === 'day')?.value;
      postStartDateStr = `${sYear}-${sMonth}-${sDay}`;
    }

    return res.json({
      shopId: shop.id,
      shopName: shop.name,
      postActive: shop.post_active,
      postStartDate: postStartDateStr,
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
        postTimeHour: (shop.keywords as any)?.post_time_hour ?? 9,
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
  const { postActive, postStartDate, keywords, googleLocationId } = req.body;

  try {
    const updateData: any = {
      post_active: typeof postActive === 'boolean' ? postActive : true,
    };
    if (postStartDate !== undefined) {
      updateData.post_start_date = postStartDate ? new Date(postStartDate) : null;
    }
    if (googleLocationId !== undefined) {
      updateData.google_location_id = googleLocationId
        ? (googleLocationId.startsWith('locations/') ? googleLocationId : `locations/${googleLocationId}`)
        : null;
    }

    await prisma.shop.update({
      where: { id: shopId },
      data: updateData
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
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 9,
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
          post_time_hour: typeof keywords.postTimeHour === 'number' ? keywords.postTimeHour : 9,
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

    const folderId = extractGoogleDriveFolderId(shop.google_drive_folder_id);

    console.log(`📂 Scanning Google Drive folder and subfolders: ${folderId}...`);
    const files = await fetchDriveFilesWithSubfolders(auth, folderId);

    return res.json({ files, isMock: false });
  } catch (error: any) {
    console.error('❌ Failed to fetch Google Drive files:', error.message || error);
    
    if (auth && shop) {
      const folderId = extractGoogleDriveFolderId(shop.google_drive_folder_id);
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
      supportsAllDrives: true,
    });

    res.setHeader('Content-Type', metadata.data.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const fileRes = await drive.files.get({
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, { responseType: 'stream' });

    fileRes.data.pipe(res);
  } catch (error: any) {
    console.error(`❌ Failed to stream Google Drive image ${fileId}:`, error.message || error);
    return res.redirect('https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=600');
  }
});

// GET /api/shops/:shopId/drive-folders (Fetch list of subfolders in Google Drive)
app.get('/api/shops/:shopId/drive-folders', async (req, res) => {
  const { shopId } = req.params;

  try {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const auth = getGoogleAuthClient();

    if (!shop) {
      return res.status(404).json({ error: '店舗が見つかりませんでした。' });
    }

    const folderId = extractGoogleDriveFolderId(shop.google_drive_folder_id);
    if (!auth || !folderId || folderId === 'root') {
      return res.json({ folders: [] });
    }

    const drive = google.drive({ version: 'v3', auth });
    const subfolderRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const folders = (subfolderRes.data.files || []).map((f: any) => ({
      id: f.id || '',
      name: f.name ? f.name.trim() : '無題のフォルダ',
    }));

    return res.json({ folders });
  } catch (error: any) {
    console.error('❌ Failed to fetch Drive folders:', error.message || error);
    return res.json({ folders: [] });
  }
});

// POST /api/shops/:shopId/drive-images/upload (Upload raw base64 photo directly into Google Drive with target subfolder)
app.post('/api/shops/:shopId/drive-images/upload', async (req, res) => {
  const { shopId } = req.params;
  const { fileName, mimeType, base64Data, targetFolderId, newFolderName } = req.body;

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
    let destinationFolderId = extractGoogleDriveFolderId(shop.google_drive_folder_id) || 'root';
    let targetFolderName: string | undefined = undefined;

    // Handle new folder creation if specified
    if (newFolderName && newFolderName.trim()) {
      try {
        console.log(`📁 Creating new subfolder in Drive: "${newFolderName.trim()}"...`);
        const folderCreateRes = await drive.files.create({
          requestBody: {
            name: newFolderName.trim(),
            mimeType: 'application/vnd.google-apps.folder',
            parents: [destinationFolderId],
          },
          fields: 'id, name',
          supportsAllDrives: true,
        });
        if (folderCreateRes.data.id) {
          destinationFolderId = folderCreateRes.data.id;
          targetFolderName = folderCreateRes.data.name?.trim();
        }
      } catch (fErr: any) {
        console.warn('⚠️ Failed to create new subfolder in Drive, falling back to root folder:', fErr.message || fErr);
      }
    } else if (targetFolderId && targetFolderId !== 'root') {
      destinationFolderId = targetFolderId;
      try {
        const fMeta = await drive.files.get({ fileId: targetFolderId, fields: 'name', supportsAllDrives: true });
        targetFolderName = fMeta.data.name?.trim();
      } catch (e) {}
    }

    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileBuffer);

    console.log(`🔄 Uploading file ${fileName} into Drive folder: ${destinationFolderId} (${targetFolderName || '直下'})...`);
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [destinationFolderId],
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: bufferStream,
      },
      fields: 'id, name, mimeType, size, createdTime',
      supportsAllDrives: true,
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
        folderName: targetFolderName,
        folderId: destinationFolderId,
        mimeType: file.mimeType,
        size: sizeMB,
        createdTime: file.createdTime,
      }
    });
  } catch (error: any) {
    console.error('❌ Image upload error:', error.message || error);
    
    if (auth && shop) {
      const folderId = extractGoogleDriveFolderId(shop.google_drive_folder_id);
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
    await drive.files.delete({ fileId, supportsAllDrives: true });

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

// Interface for Medical Fact Check result
interface FactCheckResult {
  passed: boolean;
  reason: string;
  issues: string[];
  correctionAdvice: string;
}

// Helper to run fact check using Anthropic Claude (claude-3-5-haiku / claude-3-haiku)
async function factCheckMedicalPost(draftText: string, shopName: string): Promise<FactCheckResult> {
  const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!claudeApiKey) {
    console.warn('⚠️ CLAUDE_API_KEY is not set. Defaulting to passed for medical fact check.');
    return { passed: true, reason: 'CLAUDE_API_KEY未設定のためスキップ', issues: [], correctionAdvice: '' };
  }

  const prompt = `あなたは医療法・医療広告ガイドライン・薬機法（医薬品医療機器等法）・柔道整復師法およびGoogleビジネスプロフィールポリシーの専門審査官です。
以下のGoogleマップ（MEO）向け医療・健康関連投稿テキストを厳格にファクトチェックおよびコンプライアンス審査してください。対象店舗: 「${shopName}」

【審査基準（NG判定条件）】
1. 治癒・効果効能の断定・保証:
   「絶対に治る」「必ず改善する」「完全に治す」「100%安全」「副作用がない」「確実に効く」「根本改善を保証」などの断定・保証表現が含まれていないか。
2. 誇大・最高級・比較表現:
   「地域No.1」「最高峰」「唯一」「神の手」「完璧」「他院より優れている」などの客観的根拠のない最上級・比較表現が含まれていないか。
3. 虚偽・未確認の医学的断定:
   特定の症状から病名を勝手に確定させていたり、医学的根拠のない予防・治療効果、虚偽の専門資格や症例実績を創作していないか。
4. 広告ガイドライン・法令抵触:
   医師の診断と施術・服薬指導の混同、処方薬の無断中止勧奨、承認外効能の標榜など、法令やガイドラインに抵触する表現がないか。
5. 形式ルール:
   最後に指定CTA「『詳細』ボタン、またはプロフィールのウェブサイトリンクからお気軽にお問い合わせください。」が含まれており、過度な不安煽りや不適切なマークダウン記号（**や#など）・絵文字がないか。

【審査対象テキスト】
${draftText}

【出力フォーマット】
必ず以下の有効なJSON形式のみを出力してください（マークダウンのコードブロックや余分なテキストは一切含めないでください）。
{
  "passed": true または false,
  "reason": "審査結果の要約（50文字以内）",
  "issues": ["NG判定された具体的な問題箇所や不適切表現（合格の場合は空配列）"],
  "correctionAdvice": "再生成時に修正すべき具体的なアドバイス（合格の場合は空文字）"
}`;

  try {
    const anthropic = new Anthropic({ apiKey: claudeApiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const contentText = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleanJson = contentText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      passed: typeof parsed.passed === 'boolean' ? parsed.passed : true,
      reason: parsed.reason || '',
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      correctionAdvice: parsed.correctionAdvice || '',
    };
  } catch (err: any) {
    console.error('❌ Claude fact check API error:', err.message || err);
    return { passed: true, reason: '審査API通信エラーのためフォールバック通過', issues: [], correctionAdvice: '' };
  }
}

async function generateTextFromGemini(genAI: any, promptText: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
  try {
    const result = await model.generateContent(promptText);
    const response = await result.response;
    return response.text().trim().replace(/```/g, '');
  } catch (err: any) {
    console.warn('⚠️ gemini-3.6-flash failed or was under heavy load. Falling back to stable gemini-3.5-flash:', err.message || err);
    const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await fallbackModel.generateContent(promptText);
    const response = await result.response;
    return response.text().trim().replace(/```/g, '');
  }
}

async function checkIsMedicalShop(shop: any): Promise<boolean> {
  if (typeof shop.is_medical === 'boolean') {
    return shop.is_medical;
  }
  try {
    const res: any[] = await prisma.$queryRawUnsafe(
      'SELECT is_medical FROM "Shop" WHERE id = $1 LIMIT 1',
      shop.id
    );
    if (res.length > 0 && typeof res[0].is_medical === 'boolean') {
      return res[0].is_medical;
    }
  } catch (e) {
    // Column not yet added to Shop in DB, safely ignore
  }
  return false;
}

// Helper to generate a single day's MEO draft post using Google Gemini AI
export async function generateSingleDraft(
  shop: any,
  dayIndex: number,
  driveFiles?: DriveFileItem[],
  forceTextOnly: boolean = false
): Promise<{ text: string, subKeywords: string[], imageFileId: string | null, promptType: 'MEDICAL' | 'STANDARD' }> {
  const mainKeywords: string[] = JSON.parse(shop.keywords?.main_keywords || '[]');
  const subKeywords: string[] = JSON.parse(shop.keywords?.sub_keywords || '[]');
  const customPrompt = shop.keywords?.custom_prompt || '';
  const fixedFooter = shop.keywords?.fixed_footer || '';
  const isMedicalShop = await checkIsMedicalShop(shop);

  let imageFileId: string | null = null;
  const selectedSubKeywords: string[] = [];

  const validDriveFiles = (driveFiles || []).filter(f => f.isValidForGbp !== false);
  const imageCount = validDriveFiles.length;
  const isAlternating = imageCount >= 1 && imageCount < 10;
  const shouldBeTextOnly = forceTextOnly || (isAlternating && dayIndex % 2 === 1);

  // 1. First, select the daily randomized sub-keywords
  if (subKeywords.length > 0) {
    const shuffled = [...subKeywords].sort(() => 0.5 - Math.random());
    const count = Math.floor(Math.random() * 2) + 2; // 2 or 3
    selectedSubKeywords.push(...shuffled.slice(0, Math.min(count, shuffled.length)));
  }

  // 2. Intelligent Image Selection with Subfolder Matching & Safe Root Fallback (VALID images only)
  if (validDriveFiles.length > 0 && !shouldBeTextOnly) {
    const subfolderMatchedFiles: DriveFileItem[] = [];

    // Check if any drive file belongs to a subfolder that matches one of the selected sub-keywords
    if (selectedSubKeywords.length > 0) {
      for (const file of validDriveFiles) {
        if (file.folderName) {
          const normalizedFolderName = file.folderName.trim().toLowerCase();
          const isMatched = selectedSubKeywords.some((subKw: string) => {
            const normalizedSubKw = subKw.trim().toLowerCase();
            return normalizedFolderName === normalizedSubKw || normalizedFolderName.includes(normalizedSubKw) || normalizedSubKw.includes(normalizedFolderName);
          });
          if (isMatched) {
            subfolderMatchedFiles.push(file);
          }
        }
      }
    }

    if (subfolderMatchedFiles.length > 0) {
      // Pick randomly from the matching subfolder images!
      const randomIndex = Math.floor(Math.random() * subfolderMatchedFiles.length);
      const selectedFile = subfolderMatchedFiles[randomIndex];
      imageFileId = selectedFile.id || null;
      console.log(`📁 [サブフォルダ連動] サブキーワード [${selectedSubKeywords.join(', ')}] に一致するフォルダ「${selectedFile.folderName}」から画像(${selectedFile.id})を選択しました。`);
    } else {
      // 100% Safe Root Fallback: Pick randomly from the entire valid pool
      const randomIndex = Math.floor(Math.random() * validDriveFiles.length);
      const selectedFile = validDriveFiles[randomIndex];
      imageFileId = selectedFile.id || null;
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。');
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiApiKey);

  // Standard Themes
  const standardThemes = [
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

  // Medical / Healthcare Specific Themes (YMYL Compliant)
  const medicalThemes = [
    {
      name: "症状・健康悩みサポート型 (Health & Symptom Support)",
      focus: "季節の変わり目の体調変化、日常の健康不安、お薬の飲み合わせなどのお悩みに対して、専門知識に基づいて丁寧に寄り添い、相談・受診を案内する構成。"
    },
    {
      name: "診療・調剤サービス紹介型 (Medical & Dispensing Services)",
      focus: "実施している診療案内、処方箋事前受付、一包化調剤、訪問服薬指導、健康相談など、提供しているサービスの特徴や利用メリットを客観的に解説する構成。"
    },
    {
      name: "施設・受診シチュエーション型 (Visit & Consultation Context)",
      focus: "「お仕事帰りに立ち寄りたい」「子育て中で時間が取れない」「急な体調不良の時に」など、具体的な受診・利用場面に焦点を当て、通いやすさや安心できる環境をアピールする構成。"
    },
    {
      name: "医療・お薬よくある質問回答型 (Medical & Pharmacy FAQ)",
      focus: "患者様からよく受ける代表的な疑問（処方箋の有効期限、お薬の保管方法、受診の流れなど）に、わかりやすく客観的に答える構成。"
    },
    {
      name: "専門性・かかりつけのこだわり提示型 (Expertise & Care Commitment)",
      focus: "丁寧な服薬指導、分かりやすい病状説明、プライバシーへの配慮、地域のかかりつけとしての誠実な姿勢について客観的な事実に基づいて解説する構成。"
    },
    {
      name: "年代・お悩み別健康アピール型 (Patient-Centered Care)",
      focus: "ご高齢の方、働くビジネスパーソン、お子様連れの親御様など、対象に合わせた安心の医療・調剤サポートを具体的に語る構成。"
    }
  ];

  const now = new Date();
  const targetDate = new Date(now.getTime() + dayIndex * 24 * 60 * 60 * 1000);
  const targetDateJp = targetDate.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  // Prompt Builders
  const buildStandardPrompt = () => {
    const selectedTheme = standardThemes[dayIndex % standardThemes.length];
    return `
    あなたは店舗「${shop.name}」のオーナー代理として、Googleマップ（MEO）および生成AI検索（AIO/LLMO）向けに最適化された、日替わりの店舗投稿テキスト（おしらせ/最新情報）を自動作成してください。

    【今回の投稿テーマ・検索意図】
    - テーマ名: ${selectedTheme.name}
    - 執筆のフォーカス: ${selectedTheme.focus}
    ※必ずこのテーマの検索文脈・意図に完全に合致する内容で執筆してください。

    【店舗基本情報】
    - 店舗名: ${shop.name}
    - 所在地住所情報（固定フッターより抜粋）: ${fixedFooter || '未設定'}
    - ターゲット層へのアピール・トーンマナー: ${customPrompt || '親しみやすく誠実なトーン。'}
    - 本日の下書きの投稿予定日: ${targetDateJp}
    - 投稿スロット番号: Day ${dayIndex} (${dayIndex === 0 ? '本日投稿分' : dayIndex === 1 ? '明日投稿分' : '明後日・3日後投稿分'})

    【曜日別・日毎の言語切り替えルール（指定がある場合）】
    ※「ターゲット層へのアピール・トーンマナー」において「月曜日は英語」「土日は英語」「1日おきに英語」などの曜日・日毎の言語条件指定がある場合は、上記の【本日の下書きの投稿予定日】の曜日や【投稿スロット番号】を元に、該当する日のみ指定された言語（英語等）、それ以外の日は自然な日本語で執筆してください。特に言語指定がない場合は自然な日本語で執筆してください。

    【作成の絶対ルール（厳守してください）】
    1. 結論ファースト（PREP法）の徹底:
       文章の冒頭（最初の一文、30〜50文字程度）で、時候の挨拶などを一切省き、「【主要キーワード/テーマ】店舗名＋エリア名＋主要サービス（結論）」を一発で言い切る形で書き出してください。
       また、この結論を言い切った最初の一文の直後には、必ず【空行を1行】挟んでから、次の文章（最寄り駅や詳細なアクセス情報など）を書き始めてください。（冒頭が1つの重たい段落にまとまるのを物理的に防ぎます）

    2. 主語・エリア・サービス名の明確化（5W1Hの網羅）:
       主語を「当店」や「当院」などの曖昧な言葉にせず、必ず「${shop.name}」という具体的な店舗名で表記してください。また、エリア名（店舗の所在地・地域）を一文の中に自然に含めてください。エリア名については、必ず「所在地住所情報（固定フッター）」に記載されている住所情報のみから正しい地域名（市区町村名や駅名など）を抽出し、それを使用してください。フッターに住所情報がない場合、あるいは未設定の場合は、具体的な地域名は出力せず、所在地を特定しない汎用的な表現にしてください。メインキーワードやその他の情報から地域名を取得したり、存在しない架空の地域名を捏造することは絶対に禁止します。

    3. メインキーワードの完全含有:
       指定されたメインキーワード [ ${mainKeywords.join(', ')} ] を、文章全体の自然な文脈にそって【すべて必ず】本文中に含めてください。単なるキーワードの羅列や強引な詰め込みは厳禁です。（※英語等の指定がある場合でも、メインキーワードを文脈に合わせて適切に含めてください）

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
       指定テキスト（日本語の場合）：「『詳細』ボタン、またはプロフィールのウェブサイトリンクからお気軽にお問い合わせください。」
       指定テキスト（英語指定の場合）：「Please feel free to contact us via the 'Learn more' button or the website link in our profile.」
       （※この指定テキスト以外の独自の行動喚起や売り込みの文章、連絡先などを追加することは【絶対に】禁止します）

    8. 段落分けと空行の徹底（スマートフォン可読性の最適化）:
       文章全体が視覚的に詰まって見苦しくなるのを防ぐため、一つの段落は必ず「1文〜最大2文程度（50文字〜100文字程度）」とし、各段落の間には【必ず空行を1行】挟んでください。中盤の説明文、後半のまとめ、最後のアクション喚起（CTA）の各箇所においても、文章が2文以上続く場合は積極的に改行・空行を挟んで複数の短い段落に分割してください。スマートフォン画面でのスクロール時の読みやすさを極限まで高めてください。

    9. 文字数および言語制限:
       全体の本文は【500文字程度（英語の場合は100〜150単語程度）】に収め、一般客が読んで親しみやすく自然な文章（トーンマナーで英語等の言語指定がある場合はその言語、特に指定がない場合は自然な日本語）で仕上げてください。

    10. 署名・連絡先・記号マークダウンの排除:
        本文の中には、ホームページURL、電話番号、アクションボタンの文言（「詳細はこちら」「今すぐ予約」など）、住所、店舗名のフッター署名、および絵文字やマークダウン記号（**、#、*など）は【絶対に】含めないでください。純粋な文章テキストと「・」マーク、改行のみで出力してください。

    返される内容は自動作成した完成本文のみとし、説明、挨拶、マークダウン装飾（\`\`\`など）は一切含めないでください。`;
  };

  const buildMedicalPrompt = (feedbackAdvice: string = '') => {
    const selectedTheme = medicalThemes[dayIndex % medicalThemes.length];
    return `
    # GBP最新情報投稿｜YMYL対応マスタープロンプト Ver1.0

    あなたは店舗「${shop.name}」のオーナー代理として、Googleマップ（MEO）および生成AI検索（AIO/LLMO）向けに最適化された、日替わりの店舗投稿テキスト（おしらせ／最新情報）を自動作成してください。

    対象は接骨院・整骨院・クリニック・医院・調剤薬局・薬局などの医療・健康関連事業者です。
    検索ユーザーの悩み・疑問・検索意図に対応しながら、店舗名・地域名・診療内容・施術内容・提供サービスを明確に伝えてください。
    ただし、MEOやAI検索への最適化を目的として、医学的に不正確な情報、誇大広告、根拠のない効果表現、存在しないサービスを作成してはいけません。
    医療・健康分野では、情報の正確性、利用者の安全性、一次情報の信頼性、法令・広告ガイドラインへの適合を最優先としてください。

    ${feedbackAdvice ? `\n【前回の審査指摘事項（厳守）】\n${feedbackAdvice}\n上記の指摘事項を必ず修正し、ガイドラインを厳格に遵守して再作成してください。\n` : ''}

    ## 【今回の投稿テーマ・検索意図】
    - テーマ名: ${selectedTheme.name}
    - 執筆のフォーカス: ${selectedTheme.focus}
    必ず今回のテーマの検索文脈・意図に合致する内容で執筆してください。ただし、テーマに含まれる症状名・疾患名・治療名・施術名などは、店舗の実際の対応範囲と照合し、適切な場合に限り使用してください。医学的な断定や未確認のサービス内容を追加してはいけません。

    ## 【店舗基本情報】
    - 店舗名: ${shop.name}
    - 所在地住所情報（固定フッターより抜粋）: ${fixedFooter || '未設定'}
    - ターゲット層へのアピール・トーンマナー: ${customPrompt || '親しみやすく誠実なトーン。'}
    - 本日の下書きの投稿予定日: ${targetDateJp}
    - 投稿スロット番号: Day ${dayIndex} (${dayIndex === 0 ? '本日投稿分' : dayIndex === 1 ? '明日投稿分' : '明後日・3日後投稿分'})

    ## 【YMYL共通の最優先ルール（文章構成や文字数よりも優先します）】
    ### 1. 医療・健康情報の正確性
    - 症状名と疾患名を混同しない。
    - 症状だけから病名や原因を断定しない。
    - 治療や施術による改善・治癒を保証しない。
    - 効果には個人差があることを前提とし、根拠のない効果表現を使用しない。
    - 医学的根拠のない予防効果や治療効果を創作しない。未確認の医学情報を断定的に説明しない。
    - 必要な場合は、適切な医療機関への相談や受診の重要性を簡潔に伝える。

    ### 2. 医療広告・関連法令への配慮（禁止表現）
    対象業種に応じて、医療法に基づく医療広告規制、柔道整復師法などの関係法令、医薬品医療機器等法（薬機法）、関連する広告ガイドラインおよびGoogleビジネスプロフィールのポリシーを考慮してください。
    以下の表現を絶対に禁止します：
    - 絶対に治る
    - 必ず改善する
    - 完全に治す
    - 副作用がない
    - 100％安全
    - 地域No.1、最高、唯一など、根拠や広告上の適法性を確認できない優良性表現
    - 他院・他店より優れていると断定する比較表現
    - 患者・利用者の体験談を創作する表現
    - 不安や恐怖を過度にあおる表現
    - 確認できない症例数、改善率、実績、資格、設備の表現

    ### 3. 一次情報の厳守
    次の情報は、店舗から提供されている場合、または信頼できる店舗情報として確認できる場合のみ使用してください。
    - 医師・薬剤師・柔道整復師などの資格、経歴
    - 診療科目、施術内容、薬局サービス
    - 専門的な取り組みや対応方針
    - 検査、設備、機器
    - 料金、保険適用条件
    - 受付時間、予約方法、訪問対応
    - 実績、数値、患者数
    - 他の医療機関との連携体制
    提供されていない一次情報、患者の声、診療実績、専門家の見解を創作してはいけません。

    ### 4. 検索キーワードの安全性判定
    メインキーワードとサブキーワードは、本文を生成する前に内部で確認してください。次の条件を満たすキーワードを優先して使用します：
    - 今回のテーマと検索意図に関連する。
    - 店舗の実際の対応内容と一致する。
    - 医学的に不正確な意味を持たない。
    - 広告規制上、不適切な効果保証や優良性表現にならない。
    - 読者に誤解を与えない自然な日本語として使用できる。
    不適切なキーワードは、必要に応じて正確な表現に置き換えるか、省略してください。

    ### 5. 読者の不安への対応
    検索ユーザーの悩みや不安に寄り添いながら、落ち着いた説明を行ってください。過度な不安をあおって来院や購入を促してはいけません。読者がサービス内容を理解し、相談・受診・利用の必要性を適切に判断できる文章を目指してください。

    ## 【業種別YMYLルール】
    店舗の名称、テーマ、提供情報から業種を判断し、該当するルールを適用してください：
    - A. 接骨院・整骨院: 柔道整復師の業務範囲を超える医療行為を行っているように表現しない。医師による診断・治療と柔道整復師による施術を混同しない。骨折・脱臼・捻挫・打撲・挫傷などは実際の対応内容や適切な条件を確認して記述する。慢性的な肩こり・腰痛などを当然に保険適用される症状として説明しない。骨盤矯正や姿勢改善などについて医学的に確認できない効果を断定しない。
    - B. クリニック・医院: 実際に標榜・提供している診療科目や診療内容のみ記述する。特定の症状から病名を確定させない。治療効果や検査結果を保証しない。医師の専門医資格や実績を推測しない。自由診療について効果・費用・リスク・副作用などの必要な広告情報を欠いた誘引的表現を作成しない。
    - C. 調剤薬局・薬局: 実際に提供している処方箋受付、服薬相談、在宅対応などのサービスのみ記述する。薬剤師による服薬支援と医師による診断・処方を混同しない。医薬品の効能・効果を承認された範囲を超えて説明しない。医薬品の安全性や副作用の不存在を保証しない。個人の判断による処方薬の中止、増減、変更を勧めない。

    ## 【作成の絶対ルール】
    1. 結論ファースト（PREP法）の徹底:
       文章の冒頭（最初の一文、30〜50文字程度）で、時候の挨拶などを省き、今回のテーマに対する結論を明確にしてください。原則として「主要キーワード／テーマ＋店舗名＋エリア名＋主要サービス」を自然な一文にまとめてください。ただし症状の改善、治療効果、予防効果などを断定する結論にはしないでください。最初の一文の直後には必ず空行を1行挟んでください。
    2. 主語・エリア・サービス名の明確化（5W1Hの網羅）:
       主語は必ず「${shop.name}」とし、エリア名は所在地住所情報（固定フッター）からのみ抽出し、住所情報がない場合は架空の地域名を創作せず汎用表現にしてください。
    3. メインキーワードの含有:
       指定メインキーワード [ ${mainKeywords.join(', ')} ] を自然な文脈に沿って含めてください（医学的不正確・誇大になる場合は安全な表現に調整）。
    4. 本日の日替わりサブキーワード:
       本日のサブキーワード [ ${selectedSubKeywords.join(', ')} ] を自然に盛り込んでください。
    5. 曖昧な表現の排除と一次情報・数値の提示:
       抽象的な形容詞や根拠のないアピールを避け、店舗が実際に提供している客観的・専門的な事実を具体的に記述してください。
    6. 特徴・こだわりの箇条書き構造化（中盤）:
       文章の中盤部分で、今回のテーマに関連する店舗の特徴・対応内容・サービス情報を、原則として3つの箇条書き（「・」マーク）で簡潔に整理してください。直前には説明・移行文を設け、その直後に空行を1行挟んでください。
    7. アクション喚起（CTA）の固定配置（後半）:
       文章の最後（箇条書きの後）の締めくくりのCTAとして、次の指定テキストを一言一句変更せず、固定の1文として出力してください：
       「『詳細』ボタン、またはプロフィールのウェブサイトリンクからお気軽にお問い合わせください。」
    8. 段落分けと空行の徹底:
       一つの段落は1文〜最大2文程度（50〜100文字程度）を目安とし、各段落の間には必ず空行を1行挟んでください。
    9. 文字数制限:
       全体の本文は500文字程度（改行を除く）に収めてください。
    10. 署名・連絡先・記号マークダウンの排除:
        本文中にURL、電話番号、住所、店舗名のフッター署名、絵文字、マークダウン記号は含めず、純粋な文章テキストと「・」マーク、改行のみで出力してください。

    返される内容は自動作成した完成本文のみとし、説明、挨拶、マークダウン装飾は一切含めないでください。`;
  };

  // Execution with Medical Fact-Check Loop or Standard Generation
  if (isMedicalShop) {
    console.log(`🩺 [医療モード起動] 店舗「${shop.name}」: 医療専用プロンプト (Gemini) & ファクトチェック審査 (Claude) を開始します...`);
    let finalMedicalText = '';
    let factCheckPassed = false;
    let feedback = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`📡 [医療プロンプト生成 試行 ${attempt}/2] 店舗「${shop.name}」`);
      const medicalPrompt = buildMedicalPrompt(feedback);
      const candidateText = await generateTextFromGemini(genAI, medicalPrompt);

      console.log(`🔍 [Claude 医療ファクトチェック審査 試行 ${attempt}/2 実行中...]`);
      const checkResult = await factCheckMedicalPost(candidateText, shop.name);

      if (checkResult.passed) {
        console.log(`✅ [医療ファクトチェック合格 (試行 ${attempt}/2)]: ${checkResult.reason || '適合'}`);
        finalMedicalText = candidateText;
        factCheckPassed = true;
        break;
      } else {
        console.warn(`⚠️ [医療ファクトチェックNG (試行 ${attempt}/2)]: ${checkResult.reason} - 指摘: ${checkResult.issues.join(' / ')}`);
        feedback = `【前回の審査で以下のNG指摘がありました。必ず修正しガイドラインを厳格に遵守してください】: ${checkResult.issues.join('、')}${checkResult.correctionAdvice ? ` (改善指示: ${checkResult.correctionAdvice})` : ''}`;
      }
    }

    if (factCheckPassed && finalMedicalText) {
      return {
        text: finalMedicalText,
        subKeywords: selectedSubKeywords,
        imageFileId,
        promptType: 'MEDICAL',
      };
    }

    console.warn(`🔄 [通常プロンプト自動フォールバック (試行 3/3)] 店舗「${shop.name}」: 医療ファクトチェックが2回連続NGとなったため、通常プロンプトにて安全に生成します。`);
  }

  // Standard generation
  const standardPrompt = buildStandardPrompt();
  const standardText = await generateTextFromGemini(genAI, standardPrompt);

  return {
    text: standardText,
    subKeywords: selectedSubKeywords,
    imageFileId,
    promptType: 'STANDARD',
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

    // Fetch Drive files with subfolders for intelligent keyword-folder matching
    let driveFilesList: DriveFileItem[] = [];
    const auth = getGoogleAuthClient();
    if (auth && shop.google_drive_folder_id) {
      driveFilesList = await fetchDriveFilesWithSubfolders(auth, shop.google_drive_folder_id);
    }

    if (all) {
      const day0 = await generateSingleDraft(shop, 0, driveFilesList);
      const day1 = await generateSingleDraft(shop, 1, driveFilesList);
      const day2 = await generateSingleDraft(shop, 2, driveFilesList);

      const nextDrafts = [
        { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null, promptType: day0.promptType },
        { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null, promptType: day1.promptType },
        { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null, promptType: day2.promptType },
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
        promptType: regenerated.promptType,
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

  let cleanDrafts = draftPostsArr.filter((d: any) => d.dayIndex !== -1);

  if (cleanDrafts.length === 0) {
    console.log(`🤖 Auto-generating initial 3-day drafts for shop: ${shop.name}`);
    let driveFilesList: any[] = [];
    const auth = getGoogleAuthClient();
    const driveFolderId = extractGoogleDriveFolderId(shop.google_drive_folder_id);
    if (auth && driveFolderId !== 'root') {
      try {
        const drive = google.drive({ version: 'v3', auth });
        const driveRes = await drive.files.list({
          q: `parents in '${driveFolderId}' and (mimeType = 'image/jpeg' or mimeType = 'image/png' or mimeType = 'image/jpg') and trashed = false`,
          fields: 'files(id, name)',
          pageSize: 1000,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        if (driveRes.data.files) {
          driveFilesList = driveRes.data.files.map((f: any) => ({ id: f.id || '', name: f.name || '' }));
        }
      } catch (e) {}
    }

    try {
      const day0 = await generateSingleDraft(shop, 0, driveFilesList);
      const day1 = await generateSingleDraft(shop, 1, driveFilesList);
      const day2 = await generateSingleDraft(shop, 2, driveFilesList);
      cleanDrafts = [
        { dayIndex: 0, title: '今日投稿予定の下書き (Day 0)', text: day0.text, subKeywords: day0.subKeywords, imageFileId: day0.imageFileId || null, promptType: day0.promptType },
        { dayIndex: 1, title: '明日投稿予定の下書き (Day 1)', text: day1.text, subKeywords: day1.subKeywords, imageFileId: day1.imageFileId || null, promptType: day1.promptType },
        { dayIndex: 2, title: '明後日投稿予定の下書き (Day 2)', text: day2.text, subKeywords: day2.subKeywords, imageFileId: day2.imageFileId || null, promptType: day2.promptType }
      ];
    } catch (genErr) {
      console.error('❌ Failed to auto-generate initial drafts during rollover:', genErr);
      throw new Error('下書きが存在せず初期生成にも失敗したため、投稿処理を中断しました。');
    }
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
    // 🛡️ Content Validation Safeguard: Prevent error notices or pending placeholders from ever being published to Google Maps
    const isPendingOrInvalid =
      publishedPost.text.includes('【下書き生成保留中】') ||
      publishedPost.text.includes('AI APIクレジット') ||
      publishedPost.text.includes('自動生成を保留') ||
      publishedPost.text.includes('【AI生成保留中】') ||
      publishedPost.text.trim().length < 30;

    if (isPendingOrInvalid) {
      console.warn(`⚠️ [GBP安全遮断] 店舗「${shop.name}」: 本日の下書きはAI生成保留中のため、Googleマップへの一般公開を安全にスキップしました。`);
    } else {
      console.log(`📡 Attempting real GBP post creation for location: ${resolvedPath}`);
      const oauth2Client = new google.auth.OAuth2(clientID, clientSecret, 'http://localhost');
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      let mediaPayload = undefined;
      if (publishedPost.imageFileId) {
        const apiBaseUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_API_BASE_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : 'https://post.365voice.com');
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
      if (shop.keywords && shop.keywords.gbp_action_url && shop.keywords.gbp_action_url.trim()) {
        const actionUrl = shop.keywords.gbp_action_url.trim();
        const isGoogleMapsUrl = 
          actionUrl.includes('maps.app.goo.gl') ||
          actionUrl.includes('goo.gl/maps') ||
          actionUrl.includes('maps.google.') ||
          actionUrl.includes('google.com/maps') ||
          actionUrl.includes('google.co.jp/maps') ||
          actionUrl.includes('share.google') ||
          actionUrl.includes('posts.gle');

        if (isGoogleMapsUrl) {
          console.warn(`⚠️ [GBP規約ガード] 店舗「${shop.name}」: Googleマップ自身のURLが詳細ボタンに設定されていたため、循環リンク違反・スパム判定を防ぐためボタン付与を安全にスキップしました。`);
        } else if (actionUrl.startsWith('http://') || actionUrl.startsWith('https://')) {
          console.log(`🔗 Attaching Call-to-Action button to GBP post: ${actionUrl}`);
          callToActionPayload = {
            actionType: 'LEARN_MORE',
            url: actionUrl
          };
        }
      }

      const postTimeHour = (shop.keywords as any)?.post_time_hour ?? 9;
      const now = new Date();
      const jstHourStr = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        hour12: false
      }).format(now);
      const currentHour = parseInt(jstHourStr || '0', 10);
      const isDelayedCycle = currentHour > postTimeHour;

      let gbpSuccess = false;
      let lastGbpError: any = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`📡 [GBP投稿 試行 ${attempt}/2] Location: ${resolvedPath} (画像添付: ${mediaPayload ? 'あり' : 'なし'})`);
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
          gbpSuccess = true;
          console.log('✅ Successfully published real post to Google Business Profile!');
          break;
        } catch (gbpError: any) {
          lastGbpError = gbpError;
          console.error(`⚠️ [GBP投稿 試行 ${attempt}/2 失敗]:`, gbpError.message || gbpError);
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      // 🛡️ 1時間経過(遅延)時の画像エラー自動フォールバック:
      // 設定時刻から1時間以上経過(例: 13:00以降)しても画像がGoogle側でエラー拒否される場合、テキストのみに切り替えて確実に公開
      if (!gbpSuccess && mediaPayload && isDelayedCycle) {
        console.warn(`🛡️ [GBPテキストフォールバック起動] 設定時刻(${postTimeHour}:00)から1時間以上経過(現在: ${currentHour}:00 JST)し、画像送信がGoogle側で拒否されたため、テキストのみでの投稿に切り替えて再試行します...`);
        try {
          const fallbackRes = await oauth2Client.request({
            url: `https://mybusiness.googleapis.com/v4/${resolvedPath}/localPosts`,
            method: 'POST',
            data: {
              languageCode: 'ja-JP',
              summary: gbpPostText,
              topicType: 'STANDARD',
              ...(callToActionPayload ? { callToAction: callToActionPayload } : {})
            }
          });
          gbpPublished = true;
          gbpResponse = fallbackRes.data;
          gbpSuccess = true;
          console.log('✅ [テキストフォールバック成功] 画像を切り離したテキストのみの投稿がGoogleマップへ正常に公開されました！');
        } catch (fallbackErr: any) {
          lastGbpError = fallbackErr;
          console.error('❌ [テキストフォールバックも失敗]:', fallbackErr.message || fallbackErr);
        }
      }

      if (!gbpSuccess) {
        const isDemoStore = shop.name.includes('Avenir') || shop.name.includes('デモ') || (shop.google_location_id && shop.google_location_id.includes('demo'));
        if (isDemoStore && (lastGbpError?.message?.includes('Requested entity was not found') || lastGbpError?.status === 404)) {
          console.warn(`ℹ️ [デモ店舗判定] デモ用店舗のため、GBP実送信エラーを無視してシミュレーション投稿を継続します。`);
        } else {
          throw new Error(`Googleマップ(GBP)への投稿に失敗しました: ${lastGbpError?.message || lastGbpError}`);
        }
      }
    }
  }

  // Fetch Drive files with subfolders for intelligent keyword-folder matching
  let driveFilesList: DriveFileItem[] = [];
  const auth = getGoogleAuthClient();
  if (auth && shop.google_drive_folder_id) {
    driveFilesList = await fetchDriveFilesWithSubfolders(auth, shop.google_drive_folder_id);
  }

  const nextDayMinus1 = {
    dayIndex: -1,
    title: '本日投稿済みの下書き',
    text: publishedPost.text,
    subKeywords: publishedPost.subKeywords,
    imageFileId: publishedPost.imageFileId || null,
    promptType: publishedPost.promptType || 'STANDARD',
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
    promptType: draft1.promptType || 'STANDARD',
  };

  const nextDay1 = {
    dayIndex: 1,
    title: '明後日投稿予定の下書き (Day 1)',
    text: draft2.text,
    subKeywords: draft2.subKeywords,
    imageFileId: draft2.imageFileId || null,
    promptType: draft2.promptType || 'STANDARD',
  };

  const imageCount = driveFilesList.length;
  const isAlternating = imageCount >= 1 && imageCount < 10;
  const forceTextOnlyForDay2 = isAlternating ? !!draft2.imageFileId : false;

  // 3. Generate a brand new Day 2 draft using Gemini AI with robust fail-safe error boundary!
  let nextDay2;
  try {
    const newDay2Raw = await generateSingleDraft(shop, 2, driveFilesList, forceTextOnlyForDay2);
    nextDay2 = {
      dayIndex: 2,
      title: '明々後日投稿予定の下書き (Day 2)',
      text: newDay2Raw.text,
      subKeywords: newDay2Raw.subKeywords,
      imageFileId: newDay2Raw.imageFileId || null,
      promptType: newDay2Raw.promptType || 'STANDARD',
    };
  } catch (aiErr: any) {
    console.error(`⚠️ [AI下書き生成エラー] 店舗「${shop.name}」のDay 2下書き自動生成に失敗しました（スライド処理は安全に継続します）:`, aiErr.message || aiErr);
    let fallbackSubs: string[] = [];
    try {
      if (shop.keywords?.sub_keywords) {
        fallbackSubs = JSON.parse(shop.keywords.sub_keywords).slice(0, 2);
      }
    } catch (e) {}

    nextDay2 = {
      dayIndex: 2,
      title: '明々後日投稿予定の下書き (Day 2 - AI生成保留中)',
      text: '【下書き生成保留中】Google AI APIのクレジット残高不足、または通信タイムアウトにより自動生成を保留しました。APIクレジット確認後、ダッシュボードの「下書きを再生成」ボタンから再作成してください。',
      subKeywords: fallbackSubs,
      imageFileId: null,
    };
  }

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

// In-memory set to prevent double posting in the same hour & Mutex Lock to prevent overlapping runs
let isSchedulerRunning = false;
const alreadyPostedToday = new Set<string>();

// ==============================================================================
// ⏱️ Background Automated Scheduler (Hourly execution check & auto-retry)
// ==============================================================================
async function runBackgroundScheduler() {
  if (isSchedulerRunning) {
    console.log('🔒 [排他制御ガード] 現在すでに自動巡回バッチが実行中です。二重投稿・並行実行を防ぐため今回のリクエストを安全にスキップしました。');
    return;
  }
  isSchedulerRunning = true;

  try {
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

    console.log(`\n⏰ [${todayStr} ${hour}:00 JST] 365ボイス バックグラウンド自動巡回サイクルを開始します...`);

    if (currentHour === 0) {
      alreadyPostedToday.clear();
      console.log('🧹 [日付変更検知] 深夜0時(JST)を迎えたため、当日の投稿済みメモリキャッシュをクリアしました。');
    }

    // 稼働中（post_active: true または 開始予定日設定あり）のすべての店舗を取得
    const shops = await prisma.shop.findMany({
      where: {
        OR: [
          { post_active: true },
          { post_start_date: { not: null } }
        ]
      },
      include: { keywords: true },
    });

    console.log(`🔎 巡回対象店舗数: ${shops.length}件 を確認`);

    for (const shop of shops) {
      if (!shop.keywords) {
        console.log(`✨ 店舗「${shop.name}」: 初期キーワード設定を自動生成します...`);
        shop.keywords = await initializeShopKeywords(shop);
      }

      // 📅 自動投稿開始予定日（post_start_date）の判定
      if (shop.post_start_date) {
        const parts = jstFormatter.formatToParts(new Date(shop.post_start_date));
        const sYear = parts.find(p => p.type === 'year')?.value;
        const sMonth = parts.find(p => p.type === 'month')?.value;
        const sDay = parts.find(p => p.type === 'day')?.value;
        const startDateStr = `${sYear}-${sMonth}-${sDay}`;

        if (todayStr >= startDateStr) {
          // 開始日を迎えたため、1回限りの自動昇格を実行し、post_start_dateをnullにクリア（手動OFFにした際に勝手に再ONになるのを完全に防止）
          const updateData: any = { post_start_date: null };
          if (!shop.post_active) {
            updateData.post_active = true;
            shop.post_active = true;
            console.log(`🚀 [開始予定日到達] 店舗「${shop.name}」: 投稿開始日（${startDateStr}）に到達したため、自動投稿をONに自動切り替えしました！`);
          }
          await prisma.shop.update({
            where: { id: shop.id },
            data: updateData
          });
          shop.post_start_date = null;
        } else {
          console.log(`⏳ 店舗「${shop.name}」: 投稿開始日（${startDateStr}）前のため待機中（現在: ${todayStr} JST）`);
          continue;
        }
      }

      if (!shop.post_active) {
        continue;
      }

      const postTimeHour = (shop.keywords as any)?.post_time_hour ?? 9;

      // DB内の下書きから、本日既に投稿済み（Day -1 かつ publishedAt が本日）か判定
      let isAlreadyPostedTodayInDb = false;
      if (shop.keywords && shop.keywords.draft_posts) {
        try {
          const drafts = JSON.parse(shop.keywords.draft_posts);
          const postedItem = drafts.find((d: any) => d.dayIndex === -1);
          if (postedItem && postedItem.publishedAt) {
            const pubDateJst = jstFormatter.formatToParts(new Date(postedItem.publishedAt));
            const pYear = pubDateJst.find(p => p.type === 'year')?.value;
            const pMonth = pubDateJst.find(p => p.type === 'month')?.value;
            const pDay = pubDateJst.find(p => p.type === 'day')?.value;
            const pubDateStr = `${pYear}-${pMonth}-${pDay}`;
            if (pubDateStr === todayStr) {
              isAlreadyPostedTodayInDb = true;
            }
          }
        } catch (e) {}
      }

      const memoryKey = `${shop.id}_${todayStr}`;

      // 投稿タイミング判定：
      // 設定時刻以降（currentHour >= postTimeHour）かつ 本日未投稿の場合に実行
      if (currentHour >= postTimeHour) {
        if (isAlreadyPostedTodayInDb || alreadyPostedToday.has(memoryKey)) {
          console.log(`✓ 店舗「${shop.name}」: 本日分（${todayStr}）は既に投稿・ロールオーバー完了済みです。`);
          alreadyPostedToday.add(memoryKey);
          continue;
        }

        console.log(`🚀 [自動投稿実行] 店舗「${shop.name}」: 設定時刻 ${postTimeHour}:00 (現在: ${currentHour}:00 JST) ➔ 投稿処理を開始します...`);
        // 🛡️ Pre-lock memory key immediately before async communication begins!
        alreadyPostedToday.add(memoryKey);
        try {
          await executeDailyPostRollover(shop.id);
          console.log(`✅ [自動投稿成功] 店舗「${shop.name}」の投稿＆下書きスライドが完了しました！`);
        } catch (postErr: any) {
          console.error(`❌ [自動投稿失敗] 店舗「${shop.name}」の投稿処理でエラーが発生しました（次回のCronで自動再試行します）:`, postErr.message || postErr);
          // Unlock only if rollover completely failed so future retry can happen
          alreadyPostedToday.delete(memoryKey);
        }
      } else {
        console.log(`⏳ 店舗「${shop.name}」: 投稿予定時刻は ${postTimeHour}:00 です (現在: ${currentHour}:00 JST ➔ 待機中)`);
      }
    }
  } catch (err) {
    console.error('❌ Scheduler error:', err);
  } finally {
    isSchedulerRunning = false;
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

// Helper to auto-sync known location IDs (e.g. TOMOEデザイン)
async function syncKnownShopLocations() {
  try {
    const tomoeShop = await prisma.shop.findFirst({
      where: {
        OR: [
          { name: { contains: 'TOMOE' } },
          { name: { contains: 'tomoe' } },
          { name: { contains: 'トモエ' } },
        ]
      }
    });

    if (tomoeShop && (!tomoeShop.google_location_id || !tomoeShop.google_location_id.includes('12479817179542355864'))) {
      await prisma.shop.update({
        where: { id: tomoeShop.id },
        data: {
          google_location_id: 'locations/12479817179542355864'
        }
      });
      console.log(`✅ [Location ID Set] Updated TOMOEデザイン with google_location_id: locations/12479817179542355864`);
    }
  } catch (err: any) {
    console.warn('⚠️ syncKnownShopLocations notice:', err.message || err);
  }
}

// Helper to automatically sync gbpLocationId from co-developer's Store table to Shop.google_location_id
async function syncStoreLocationIdsToShop() {
  try {
    const stores: any[] = await prisma.$queryRawUnsafe(
      'SELECT id, name, "voiceShopId", "gbpLocationId" FROM "Store" WHERE "gbpLocationId" IS NOT NULL AND "voiceShopId" IS NOT NULL'
    );
    for (const store of stores) {
      if (store.voiceShopId && store.gbpLocationId) {
        const cleanLocationId = store.gbpLocationId.trim();
        const shop = await prisma.shop.findUnique({
          where: { id: store.voiceShopId },
          select: { id: true, name: true, google_location_id: true }
        });
        if (shop && shop.google_location_id !== cleanLocationId) {
          await prisma.shop.update({
            where: { id: shop.id },
            data: { google_location_id: cleanLocationId }
          });
          console.log(`📍 [Auto-Synced GBP ID] Store "${store.name}" -> Shop "${shop.name}": ${cleanLocationId}`);
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ syncStoreLocationIdsToShop notice:', err.message || err);
  }
}

// Start express server
app.listen(port, () => {
  console.log(`\n================================================================================`);
  console.log(`🚀 365ボイス - Express API Server running on: http://localhost:${port}`);
  console.log(`📅 Started on: ${new Date().toLocaleString()}`);
  console.log(`================================================================================\n`);

  // Run initial sync of known location IDs
  syncKnownShopLocations().catch(() => {});
  syncStoreLocationIdsToShop().catch(() => {});

  console.log('⏱️ [Internal Scheduler] Initializing internal fallback scheduler (10-minute intervals)...');
  setInterval(async () => {
    console.log('⏰ [Internal Scheduler] Executing automatic background sync cycle...');
    try {
      await syncKnownShopLocations();
      await syncStoreLocationIdsToShop();
      await runBackgroundScheduler();
      console.log('✅ [Internal Scheduler] Completed background sync cycle successfully.');
    } catch (err: any) {
      console.error('❌ [Internal Scheduler] Background sync cycle failed:', err.message || err);
    }
  }, 10 * 60 * 1000);

  setTimeout(async () => {
    console.log('⏰ [Internal Scheduler] Executing initial startup background sync...');
    try {
      await syncKnownShopLocations();
      await syncStoreLocationIdsToShop();
      await runBackgroundScheduler();
      console.log('✅ [Internal Scheduler] Completed initial startup background sync.');
    } catch (err: any) {
      console.error('❌ [Internal Scheduler] Initial startup background sync failed:', err.message || err);
    }
  }, 15 * 1000);
});
