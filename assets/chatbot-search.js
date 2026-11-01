// FAQデータを保持する変数
let faqData = [];

// 入力文字数の上限
const MAX_INPUT_LENGTH = 200;

// 最小入力文字数（短すぎる入力を弾く）
const MIN_INPUT_LENGTH = 2;

// データの読み込み（JS変数から直接取得）
async function loadFaqData() {
    if (faqData.length > 0) return;
    if (typeof FAQ_DATA !== 'undefined') {
        faqData = FAQ_DATA;
        console.log("FAQデータを読み込みました:", faqData.length, "件");
    } else {
        console.error("FAQデータが見つかりません。chatbot-data.js が読み込まれているか確認してください。");
    }
}
// IDからFAQを検索する
function findFaqById(id) {
    return faqData.find(faq => faq.id === id) || null;
}

// カテゴリーに属するFAQ一覧を返す
function getFaqsByCategory(category) {
    return faqData.filter(faq => faq.category === category);
}

// テキストの正規化（全角半角、大文字小文字の統一など）
function normalizeText(text) {
    if (!text) return "";
    let normalized = text
        .normalize('NFKC').trim()
        .toLowerCase()
        // 全角英数字を半角に変換
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        // 全角スペースを半角に
        .replace(/　/g, " ");

    // 同義語の統一
    normalized = normalized.replace(/エーアイ|エイアイ/g, 'ai').replace(/チャットジーピーティー|チャットジーピーティ|チャットgpt/g, 'chatgpt');
    normalized = normalized.replace(/hpb|ホトペ|ホットペッパービューティー/g, 'ホットペッパー');
    normalized = normalized.replace(/インスタグラム/g, 'instagram').replace(/(?<!オン)ライン/g, 'line');
    normalized = normalized.replace(/らいと/g, 'ライト').replace(/すたんだーど/g, 'スタンダード').replace(/ぷれみあむ/g, 'プレミアム');
    normalized = normalized.replace(/hp|ウェブサイト|webサイト|web サイト/g, "ホームページ");
    normalized = normalized.replace(/値段|価格|費用|予算|コスト/g, "料金");
    normalized = normalized.replace(/作成|構築|開発|立ち上げ/g, "制作");
    normalized = normalized.replace(/修正|変更|更新|直す|直して/g, "修正");
    normalized = normalized.replace(/(?<!イン)サイト/g, "ホームページ");
    normalized = normalized.replace(/ヶ月|ケ月|箇月|カ月/g, "か月");
    normalized = normalized.replace(/[？?。！!\s]/g, "");

    return normalized;
}

// 料金や診断は、共通語の一致数よりも質問中のサービス名を優先する。
// 文脈だけで別サービスの金額・納期を断定しない。
function routeFaqIntent(q) {
    const result = (...ids) => {
        const candidates = ids.map(findFaqById).filter(Boolean);
        if (!candidates.length) return { type: 'none' };
        return candidates.length === 1 ? { type: 'found', faq: candidates[0] }
            : { type: 'ambiguous', candidates };
    };
    const price = /料金|いくら|金額|有料|無料|見積|19,?800/.test(q);
    const plan = /ライト|スタンダード|プレミアム/.test(q);
    const diagnosis = /診断|レポート/.test(q);
    if (/パスワード|認証コード|顧客名簿/.test(q) || /ログイン情報.*(送|教え|入力)/.test(q)) return result('contact-security');
    if (/相談だけ|契約しないと|勝手に契約|契約になります|契約成立/.test(q)) return result('consultation-contract');
    // 管理者が用意した具体的な質問は、広いカテゴリーの案内より優先する。
    const specific = faqData.filter(f => f.specific && f.questions.some(question => normalizeText(question) === q));
    if (specific.length) return result(...specific.map(f=>f.id));
    const clarification = routeClarificationIntent(q);
    if (clarification) return result(...(Array.isArray(clarification) ? clarification : [clarification]));
    const companyStaff = routeCompanyStaffIntent(q);
    if (companyStaff) return result(companyStaff);
    const instagram = routeInstagramIntent(q);
    if (instagram) return result(instagram);
    const detailed = routeDetailedTopic(q);
    if (detailed) return result(...(Array.isArray(detailed) ? detailed : [detailed]));
    if (price && /ホームページ.*(作る|作り|作れ|作って)/.test(q) && !diagnosis) return result('website-price');
    if (/ホームページ.*動画/.test(q) && /設置|埋め込|載せ/.test(q) && !price) return result('website-pages-features');
    if (/請求書.*発行/.test(q) && !/適格|インボイス/.test(q)) return result('contact-general');
    if (/振込先/.test(q)) return result('contact-general');
    if (/支払.*方法/.test(q) && !plan && !/月額/.test(q)) return result('payment-method');
    if (/初回相談|相談料/.test(q)) return result('consultation-free');
    if (/ホームページ.*診断/.test(q) && /サロン.*診断/.test(q)) return result('audit-price','salon-diagnosis-price','consultation-free');
    if (price && /ホームページ.*制作/.test(q) && /サロン|コンサル/.test(q)) return result('website-price','salon-plan-comparison');
    if (/(^|[^a-z])ai(?![a-z])|chatgpt|codex/.test(q) && !/診断|検索|ホームページ/.test(q)) {
        if(price) return result('ai-price');
        if(/初心者|使ったこと|苦手|初めて|難しい/.test(q)) return result('ai-beginner');
        return result('ai-support-about');
    }
    // 支払い・解約の質問を、プラン料金や新規制作の質問と混同しない。
    if (/解約|自動更新|最低契約|契約期間|何か月|縛り/.test(q) && (plan || /月額|コンサル|サロン|meo/.test(q))) return result('salon-meo-cancel');
    if (/支払|振込|請求/.test(q) && plan) return result('payment-monthly');
    if (/払い|支払|振込|請求/.test(q) && /月額|サブスク/.test(q)) return result('payment-monthly');
    if (/解約/.test(q) && !/ホームページ|制作/.test(q)) return result('salon-meo-cancel');
    if (/交通費|出張費|駐車料金|無料.*訪問|訪問.*無料/.test(q)) return result('salon-visit-cost');
    if (/セルフ|診断シート|登録不要/.test(q)) return result('salon-self-check');
    if (/無料/.test(q) && /初回|相談|簡易|話せ/.test(q) && !/ホームページ.*診断/.test(q)) return result('consultation-free');
    if (diagnosis) {
        if (/無料|初回|簡易/.test(q) && /19,?800|有料.*診断/.test(q) && /違い|比較|と/.test(q)) {
            if (/19,?800|ホームページ|裏側/.test(q)) return result('consultation-free','audit-price');
            if (/サロン|店舗|お店/.test(q)) return result('consultation-free','salon-diagnosis-price');
            return result('consultation-free','salon-self-check','salon-diagnosis-price','audit-price');
        }
        if (/ホームページ|裏側|seo|ai検索|url|表示速度|19,?800|縦型|制作会社/.test(q)) {
            if (price && /いつ|納期|何日|期間/.test(q)) return result('audit-price','audit-delivery');
            if (/いつ|納期|何日|期間/.test(q)) return result('audit-delivery');
            if (/形式|pdf|レポート|制作会社.*(送|渡)/.test(q) && !price) return result('audit-report-format');
            if (/項目|34|表示速度/.test(q)) return result('audit-items');
            if (/悪い|悪かった|修正|直し/.test(q)) return result('audit-badresult');
            if (/申込|申し込|依頼方法/.test(q)) return result('audit-apply');
            return result(price ? 'audit-price' : 'audit-about');
        }
        if (/サロン|お店|店舗/.test(q)) {
            if (/無料|簡易|初回/.test(q)) return result('consultation-free');
            if (price && /いつ|納期|何日|期間/.test(q)) return result('salon-diagnosis-price','salon-diagnosis-details');
            if (/いつ|納期|何日|期間|形式|pdf|レポート/.test(q) && !price) return result('salon-diagnosis-details');
            if (/資料/.test(q)) return result('salon-materials');
            return result('salon-diagnosis-price');
        }
        if (/資料/.test(q)) return result('salon-materials');
        if (/無料|簡易|初回/.test(q)) return result('consultation-free');
        if (/いつ|納期|何日|期間/.test(q)) return result('audit-delivery','salon-diagnosis-details');
        if (/形式|pdf|レポート/.test(q) && !price) return result('audit-report-format','salon-diagnosis-details');
        return result('consultation-free','salon-self-check','salon-diagnosis-price','audit-price');
    }
    if (/問い合わせ方法|連絡先|電話番号|受付時間|営業時間|所在地|住所|どこにあります|メールアドレス|どうやって申し込|^お問い合わせ$|^問い合わせ$/.test(q) && !/修正|変え|設置|載せ/.test(q)) return result('contact-general');
    if (price && /オンライン.*相談|電話で相談/.test(q)) return result('consultation-free','salon-plan-comparison');
    if (/遠方|オンライン.*相談|電話で相談|県外/.test(q)) return result('salon-remote');
    if (/訪問|対応エリア|対応地域|店舗に来|千葉県|埼玉県|東京23区|東京都23区|茨城県/.test(q)) return result('salon-visit-area');
    if (/茨城|千葉|埼玉/.test(q) && /来|訪問|対応/.test(q)) return result('salon-visit-area');
    if (/資料.*(なく|ない)|相談.*用意/.test(q)) return result('salon-materials');
    if (/googleマップ|meo/.test(q) && /効果|成果|いつ/.test(q)) return result('salon-meo-effect');
    if (/googleマップ|meo/.test(q) && /上位|対策|順位/.test(q)) return result('salon-meo');
    if (/aio|aeo/.test(q) && /とは|意味|何です|違い|必ず|保証/.test(q)) return result('website-seo');
    if (/検索.*(必ず|上位)|上位表示|ai検索.*表示/.test(q)) return result('website-seo');
    if (/元データ|ソースファイル|著作権|ホームページのデータ/.test(q)) return result('website-handover');
    if (/制作.*流れ|ホームページ.*流れ|公開まで.*手順/.test(q)) return result('website-flow');
    if (/維持費/.test(q) && /修正|無料/.test(q)) return result('website-extra-cost');
    const names = ['ライト','スタンダード','プレミアム'].filter(n=>q.includes(n));
    if (names.length > 1 || /プラン.*(違い|比較|選)|サロン.*月額料金|サロン相談.*料金|コンサル.*料金/.test(q)) return result('salon-plan-comparison');
    if (plan) {
        if (/解約|契約|支払/.test(q)) return null;
        return result({'ライト':'salon-light-price','スタンダード':'salon-standard-price','プレミアム':'salon-premium-price'}[names[0]]);
    }
    if (/開業|オープン準備|お店を開/.test(q)) return result('salon-opening');
    // 設置・リンクの相談と、媒体を使った集客相談を分ける。
    if (/インスタ|instagram|line|ホットペッパー|hotpepper|sns|広告運用/.test(q) && /相談|集客|使い方|確認|投稿|運用/.test(q)) return result('salon-sns');
    if (/新規客|リピーター|再来率|失客|集客が|予約が入|売上を増/.test(q)) return result('salon-acquisition');
    // 内容不明の料金質問では、いずれかのサービスを勝手に選ばない。
    if (price && !/ホームページ|ページ|制作|サーバー|ドメイン|修正|維持費|更新|レッスン|支払|キャンセル|公開|年間|毎年|有料サービス|変え|メニュー|保守|見積/.test(q)) {
        if (/サロン|コンサル/.test(q)) return result('salon-plan-comparison');
        if (/月額/.test(q)) return result('website-extra-cost','salon-plan-comparison');
        return result('website-price','salon-plan-comparison','audit-price','ai-price');
    }
    return null;
}

// 短い悩みの表現を拾う。料金・診断・契約の条件を勝手に変更しない。
function routeClarificationIntent(q) {
    if (/このチャット|ここのチャット/.test(q) && /ai|人間|自動|予約|申込|申し込|受付/.test(q)) return 'chatbot-about';
    if (/顧客情報|お客様の情報|個人情報|機密/.test(q) && /ai|chatgpt|dots|ドッツ/.test(q)) return 'ai-safe-use';
    if (/ホームページ/.test(q) && /月額費|月々|毎月.*(料金|かか)|維持費|ランニング/.test(q) && !/診断/.test(q)) return 'website-extra-cost';
    if (/女性|男性|スタッフ|従業員|社員/.test(q) && /名前|氏名|総人数|年齢|何歳/.test(q)) return 'company-staff-details';
    if (/男性.*(スタッフ|従業員|社員).*(いる|います)|従業員.*(一人|ひとり|1人)/.test(q)) return 'company-staff-details';
    if (/^(授業|レッスン|講座)(は|を|について)/.test(q)) return ['website-lesson','ai-beginner','instagram-about'];
    if (/インスタ|instagram/.test(q) && /授業|講座|教室|レッスン/.test(q)) return /料金|いくら/.test(q) ? 'instagram-price' : 'instagram-about';
    if (/ai|chatgpt/.test(q) && /一から|いちから|基礎から/.test(q)) return 'ai-beginner';
    if (/パソコン|スマホ/.test(q) && /苦手|初心者/.test(q) && !/ホームページ|料金/.test(q)) return 'ai-beginner';
    if (/今日|明日|今から|日曜日|土日|祝日/.test(q) && /相談|来て|来れ|訪問|対応/.test(q)) return 'consultation-availability';
    if (/相談に.*(行|伺)|個人でも相談|男性でも相談|サロン以外.*(会社|頼|相談)/.test(q)) return 'consultation-availability';
    if (/電話相談|電話で相談/.test(q) && !/料金|無料|いくら/.test(q)) return 'salon-remote';
    if (/line.*問い合わせ/.test(q)) return 'contact-general';
    if (/女性.*(お客様|お客|客).*(増や|集客)/.test(q)) return 'salon-acquisition';
    if (/途中で.*(やめ|止め)/.test(q)) return ['salon-meo-cancel','contact-general'];
    return null;
}

function routeCompanyStaffIntent(q) {
    // お客様のお店の人員相談・制作物の相談と、当社の対応体制を区別する。
    if (/うちの|当店|自店|お客様|顧客|採用|求人|シフト|勤務表|配置|紹介ページ|紹介文|写真|画像|動画|マニュアル|研修資料/.test(q)) return null;
    if (/女性/.test(q) && /担当|スタッフ|従業員|相談|訪問|対応|教え|お願い|指名|希望|います|いる|何人|何名/.test(q)) {
        if (/希望|指名|相談したい|お願い|訪問|対応して|教え|担当して/.test(q)) return 'company-female-request';
        return 'company-staff';
    }
    if (/(従業員|スタッフ|社員).*(います|いる|何人|何名|人数)|何人で.*(運営|対応|やって)|高崎.*(一人|ひとり)|一人で.*(運営|やって)/.test(q)) return 'company-staff';
    if (/誰が.*(対応|担当|訪問|教え)|誰に相談|代表者.*(誰|どなた)|高崎.*(どんな人|経歴)|担当者.*誰/.test(q)) return 'company-representative';
    return null;
}

function routeInstagramIntent(q) {
    const named = /インスタ|instagram/.test(q);
    const distinctive = /ストーリ(?:ー|ーズ)|ハッシュタグ|ハイライト|インサイト/.test(q);
    if (!named && !distinctive) return null;
    if (named && /ホームページ/.test(q) && /リンク|ボタン|埋め込|設置/.test(q) && !/料金|いくら|診断/.test(q)) return 'website-connections';
    // ホームページへの設置や他媒体の相談は、既存の担当回答へ渡す。
    if (/ホームページ|診断|line|ホットペッパー|著作権|商用利用|個人情報|顧客データ|機密/.test(q)) return null;
    if (/広告費|媒体費|広告.*(料金|いくら)/.test(q)) return 'salon-channel-budget';
    if (/解約|キャンセル|契約期間|最低契約|支払|振込/.test(q)) return 'instagram-management';
    if (/料金|いくら|金額|見積|有料|無料/.test(q) && !/料金表|料金を.*(載せ|投稿)|料金設定/.test(q)) return 'instagram-price';
    if (/(?<!ハイ)ライト|スタンダード|プレミアム/.test(q)) return 'instagram-price';
    if (/自動投稿|予約投稿|投稿.*(自動|予約)|自動.*(投稿|返信)|dm.*自動/.test(q)) return 'instagram-automation';
    if (/運用代行|丸ごと|全部任せ|外注|投稿作業|投稿代行|dm対応|dm.*(任せ|代行)/.test(q)) return 'instagram-management';
    // AIでの文章・画像・動画づくりは、それぞれの具体的な回答を使う。
    if (/ai|chatgpt|dots|ドッツ|codex/.test(q)) return null;
    if (/ハッシュタグ|タグ.*(選|見直|修正|付け|つけ)/.test(q)) return 'instagram-hashtags';
    if (/分析|インサイト|数字|保存数|比較|振り返|反応.*(見|確認|調べ)/.test(q)) return 'instagram-insights';
    if (/フォロワー|いいね|リーチ|再生回数|必ず.*集客/.test(q)) return 'instagram-followers';
    if (/頻度|何時|週何回|毎日投稿|予定表|投稿.*時間|時間.*ない/.test(q)) return 'instagram-schedule';
    if (/使い分け|違い/.test(q) && /フィード|リール|ストーリ/.test(q)) return 'instagram-content';
    if (distinctive && /ストーリ|ハイライト/.test(q)) return 'instagram-stories';
    if (/プロフィール|予約|投稿.*ネタ/.test(q)) return 'salon-instagram';
    if (/画像|写真|リール|動画|dm.*返信|投稿文|文章/.test(q)) return null;
    if (/投稿.*(手伝|作|制作|内容)|何を載せ|何を投稿/.test(q)) return 'instagram-content';
    if (/運用/.test(q)) return 'instagram-management';
    if (/^(インスタ|instagram)(について|は|については)?$|について教えて|何を.*(でき|手伝)|始めたい|苦手|活用.*相談/.test(q)) return 'instagram-about';
    return null;
}

function routeDetailedTopic(q) {
    // 動画や資料の「制作料金」を、ホームページの標準制作費と混同しない。
    const asksWorkFee = /料金|いくら|有料|無料|見積(?!書)/.test(q);
    if (asksWorkFee && /ホームページ.*動画|動画.*ホームページ/.test(q) && !/診断/.test(q)) return 'website-pages-features';
    const namedWork = /動画|リール|翻訳|文字起こし|議事録|チラシ|ポスター|店内pop|シフト|勤務表/.test(q)
        || /(?:資料|請求書|見積書).*(制作|作り|作る|作っ|ひな形|整理|転記)/.test(q);
    if (asksWorkFee && namedWork && !/ホームページ|診断|ライト|スタンダード|プレミアム|月額プラン|chatgpt|dots|ドッツ|ドット|codex|work|ツール|商用利用|著作権|個人情報|顧客データ|機密/.test(q)) return 'ai-price';
    const capability = routeAiCapability(q);
    if (capability) return capability;
    // 「AI」を書かない相談は、作業と困りごとが具体的な場合だけ拾う。
    const workNeed = routeAiWorkTopic(q, false);
    if (workNeed) return workNeed;
    if (/解約|キャンセル|契約期間|支払|振込|最低契約/.test(q)) return null;
    if (/ホームページ/.test(q) && /値上げ/.test(q) && /修正/.test(q)) return 'website-renewal';
    if (/ai(?![a-z])/.test(q)) {
        if (/料金|いくら|有料|無料/.test(q)) return null;
        if (/顧客データ|お客様の情報|間違い|そのまま使|何を入力/.test(q)) return 'ai-safe-use';
        if (/自動化|定期的|全部任せ|同じ作業/.test(q)) return 'ai-automation';
        if (/売上|表を|資料を|他店|口コミをまとめ/.test(q)) return 'ai-data';
        if (/案内文|返信|キャンペーン|メニューの説明|お客様向け/.test(q)) return 'ai-writing';
        return null;
    }
    if (/ホームページ|サイト|hp|制作/.test(q) && /料金|いくら|金額/.test(q) && !/66,?000|99,?000|レッスン/.test(q)) return null;
    if (/診断/.test(q)) return null;
    const rules = [
        [/66,?000.*99,?000|99,?000.*66,?000|制作プラン.*(選|迷|違)|自分で修正.*迷/, 'website-plan-choice'],
        [/写真.*(ない|なく|用意でき|撮れば)|スマホで撮/, 'website-photos'],
        [/原稿.*(ない|ありません)|文章.*(苦手|考えて)|何を載せ|強み.*分から|内容.*決まってない/, 'website-writing'],
        [/サンプル|制作例|参考.*ホームページ|高級感.*デザイン/, 'website-samples'],
        [/スマホ.*(見やす|見れ|表示|文字)|スマートフォン対応/, 'website-mobile'],
        [/操作レッスン|修正.*レッスン|修正する方法|入れ替える練習/, 'website-lesson'],
        [/ホームページ.*(開かない|消え)|予約ボタン.*動か|画像.*表示されない|リンク.*開きません|エラーが出/, 'website-trouble'],
        [/インスタだけ|snsだけ|ホームページ.*(必要|意味)/, 'website-sns-only'],
        [/ホットペッパー.*(クーポン|写真|掲載|予約が入|文章)/, 'salon-hpb'],
        [/投稿.*(ネタ|続けられ)|何を投稿|インスタ.*(プロフィール|予約)|フォロワー/, 'salon-instagram'],
        [/line.*(配信|来店後|再来|活用)/, 'salon-line'],
        [/口コミ.*(返信|返事|活用|生か)|悪い口コミ|レビュー.*返信/, 'salon-reviews'],
        [/広告費|媒体費|ホットペッパー代|費用対効果|どの媒体|頼りすぎ/, 'salon-channel-budget'],
        [/値上げ|値引き|客単価.*上げ|安売り|メニュー.*見直|料金設定/, 'salon-menu-pricing'],
        [/リピートしない|次につながらない|戻ってこない|次回予約|常連.*減|失客が多/, 'salon-retention'],
        [/予約枠|スタッフ.*(配置|予約)|予約.*偏|接客の流れ|業務.*追われ/, 'salon-operations'],
        [/数字.*(見方|記録)|利益が出ている|お金が残らない|客数と客単価/, 'salon-metrics'],
        [/何から相談|何も決まって|まず話|まとまっていない|どのサービス/, 'contact-start']
    ];
    return rules.find(([pattern])=>pattern.test(q))?.[1] || null;
}

// 製品名だけの質問や具体的な成果物を、一般的なAI案内から分ける。
function routeAiCapability(q) {
    const dots = /(^|[^a-z])dots?(?![a-z])|ドッツ|ドット(?!絵)/.test(q);
    const work = /chatgptwork|chatgptワーク|(^|[^a-z])work(?![a-z])|ワークで/.test(q);
    const codex = /codex|コーデックス/.test(q);
    const ai = /(^|[^a-z])ai(?![a-z])|chatgpt|チャットgpt/.test(q) || dots || work || codex;
    if (!ai && !/excel|エクセル|スプレッドシート/.test(q)) return null;
    // 診断や制作の料金は、これまでのサービス別の回答へ回す。
    if (/診断/.test(q) || (/ホームページ.*(制作|作る|作り|作れ|作って)/.test(q) && /料金|いくら|金額/.test(q) && !dots && !work && !codex)) return null;
    if (/パスワード|認証コード|ログイン情報/.test(q)) return 'contact-security';
    if (/顧客データ|お客様の情報|個人情報|機密|何を入力/.test(q)) return 'ai-safe-use';
    if (/商用利用|著作権/.test(q) && !/サポート.*料金|制作.*(料金|いくら)/.test(q)) return 'ai-rights';
    if (dots && /無料プラン|利用条件|使える条件|誰でも|表示され|使えない|利用できない|スマホ|スマートフォン|電源|パソコン.*(切|オフ)/.test(q)) return 'ai-dots-access';
    if (/無料/.test(q) && /使える|使えます|使う|利用できる/.test(q) && !/相談|サポート|講座/.test(q)) return 'ai-tool-cost';
    const workTopic = routeAiWorkTopic(q, true);
    const asksFee = /料金|いくら|有料|無料|利用料|月額|見積もり|見積り/.test(q);
    if (workTopic && !asksFee) return workTopic;
    if (/解約|契約期間|支払|振込/.test(q)) return /サポート|相談|講座/.test(q) ? 'ai-price' : 'ai-tool-cost';
    if (/競合|他店/.test(q) && /比較|調べ|調査/.test(q) && !/サポート.*料金|利用料/.test(q)) return 'ai-research';
    if (/料金表.*(作り|作れ|制作)/.test(q) && !/いくら|利用料/.test(q)) return 'ai-documents';
    if (/値上げ.*(案内|文章|お知らせ)/.test(q)) return 'ai-writing';
    if (/料金|いくら|金額|有料|無料|利用料|月額/.test(q)) {
        if (/サポート|相談|教わる|講座|導入支援/.test(q) && !/利用料.*(含|別)/.test(q)) return 'ai-price';
        if (dots || work || codex || /chatgpt|チャットgpt|ツール/.test(q)) return 'ai-tool-cost';
        return 'ai-price';
    }
    if ((dots || work || codex || /chatgpt|チャットgpt/.test(q)) && /違い|使い分け|比較/.test(q) && !/競合|店舗|他店|売上|資料/.test(q)) return 'ai-tool-choice';
    if (/どのai|aiツール.*選/.test(q)) return 'ai-tool-choice';
    if (/顧客データ|お客様の情報|個人情報|機密|間違い|そのまま使|何を入力/.test(q)) return 'ai-safe-use';
    if (dots && /止め|停止|勝手|全部任せ|任せる範囲|自動送信|自動投稿|キャンセル/.test(q)) return 'ai-dots-control';
    if (/連携|接続|gmail|ドライブ|カレンダー|外部サービス|パソコン.*操作/.test(q)) return 'ai-connections';
    if (dots) return 'ai-dots';
    if (/excel|エクセル|スプレッドシート|グラフ|集計|数式/.test(q)) return 'ai-spreadsheets';
    if (/リマインド|締め切り|締切|毎週|毎月|定期レポート|予定.*忘れ/.test(q)) return 'ai-reminders';
    if (/画像|写真|バナー|イラスト|背景/.test(q)) return 'ai-images';
    if (/提案書|手順書|マニュアル|スライド|パワーポイント|powerpoint|研修資料|pdf.*まとめ|資料.*(制作|作り|作れ)/.test(q)) return 'ai-documents';
    if (/競合|商圏|公開情報|最新情報|調査.*(結果|比較)/.test(q)) return 'ai-research';
    if (codex || /アプリ|業務用.*ツール|ホームページ.*点検/.test(q)) return 'ai-website-tools';
    if (work) return 'ai-work';
    // ChatGPTという呼び方でも、既存の実務別回答を選べるようにする。
    if (/自動化|同じ作業|全部任せ/.test(q)) return 'ai-automation';
    if (/売上|口コミ.*(まとめ|分析)|資料.*整理/.test(q)) return 'ai-data';
    if (/案内文|返信|投稿文|キャンペーン.*文章|メニュー.*説明|(?:sns|instagram|インスタ).*投稿/.test(q)) return 'ai-writing';
    return null;
}

// 新しい用途と、製品名を使わない日常の相談を対応する説明に結び付ける。
function routeAiWorkTopic(q, explicitAi) {
    if (!explicitAi && /ホームページ|診断|訪問|交通費|月額|ライト|スタンダード|プレミアム|解約|契約|支払|振込|いくら|料金|無料|有料|見積もり|見積り/.test(q)) return null;
    if (/動画.*(作らず|いらない|不要).*文章/.test(q)) return 'ai-writing';
    if (explicitAi && /動画と画像|画像と動画/.test(q)) return ['ai-video','ai-images'];
    if (explicitAi && /スマホ|スマートフォン/.test(q) && /動画|リール/.test(q)) return ['ai-video','ai-mobile'];
    if (/商用利用|著作権|(画像|イラスト|動画).*広告.*(使|利用)|写真.*(加工|使用).*いい|音楽.*(権利|付け.*いい)/.test(q)) return explicitAi ? 'ai-rights' : null;
    if (explicitAi && /効果|何時間|どれくらい.*(時間|減ら|時短)|集客.*(増|改善|上が)|必ず.*(売上|集客)|売上.*(予測|上が|増)/.test(q)) return 'ai-effect';
    if (explicitAi && /できない|苦手なこと|任せてはいけない|間違えません|放置|だけで全部/.test(q)) return 'ai-limits';
    if (explicitAi && /スマホ|スマートフォン|パソコン.*(必要|なく|ない|なし)/.test(q)) return 'ai-mobile';
    if (explicitAi && /何.*準備|始め方|どう頼|何から始め|プロンプト|何を相談|お店に合う.*活用/.test(q)) return 'ai-getting-started';
    if (/議事録|文字起こし|音声.*(文章|文字)|会議.*(まとめ|メモ|決定)|打ち合わせ.*(メモ|整理)/.test(q)) return 'ai-meeting';
    if (/翻訳|英訳|和訳|外国人向け|多言語|外国語|メニュー.*英語|英語.*(お客様|返信|案内)|中国語.*案内/.test(q)) return 'ai-translation';
    if (/動画|リール|字幕|ショート動画/.test(q) && (explicitAi || /作り|作れ|作る|制作|台本|構成|付け|相談|編集|大変/.test(q))) return 'ai-video';
    if (/チラシ|店内pop|店内ポップ|ポスター/.test(q) && (explicitAi || /作り|作れ|作る|制作|考え|用意|大変/.test(q))) return 'ai-flyer';
    if (/請求書|見積書/.test(q) && (explicitAi || /作り|作れ|制作|ひな形|転記|数字.*確認/.test(q))) return 'ai-invoices';
    if (explicitAi && /インボイス.*(作り|作れ|作る|制作)/.test(q)) return 'ai-invoices';
    if (/経理|領収書|レシート|経費|会計ソフト|帳簿/.test(q) && (explicitAi || /整理|集計|入力|減ら|大変|自動化/.test(q))) return 'ai-bookkeeping';
    if (/シフト|勤務表|希望休|勤務予定/.test(q) && (explicitAi || /作り|作れ|制作|整理|大変|まとめ/.test(q))) return 'ai-shifts';
    if (/予約管理|予約対応|予約データ|予約.*(返信|確認.*文章|変更.*任せ)|予約.*修正.*任せ/.test(q) && (explicitAi || /時間|下書き|作り|作れ|整理|自動化/.test(q))) return 'ai-booking';
    if (/投稿.*(考え|文章|文を|下書き)|sns.*文章|返信|メール.*返事/.test(q) && /時間|大変|減ら|楽に|考えて|下書き/.test(q)) return 'ai-writing';
    if (/資料.*(作り|作る|作っ|制作)|説明資料|マニュアル|手順書/.test(q) && /大変|時間|楽に|減ら|作り|作れ|作る|作っ/.test(q)) return 'ai-documents';
    if (!explicitAi && /インスタ|instagram/.test(q) && /大変|時間.*かか/.test(q)) return ['salon-instagram','ai-writing'];
    if (/売上.*集計|数字.*転記/.test(q) && /時間|面倒|楽に|減ら/.test(q)) return 'ai-spreadsheets';
    return null;
}

// 「それはいくら？」など、直前に表示した回答を指す短い質問だけを扱う。
// サービス名を含む新しい質問には文脈を上書きしない。
function searchFollowUp(q, lastFaqId) {
    const last = findFaqById(lastFaqId);
    if (!last) return null;
    const result = (...ids) => {
        const candidates = ids.map(findFaqById).filter(Boolean);
        return candidates.length === 1 ? {type:'found',faq:candidates[0]}
            : candidates.length ? {type:'ambiguous',candidates} : null;
    };
    if (last.id.startsWith('ai-')) {
        const shortTopics = {動画:'ai-video',リール:'ai-video',議事録:'ai-meeting',文字起こし:'ai-meeting',翻訳:'ai-translation',チラシ:'ai-flyer',予約管理:'ai-booking',シフト:'ai-shifts',請求書:'ai-invoices',経理:'ai-bookkeeping',スマホ:'ai-mobile',準備:'ai-getting-started'};
        const short = q.match(/^(動画|リール|議事録|文字起こし|翻訳|チラシ|予約管理|シフト|請求書|経理|スマホ|準備)(は|も|では|でも|はどう|はできる|もできる|もできますか|でもできますか|はどうですか)?$/);
        if (short) return {...result(shortTopics[short[1]]), contextFaqId:shortTopics[short[1]]};
        if (/^(ほかには|他には|ほかにできること|他にできること|具体例を教えて)$/.test(q)) return {...result('ai-support-about'),contextFaqId:'ai-support-about'};
    }
    if (last.id.startsWith('instagram-') || last.id === 'salon-instagram') {
        const topics = {ストーリーズ:'instagram-stories',ストーリー:'instagram-stories',ハイライト:'instagram-stories',ハッシュタグ:'instagram-hashtags',投稿頻度:'instagram-schedule',インサイト:'instagram-insights',運用代行:'instagram-management',自動投稿:'instagram-automation',予約投稿:'instagram-automation',画像:'ai-images',リール:'ai-video',動画:'ai-video'};
        const short = q.match(/^(ストーリーズ|ストーリー|ハイライト|ハッシュタグ|投稿頻度|インサイト|運用代行|自動投稿|予約投稿|画像|リール|動画)(は|も|はどう|はどうですか|もできますか)?$/);
        if (short) return {...result(topics[short[1]]),contextFaqId:topics[short[1]]};
    }
    if (/^(それ|これ|そのプラン|そのサービス)?(は|の)?(料金|金額|いくら)(は|ですか|なの|になりますか|を教えて|かかる|かかりますか)?$/.test(q)) {
        if (last.id.startsWith('instagram-') || last.id === 'salon-instagram') return result('instagram-price');
        if (['consultation-free','salon-self-check','website-lesson'].includes(last.id)) return result(last.id);
        if (['ai-dots','ai-dots-access','ai-work','ai-website-tools','ai-tool-cost'].includes(last.id)) return result('ai-tool-cost');
        if (last.id.startsWith('audit-')) return result('audit-price');
        if (['website-extra-cost','website-after-fix','website-after-management','website-domain-hosting'].includes(last.id)) return result(last.id);
        if (['website-renewal','website-trouble'].includes(last.id)) return result('website-renewal');
        if (last.id.startsWith('website-')) return result('website-price');
        if (last.id.startsWith('ai-')) return result('ai-price');
        if (last.id.startsWith('salon-diagnosis')) return result('salon-diagnosis-price');
        if (/^salon-(light|standard|premium)-price$|^salon-opening$/.test(last.id)) return result(last.id);
        if (last.id.startsWith('salon-')) return result('salon-plan-comparison');
    }
    if (/^(それ|これ|そのプラン)?(は|の)?(期間|納期|いつできる|何日|何か月|どれくらいかかる)(は|ですか|くらい|かかりますか)?$/.test(q)) {
        if (last.id.startsWith('audit-')) return result('audit-delivery');
        if (['website-price','website-scope','website-flow','website-period','website-plan-choice','website-photos','website-writing','website-samples','website-mobile','website-sns-only'].includes(last.id)) return result('website-period');
        if (['website-lesson','website-after-fix','consultation-free'].includes(last.id)) return result(last.id);
        if (last.id.startsWith('salon-diagnosis')) return result('salon-diagnosis-details');
        if (/^salon-(light|standard|premium)-price$|^salon-plan-comparison$/.test(last.id)) return result('salon-meo-cancel');
        if(last.id==='salon-opening') return result('salon-opening');
        return {type:'message',text:'その内容の具体的な期間は、ご希望の作業や状況を確認したうえでご案内します。「問い合わせる」からご相談ください。'};
    }
    if (/^(それを|これを)?(お願いしたい|申し込みたい|相談したい|頼みたい)$/.test(q)) return result('contact-general');
    if (/^(もう少し|もっと)?詳しく(教えて|知りたい)?$/.test(q)) return last.related.length ? result(...last.related.slice(0,4)) : result(last.id);
    return null;
}

// 質問から回答を検索する（複数候補の返却に対応）
function searchAnswer(query, currentCategory = null, lastFaqId = null) {
    const normQuery = normalizeText(query);
    if (!normQuery || normQuery.length < MIN_INPUT_LENGTH || query.length > MAX_INPUT_LENGTH) return { type: "none" };

    if (/^(こんにちは|こんばんは|おはようございます|はじめまして|よろしくお願いします)$/.test(normQuery)) return {type:'message',text:'こんにちは。ホームページ制作、サロンの集客・経営相談、AI活用についてご案内します。今いちばん知りたいことをお知らせください。'};
    if (/^(ありがとう|ありがとうございます|助かりました|了解|わかりました|分かりました)$/.test(normQuery)) return {type:'message',text:'ありがとうございます。ほかに気になることがあれば続けてご質問ください。個別のご相談は「問い合わせる」からお進みいただけます。'};
    const followUp = searchFollowUp(normQuery, lastFaqId);
    if (followUp) return { ...followUp, contextFaqId: followUp.contextFaqId || lastFaqId };

    const routed = routeFaqIntent(normQuery);
    if (routed) return routed;

    const candidates = [];

    for (const faq of faqData) {
        let score = 0;
        let exactMatch = false;

        // 1. questions(言い換え)との完全一致・部分一致
        for (const q of faq.questions) {
            const normQ = normalizeText(q);
            if (normQuery === normQ) {
                score = Math.max(score, 100);
                exactMatch = true;
            } else if (normQuery.includes(normQ) || normQ.includes(normQuery)) {
                score = Math.max(score, 50);
            }
        }

        // 2. キーワードの合致数
        let keywordMatches = 0;
        // 「料金・費用・価格」など、正規化後に同じ語は1回だけ数える
        const normalizedKeywords = new Set(faq.keywords.map(kw => normalizeText(kw)));
        for (const normKw of normalizedKeywords) {
            // 短すぎるキーワード（1文字）は部分一致を避ける
            if (normKw.length <= 1) continue;
            if (normQuery.includes(normKw)) {
                keywordMatches++;
                score += 10;
            }
        }

        // 複数キーワードが合致した場合のボーナス
        if (keywordMatches >= 2) {
            score += 20;
        }
        if (keywordMatches >= 3) {
            score += 15; // 3つ以上一致で追加ボーナス
        }

        // 質問自体に十分な一致がない回答は、前の話題だけで候補にしない
        if (!exactMatch && score < 20) continue;

        // 3. 質問に合致した候補だけにカテゴリーボーナスを付ける
        if (currentCategory && faq.category === currentCategory) {
            score += 5;
        }

        if (score > 0) {
            candidates.push({ faq, score, exactMatch });
        }
    }

    // スコア降順にソート
    candidates.sort((a, b) => {
        if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
        return b.score - a.score;
    });

    if (candidates.length === 0 || candidates[0].score < 20) {
        return { type: "none" };
    }

    // 同じカテゴリー内でも候補を絞れなければ選択肢を出す。
    if (!candidates[0].exactMatch &&
        candidates.length >= 2 &&
        candidates[0].score - candidates[1].score <= 15 &&
        candidates[0].faq.id !== candidates[1].faq.id) {
        const top = candidates.slice(0, 3).map(c => c.faq);
        return { type: "ambiguous", candidates: top };
    }

    return { type: "found", faq: candidates[0].faq };
}
