import base64

def generate_perfect_html():
    # Read logo base64
    logo_path = "/Users/kentosada/dev/365VOICE/365_logo.jpg"
    with open(logo_path, "rb") as f:
        b64_logo = base64.b64encode(f.read()).decode("utf-8")
    logo_data_url = f"data:image/jpeg;base64,{b64_logo}"

    html_content = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>365店舗集客・リピート診断シート</title>
  <style>
    @page {{
      size: A4 landscape;
      size: landscape;
      size: 297mm 210mm;
      margin: 4mm;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }}
    body {{
      font-family: "Hiragino Kaku Gothic ProN", "游ゴシック", "Meiryo", sans-serif;
      color: #1a1a1a;
      background-color: #eef2f5;
      font-size: 10.5px;
      line-height: 1.35;
    }}
    .sheet-container {{
      width: 297mm;
      max-width: 100%;
      min-height: 200mm;
      background: #fff;
      margin: 10px auto;
      padding: 8mm 10mm;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      border-radius: 2px;
    }}
    @media print {{
      @page {{
        size: A4 landscape !important;
        size: landscape !important;
        size: 297mm 210mm !important;
        margin: 4mm !important;
      }}
      * {{
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }}
      html, body {{
        width: 297mm !important;
        height: 210mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: none !important;
        overflow: hidden;
      }}
      .sheet-container {{
        width: 297mm !important;
        max-width: 297mm !important;
        height: 210mm !important;
        margin: 0 !important;
        padding: 2mm 4mm !important;
        box-shadow: none !important;
        border: none !important;
        page-break-inside: avoid;
        page-break-after: avoid;
      }}
      .top-bar {{ margin-bottom: 4px !important; }}
      .brand-logo {{ height: 42px !important; }}
      .company-name {{ font-size: 14px !important; }}
      .badge-item {{ font-size: 9.5px !important; padding: 3px 8px !important; }}
      .title-banner {{ padding: 5px 8px !important; margin-bottom: 6px !important; }}
      .title-banner h1 {{ font-size: 16px !important; }}
      .title-banner p {{ font-size: 9.5px !important; }}
      .info-box {{ margin-bottom: 6px !important; padding: 3px 8px !important; }}
      .columns {{ gap: 8px !important; }}
      .col {{ gap: 6px !important; }}
      .sec-header {{ padding: 3px 6px !important; font-size: 10px !important; }}
      .sec-body {{ padding: 4px 6px !important; gap: 4px !important; }}
      .q-item {{ gap: 2px !important; }}
      .q-title {{ font-size: 10px !important; }}
      .q-options {{ gap: 3px 10px !important; }}
      .opt {{ font-size: 9.5px !important; }}
      .point-box {{ padding: 2px 6px !important; font-size: 9px !important; margin-top: 1px !important; }}
      .text-area-box {{ height: 30px !important; }}
      .footer-section {{ margin-top: 6px !important; padding: 6px 10px !important; }}
      .footer-right {{ display: none !important; }}
      input[type="text"], textarea {{
        border: none !important;
        border-bottom: 1px solid #000 !important;
        background: transparent !important;
      }}
    }}

    /* Top Bar Header */
    .top-bar {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }}
    .brand-group {{
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .brand-logo {{
      height: 52px;
      width: auto;
      object-fit: contain;
    }}
    .company-name {{
      font-size: 16px;
      font-weight: bold;
      color: #0d2b45;
      letter-spacing: 0.5px;
    }}
    .badge-bar {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .badge-item {{
      font-size: 10px;
      font-weight: bold;
      padding: 3px 10px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }}
    .badge-time {{
      background: #0d2b45;
      color: #fff;
    }}
    .badge-check {{
      background: #fff0f3;
      color: #d81b60;
      border: 1px solid #f8bbd0;
    }}
    .badge-diagnosis {{
      background: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #c8e6c9;
      position: relative;
    }}
    .badge-no-know {{
      background: #e3f2fd;
      color: #1565c0;
      border: 1px solid #bbdefb;
    }}

    /* Main Title Banner */
    .title-banner {{
      background: linear-gradient(135deg, #0d2b45 0%, #1a4971 100%);
      color: #ffffff;
      text-align: center;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 8px;
    }}
    .title-banner h1 {{
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 2px;
    }}
    .title-banner p {{
      font-size: 10px;
      color: #d0e1fd;
      font-weight: 500;
    }}

    /* Info Box */
    .info-box {{
      border: 1px solid #0d2b45;
      border-radius: 4px;
      padding: 5px 12px;
      margin-bottom: 10px;
      background: #f8faff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }}
    .info-title {{
      font-weight: bold;
      color: #0d2b45;
      font-size: 11px;
      white-space: nowrap;
    }}
    .info-fields {{
      display: flex;
      gap: 24px;
      flex: 1;
      margin-left: 20px;
    }}
    .info-field {{
      display: flex;
      align-items: center;
      flex: 1;
      font-weight: bold;
      font-size: 10.5px;
    }}
    .info-input {{
      flex: 1;
      border: none;
      border-bottom: 1.5px solid #0d2b45;
      background: transparent;
      padding: 2px 6px;
      font-size: 11px;
      outline: none;
      margin-left: 4px;
    }}
    .info-note {{
      font-size: 9px;
      color: #666;
      white-space: nowrap;
    }}

    /* Two Columns Layout */
    .columns {{
      display: flex;
      gap: 12px;
    }}
    .col {{
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    /* Section Card */
    .section-card {{
      border: 1px solid #b0bec5;
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    }}
    .sec-header {{
      background: #1a4971;
      color: #fff;
      font-weight: bold;
      font-size: 11px;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .sec-num {{
      background: #fff;
      color: #1a4971;
      font-weight: 800;
      width: 18px;
      height: 18px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }}
    .sec-body {{
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    /* Question Block */
    .q-item {{
      display: flex;
      flex-direction: column;
      gap: 3px;
    }}
    .q-title {{
      font-weight: bold;
      color: #0d2b45;
      font-size: 10.5px;
      display: flex;
      align-items: center;
      gap: 4px;
    }}
    .q-num {{
      color: #1a4971;
      font-weight: 800;
    }}
    .q-options {{
      display: flex;
      flex-wrap: wrap;
      gap: 5px 12px;
      padding-left: 4px;
    }}
    .opt {{
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      cursor: pointer;
      user-select: none;
      color: #222;
    }}
    .opt input[type="checkbox"], .opt input[type="radio"] {{
      width: 13px;
      height: 13px;
      accent-color: #0d2b45;
      cursor: pointer;
    }}
    .text-inline {{
      border: none;
      border-bottom: 1px solid #555;
      width: 45px;
      text-align: center;
      font-size: 10px;
      outline: none;
      background: transparent;
    }}

    /* Point Box */
    .point-box {{
      background: #fffde7;
      border: 1px solid #ffe082;
      border-radius: 3px;
      padding: 3px 8px;
      font-size: 9.5px;
      color: #7f4f00;
      font-weight: bold;
      margin-top: 2px;
    }}

    /* Free Text Area */
    .text-area-box {{
      width: 100%;
      height: 40px;
      border: 1px solid #b0bec5;
      border-radius: 3px;
      padding: 4px 6px;
      font-size: 10px;
      font-family: inherit;
      resize: none;
      outline: none;
      background: #fafafa;
    }}
    .text-area-box:focus {{
      background: #fff;
      border-color: #0d2b45;
    }}

    /* Footer Banner */
    .footer-section {{
      margin-top: 8px;
      border: 1.5px solid #0d2b45;
      border-radius: 4px;
      padding: 8px 12px;
      background: #f4f8fc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }}
    .footer-left {{
      flex: 1;
    }}
    .footer-msg-top {{
      font-size: 11px;
      font-weight: bold;
      color: #0d2b45;
      margin-bottom: 2px;
    }}
    .footer-msg-sub {{
      font-size: 9.5px;
      color: #444;
      margin-bottom: 6px;
    }}
    .footer-features {{
      background: #fff;
      border: 1px solid #cfd8dc;
      border-radius: 4px;
      padding: 5px 8px;
    }}
    .features-header {{
      font-size: 9.5px;
      font-weight: bold;
      color: #0d2b45;
      margin-bottom: 3px;
    }}
    .features-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 2px 10px;
      font-size: 9px;
      color: #222;
      font-weight: 500;
    }}
    .feature-item {{
      display: flex;
      align-items: center;
      gap: 2px;
    }}
    .footer-right {{
      background: #e3f2fd;
      border: 2px solid #1565c0;
      border-radius: 6px;
      padding: 10px 16px;
      text-align: center;
      min-width: 220px;
    }}
    .footer-right-text {{
      font-size: 10px;
      font-weight: bold;
      color: #0d2b45;
      margin-bottom: 6px;
      line-height: 1.3;
    }}
    .print-btn {{
      font-size: 12px;
      font-weight: bold;
      color: #ffffff;
      background: #0d2b45;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15);
      transition: background 0.2s;
    }}
    .print-btn:hover {{
      background: #1a4971;
    }}
    @media print {{
      .footer-right {{
        display: none !important;
      }}
    }}
  </style>
</head>
<body>

<form class="sheet-container" onsubmit="return false;">
  
  <!-- Top Bar -->
  <div class="top-bar">
    <div class="brand-group">
      <img src="{logo_data_url}" alt="365 Logo" class="brand-logo">
      <div class="company-name">株式会社365</div>
    </div>
    <div class="badge-bar">
      <span class="badge-item badge-time">⏱ 所要時間：約10分</span>
      <span class="badge-item badge-check">♥ チェックするだけ</span>
      <span class="badge-item badge-diagnosis">◀ 無料診断付き</span>
      <span class="badge-item badge-no-know">💡 専門知識不要</span>
    </div>
  </div>

  <!-- Title Banner -->
  <div class="title-banner">
    <h1>365店舗集客・リピート診断シート <span style="font-size:12px; font-weight:normal; opacity:0.9;">ver1</span></h1>
    <p>〜お客様の声を資産化し、来店・再来店の流れを最適化するために〜</p>
  </div>

  <!-- Info Box -->
  <div class="info-box">
    <div class="info-title">【ご記入者情報】</div>
    <div class="info-fields">
      <label class="info-field">店舗名：<input type="text" class="info-input" placeholder="（例：カフェ365）"></label>
      <label class="info-field">ご担当者名：<input type="text" class="info-input" placeholder="（例：山田 太郎）"></label>
    </div>
    <div class="info-note">※ご連絡先のご記入は不要です。</div>
  </div>

  <!-- Two Columns -->
  <div class="columns">
    
    <!-- LEFT COLUMN -->
    <div class="col">
      
      <!-- Section 1 -->
      <div class="section-card">
        <div class="sec-header">
          <span class="sec-num">1</span>
          <span>現在の集客状況について</span>
        </div>
        <div class="sec-body">
          
          <div class="q-item">
            <div class="q-title"><span class="q-num">1-1</span> 新規のお客様はどこから来ますか？（複数選択可）</div>
            <div class="q-options">
              <label class="opt"><input type="checkbox" name="q1_1" value="gmap"> Googleマップ</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="gsearch"> Google検索</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="insta"> Instagram</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="tiktok"> TikTok</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="line"> LINE</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="hp"> ホームページ</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="flyer"> チラシ</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="intro"> 紹介</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="walk"> 通りがかり</label>
              <label class="opt"><input type="checkbox" name="q1_1" value="other"> その他（<input type="text" class="text-inline">）</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">1-2</span> Googleマップからの来店はどれくらいありますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q1_2" value="many"> 多い</label>
              <label class="opt"><input type="radio" name="q1_2" value="normal"> 普通</label>
              <label class="opt"><input type="radio" name="q1_2" value="few"> 少ない</label>
              <label class="opt"><input type="radio" name="q1_2" value="unknown"> 分からない</label>
            </div>
            <div class="point-box">ポイント：Googleマップからの来店が増えると、新規のお客様が大きく増える可能性があります。</div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">1-3</span> 現在、LINE公式アカウントはありますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q1_3" value="active"> 運用している（登録者数：約 <input type="text" class="text-inline" style="width:30px;"> 人）</label>
              <label class="opt"><input type="radio" name="q1_3" value="exist"> 登録だけある</label>
              <label class="opt"><input type="radio" name="q1_3" value="none"> 無い</label>
            </div>
          </div>

        </div>
      </div>

      <!-- Section 2 -->
      <div class="section-card">
        <div class="sec-header">
          <span class="sec-num">2</span>
          <span>Googleマップ（口コミ・投稿）について</span>
        </div>
        <div class="sec-body">
          
          <div class="q-item">
            <div class="q-title"><span class="q-num">2-1</span> 口コミへの返信はどのくらいの頻度で行っていますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q2_1" value="always"> 毎回返信している</label>
              <label class="opt"><input type="radio" name="q2_1" value="sometimes"> 時々返信している</label>
              <label class="opt"><input type="radio" name="q2_1" value="rarely"> ほとんどしていない</label>
              <label class="opt"><input type="radio" name="q2_1" value="never"> していない</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">2-2</span> Googleマップへの投稿（最新情報）はどのくらいの頻度で行っていますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q2_2" value="regular"> 定期的に投稿している（週に <input type="text" class="text-inline" style="width:25px;"> 回くらい）</label>
              <label class="opt"><input type="radio" name="q2_2" value="sometimes"> 時々投稿している</label>
              <label class="opt"><input type="radio" name="q2_2" value="rarely"> あまりしていない</label>
              <label class="opt"><input type="radio" name="q2_2" value="never"> 投稿したことがない</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">2-3</span> Googleマップの写真は定期的に更新していますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q2_3" value="regular"> はい（定期的に更新している）</label>
              <label class="opt"><input type="radio" name="q2_3" value="sometimes"> 時々更新している</label>
              <label class="opt"><input type="radio" name="q2_3" value="never"> 更新していない</label>
            </div>
            <div class="point-box">ポイント：口コミへの返信・投稿・写真の更新が、信頼と来店を生みます。</div>
          </div>

        </div>
      </div>

    </div>

    <!-- RIGHT COLUMN -->
    <div class="col">
      
      <!-- Section 3 -->
      <div class="section-card">
        <div class="sec-header">
          <span class="sec-num">3</span>
          <span>お客様との関係づくりについて（つながり方がリピートを左右します）</span>
        </div>
        <div class="sec-body">
          
          <div class="q-item">
            <div class="q-title"><span class="q-num">3-1</span> 来店・来院されたお客様へのフォロー方法はありますか？（複数選択可）</div>
            <div class="q-options">
              <label class="opt"><input type="checkbox" name="q3_1" value="line"> LINE</label>
              <label class="opt"><input type="checkbox" name="q3_1" value="phone"> 電話</label>
              <label class="opt"><input type="checkbox" name="q3_1" value="email"> メール</label>
              <label class="opt"><input type="checkbox" name="q3_1" value="dm"> ハガキ・DM</label>
              <label class="opt"><input type="checkbox" name="q3_1" value="none"> 特になし</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">3-2</span> クーポンや特典の配信はしていますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q3_2" value="yes"> している</label>
              <label class="opt"><input type="radio" name="q3_2" value="no"> していない</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">3-3</span> お客様アンケートは実施していますか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q3_3" value="yes" id="q3_3_yes"> 実施している（方法： <label class="opt"><input type="checkbox" class="q3_3_sub" value="paper"> 紙</label> <label class="opt"><input type="checkbox" class="q3_3_sub" value="line"> LINE</label> <label class="opt"><input type="checkbox" class="q3_3_sub" value="other"> その他（<input type="text" class="text-inline" style="width:30px;">）</label>）</label>
              <label class="opt"><input type="radio" name="q3_3" value="no" id="q3_3_no"> 実施していない</label>
            </div>
          </div>

        </div>
      </div>

      <!-- Section 4 -->
      <div class="section-card">
        <div class="sec-header">
          <span class="sec-num">4</span>
          <span>一番困っていること・解決したいこと（課題が明確になるほど改善できます）</span>
        </div>
        <div class="sec-body">
          
          <div class="q-item">
            <div class="q-title"><span class="q-num">4-1</span> 現在、一番困っていることは何ですか？（あてはまるものを3つまで）</div>
            <div class="q-options" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px 8px;">
              <label class="opt"><input type="checkbox" name="q4_1"> 新規のお客様を増やしたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> リピーター・会員を増やしたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> 口コミを増やしたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> LINE登録者を増やしたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> Googleマップを強くしたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> 売上を上げたい</label>
              <label class="opt"><input type="checkbox" name="q4_1"> スタッフの教育・定着</label>
              <label class="opt"><input type="checkbox" name="q4_1"> 品質とその成果のばらつき</label>
              <label class="opt"><input type="checkbox" name="q4_1"> 人手不足・採用</label>
              <label class="opt"><input type="checkbox" name="q4_1"> SNS（Instagramなど）の活用</label>
              <label class="opt"><input type="checkbox" name="q4_1"> 競合対策</label>
              <label class="opt"><input type="checkbox" name="q4_1"> その他（<input type="text" class="text-inline" style="width:30px;">）</label>
            </div>
          </div>

          <div class="q-item">
            <div class="q-title"><span class="q-num">4-2</span> その他、特に解決したいことがあればご記入ください（自由記述）</div>
            <textarea class="text-area-box" placeholder="ご自由にご記入ください..."></textarea>
          </div>

        </div>
      </div>

      <!-- Section 5 -->
      <div class="section-card">
        <div class="sec-header">
          <span class="sec-num">5</span>
          <span>無料診断について</span>
        </div>
        <div class="sec-body" style="padding:4px 8px;">
          <div class="q-item">
            <div class="q-title"><span class="q-num">5-1</span> 無料診断レポートをご希望ですか？</div>
            <div class="q-options">
              <label class="opt"><input type="radio" name="q5_1" value="yes" checked> はい</label>
              <label class="opt"><input type="radio" name="q5_1" value="no"> いいえ</label>
            </div>
          </div>
        </div>
      </div>

    </div>

  </div>

  <!-- Footer Section -->
  <div class="footer-section">
    <div class="footer-left">
      <div class="footer-msg-top">ご記入ありがとうございました。</div>
      <div class="footer-msg-sub">あなたのお店の“伸びしろ”を無料診断いたします。<br>Googleマップ・口コミ・LINE・リピーター対策まで、改善ポイントをレポートで分かりやすくご提案します。</div>
      
      <div class="footer-features">
        <div class="features-header">無料診断でわかること（例）</div>
        <div class="features-grid">
          <div class="feature-item"><span>＜</span> 集客の改善ポイント</div>
          <div class="feature-item"><span>＜</span> リピート率の改善ポイント</div>
          <div class="feature-item"><span>＜</span> Googleマップの改善ポイント</div>
          <div class="feature-item"><span>＜</span> 口コミ・評価の改善ポイント</div>
          <div class="feature-item"><span>＜</span> LINE活用の改善ポイント</div>
          <div class="feature-item"><span>＜</span> AI分析による具体的な改善提案</div>
        </div>
      </div>
    </div>

    <div class="footer-right">
      <div class="footer-right-text">ご記入内容の保存・印刷</div>
      <button type="button" class="print-btn" onclick="handlePrint();">
        <span style="font-size:14px;">🖨</span>
        <span>印刷 / PDF保存する</span>
      </button>
    </div>
  </div>

</form>

<script>
function handlePrint() {{
  const isLINE = /Line/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  
  if (isLINE) {{
    const url = new URL(window.location.href);
    url.searchParams.set("openExternalBrowser", "1");
    url.searchParams.set("autoPrint", "1");

    // LINE内で入力されたチェックやテキスト情報を引き継ぐ
    const formData = {{}};
    const formElements = document.querySelectorAll("input, textarea");
    formElements.forEach((el, idx) => {{
      if (el.type === "checkbox" || el.type === "radio") {{
        if (el.checked) {{
          formData["el_" + idx] = "1";
        }}
      }} else if (el.value) {{
        formData["el_" + idx] = el.value;
      }}
    }});
    
    url.hash = "data=" + encodeURIComponent(JSON.stringify(formData));

    alert("LINEアプリ内では直接印刷機能が利用できないため、Safari/Chrome（標準ブラウザ）に移動して印刷画面を開きます。");
    window.location.href = url.toString();
    return;
  }}
  
  if (isMobile) {{
    alert("スマホの印刷プレビュー画面が開きます。\n\n※画面上の印刷設定（「詳細設定」または「向き」）で『横（横向き）』を選択するとA4横1枚できれいに保存・印刷できます。");
  }}

  window.print();
}}

document.addEventListener("DOMContentLoaded", function() {{
  // LINE等から外部ブラウザに遷移した場合に入力状態を復元
  if (window.location.hash.startsWith("#data=")) {{
    try {{
      const rawData = decodeURIComponent(window.location.hash.replace("#data=", ""));
      const formData = JSON.parse(rawData);
      const formElements = document.querySelectorAll("input, textarea");
      formElements.forEach((el, idx) => {{
        const val = formData["el_" + idx];
        if (val !== undefined) {{
          if (el.type === "checkbox" || el.type === "radio") {{
            el.checked = (val === "1");
          }} else {{
            el.value = val;
          }}
        }}
      }});
    }} catch(e) {{
      console.error(e);
    }}
  }}

  // 外部ブラウザ遷移後の自動印刷呼び出し
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("autoPrint") === "1" && !/Line/i.test(navigator.userAgent)) {{
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("autoPrint");
    cleanUrl.searchParams.delete("openExternalBrowser");
    window.history.replaceState({{}}, document.title, cleanUrl.toString());

    setTimeout(function() {{
      window.print();
    }}, 1000);
  }}

  const radioYes = document.getElementById("q3_3_yes");
  const radioNo = document.getElementById("q3_3_no");
  const subCheckboxes = document.querySelectorAll(".q3_3_sub");

  // 当方式（紙、LINE、その他）のいずれかにチェックが入ったら自動で「実施している」にチェック
  subCheckboxes.forEach(function(cb) {{
    cb.addEventListener("change", function() {{
      const anyChecked = Array.from(subCheckboxes).some(c => c.checked);
      if (anyChecked) {{
        radioYes.checked = true;
      }}
    }});
  }});

  // 「実施していない」にチェックが入ったら方式のチェックを全解除
  if (radioNo) {{
    radioNo.addEventListener("change", function() {{
      if (radioNo.checked) {{
        subCheckboxes.forEach(function(cb) {{
          cb.checked = false;
        }});
      }}
    }});
  }}
}});
</script>

</body>
</html>
"""

    out_paths = [
        "/Users/kentosada/dev/365VOICE/diagnosis_sheet.html",
        "/Users/kentosada/Downloads/diagnosis_sheet.html",
        "/Users/kentosada/dev/365VOICE_diagnosis_sheet/index.html",
        "/Users/kentosada/dev/365VOICE_diagnosis_sheet/diagnosis_sheet.html"
    ]
    for path in out_paths:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_content)

    print("Successfully built perfect HTML matching original image!")

if __name__ == "__main__":
    generate_perfect_html()
