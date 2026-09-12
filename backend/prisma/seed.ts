import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting 365VOICE database seeding (safe mode)...');

  // Check if admin shop exists
  const adminExists = await prisma.shop.findUnique({
    where: { id: 'admin-seiha-uuid' }
  });

  if (!adminExists) {
    await prisma.shop.create({
      data: {
        id: 'admin-seiha-uuid',
        name: '365ボイスシステム管理運営本部',
        email: 'admin@365voice.com',
        password: 'password',
        role: 'ADMIN',
        google_location_id: null,
        google_drive_folder_id: null,
        post_active: false,
      },
    });
    console.log('👮 Created Admin User.');
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
            text: '【髪質改善】栄駅徒歩5分の完全個室サロン Avenir Hair です。\n当サロンでは、お客様一人ひとりの髪質やクセに徹底的に向き合う「丁寧なカウンセリング技術」を大切にしています。\n\n栄で完全個室だからこそ、周りを気にせず髪のパサつきやダメージについて髪質改善トリートメントのご相談をいただけます。\n\n・オーダーメイド極上髪質改善メニュー\n・完全個室のリラックスできるサロン空間\n・髪を傷めない最先端トリートメント技術\n\nお客様の髪本来の輝きとサロントリートメントによる感動的な艶を引き出します。\nお体のメンテナンスを兼ねて、ぜひ下記の「詳細」ボタンよりご予約情報をご確認ください。',
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
            text: '【白髪染め】頭皮と髪を優しく守る栄の髪質改善カラーなら「Avenir Hair」です。\n「白髪は染めたいけれど髪のパサつきやダメージが気になる」とお悩みではありませんか？\n\n当サロン独自の髪質改善トリートメントを配合した、優しく低刺激なオーガニックカラーをご提案します。\n\n・白髪染めとトリートメントの極上融合\n・完全個室でゆったり過ごせる大人の隠れ家\n・髪質に合わせたオーダーメイド施術\n\n潤いに満ちた、若々しくしっとりまとまる美しい艶髪に仕上げます。\nぜひ下記の詳細ボタンより空き状況をご確認ください。',
            subKeywords: ['白髪染め 名古屋', 'トリートメント 推奨'],
            imageFileId: '1iLC1rMI5az8xd8nK8tOEK9ZuszpDFHwW'
          }
        ])
      }
    });

    console.log('📝 Seeded default static Keywords for Avenir Hair.');
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
