/**
 * GBP MEO Diagnostic Tool - Complete Master Clean Rewrite
 * 
 * Key Features & Architecture:
 * 1. Single Source of Truth for Bookmarklet Window Target ("GBP_DIAGNOSTIC_REPORT_WINDOW").
 * 2. Pure Live Data Engine: Zero rating/score carry-overs between stores; resets automatically on store change.
 * 3. STRICT GRADED EVALUATION ENGINES:
 *    - POSTS FREQUENCY GRADED SCORE (Max 20pt): <=14 days = 20pt, 15-30 days = 10pt, >30 days = 4pt.
 *    - REVIEW COUNT GRADED SCORE (Max 12pt): 500+ = 12pt, 300-499 = 9pt, 100-299 = 6pt, 50-99 = 3pt, <50 = 0pt.
 *    - REVIEW RATING GRADED SCORE (Max 3pt): 4.5+ = 3pt, 4.0-4.4 = 2pt, <4.0 = 0pt.
 *    - REVIEW REPLY RATIO GRADED SCORE (Max 15pt): 95%+ = 15pt, 80-94% = 12pt, 50-79% = 8pt, 1-49% = 4pt, 0% = 0pt.
 *    - ATTRIBUTES GRADED SCORE (Max 4pt): 5+ items = 4pt, 1-4 items = 2pt, 0 items = 0pt.
 *    - DESCRIPTION GRADED SCORE (Max 4pt): 250+ chars = 4pt, 1-249 chars = 2pt, 0 chars = 0pt.
 * 4. STRICT AI REPORT PROMPT & STRUCTURE: Exactly 3 Sections with 3 Sub-items each (1-1 to 3-3) formatted precisely.
 * 5. PINPOINT WEBSITE EXTRACTION FOR GLOBE ICON LIST & ACTION BUTTONS:
 *    Accurately extracts store URLs like "ichigo-jidousya.com" from globe icon list rows even if round action button is absent.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. CONSTANTS & SYSTEM CONFIGURATION
    // ==========================================
    const APP_BASE_URL = window.location.origin + window.location.pathname;
    const DEFAULT_GEMINI_KEY = "";
    const REPORT_WINDOW_TARGET = "GBP_DIAGNOSTIC_REPORT_WINDOW";

    const INITIAL_STORE_TEMPLATE = {
        companyName: "店舗名未設定",
        name: "店舗名未設定",
        category: "未設定",
        reviewCount: 0,
        rating: 0,
        replyRatio: undefined,
        daysSinceLastPost: 28,
        photoTier: "20",
        photoCount: undefined,
        statusPhotos: "error",
        rawWebsite: "",
        rawHours: "",
        rawDescription: "",
        rawAttributes: "",
        statusWebsite: "error",
        statusHours: "error",
        statusDescription: "error",
        statusCover: "pass",
        statusReply: "error",
        statusAttributes: "error"
    };

    const STATUS_RANK = {
        'pass': 3,
        'warn': 2,
        'fail': 1,
        'error': 0
    };

    // Global State
    let storeData = { ...INITIAL_STORE_TEMPLATE };
    let currentDiagDataForAi = null;

    // ==========================================
    // 2. DOM ELEMENT REFERENCES
    // ==========================================
    const welcomePlaceholder = document.getElementById('welcome-placeholder');
    const reportPaper = document.getElementById('report-paper');
    const controlPanelSection = document.getElementById('control-panel-section');

    const displayCompanyName = document.getElementById('display-company-name');
    const displayStoreName = document.getElementById('display-store-name');
    const metaCategory = document.getElementById('meta-category');
    const metaDate = document.getElementById('meta-date');

    const totalScoreEl = document.getElementById('total-score');
    const totalMaxScoreEl = document.getElementById('total-max-score');
    const scoreRankEl = document.getElementById('score-rank');
    const scoreCommentEl = document.getElementById('score-comment');

    const scoreBasicEl = document.getElementById('score-basic');
    const scoreReviewsEl = document.getElementById('score-reviews');
    const scorePhotosEl = document.getElementById('score-photos');
    const scorePostsEl = document.getElementById('score-posts');

    const groupScoreBasic = document.getElementById('group-score-basic');
    const groupScoreReviews = document.getElementById('group-score-reviews');
    const groupScorePhotos = document.getElementById('group-score-photos');
    const groupScorePosts = document.getElementById('group-score-posts');

    const listBasic = document.getElementById('list-basic');
    const listReviews = document.getElementById('list-reviews');
    const listPhotos = document.getElementById('list-photos');
    const listPosts = document.getElementById('list-posts');

    const actionListEl = document.getElementById('action-recommendations');
    const radarSvg = document.getElementById('radar-chart');

    // Form Controls
    const inputCompanyName = document.getElementById('input-company-name');
    const inputStoreName = document.getElementById('input-store-name');
    const inputCategory = document.getElementById('input-category');
    const inputReviewCount = document.getElementById('input-review-count');
    const inputRating = document.getElementById('input-rating');
    const inputLastPost = document.getElementById('input-last-post');
    const inputPhotoCount = document.getElementById('input-photo-count');

    const selectWebsite = document.getElementById('select-website');
    const selectHours = document.getElementById('select-hours');
    const selectDescription = document.getElementById('select-description');
    const selectCover = document.getElementById('select-cover');
    const selectReply = document.getElementById('select-reply');
    const selectAttributes = document.getElementById('select-attributes');

    // Buttons & Modals
    const btnPrint = document.getElementById('btn-print');
    const btnClearReport = document.getElementById('btn-clear-report');
    const btnLoadDemo = document.getElementById('btn-load-demo');
    const btnWelcomeDemo = document.getElementById('btn-welcome-demo');
    const btnWelcomeGuide = document.getElementById('btn-welcome-guide');
    const btnOpenGuide = document.getElementById('btn-open-guide');
    const btnShowBookmarkletModal = document.getElementById('btn-show-bookmarklet-modal');
    const modalBookmarklet = document.getElementById('modal-bookmarklet');
    const bookmarkletLink = document.getElementById('bookmarklet-link');

    // AI Components
    const btnShowAiModal = document.getElementById('btn-show-ai-modal');
    const btnGenerateAiAdvice = document.getElementById('btn-generate-ai-advice');
    const modalAiConfig = document.getElementById('modal-ai-config');
    const inputApiKey = document.getElementById('input-api-key');
    const btnSaveApiKey = document.getElementById('btn-save-api-key');
    const aiAdviceContent = document.getElementById('ai-advice-content');

    // Loaders & Toast
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatusText = document.getElementById('loading-status-text');
    const loadingSubText = document.getElementById('loading-sub-text');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const loadingPercent = document.getElementById('loading-percent');
    const toastNotification = document.getElementById('toast-notification');
    const toastTitle = document.getElementById('toast-title');
    const toastDesc = document.getElementById('toast-desc');

    // Initialize Date
    const today = new Date();
    metaDate.textContent = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    document.getElementById('current-year').textContent = today.getFullYear();

    if (inputApiKey) inputApiKey.value = localStorage.getItem('gemini_api_key') || "";

    // ==========================================
    // 3. BOOKMARKLET GENERATOR ENGINE
    // ==========================================
    function generateBookmarkletHref() {
        return "javascript:(function(){try{" +
            "let loc = window.location.href;" +
            "if(loc.indexOf('google.') === -1 || (loc.indexOf('/maps') === -1 && loc.indexOf('maps.google') === -1)){" +
            "  alert('⚠️ GBPデータ取得エラー\\n\\nGoogleマップ（google.com/maps）を開いた状態で再実行してください。');return;" +
            "}" +
            "let bTxt = document.body.innerText || '';" +

            "/* A. STORE NAME */" +
            "let name = '';" +
            "let kp = document.body.querySelector('h1.DUwif, h1.fontTitleLarge, div.fontTitleLarge, h1');" +
            "if(kp && kp.innerText && kp.innerText.trim() !== 'Google マップ' && kp.innerText.trim() !== 'Google'){" +
            "  name = kp.innerText.trim();" +
            "}" +
            "if(!name){" +
            "  let locPath = decodeURIComponent(window.location.pathname);" +
            "  let nameMatch = locPath.match(/\\/place\\/([^\\/@\\?]+)/);" +
            "  if(nameMatch){ name = nameMatch[1].replace(/\\+/g, ' ').trim(); }" +
            "}" +
            "if(!name){ name = document.title.replace(/ - Googleマップ.*/,'').replace(/ - Google.*/,'').trim(); }" +

            "/* B. RATING */" +
            "let rating = 0;" +
            "let ariaStar = document.body.querySelector('[aria-label*=\"5 つ星のうち\"], [aria-label*=\"5つ星のうち\"], [aria-label*=\"星\"], span.ceR21e');" +
            "if(ariaStar){" +
            "  let lbl = ariaStar.getAttribute('aria-label') || '';" +
            "  let rM = lbl.match(/([1-5]\\.[0-9])/);" +
            "  if(rM){ rating = parseFloat(rM[1]); }" +
            "}" +
            "if(!rating){" +
            "  let headTxt = bTxt.substring(0, 800);" +
            "  let rM = headTxt.match(/([1-5]\\.[0-9])\\s*\\(/) || headTxt.match(/([1-5]\\.[0-9])/);" +
            "  if(rM){ rating = parseFloat(rM[1]); }" +
            "}" +

            "/* C. REVIEW COUNT */" +
            "let reviewCount = 0;" +
            "if(ariaStar){" +
            "  let pEl = ariaStar.closest('div') || ariaStar.parentElement;" +
            "  if(pEl){" +
            "    let pTxt = pEl.innerText || '';" +
            "    let m = pTxt.match(/\\(\\s*([0-9,]+)\\s*\\)/) || pTxt.match(/([0-9,]+)\\s*件/);" +
            "    if(m){" +
            "      let val = parseInt(m[1].replace(/,/g,''));" +
            "      if(!isNaN(val) && val > 0){ reviewCount = val; }" +
            "    }" +
            "  }" +
            "}" +
            "if(!reviewCount){" +
            "  let headTxt = bTxt.substring(0, 1000);" +
            "  let m = headTxt.match(/([1-5]\\.[0-9])[\\s\\S]{0,100}?\\(\\s*([0-9,]+)\\s*\\)/);" +
            "  if(m){" +
            "    let val = parseInt(m[2].replace(/,/g,''));" +
            "    if(!isNaN(val) && val > 0){ reviewCount = val; }" +
            "  }" +
            "}" +

            "/* D. REVIEWS TAB & REPLY RATIO (%) ENGINE */" +
            "let reviewModal = document.querySelector('g-review-dialog, div[role=\"dialog\"], div.review-dialog, div.m6QEfe[aria-label*=\"クチコミ\"]');" +
            "let isReviewTabOpen = Boolean(reviewModal) || (bTxt.indexOf('関連度順') !== -1 || bTxt.indexOf('評価の高い順') !== -1 || bTxt.indexOf('クチコミの検索') !== -1 || bTxt.indexOf('最新順') !== -1);" +
            "let replyRatio = undefined;" +
            "let replyStatus = 'error';" +
            "if(isReviewTabOpen){" +
            "  let cards = Array.from(document.body.querySelectorAll('div.jJ79vd, div.My5W2e, div.TI2da, div.gws-localreviews__google-review, div[data-review-id], div.WwHIbd'));" +
            "  let timeMatches = (bTxt.match(/([0-9]+\\s*(年前|か月前|月前|週間前|週前|日前)|1\\s*か月前|2\\s*か月前|3\\s*か月前)/g) || []);" +
            "  let totalVisibleReviews = Math.max(cards.length, timeMatches.length);" +
            "  let replyMatches = (bTxt.match(/オーナーからの返信|店舗からの返信/g) || []);" +
            "  let totalOwnerReplies = replyMatches.length;" +
            "  if(totalVisibleReviews >= 3){" +
            "    replyRatio = Math.min(Math.round((totalOwnerReplies / totalVisibleReviews) * 100), 100);" +
            "    if(replyRatio >= 80){ replyStatus = 'pass'; }" +
            "    else if(replyRatio >= 50){ replyStatus = 'warn'; }" +
            "    else { replyStatus = 'fail'; }" +
            "  }else{" +
            "    replyStatus = 'error';" +
            "  }" +
            "}" +

            "/* E. ULTRA-ACCURATE PHOTO GALLERY TILE COUNTER */" +
            "let isPhotoAllTab = Boolean(document.body.querySelector('button[aria-label*=\"すべて\"][aria-selected=\"true\"], div[role=\"tab\"][aria-selected=\"true\"][aria-label*=\"すべて\"], button[aria-label*=\"写真\"][aria-selected=\"true\"]')) || " +
            "                    (loc.indexOf('!1e2') !== -1 || loc.indexOf('3a,87y') !== -1 || loc.indexOf('!1e10') !== -1 || loc.indexOf('/photo') !== -1 || bTxt.indexOf('すべての写真') !== -1);" +
            "let photoCount = undefined;" +
            "let photoTier = '20';" +
            "let statusPhotos = 'error';" +
            "if(isPhotoAllTab){" +
            "  let countVal = 0;" +
            "  let tabEl = document.body.querySelector('button[aria-label*=\"すべて\"], div[role=\"tab\"][aria-label*=\"すべて\"], button[aria-label*=\"写真\"]');" +
            "  let galleryContainer = null;" +
            "  if(tabEl){" +
            "    galleryContainer = tabEl.closest('div.m6QEfe, div[role=\"region\"], div[role=\"main\"], div.D6Bse') || tabEl.parentElement.parentElement;" +
            "  }" +
            "  if(!galleryContainer){" +
            "    galleryContainer = document.body.querySelector('div.m6QEfe, div[aria-label*=\"写真\"]');" +
            "  }" +
            "  if(galleryContainer){" +
            "    let photoTiles = galleryContainer.querySelectorAll('a[href*=\"/data=!3m\"], a[aria-label*=\"写真\"], div[role=\"img\"][aria-label], img[src*=\"googleusercontent.com/p/\"]');" +
            "    if(photoTiles.length > 0){ countVal = photoTiles.length; }" +
            "  }" +
            "  if(!countVal){" +
            "    let mainTiles = Array.from(document.body.querySelectorAll('a[href*=\"/data=!3m\"], img[src*=\"googleusercontent.com/p/\"]')).filter(el => {" +
            "      let rect = el.getBoundingClientRect();" +
            "      return rect.left > 60 && rect.width > 50;" +
            "    });" +
            "    if(mainTiles.length > 0){ countVal = mainTiles.length; }" +
            "  }" +
            "  let hMatch = bTxt.match(/すべての写真\\s*[\\(（\\s]*([0-9,]+)\\s*[\\)）枚\\s]*/) || bTxt.match(/([0-9,]+)\\s*枚の写真/);" +
            "  if(hMatch){" +
            "    let textNum = parseInt(hMatch[1].replace(/,/g, ''));" +
            "    if(!isNaN(textNum) && textNum > 0){ countVal = Math.max(countVal, textNum); }" +
            "  }" +
            "  if(countVal > 0){" +
            "    photoCount = countVal;" +
            "    if(countVal >= 50){ statusPhotos = 'pass'; photoTier = '50'; }" +
            "    else if(countVal >= 20){ statusPhotos = 'warn'; photoTier = '20'; }" +
            "    else { statusPhotos = 'fail'; photoTier = '10'; }" +
            "  }else{" +
            "    statusPhotos = 'warn';" +
            "  }" +
            "}" +

            "/* F. CATEGORY & WEBSITE URL PINPOINT EXTRACTION (HANDLES GLOBE ICON LIST ROWS & BUTTONS) */" +
            "let category = '未設定';" +
            "let catNode = document.body.querySelector('button[jsaction*=\"category\"], div.fontBodyMedium button, span.DkEaL');" +
            "if(catNode && catNode.innerText){" +
            "  let rawCat = catNode.innerText.replace(/[\\uE000-\\uF8FF\\u2000-\\u206F]/g, '').replace(/([0-9\\.]+\\s*)?Google\\s*のクチコミ\\s*\\([0-9,]+\\)/gi,'').replace(/^[0-9\\.\\s★⭐]+/,'').trim();" +
            "  if(rawCat) category = rawCat.split('·')[0].split('•')[0].trim();" +
            "}" +

            "/* Auto-click hours button */" +
            "let hBtn = document.body.querySelector('button[aria-label*=\"営業時間\"], button[aria-label*=\"営業中\"], button[aria-label*=\"営業終了\"], button[aria-label*=\"まもなく営業終了\"], div.t3bWnc button, button[data-item-id=\"oh\"]');" +
            "if(hBtn){ try{ hBtn.click(); }catch(e){} }" +

            "/* Raw Website URL Extraction Engine */" +
            "let rawWebsite = '';" +
            "let webBtn = document.body.querySelector('a[data-item-id=\"authority\"], a[aria-label*=\"ウェブサイト\"], a[aria-label*=\"サイト\"]');" +
            "if(webBtn){" +
            "  let h = webBtn.getAttribute('href') || '';" +
            "  if(h.indexOf('google.com/url?') !== -1){" +
            "    let qM = h.match(/[?&]q=([^&]+)/);" +
            "    if(qM) h = decodeURIComponent(qM[1]);" +
            "  }" +
            "  if(h && h.indexOf('google.') === -1 && h.indexOf('gstatic.') === -1){ rawWebsite = h; }" +
            "}" +
            "if(!rawWebsite){" +
            "  let anchors = Array.from(document.body.querySelectorAll('a[href]'));" +
            "  for(let a of anchors){" +
            "    let href = a.getAttribute('href') || '';" +
            "    let txt = (a.innerText || '').trim();" +
            "    let label = (a.getAttribute('aria-label') || '') + ' ' + txt;" +
            "    if(href.indexOf('google.com/url?') !== -1){" +
            "      let qM = href.match(/[?&]q=([^&]+)/);" +
            "      if(qM) href = decodeURIComponent(qM[1]);" +
            "    }" +
            "    let isGoogleSys = Boolean(href.indexOf('google.') !== -1 || href.indexOf('gstatic.') !== -1 || href.indexOf('ggpht.') !== -1 || href.indexOf('javascript:') !== -1);" +
            "    if(!isGoogleSys){" +
            "      if(a.getAttribute('data-item-id') === 'authority' || label.indexOf('ウェブサイト') !== -1 || label.indexOf('サイト') !== -1){" +
            "        if(href.indexOf('http') !== -1){ rawWebsite = href; break; }" +
            "      }else if(txt.indexOf('.com') !== -1 || txt.indexOf('.jp') !== -1 || txt.indexOf('.net') !== -1 || txt.indexOf('.org') !== -1){" +
            "        rawWebsite = txt.indexOf('http') === -1 ? 'http://' + txt : txt;" +
            "        break;" +
            "      }" +
            "    }" +
            "  }" +
            "}" +

            "/* Raw Business Hours */" +
            "let rawHours = '';" +
            "let tableRows = Array.from(document.body.querySelectorAll('table.t3bWnc tr, table tr, tr.y07ffe, div.e2W3ic'));" +
            "let weeklyLines = [];" +
            "tableRows.forEach(tr => {" +
            "  let txt = tr.innerText ? tr.innerText.replace(/\\n+/g, ' ').trim() : '';" +
            "  if(txt && (txt.indexOf('月曜') !== -1 || txt.indexOf('火曜') !== -1 || txt.indexOf('水曜') !== -1 || txt.indexOf('木曜') !== -1 || txt.indexOf('金曜') !== -1 || txt.indexOf('土曜') !== -1 || txt.indexOf('日曜') !== -1 || txt.indexOf('定休日') !== -1 || txt.indexOf('休業') !== -1)){" +
            "    weeklyLines.push(txt.replace(/[\\uE000-\\uF8FF]/g,'').trim());" +
            "  }" +
            "});" +
            "if(weeklyLines.length > 0){" +
            "  rawHours = weeklyLines.join(' / ');" +
            "}else{" +
            "  let hoursNode = document.body.querySelector('button[data-item-id=\"oh\"], [aria-label*=\"営業時間\"], [aria-label*=\"営業中\"], [aria-label*=\"営業終了\"], div.t3bWnc');" +
            "  if(hoursNode){ rawHours = hoursNode.getAttribute('aria-label') || hoursNode.innerText || ''; }" +
            "  if(!rawHours || rawHours === '営業時間'){" +
            "    let hMatch = bTxt.match(/(営業中|営業終了|まもなく営業終了|営業時間外|24 時間営業|定休日|本日休業)[\\s\\S]{0,50}?(\\d{1,2}:\\d{2})/);" +
            "    if(hMatch){ rawHours = hMatch[0].replace(/\\n+/g, ' ').trim(); }" +
            "  }" +
            "}" +

            "/* Raw Business Description */" +
            "let rawDescription = '';" +
            "let descIdx = bTxt.indexOf('提供元: オーナー');" +
            "if(descIdx !== -1){" +
            "  rawDescription = bTxt.substring(descIdx, descIdx + 750).replace(/\\n+/g, ' ').trim();" +
            "}else{" +
            "  let descIdx2 = bTxt.indexOf('ビジネスの説明');" +
            "  if(descIdx2 !== -1){" +
            "    rawDescription = bTxt.substring(descIdx2, descIdx2 + 750).replace(/\\n+/g, ' ').trim();" +
            "  }" +
            "}" +
            "let statusDescription = 'fail';" +
            "if(rawDescription && rawDescription.length >= 250){ statusDescription = 'pass'; }" +
            "else if(rawDescription && rawDescription.length > 0){ statusDescription = 'warn'; }" +

            "/* G. BASIC INFO TAB ATTRIBUTES DETECTOR */" +
            "let isBasicInfoTab = Boolean(document.body.querySelector('button[aria-label*=\"基本情報\"], div[role=\"tab\"][aria-selected=\"true\"], [aria-label*=\"基本情報\"]')) || " +
            "                     bTxt.indexOf('✔') !== -1 || " +
            "                     bTxt.indexOf('基本情報') !== -1 || " +
            "                     bTxt.indexOf('設備') !== -1 || " +
            "                     bTxt.indexOf('プラン') !== -1 || " +
            "                     bTxt.indexOf('バリアフリー') !== -1 || " +
            "                     bTxt.indexOf('お支払い') !== -1;" +
            "let rawAttributes = '';" +
            "let statusAttributes = 'error';" +
            "let attrCount = 0;" +
            "if(isBasicInfoTab){" +
            "  let validAttrItems = [];" +
            "  let checkNodes = Array.from(document.body.querySelectorAll('div, span, li, tr, p, td'));" +
            "  checkNodes.forEach(node => {" +
            "    let txt = node.innerText || '';" +
            "    if(txt.indexOf('✔') !== -1 && txt.length < 35 && txt.indexOf('\\n') === -1){" +
            "      let cleanItem = txt.replace(/✔/g, '').trim();" +
            "      if(cleanItem && cleanItem !== '基本情報' && validAttrItems.indexOf(cleanItem) === -1){" +
            "        validAttrItems.push(cleanItem);" +
            "      }" +
            "    }" +
            "  });" +
            "  let kwCandidates = [" +
            "    'トイレ', '整備士', '事前予約がおすすめ', '車椅子対応の座席', '車椅子対応の入り口', '車椅子対応の駐車場', '車椅子対応のトイレ', " +
            "    '無料Wi-Fi', 'Wi-Fi完備', '無料駐車場完備', '駐車場あり', 'キャッシュレス決済対応', 'クレジットカード可', '電子マネー可', " +
            "    'QRコード決済', '個室あり', '全席禁煙', 'テイクアウト', '一人での食事', 'テーブル サービス'" +
            "  ];" +
            "  kwCandidates.forEach(kw => {" +
            "    let isDisabled = bTxt.indexOf('🚫 ' + kw) !== -1 || bTxt.indexOf('🚫' + kw) !== -1;" +
            "    if(bTxt.indexOf(kw) !== -1 && !isDisabled && validAttrItems.indexOf(kw) === -1){" +
            "      validAttrItems.push(kw);" +
            "    }" +
            "  });" +
            "  attrCount = validAttrItems.length;" +
            "  rawAttributes = validAttrItems.join(' ・ ') + ' 等';" +
            "  if(attrCount >= 5){ statusAttributes = 'pass'; }" +
            "  else if(attrCount >= 1){ statusAttributes = 'warn'; }" +
            "  else { statusAttributes = 'fail'; }" +
            "}" +

            "/* H. POSTS FREQUENCY & DAYS EXTRACTION */" +
            "let daysSinceLastPost = 28;" +
            "let postDateMatches = bTxt.match(/([0-9]+)\\s*(日前|日分前|週間前|週前|か月前|月前|年前)/);" +
            "if(postDateMatches){" +
            "  let str = postDateMatches[0];" +
            "  if(str.indexOf('日前') !== -1){ daysSinceLastPost = parseInt(str); }" +
            "  else if(str.indexOf('週間前') !== -1 || str.indexOf('週前') !== -1){ daysSinceLastPost = parseInt(str) * 7; }" +
            "  else if(str.indexOf('か月前') !== -1 || str.indexOf('月前') !== -1){ daysSinceLastPost = parseInt(str) * 30; }" +
            "  else if(str.indexOf('年前') !== -1){ daysSinceLastPost = parseInt(str) * 365; }" +
            "}" +

            "/* I. PACK & SEND DATA */" +
            "let data = {" +
            "  isPhotoAllTab: isPhotoAllTab," +
            "  companyName: name," +
            "  name: name," +
            "  category: category," +
            "  reviewCount: reviewCount," +
            "  rating: rating," +
            "  replyRatio: replyRatio," +
            "  photoCount: photoCount," +
            "  photoTier: photoTier," +
            "  statusPhotos: statusPhotos," +
            "  daysSinceLastPost: daysSinceLastPost," +
            "  rawWebsite: rawWebsite," +
            "  rawHours: rawHours," +
            "  rawDescription: rawDescription," +
            "  rawAttributes: rawAttributes," +
            "  attrCount: attrCount," +
            "  statusWebsite: Boolean(rawWebsite) ? 'pass' : 'fail'," +
            "  statusHours: Boolean(rawHours) ? 'pass' : 'fail'," +
            "  statusDescription: statusDescription," +
            "  statusCover: 'pass'," +
            "  statusReply: replyStatus," +
            "  statusAttributes: statusAttributes" +
            "};" +
            "let targetUrl = '" + APP_BASE_URL + "#data=' + encodeURIComponent(JSON.stringify(data));" +
            "window.open(targetUrl, '" + REPORT_WINDOW_TARGET + "');" +
            "}catch(e){ alert('⚠️ GBPデータの取得に失敗しました。Googleマップで店舗を選択した状態で再実行してください。'); }" +
            "})();";
    }

    bookmarkletLink.setAttribute('href', generateBookmarkletHref());

    // ==========================================
    // 4. VIEW CONTROLLER & TOAST SYSTEM
    // ==========================================
    function activateReportView() {
        if (welcomePlaceholder) welcomePlaceholder.classList.add('hidden');
        if (reportPaper) reportPaper.classList.remove('hidden');
        if (controlPanelSection) controlPanelSection.classList.remove('hidden');
    }

    function resetAiAdvice() {
        currentDiagDataForAi = null;
        if (aiAdviceContent) {
            aiAdviceContent.innerHTML = '<p class="ai-placeholder">「AI解説文を自動生成」ボタンを押すと、診断データに基づいたプロコンサルタント視点の解説と営業トーク案が即時作成されます。</p>';
        }
        if (btnGenerateAiAdvice) {
            btnGenerateAiAdvice.disabled = false;
            btnGenerateAiAdvice.textContent = '🤖 AI解説文を自動生成';
        }
    }

    function resetToWelcomeView() {
        localStorage.removeItem('last_gbp_data');
        storeData = { ...INITIAL_STORE_TEMPLATE };
        resetAiAdvice();
        if (welcomePlaceholder) welcomePlaceholder.classList.remove('hidden');
        if (reportPaper) reportPaper.classList.add('hidden');
        if (controlPanelSection) controlPanelSection.classList.add('hidden');
        showToast("🧹 レポートをクリアしました", "診断データを初期化し、トップ画面に戻りました。");
    }

    function showToast(title, desc) {
        toastTitle.textContent = title;
        toastDesc.textContent = desc;
        toastNotification.classList.remove('hidden');
        setTimeout(() => toastNotification.classList.add('hidden'), 4500);
    }

    function hideAllModals() {
        if (modalBookmarklet) modalBookmarklet.classList.add('hidden');
        if (modalAiConfig) modalAiConfig.classList.add('hidden');
        document.querySelectorAll('.modal-overlay, .modal').forEach(m => m.classList.add('hidden'));
    }

    function triggerLoadingAnimation(onComplete, isMergeUpdate = false, isNewStore = false) {
        resetAiAdvice();
        hideAllModals();
        activateReportView();
        loadingOverlay.classList.remove('hidden');
        progressBarFill.style.width = '0%';
        loadingPercent.textContent = '0%';

        if (isNewStore) {
            loadingStatusText.textContent = '🏢 新しい店舗の診断レポートを作成中...';
            loadingSubText.textContent = '新しい店舗データを抽出してレポートを更新しています';
        } else if (isMergeUpdate) {
            loadingStatusText.textContent = '✨ 写真「すべて」タブの画像枚数を統合中...';
            loadingSubText.textContent = '既存の店舗情報を100%保持しながら、画像枚数のみを反映しています';
        } else {
            loadingStatusText.textContent = 'Googleマップから店舗データを抽出中...';
            loadingSubText.textContent = '基本情報・全曜日営業時間・属性(基本情報タブ)・写真(すべてタブ)を集計しています';
        }

        const startTime = Date.now();
        const duration = 2200;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(Math.floor((elapsed / duration) * 100), 100);

            progressBarFill.style.width = `${progress}%`;
            loadingPercent.textContent = `${progress}%`;

            if (progress >= 100) {
                loadingStatusText.textContent = '診断更新完了！';
                loadingSubText.textContent = '集約レポートに反映しました';
                clearInterval(interval);
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');
                    if (onComplete) onComplete();
                    if (isNewStore) {
                        showToast("✨ 新店舗の診断レポートを作成しました！", `${storeData.name} の診断結果を表示しています。`);
                    } else if (isMergeUpdate) {
                        showToast("✨ 写真枚数を反映・統合しました！", `店舗情報を維持したまま、最新の画像枚数を追加しました。`);
                    }
                }, 250);
            }
        }, 30);
    }

    // ==========================================
    // 5. ABSOLUTE VAULT DATA MERGE ENGINE
    // ==========================================
    function mergeStoreData(existing, incoming) {
        let isUpdated = false;
        let isNewStore = false;

        const safeIncoming = {
            ...INITIAL_STORE_TEMPLATE,
            ...incoming
        };

        const merged = { ...existing };

        // 写真タブからの送信、または送信データで店舗名が空・未設定・Googleマップの場合は絶対に他情報をリセットさせない保護！
        if (safeIncoming.isPhotoAllTab || !safeIncoming.name || safeIncoming.name === "店舗名未設定" || safeIncoming.name === "Google マップ") {
            if (safeIncoming.photoCount !== undefined && safeIncoming.statusPhotos !== 'error') {
                merged.photoCount = safeIncoming.photoCount;
                merged.statusPhotos = safeIncoming.statusPhotos;
                if (safeIncoming.photoTier) merged.photoTier = safeIncoming.photoTier;
            }
            return { merged, isUpdated: true, isNewStore: false };
        }

        // 既存店舗が存在する場合、送信されてきた名前と既存名が互いに部分一致すらしない完全に異なる店舗名である時のみ新店舗切り替え
        if (existing.name && safeIncoming.name && existing.name !== "店舗名未設定") {
            let cleanExist = existing.name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '');
            let cleanIn = safeIncoming.name.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '');

            if (cleanExist && cleanIn && cleanExist.indexOf(cleanIn) === -1 && cleanIn.indexOf(cleanExist) === -1) {
                isNewStore = true;
                return { merged: safeIncoming, isUpdated: true, isNewStore };
            }
        }

        if (safeIncoming.name && safeIncoming.name !== "店舗名未設定") merged.name = safeIncoming.name;
        if (safeIncoming.companyName) merged.companyName = safeIncoming.companyName;
        if (safeIncoming.category && safeIncoming.category !== "未設定") merged.category = safeIncoming.category;
        if (safeIncoming.reviewCount > 0) merged.reviewCount = Math.max(existing.reviewCount || 0, safeIncoming.reviewCount);
        if (safeIncoming.rating > 0) merged.rating = Math.min(Math.max(parseFloat(safeIncoming.rating), 1.0), 5.0);

        if (safeIncoming.daysSinceLastPost !== undefined) merged.daysSinceLastPost = safeIncoming.daysSinceLastPost;
        if (safeIncoming.rawWebsite) merged.rawWebsite = safeIncoming.rawWebsite;
        if (safeIncoming.rawHours) merged.rawHours = safeIncoming.rawHours;
        if (safeIncoming.rawDescription) merged.rawDescription = safeIncoming.rawDescription;
        if (safeIncoming.rawAttributes && safeIncoming.statusAttributes !== 'error') {
            merged.rawAttributes = safeIncoming.rawAttributes;
            if (safeIncoming.attrCount !== undefined) merged.attrCount = safeIncoming.attrCount;
        }

        if (safeIncoming.replyRatio !== undefined && safeIncoming.statusReply !== 'error') {
            merged.replyRatio = safeIncoming.replyRatio;
        }

        const statusKeys = ['statusWebsite', 'statusHours', 'statusDescription', 'statusCover', 'statusReply', 'statusAttributes'];
        statusKeys.forEach(key => {
            let existingVal = existing[key] || 'error';
            let incomingVal = safeIncoming[key] || 'error';

            let existingRank = STATUS_RANK[existingVal] !== undefined ? STATUS_RANK[existingVal] : 0;
            let incomingRank = STATUS_RANK[incomingVal] !== undefined ? STATUS_RANK[incomingVal] : 0;

            if (incomingRank >= existingRank) {
                merged[key] = incomingVal;
            }
        });

        return { merged, isUpdated: true, isNewStore: false };
    }

    function parseIncomingData() {
        const hash = window.location.hash;
        if (hash && hash.includes('data=')) {
            try {
                const jsonStr = decodeURIComponent(hash.split('data=')[1]);
                const parsed = JSON.parse(jsonStr);
                if (parsed && (parsed.name || parsed.companyName)) {
                    if (parsed.category) {
                        parsed.category = parsed.category.replace(/[\\uE000-\\uF8FF\\u2000-\\u206F]/g, '').replace(/([0-9\.]+\s*)?Google\s*のクチコミ.*/gi, '').replace(/^[0-9\.\s★⭐]+/,'').replace(/^.*?[都道府県市区町村]の/, '').trim() || "未設定";
                    }

                    const saved = localStorage.getItem('last_gbp_data');
                    let baseData = storeData;
                    if (saved) {
                        try { baseData = JSON.parse(saved); } catch(e){}
                    }

                    const { merged, isUpdated, isNewStore } = mergeStoreData(baseData, parsed);
                    storeData = merged;
                    localStorage.setItem('last_gbp_data', JSON.stringify(storeData));

                    history.replaceState(null, "", window.location.pathname);
                    activateReportView();
                    triggerLoadingAnimation(() => updateFormValues(), isUpdated, isNewStore);
                    return true;
                }
            } catch (e) {
                console.error("Error parsing bookmarklet data:", e);
            }
        }

        const savedData = localStorage.getItem('last_gbp_data');
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (parsed && parsed.name && parsed.name !== "店舗名未設定") {
                    if (parsed.rating > 0) parsed.rating = Math.min(Math.max(parseFloat(parsed.rating), 1.0), 5.0);
                    storeData = { ...INITIAL_STORE_TEMPLATE, ...parsed };
                    activateReportView();
                    updateFormValues();
                    return true;
                }
            } catch (e) {}
        }
        return false;
    }

    window.addEventListener('hashchange', parseIncomingData);

    // ==========================================
    // 6. FORM & REPORT DATA SYNC
    // ==========================================
    function updateFormValues() {
        if (storeData.rating > 0) {
            storeData.rating = Math.min(Math.max(parseFloat(storeData.rating), 1.0), 5.0);
        }

        if (inputCompanyName) inputCompanyName.value = storeData.companyName || storeData.name || "";
        inputStoreName.value = storeData.name;
        inputCategory.value = storeData.category;
        inputReviewCount.value = storeData.reviewCount;
        inputRating.value = storeData.rating > 0 ? storeData.rating : 3.7;
        inputLastPost.value = storeData.daysSinceLastPost;
        inputPhotoCount.value = storeData.photoTier;

        selectWebsite.value = storeData.statusWebsite || 'error';
        selectHours.value = storeData.statusHours || 'error';
        selectDescription.value = storeData.statusDescription || 'error';
        selectCover.value = selectCover.value;
        selectReply.value = selectReply.value;
        selectAttributes.value = selectAttributes.value;

        calculateAndRender();
    }

    function readFormValues() {
        if (inputCompanyName) storeData.companyName = inputCompanyName.value;
        storeData.name = inputStoreName.value || "店舗名未設定";
        storeData.category = inputCategory.value || "カテゴリ未設定";
        storeData.reviewCount = parseInt(inputReviewCount.value) || 0;

        let rawR = parseFloat(inputRating.value) || 0;
        storeData.rating = Math.min(Math.max(rawR, 1.0), 5.0);

        storeData.daysSinceLastPost = parseInt(inputLastPost.value) || 28;
        storeData.photoTier = inputPhotoCount.value;

        selectWebsite.value = selectWebsite.value;
        selectHours.value = selectHours.value;
        selectDescription.value = selectDescription.value;
        selectCover.value = selectCover.value;
        selectReply.value = selectReply.value;
        selectAttributes.value = selectAttributes.value;

        calculateAndRender();
    }

    // ==========================================
    // 7. GEMINI 3.6 FLASH AI ADVISOR 3.0 (STRICT STRUCTURED OUTPUT)
    // ==========================================
    async function callAiAdviceApi(diagData) {
        const apiKey = localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_KEY || "";
        if (!apiKey) {
            modalAiConfig.classList.remove('hidden');
            showToast("⚙️ APIキーが必要です", "Gemini APIキーを入力して保存してください。");
            btnGenerateAiAdvice.disabled = false;
            btnGenerateAiAdvice.textContent = '🤖 AI解説文を自動生成';
            return;
        }
        btnGenerateAiAdvice.disabled = true;
        btnGenerateAiAdvice.textContent = '🤖 店舗様向けアドバイス文章を生成中...';
        aiAdviceContent.innerHTML = '<p class="ai-placeholder">Gemini 3.6 Flash が店舗様向けの分かりやすい改善提案文を作成しています...</p>';

        const prompt = `あなたは頼れるGoogleマップ集客（MEO）の専門コンサルタントです。
以下のGBP診断レポート結果に基づき、店舗のオーナー様・店長様（${diagData.name} 様）が直接読まれて「自分の店の強み、課題、明日からの具体的な対策」が深く理解できる、説得力と親しみのあるアドバイス文章を作成してください。

【対象店舗】${diagData.name}
【業種・カテゴリ】${diagData.category}
【総合最適化スコア】${diagData.totalGained}点 / ${diagData.totalPossible}点満点 (${diagData.normalizedScore}%達成)
【評価】★${diagData.rating.toFixed(1)} (${diagData.reviewCount}件のクチコミ)
【クチコミ返信率】${diagData.replyRatio !== undefined ? diagData.replyRatio + '%' : '未確認'}

【必須出力フォーマット】
以下の「3つのセクション」と「各3つの小項目（サブ見出し）」の構成と見出しタイトルの通りに厳密に出力してください。各小項目では指示に従って具体的に執筆してください。

💡 セクション1: 【診断結果】${diagData.name} 様の「デジタル店舗情報」の現状と、機会損失の可能性
小項目 1-1: 📌 現在Googleマップ上で可視化されている「クチコミ評価と顧客認知」の現状
（高評価店舗では強みを称え、低評価や件数不足の店舗では現状の客観的分析を行ってください）
小項目 1-2: 📊 診断データで判明した「店舗情報の設定状況と最適化スコア」
（スコア${diagData.normalizedScore}%や設定漏れ・更新不足項目の客観的事実を述べてください）
小項目 1-3: ⚠️ 競合店舗と比較された際に発生している「潜在的な機会損失」
（検索上の情報不足や更新停止による顧客離れ・他店への流出の可能性を詳しく述べてください）

🚀 セクション2: 競合と差をつけ集客を最大化する対策と、店舗運営における「リソース」の課題
小項目 2-1: 📌 Web上の認知度と集客力を最大化するための「3つの必須アプローチ」
（正確な情報更新、定期的な写真投稿、100%のクチコミ返信の重要性を述べてください）
小項目 2-2: 📈 クチコミ件数と来店・問い合わせ増加に相関する「実証データと事実」
（「クチコミ数は300件に達するまでは50件増えるごとに問い合わせが1.2〜1.5倍に増加する」という実証データを必ず引用してください）
小項目 2-3: ⏳ 手作業での継続運用が直面する「時間と労力（リソース）の壁」
（日々の本業をこなしながら手作業でこれらを継続することの大変さ・課題感を共感を持って述べてください）

🤝 セクション3: 本業に集中しながら最小限の労力で成果を最大化する『365ボイス』のご提案
小項目 3-1: ⚙️ 運用にかかる手作業ストレスをゼロにする『365ボイス』の概要
（Googleマップ運用・クチコミ獲得・AI返信・LINE連携の自動化・効率化システムである概要を述べてください）
小項目 3-2: 🎯 ${diagData.name} 様の現在の集客課題を解消する「厳選・特化機能のご提案」
（診断結果の弱みに合わせて2〜3個の機能を厳選して提案してください）
小項目 3-3: 🏛️ 単発の広告依存から脱却する「持続的なデジタル集客資産」の確立
（一過性の広告ではなく長期的な自律集客基盤の構築を述べ、最後に必ず「※貴店での具体的な活用方法や他店舗様での成功事例につきましては、本日ご案内の営業担当より詳しくお伝えさせていただきます。」と添えて締めくくってください）`;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (response.ok) {
                const resData = await response.json();
                const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "AI文章の生成に失敗しました。";
                
                const formattedHtml = rawText
                    .replace(/^---+$/gim, '')
                    .replace(/^[#\s]*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]?\s*セクション\s*\d+:[^\n]+)/gimu, '<h3 class="ai-section-title">$1</h3>')
                    .replace(/^[#\s]*([\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}]?\s*小項目\s*\d+-\d+:[^\n]+)/gimu, '<h4 class="ai-sub-title">$1</h4>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^[\*\-]\s+(.*$)/gim, '<li style="margin-left: 1.2rem; margin-bottom: 0.3rem; list-style: disc;">$1</li>')
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');

                aiAdviceContent.innerHTML = `<div class="ai-generated-text">${formattedHtml}</div>`;
                showToast("✨ 店舗様向けアドバイスの生成が完了しました", "指定セクション構成で提案文章が反映されました。");
            }
        } catch(e) {
            aiAdviceContent.innerHTML = `<p class="ai-placeholder" style="color: var(--danger-color);">⚠️ AI生成エラー: (${e.message})</p>`;
        }

        btnGenerateAiAdvice.disabled = false;
        btnGenerateAiAdvice.textContent = '🤖 AI解説文を自動生成';
    }

    // ==========================================
    // 8. SCORING & RADAR CHART ENGINE
    // ==========================================
    function calculateAndRender() {
        let displayRating = storeData.rating > 0 ? storeData.rating : 5.0;
        displayRating = Math.min(Math.max(displayRating, 1.0), 5.0);

        if (displayCompanyName) {
            if (storeData.companyName && storeData.companyName !== storeData.name && storeData.companyName !== "店舗名未設定") {
                displayCompanyName.textContent = `対象事業者: ${storeData.companyName}`;
                displayCompanyName.style.display = 'block';
            } else {
                displayCompanyName.textContent = '';
                displayCompanyName.style.display = 'none';
            }
        }
        displayStoreName.textContent = storeData.name;
        metaCategory.textContent = storeData.category;

        let totalGained = 0;
        let totalPossible = 0;

        // Category 1: Basic Info (Max 30)
        let basicGained = 0;
        let basicPossible = 0;
        const itemsBasic = [];

        basicPossible += 5;
        if (storeData.name && storeData.name !== "店舗名未設定") { 
            basicGained += 5; 
            itemsBasic.push({ title: "ビジネス名設定", status: "pass", rawText: storeData.name }); 
        } else {
            itemsBasic.push({ title: "ビジネス名設定", status: "fail", rawText: "未設定 (店舗名が登録されていません)" });
        }

        basicPossible += 5;
        if (storeData.category && storeData.category !== "未設定") { 
            basicGained += 5; 
            itemsBasic.push({ title: "カテゴリ設定", status: "pass", rawText: storeData.category }); 
        } else {
            itemsBasic.push({ title: "カテゴリ設定", status: "fail", desc: "未設定 (メインカテゴリ未選択)" });
        }

        // STRICT WEBSITE EVALUATION & FILTER
        basicPossible += 6;
        let webVal = storeData.rawWebsite || "";
        let isSystemUrl = Boolean(webVal && (webVal.indexOf('google.co.jp/intl') !== -1 || webVal.indexOf('google.com/intl') !== -1 || webVal.indexOf('about/products') !== -1));
        
        if ((storeData.statusWebsite === 'pass' || webVal) && !isSystemUrl) { 
            basicGained += 6; 
            itemsBasic.push({ title: "Webサイトリンク", status: "pass", rawText: webVal }); 
        } else { 
            itemsBasic.push({ title: "Webサイトリンク", status: "fail", rawText: "未設定 (WebサイトのURLリンクが登録されていません)" }); 
        }

        basicPossible += 6;
        if (storeData.statusHours === 'pass' || storeData.rawHours) { 
            basicGained += 6; 
            let hoursVal = storeData.rawHours || "月曜 9:00〜19:00 / 火曜 9:00〜19:00 / 水曜 9:00〜19:00 / 木曜 9:00〜19:00 / 金曜 9:00〜19:00 / 土曜 9:00〜18:00 (日曜定休)";
            itemsBasic.push({ title: "営業時間設定", status: "pass", rawText: hoursVal }); 
        } else { 
            itemsBasic.push({ title: "営業時間設定", status: "fail", rawText: "未設定 (全曜日営業時間や定休日が登録されていません)" }); 
        }

        // GRADED SCORE: Business Description (Max 4pt: 250+ chars = 4pt, 1-249 chars = 2pt, 0 = 0pt)
        basicPossible += 4;
        let descText = storeData.rawDescription || "";
        let descLen = descText.length;
        if (descLen >= 250) { 
            basicGained += 4; 
            itemsBasic.push({ title: "ビジネス説明文", status: "pass", rawText: `${descText} (${descLen}文字・良好)` }); 
        } else if (descLen > 0) {
            basicGained += 2;
            itemsBasic.push({ title: "ビジネス説明文", status: "warn", rawText: `${descText} (${descLen}文字・文字数が不足しています。検索キーワードを含めて250文字以上への拡充を推奨)` });
        } else { 
            itemsBasic.push({ title: "ビジネス説明文", status: "fail", rawText: "未対応 (店舗のビジネス説明文・PRメッセージが未掲載です)" }); 
        }

        // GRADED SCORE: Attributes (Max 4pt: 5+ items = 4pt, 1-4 items = 2pt, 0 items = 0pt)
        basicPossible += 4;
        let attrText = storeData.rawAttributes || "";
        let attrCount = storeData.attrCount;
        
        if (attrText && (attrCount === undefined || attrCount === 0)) {
            let cleanText = attrText.replace(/\s*等\s*/g, '').replace(/\s*\([\s\S]*?\)/g, '');
            let items = cleanText.split('・').map(s => s.trim()).filter(s => s.length > 0);
            attrCount = items.length;
        }

        if (attrCount >= 5) { 
            basicGained += 4; 
            let attrVal = attrText.replace(/\s*\([\s\S]*?\)/g, '');
            itemsBasic.push({ title: "属性（詳細情報）", status: "pass", rawText: `${attrVal} (${attrCount}項目登録済み・良好)` }); 
        } else if (attrCount >= 1) {
            basicGained += 2;
            let attrVal = attrText.replace(/\s*\([\s\S]*?\)/g, '');
            itemsBasic.push({ title: "属性（詳細情報）", status: "warn", rawText: `${attrVal} (${attrCount}項目登録・項目数が不足しています。決済手段や設備の追加設定を推奨)` });
        } else if (storeData.statusAttributes === 'fail' || attrCount === 0) {
            itemsBasic.push({ title: "属性（詳細情報）", status: "fail", rawText: "未対応 (車椅子対応や決済手段などの有効属性(✔)が登録されていません)" }); 
        } else {
            itemsBasic.push({ title: "属性（詳細情報）", status: "fail", rawText: "未確認（【基本情報】タブを開いて診断してください）" }); 
        }

        // Category 2: Reviews (Max 30)
        let reviewsGained = 0;
        let reviewsPossible = 0;
        const itemsReviews = [];
        
        // GRADED SCORE: Review Count (Max 12pt: 500+ = 12pt, 300-499 = 9pt, 100-299 = 6pt, 50-99 = 3pt, <50 = 0pt)
        reviewsPossible += 12;
        if (storeData.reviewCount >= 500) {
            reviewsGained += 12;
            itemsReviews.push({ title: "クチコミ件数", status: "pass", rawText: `${storeData.reviewCount}件 (目標500件達成・圧倒的な集客基盤)` });
        } else if (storeData.reviewCount >= 300) {
            reviewsGained += 9;
            itemsReviews.push({ title: "クチコミ件数", status: "pass", rawText: `${storeData.reviewCount}件 (良好・さらなる獲得を推奨)` });
        } else if (storeData.reviewCount >= 100) {
            reviewsGained += 6;
            itemsReviews.push({ title: "クチコミ件数", status: "warn", rawText: `${storeData.reviewCount}件 (標準的・競合優位性の確保が必要)` });
        } else if (storeData.reviewCount >= 50) {
            reviewsGained += 3;
            itemsReviews.push({ title: "クチコミ件数", status: "warn", rawText: `${storeData.reviewCount}件 (不足・信頼性向上に改善が必要)` });
        } else {
            itemsReviews.push({ title: "クチコミ件数", status: "fail", rawText: `${storeData.reviewCount}件 (大幅不足・集客に悪影響あり)` });
        }

        // GRADED SCORE: Average Rating (Max 3pt: 4.5+ = 3pt, 4.0-4.4 = 2pt, <4.0 = 0pt)
        reviewsPossible += 3;
        if (displayRating >= 4.5) {
            reviewsGained += 3;
            itemsReviews.push({ title: "平均評価", status: "pass", rawText: `★${displayRating.toFixed(1)} (非常に高評価)` });
        } else if (displayRating >= 4.0) {
            reviewsGained += 2;
            itemsReviews.push({ title: "平均評価", status: "pass", rawText: `★${displayRating.toFixed(1)} (良好)` });
        } else {
            itemsReviews.push({ title: "平均評価", status: "warn", rawText: `★${displayRating.toFixed(1)} (目標★4.0以上・改善推奨)` });
        }

        // GRADED SCORE: Review Reply Ratio (Max 15pt: 95%+ = 15pt, 80-94% = 12pt, 50-79% = 8pt, 1-49% = 4pt, 0% = 0pt)
        reviewsPossible += 15;
        let ratioVal = storeData.replyRatio;
        if (ratioVal !== undefined) {
            if (ratioVal >= 95) {
                reviewsGained += 15;
                itemsReviews.push({ title: "クチコミ返信率", status: "pass", rawText: `返信率 ${ratioVal}% (完璧な運用・ファン化促進中)` });
            } else if (ratioVal >= 80) {
                reviewsGained += 12;
                itemsReviews.push({ title: "クチコミ返信率", status: "pass", rawText: `返信率 ${ratioVal}% (良好・全件返信を目指しましょう)` });
            } else if (ratioVal >= 50) {
                reviewsGained += 8;
                itemsReviews.push({ title: "クチコミ返信率", status: "warn", rawText: `返信率 ${ratioVal}% (返信漏れあり・運用体制の再考推奨)` });
            } else if (ratioVal > 0) {
                reviewsGained += 4;
                itemsReviews.push({ title: "クチコミ返信率", status: "fail", rawText: `返信率 ${ratioVal}% (放置気味・早急な対応が必要)` });
            } else {
                itemsReviews.push({ title: "クチコミ返信率", status: "fail", rawText: `返信率 0% (放置状態・致命的な機会損失)` });
            }
        } else if (storeData.statusReply === 'pass') {
            reviewsGained += 12; // 80% equivalent
            itemsReviews.push({ title: "クチコミ返信率", status: "pass", rawText: `返信率 80%以上 (良好)` });
        } else if (storeData.statusReply === 'warn') {
            reviewsGained += 8; // 50% equivalent
            itemsReviews.push({ title: "クチコミ返信率", status: "warn", rawText: `返信率 一部対応 (返信漏れあり・100%返信への改善推奨)` });
        } else if (storeData.statusReply === 'fail') {
            itemsReviews.push({ title: "クチコミ返信率", status: "fail", rawText: `返信率 0% (未返信・放置状態・全クチコミへの返信が必須)` });
        } else {
            itemsReviews.push({ title: "クチコミ返信率", status: "fail", rawText: `未確認（【クチコミ】タブを開いて診断してください）` });
        }

        itemsReviews.push({
            isNote: true,
            rawText: "※ 返信率は【クチコミ】タブで表示されている直近・上位のクチコミ（数件〜数十件）を対象に算出した割合です。"
        });

        // Category 3: Photos (Max 20)
        let photosGained = 0;
        let photosPossible = 20;
        const itemsPhotos = [];
        itemsPhotos.push({ title: "カバー・ロゴ画像", status: "pass", rawText: "設定済み (カバー画像・ロゴ掲載あり)" });

        if (storeData.statusPhotos === 'pass' || (storeData.photoCount && storeData.photoCount >= 50)) {
            photosGained += 15;
            let cntText = storeData.photoCount ? `${storeData.photoCount}枚 (豊富・高水準)` : "50枚以上 (豊富・高水準)";
            itemsPhotos.push({ title: "画像・動画枚数", status: "pass", rawText: cntText });
        } else if (storeData.statusPhotos === 'warn' || (storeData.photoCount && storeData.photoCount >= 20)) {
            photosGained += 10;
            let cntText = storeData.photoCount ? `${storeData.photoCount}枚 (店舗外観・内観・サービス写真の追加推奨)` : "20〜49枚 (店舗外観・内観・サービス写真の追加推奨)";
            itemsPhotos.push({ title: "画像・動画枚数", status: "warn", rawText: cntText });
        } else if (storeData.statusPhotos === 'fail') {
            photosGained += 4;
            let cntText = storeData.photoCount ? `${storeData.photoCount}枚 (大幅不足)` : "20枚未満 (大幅不足・追加必須)";
            itemsPhotos.push({ title: "画像・動画枚数", status: "fail", rawText: cntText });
        } else {
            itemsPhotos.push({ title: "画像・動画枚数", status: "fail", rawText: "未確認（写真ギャラリーの【すべて】タブを開いて診断してください）" });
        }

        // GRADED SCORE: Category 4: Posts (Max 20pt: <=14 days = 20pt, 15-30 days = 10pt, >30 days/none = 4pt)
        let postsGained = 0;
        let postsPossible = 20;
        const itemsPosts = [];

        let lastPostDays = storeData.daysSinceLastPost !== undefined ? parseInt(storeData.daysSinceLastPost) : 28;
        if (isNaN(lastPostDays)) lastPostDays = 28;

        if (lastPostDays <= 14) {
            postsGained = 20;
            itemsPosts.push({ title: "最新投稿状況", status: "pass", rawText: `直近 ${lastPostDays}日前に投稿あり (高頻度更新中・良好)` });
        } else if (lastPostDays <= 30) {
            postsGained = 10;
            itemsPosts.push({ title: "最新投稿状況", status: "warn", rawText: `最終投稿から ${lastPostDays}日経過 (更新頻度低下・週1〜2回の定期投稿を推奨)` });
        } else {
            postsGained = 4;
            itemsPosts.push({ title: "最新投稿状況", status: "fail", rawText: `最終投稿から ${lastPostDays}日以上経過 (30日以上更新停止中・定期投稿が必須)` });
        }

        totalGained = basicGained + reviewsGained + photosGained + postsGained;
        totalPossible = basicPossible + reviewsPossible + photosPossible + postsPossible;
        const normalizedScore = totalPossible > 0 ? Math.round((totalGained / totalPossible) * 100) : 0;

        currentDiagDataForAi = {
            name: storeData.name,
            category: storeData.category,
            totalGained,
            totalPossible,
            normalizedScore,
            rating: displayRating,
            reviewCount: storeData.reviewCount,
            replyRatio: storeData.replyRatio,
            statusReply: storeData.statusReply
        };

        totalScoreEl.textContent = totalGained;
        totalMaxScoreEl.textContent = `/ ${totalPossible}点満点`;

        groupScoreBasic.textContent = `${basicGained}/${basicPossible}`;
        groupScoreReviews.textContent = `${reviewsGained}/${reviewsPossible}`;
        groupScorePhotos.textContent = `${photosGained}/${photosPossible}`;
        groupScorePosts.textContent = `${postsGained}/${postsPossible}`;

        scoreBasicEl.textContent = `${basicGained}点`;
        scoreReviewsEl.textContent = `${reviewsGained}点`;
        scorePhotosEl.textContent = `${photosGained}点`;
        scorePostsEl.textContent = `${postsGained}点`;

        scoreRankEl.className = "score-rank-badge";
        if (normalizedScore >= 80) {
            scoreRankEl.textContent = "Sランク: 優秀";
            scoreRankEl.classList.add("rank-high");
            scoreCommentEl.textContent = "高水準な運用です。競合との差別化・上位維持のフェーズです。";
        } else if (normalizedScore >= 60) {
            scoreRankEl.textContent = "Aランク: 良好";
            scoreRankEl.classList.add("rank-mid");
            scoreCommentEl.textContent = "標準的な整備ができています。クチコミ獲得等に改善の伸び代があります。";
        } else {
            scoreRankEl.textContent = "Cランク: 要改善";
            scoreRankEl.classList.add("rank-low");
            scoreCommentEl.textContent = "競合店舗に露出を奪われている可能性が高い状態です。";
        }

        renderCheckList(listBasic, itemsBasic);
        renderCheckList(listReviews, itemsReviews);
        renderCheckList(listPhotos, itemsPhotos);
        renderCheckList(listPosts, itemsPosts);
        renderActionRecommendations(basicGained, reviewsGained, photosGained, postsGained);

        // Calculate gain for radar categories
        let reviewCountGained = 0;
        if (storeData.reviewCount >= 500) reviewCountGained = 12;
        else if (storeData.reviewCount >= 300) reviewCountGained = 9;
        else if (storeData.reviewCount >= 100) reviewCountGained = 6;
        else if (storeData.reviewCount >= 50) reviewCountGained = 3;

        let replyGained = 0;
        if (ratioVal !== undefined) {
            if (ratioVal >= 95) replyGained = 15;
            else if (ratioVal >= 80) replyGained = 12;
            else if (ratioVal >= 50) replyGained = 8;
            else if (ratioVal > 0) replyGained = 4;
        } else if (storeData.statusReply === 'pass') replyGained = 12;
        else if (storeData.statusReply === 'warn') replyGained = 8;

        drawRadarChart({
            basic: (basicGained / basicPossible) * 100,
            reviewCount: (reviewCountGained / 12) * 100,
            reviewOps: (replyGained / 15) * 100,
            photo: (photosGained / photosPossible) * 100,
            post: Math.round((postsGained / postsPossible) * 100)
        });
    }

    function renderCheckList(container, items) {
        container.innerHTML = items.map(item => {
            if (item.isNote) {
                return `<li class="check-item note-item" style="font-size:0.78rem; color:#64748b; border:none; padding-top:6px; background:none; font-style:italic;">${item.rawText}</li>`;
            }
            const statusLabel = item.status === 'pass' ? '良好' : item.status === 'warn' ? '要改善' : '未対応';
            const emptyClass = !item.rawText || item.rawText.indexOf('未設定') !== -1 || item.rawText.indexOf('未対応') !== -1 || item.rawText.indexOf('未確認') !== -1 ? 'empty-content' : '';
            return `
            <li class="check-item-block">
                <div class="check-item-header">
                    <span class="item-title">📌 ${item.title}</span>
                    <span class="check-status ${item.status}">${statusLabel}</span>
                </div>
                <div class="check-item-content ${emptyClass}">${item.rawText}</div>
            </li>
            `;
        }).join('');
    }

    function renderActionRecommendations(basicGained, reviewsGained, photosGained, postsGained) {
        const actions = [];
        if (reviewsGained < 25) {
            actions.push({
                priority: "high",
                title: "クチコミ獲得施策＆100%返信の徹底",
                desc: "検索順位に最も強い影響を与えるクチコミ件数の増加と、丁寧な返信運用を推奨します。"
            });
        }
        if (basicGained < 20) {
            actions.push({
                priority: "mid",
                title: "基本情報・キーワード最適化（SEO）",
                desc: "説明文へのキーワード盛り込みや属性情報を整備します。"
            });
        }
        if (actions.length === 0) {
            actions.push({
                priority: "low",
                title: "現状維持＆競合分析の継続",
                desc: "優れた運用です。施策を継続しましょう。"
            });
        }

        actionListEl.innerHTML = actions.map(act => `
            <div class="action-item priority-${act.priority}">
                <span class="action-priority">${act.priority === 'high' ? '最優先' : '重要'}</span>
                <div class="action-content">
                    <h5>${act.title}</h5>
                    <p>${act.desc}</p>
                </div>
            </div>
        `).join('');
    }

    // ==========================================
    // 9. RADAR CHART DRAWING ENGINE
    // ==========================================
    function drawRadarChart(scores) {
        const cx = 150, cy = 150, r = 85;
        const axes = [
            { name: "基本情報", val: scores.basic || 0 },
            { name: "クチコミ数", val: scores.reviewCount || 0 },
            { name: "クチコミ運用", val: scores.reviewOps || 0 },
            { name: "写真充実", val: scores.photo || 0 },
            { name: "更新頻度", val: scores.post || 0 }
        ];

        const numAxes = axes.length;
        const angleStep = (Math.PI * 2) / numAxes;
        let svgHtml = '';

        [0.2, 0.4, 0.6, 0.8, 1.0].forEach(scale => {
            let points = [];
            for (let i = 0; i < numAxes; i++) {
                const angle = i * angleStep - Math.PI / 2;
                points.push(`${(cx + r * scale * Math.cos(angle)).toFixed(1)},${(cy + r * scale * Math.sin(angle)).toFixed(1)}`);
            }
            svgHtml += `<polygon points="${points.join(' ')}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
        });

        let polyPoints = [];
        axes.forEach((axis, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const xLine = cx + r * Math.cos(angle);
            const yLine = cy + r * Math.sin(angle);
            svgHtml += `<line x1="${cx}" y1="${cy}" x2="${xLine.toFixed(1)}" y2="${yLine.toFixed(1)}" stroke="#cbd5e1" stroke-width="1.2"/>`;

            const valRatio = Math.min(Math.max(axis.val, 5), 100) / 100;
            const xData = cx + r * valRatio * Math.cos(angle);
            const yData = cy + r * valRatio * Math.sin(angle);
            polyPoints.push(`${xData.toFixed(1)},${yData.toFixed(1)}`);

            const xLabel = cx + (r + 22) * Math.cos(angle);
            const yLabel = cy + (r + 18) * Math.sin(angle);
            const textAnchor = Math.abs(xLabel - cx) < 10 ? 'middle' : xLabel > cx ? 'start' : 'end';
            svgHtml += `<text x="${xLabel.toFixed(1)}" y="${yLabel.toFixed(1)}" font-size="11" font-weight="700" fill="#475569" text-anchor="${textAnchor}" dominant-baseline="central">${axis.name}</text>`;
        });

        svgHtml += `<polygon points="${polyPoints.join(' ')}" fill="rgba(139, 92, 246, 0.3)" stroke="#8b5cf6" stroke-width="2.5"/>`;
        polyPoints.forEach(pt => {
            const [x, y] = pt.split(',');
            svgHtml += `<circle cx="${x}" cy="${y}" r="4.5" fill="#6d28d9" stroke="#ffffff" stroke-width="1.5"/>`;
        });

        radarSvg.innerHTML = svgHtml;
    }

    // ==========================================
    // 10. EVENT LISTENERS & GLOBAL DELEGATION
    // ==========================================
    document.querySelectorAll('.diag-form input, .diag-form select').forEach(el => {
        el.addEventListener('input', readFormValues);
        el.addEventListener('change', readFormValues);
    });

    btnPrint.addEventListener('click', () => window.print());
    if (btnClearReport) btnClearReport.addEventListener('click', resetToWelcomeView);

    const loadDemoAction = () => {
        storeData = {
            companyName: "一期自動車 小牧店",
            name: "一期自動車 小牧店",
            category: "自動車整備工場",
            reviewCount: 221,
            rating: 4.7,
            replyRatio: 85,
            daysSinceLastPost: 7,
            photoTier: "50",
            photoCount: 64,
            statusPhotos: "pass",
            rawWebsite: "http://ichigo-auto.jp/",
            rawHours: "月曜 9:00〜19:00 / 火曜 9:00〜19:00 / 水曜 9:00〜19:00 / 木曜 9:00〜19:00 / 金曜 9:00〜19:00 / 土曜 9:00〜18:00 (日曜定休)",
            rawDescription: "提供元: オーナー: 小牧市の鈑金塗装・自動車整備工場です。車検、点検、修理、オイル交換などお気軽にご相談ください！無料代車もご用意しております。確かな技術でお客様のカーライフをトータルサポートいたします！",
            rawAttributes: "トイレ ・ 整備士 ・ 事前予約がおすすめ ・ 車椅子対応の駐車場 ・ キャッシュレス決済対応 等",
            attrCount: 5,
            statusWebsite: "pass",
            statusHours: "pass",
            statusDescription: "pass",
            statusCover: "pass",
            statusReply: "pass",
            statusAttributes: "pass"
        };
        triggerLoadingAnimation(() => updateFormValues(), true);
    };

    if (btnLoadDemo) btnLoadDemo.addEventListener('click', loadDemoAction);
    if (btnWelcomeDemo) btnWelcomeDemo.addEventListener('click', loadDemoAction);

    btnGenerateAiAdvice.addEventListener('click', () => {
        if (currentDiagDataForAi) callAiAdviceApi(currentDiagDataForAi);
    });

    btnShowAiModal.addEventListener('click', () => modalAiConfig.classList.remove('hidden'));
    btnSaveApiKey.addEventListener('click', () => {
        const key = inputApiKey.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            modalAiConfig.classList.add('hidden');
            showToast("✨ APIキーを保存しました", "AI解説文の自動生成を実行します...");
            if (currentDiagDataForAi) callAiAdviceApi(currentDiagDataForAi);
        }
    });

    function showModal() { 
        if (modalBookmarklet) modalBookmarklet.classList.remove('hidden'); 
    }

    function hideModal() { 
        if (modalBookmarklet) modalBookmarklet.classList.add('hidden'); 
        if (modalAiConfig) modalAiConfig.classList.add('hidden');
        document.querySelectorAll('.modal-overlay, .modal').forEach(m => m.classList.add('hidden'));
    }

    if (btnWelcomeGuide) btnWelcomeGuide.addEventListener('click', showModal);
    if (btnOpenGuide) btnOpenGuide.addEventListener('click', showModal);
    if (btnShowBookmarkletModal) btnShowBookmarkletModal.addEventListener('click', showModal);

    // Global Event Delegation for Close Buttons & Overlay Clicks
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-close-modal')) {
            e.preventDefault();
            e.stopPropagation();
            hideModal();
        } else if (e.target.classList.contains('modal-overlay')) {
            hideModal();
        }
    });

    // ESC Key to Close Modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            hideModal();
        }
    });

    // ==========================================
    // 11. INITIALIZATION LAUNCH
    // ==========================================
    const hasIncoming = parseIncomingData();
    if (!hasIncoming) {
        if (welcomePlaceholder) welcomePlaceholder.classList.remove('hidden');
        if (reportPaper) reportPaper.classList.add('hidden');
        if (controlPanelSection) controlPanelSection.classList.add('hidden');
    }
});
