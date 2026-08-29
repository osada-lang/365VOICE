import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const prisma = new PrismaClient();

// Import generateSingleDraft from index
import { generateSingleDraft } from '../index';

async function testGeneration() {
  console.log('===================================================');
  console.log('🧪 MEO-ボイス: 毎日自動投稿生成 ＆ ハルシネーション対策 検証テスト');
  console.log('===================================================\n');

  // Verify Claude API Key
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.error('⚠️ CLAUDE_API_KEY is not defined in .env! Skip live API test.');
    return;
  }

  // 1. Fetch 美髪改善サロン Avenir Hair demo store
  const avenir = await prisma.shop.findUnique({
    where: { id: 'demo-store-uuid' },
    include: { keywords: true }
  });

  if (avenir) {
    console.log(`🏢 [美髪改善サロン Avenir Hair] の自動投稿テキスト生成テスト中...`);
    try {
      const result = await generateSingleDraft(avenir, 0, []);
      console.log('\n--- [生成された文章] ---');
      console.log(result.text);
      console.log('------------------------\n');

      // Verify no osteopathic/joint clinic hallucination keywords
      const badKeywords = ['骨盤矯正', '接骨院', '整体', '腰痛', '肩こり', '施術', 'ゆがみ'];
      const foundBad = badKeywords.filter(kw => result.text.includes(kw));

      if (foundBad.length > 0) {
        console.error(`❌ [ハルシネーションバグ検出]: 整体用キーワードが勝手に混入しています！ ->`, foundBad);
      } else {
        console.log(`🟢 [検証成功]: 整体用のキーワード混入は一切ありません。`);
      }

      // Verify no Tokyo/Shinjuku location hallucination
      const badLocations = ['東京', '新宿', '渋谷', '池袋', '品川', '静岡'];
      const foundLocations = badLocations.filter(loc => result.text.includes(loc));

      if (foundLocations.length > 0) {
        console.error(`❌ [ハルシネーションバグ検出]: 架空の地域名（東京、静岡など）が勝手に混入しています！ ->`, foundLocations);
      } else {
        console.log(`🟢 [検証成功]: 架空の地域名の捏造（ハルシネーション）は一切ありません。`);
      }

      // Verify it included local area Nagoya/Sakae from fixed_footer
      const correctLocations = ['栄', '名古屋'];
      const foundCorrect = correctLocations.filter(loc => result.text.includes(loc));
      if (foundCorrect.length > 0) {
        console.log(`🟢 [検証成功]: 固定フッターの住所から正しい地域名「${foundCorrect.join(', ')}」が抽出・掲載されました。`);
      } else {
        console.warn(`⚠️ [警告]: フッター住所の地域名が含まれていません。フッターを再確認してください。`);
      }

    } catch (err: any) {
      console.error('❌ Generation failed:', err.message || err);
    }
  } else {
    console.error('❌ Avenir Hair demo shop not found in DB!');
  }

  console.log('\n---------------------------------------------------\n');

  // 2. Fetch ラフ＆ミートラウンジ晴れテル。
  const hareteru = await prisma.shop.findUnique({
    where: { id: 'hareteru-lounge-uuid' },
    include: { keywords: true }
  });

  if (hareteru) {
    console.log(`🏢 [ラフ＆ミートラウンジ晴れテル。] の自動投稿テキスト生成テスト中...`);
    try {
      const result = await generateSingleDraft(hareteru, 0, []);
      console.log('\n--- [生成された文章] ---');
      console.log(result.text);
      console.log('------------------------\n');

      // Verify no osteopathic/joint clinic hallucination keywords
      const badKeywords = ['骨盤矯正', '接骨院', '整体', '腰痛', '肩こり', '施術', 'ゆがみ'];
      const foundBad = badKeywords.filter(kw => result.text.includes(kw));

      if (foundBad.length > 0) {
        console.error(`❌ [ハルシネーションバグ検出]: 整体用キーワードが勝手に混入しています！ ->`, foundBad);
      } else {
        console.log(`🟢 [検証成功]: 整体用のキーワード混入は一切ありません。`);
      }

      // Verify no Tokyo/Shinjuku location hallucination
      const badLocations = ['東京', '新宿', '渋谷', '池袋', '品川', '静岡'];
      const foundLocations = badLocations.filter(loc => result.text.includes(loc));

      if (foundLocations.length > 0) {
        console.error(`❌ [ハルシネーションバグ検出]: 架空の地域名（東京、静岡など）が勝手に混入しています！ ->`, foundLocations);
      } else {
        console.log(`🟢 [検証成功]: 架空の地域名の捏造（ハルシネーション）は一切ありません。`);
      }

      // Verify it included local area Nagoya from fixed_footer
      const correctLocations = ['名古屋'];
      const foundCorrect = correctLocations.filter(loc => result.text.includes(loc));
      if (foundCorrect.length > 0) {
        console.log(`🟢 [検証成功]: 固定フッターの住所から正しい地域名「${foundCorrect.join(', ')}」が抽出・掲載されました。`);
      } else {
        console.warn(`⚠️ [警告]: フッター住所の地域名が含まれていません。フッターを再確認してください。`);
      }

    } catch (err: any) {
      console.error('❌ Generation failed:', err.message || err);
    }
  } else {
    console.error('❌ Hareteru Lounge demo shop not found in DB!');
  }

  console.log('\n===================================================');
}

testGeneration()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
