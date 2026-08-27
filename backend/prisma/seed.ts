import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting 365VOICE database seeding (safe mode)...');

  // Check if admin shop exists
  const adminExists = await prisma.shop.findUnique({
    where: { id: 'admin-365meo-uuid' }
  });

  if (!adminExists) {
    await prisma.shop.create({
      data: {
        id: 'admin-365meo-uuid',
        name: '365ボイスシステム管理運営本部',
        email: 'admin@365meo.com',
        password: 'password',
        role: 'ADMIN',
        google_location_id: null,
        google_drive_folder_id: null,
        post_active: false,
      },
    });
    console.log('👮 Created Admin User.');
  }

  // Check if 365meo-shop-uuid exists
  const shop3Exists = await prisma.shop.findUnique({
    where: { id: '365meo-shop-uuid' }
  });

  let shop3 = shop3Exists;
  if (!shop3Exists) {
    shop3 = await prisma.shop.create({
      data: {
        id: '365meo-shop-uuid',
        name: '株式会社３６５',
        email: '365meo@gmail.com',
        password: 'Tody-12191019',
        role: 'OWNER',
        agency_name: '365ボイス',
        google_location_id: 'locations/7613471938029191960',
        google_drive_folder_id: '1AIgemm9-fvP-eLwP7p2p8Plja1mbOJtX',
        post_active: true,
      },
    });
    console.log('🏬 Created 365ボイス Shop.');
  } else {
    shop3 = await prisma.shop.update({
      where: { id: '365meo-shop-uuid' },
      data: {
        name: '株式会社３６５',
        google_location_id: 'locations/7613471938029191960',
        google_drive_folder_id: '1AIgemm9-fvP-eLwP7p2p8Plja1mbOJtX',
        agency_name: '365ボイス'
      }
    });
  }

  // Check if ShopKeywords for 365MEO exists
  const keywordsExists = await prisma.shopKeywords.findUnique({
    where: { shop_id: '365meo-shop-uuid' }
  });

  if (!keywordsExists && shop3) {
    await prisma.shopKeywords.create({
      data: {
        shop_id: shop3.id,
        main_keywords: JSON.stringify(['名古屋 MEO', 'MEO対策', 'Googleマップ集客', 'ローカルSEO', '365ボイス']),
        sub_keywords: JSON.stringify(['GBP運用', 'マップ順位', '集客効果', '名古屋マーケティング', '店舗集客', '自動投稿', 'SNS連動', 'AI作成']),
        fixed_footer: '店舗名: 株式会社３６５\n住所: 名古屋市中区',
        custom_prompt: '丁寧で自然なトーンで、毎日投稿サポートの魅力を訴求してください。',
        hp_url: null,
        tabelog_url: null,
        hotpepper_url: null,
        gurunavi_url: null,
        gbp_action_url: null,
        draft_posts: null,
      },
    });
    console.log('🔑 Created ShopKeywords for 365ボイス.');
  }

  // Seeding Demo Agency X and Avenir Hair demo store
  const targetAgencyId = 'demo-agency-uuid';
  const targetAvenirId = 'demo-store-uuid';

  const agencyExists = await prisma.shop.findUnique({
    where: { id: targetAgencyId }
  });

  if (!agencyExists) {
    console.log('✨ Seeding AGENCY account "代理店X" for the first time...');
    await prisma.shop.create({
      data: {
        id: targetAgencyId,
        name: '代理店X',
        email: 'meoseiha@dairiten.x',
        password: 'meoseiha@dairiten.x',
        role: 'AGENCY',
        agency_name: '代理店X',
        post_active: true,
      }
    });

    await prisma.shop.create({
      data: {
        id: targetAvenirId,
        name: '美髪改善サロン Avenir Hair',
        email: 'meoseiha@avenir',
        password: 'meoseiha@avenir',
        role: 'OWNER',
        agency_name: '代理店X',
        google_location_id: 'locations/demo-loc-365',
        google_drive_folder_id: '10c1rRfqpsdLRz_ZlOgEXJFR7BoVsRjXe',
        post_active: true,
      }
    });

    // Keywords
    await prisma.shopKeywords.create({
      data: {
        shop_id: targetAvenirId,
        main_keywords: JSON.stringify(['栄 美容室', '名古屋 髪質改善', '栄 カット', '髪質改善 サロン']),
        sub_keywords: JSON.stringify(['完全個室サロン', '縮毛矯正 栄', '白髪染め 名古屋', 'トリートメント 推奨']),
        fixed_footer: '店舗名: 美髪改善サロン Avenir Hair (アヴニールヘア)\n住所: 愛知県名古屋市中区栄3丁目\n営業時間: 10:00〜20:00 (完全予約制)\n定休日: 毎週月曜日\nご予約・お問い合わせはお気軽にどうぞ！',
        custom_prompt: '完全個室のリラックス空間と、髪を傷めない最先端の髪質改善トリートメント、そして丁寧なカウンセリング技術を上品かつ温かみのあるトーンでPRしてください。',
        hp_url: 'https://avenir-hair-demo.example.com',
        tabelog_url: '',
        hotpepper_url: 'https://beauty.hotpepper.jp/avenir-hair-demo',
        gurunavi_url: '',
        gbp_action_url: 'https://beauty.hotpepper.jp/avenir-hair-demo/reserve',
        post_time_hour: 12,
        draft_posts: JSON.stringify([
          {
            dayIndex: 0,
            title: '今日投稿予定の下書き (Day 0)',
            text: '【髪質改善】栄駅徒歩5分の完全個室サロン Avenir Hair です。\n当サロンでは、お客様一人ひとりの髪質やクセに徹底的に向き合う「丁寧なカウンセリング技術」を大切にしています。\n\n栄で完全個室だからこそ、周りを気にせず髪のパサつきやダメージについて髪質改善トリートメントのご相談をいただけます。\n\n・オーダーメイド極上髪質改善メニュー\n・完全個室のリラックスできるサロン空間\n・髪を傷めない最先端トリートメント技術\n\nお客様の髪本来 of the hood, 美しい艶髪とサロントリートメントによる感動的な艶を引き出します。\nお体のメンテナンスを兼ねて、ぜひ下記の「詳細」ボタンよりご予約情報をご確認ください。',
            subKeywords: ['完全個室サロン', 'トリートメント 推奨'],
            imageFileId: '1ICy4qoD6qjOr-w4vD6T3I_xEAxMY0N4B'
          },
          {
            dayIndex: 1,
            title: '明日投稿予定の下書き (Day 1)',
            text: '【縮毛矯正】うねりやくせ毛でお悩みなら栄の「Avenir Hair」にお任せください。\n当サロンでは、髪を傷めない最先端の薬剤を使用し、髪質改善トリートメントを同時に配合した縮毛矯正をご提供しています。\n\n完全個室のリラックスした極上空間で、仕上がりは驚くほど柔らかく滑らかな艶髪を実現します。\n\n・うねりやクセを自然に抑える縮毛矯正\n・丁寧なカウンセリングでお悩み徹底解消\n・縮毛矯正と髪質改善のダブルアプローチ\n\n毎朝のスタイリングが感動するほど楽になりますよ。\n詳しくは詳細ボタンよりご予約や空き状況をご確認ください。',
            subKeywords: ['縮毛矯正 栄', '完全個室サロン'],
            imageFileId: '1YRczsnYk5_EpPhY3U7N2RjyyOF8629u_'
          },
          {
            dayIndex: 2,
            title: '明後日投稿予定の下書き (Day 2)',
            text: '【白髪染め】頭皮と髪を優しく守る栄の髪質改善カラーなら「Avenir Hair」です。\n「白髪は染めたいけれど髪のパサつきやダメージが気になる」とお悩みではありませんか？\n\n当サロン独自の髪質改善トリートメントを配合した、優しく低刺激なオーガニックカラーをご提案します。\n\n・白髪染めとトリートメントの極上融合\n・完全個室でゆったり過ごせる大人の隠れ家\n・髪質に合わせたオーダーメイド施術\n\n運賃に満ちた、若々しくしっとりまとまる美しい艶髪に仕上げます。\nぜひ下記の詳細ボタンより空き状況をご確認ください。',
            subKeywords: ['白髪染め 名古屋', 'トリートメント 推奨'],
            imageFileId: '1iLC1rMI5az8xd8nK8tOEK9ZuszpDFHwW'
          }
        ])
      }
    });

    console.log('📝 Seeded default static Keywords for Avenir Hair.');
  }

  // Seeding ラフ＆ミートラウンジ晴れテル。
  const targetHareteruId = 'hareteru-lounge-uuid';
  const hareteruExists = await prisma.shop.findUnique({
    where: { id: targetHareteruId }
  });

  if (!hareteruExists) {
    console.log('✨ Seeding account "ラフ＆ミートラウンジ晴れテル。" for the first time...');
    await prisma.shop.create({
      data: {
        id: targetHareteruId,
        name: 'ラフ＆ミートラウンジ晴れテル。',
        email: 'moiccho@gmail.com',
        password: 'Hareteru-Meat-8080',
        role: 'OWNER',
        agency_name: '365ボイス',
        google_location_id: 'locations/10645469356950848476',
        google_drive_folder_id: '1YAGUDKqOy1UBta7XGpbO_s3A7vqr3DeB',
        post_active: false,
        created_at: new Date('2026-09-01T00:00:00+09:00'),
      }
    });

    // Keywords with gbp_action_url
    await prisma.shopKeywords.create({
      data: {
        shop_id: targetHareteruId,
        main_keywords: JSON.stringify(['名古屋 肉バル', '肉ラウンジ 晴れテル', '名古屋 グルメ', 'ミートラウンジ', '晴れテル']),
        sub_keywords: JSON.stringify(['美味しいお肉', '個室ダイニング', '名古屋ステーキ', '宴会バル', 'おしゃれ居酒屋', '女子会バル', '肉料理おすすめ']),
        fixed_footer: '店舗名: ラフ＆ミートラウンジ晴れテル。\n住所: 愛知県名古屋市中区\nご予約・お問い合わせはお気軽にどうぞ！',
        custom_prompt: '「ラフ＆ミートラウンジ晴れテル。」の魅力（美味しい極上肉料理、心地よいラウンジ空間、アットホームで楽しい雰囲気）を明るく魅力的にアピールしてください。',
        hp_url: 'https://maps.app.goo.gl/BMGhuf16cvVUkQAF9',
        tabelog_url: '',
        hotpepper_url: '',
        gurunavi_url: '',
        gbp_action_url: 'https://maps.app.goo.gl/BMGhuf16cvVUkQAF9',
        post_time_hour: 12,
      }
    });

    console.log('📝 Seeded default static Keywords for ラフ＆ミートラウンジ晴れテル。');
  }

  // Seeding test magic login token for development testing!
  const testMagicToken = 'test-magic-token';
  const tokenExists = await prisma.magicLinkToken.findUnique({
    where: { token: testMagicToken }
  });

  if (!tokenExists) {
    await prisma.magicLinkToken.create({
      data: {
        token: testMagicToken,
        shop_id: targetAvenirId, // Logs directly into Avenir Hair
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Valid for 1 year in dev
        is_used: false
      }
    });
    console.log('� Seeded dev-only Magic Link token: http://localhost:5173/?token=test-magic-token');
  }

  console.log('🟢 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
