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
        .trim()
        .toLowerCase()
        // 全角英数字を半角に変換
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        })
        // 全角スペースを半角に
        .replace(/　/g, " ");

    // 同義語の統一
    normalized = normalized.replace(/hp|ウェブサイト|webサイト|web サイト/g, "ホームページ");
    normalized = normalized.replace(/値段|価格|費用|予算|コスト/g, "料金");
    normalized = normalized.replace(/作成|構築|開発|立ち上げ/g, "制作");
    normalized = normalized.replace(/修正|変更|更新|直す|直して/g, "修正");
    normalized = normalized.replace(/サイト/g, "ホームページ");
    normalized = normalized.replace(/ヶ月|ケ月|箇月|カ月/g, "か月");
    normalized = normalized.replace(/[？?。！!]/g, "");

    return normalized;
}

// 質問から回答を検索する（複数候補の返却に対応）
function searchAnswer(query, currentCategory = null) {
    const normQuery = normalizeText(query);
    if (!normQuery || normQuery.length < MIN_INPUT_LENGTH) return { type: "none" };

    const candidates = [];

    for (const faq of faqData) {
        let score = 0;
        let exactMatch = false;

        // 1. questions(言い換え)との完全一致・部分一致
        for (const q of faq.questions) {
            const normQ = normalizeText(q);
            if (normQuery === normQ) {
                score += 100;
                exactMatch = true;
            } else if (normQuery.includes(normQ) || normQ.includes(normQuery)) {
                score += 50;
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
            score += 30;
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

    // 最高得点と2位のスコアが近い場合（差が15以内、かつカテゴリーが異なる）は聞き返す
    if (!candidates[0].exactMatch &&
        candidates.length >= 2 &&
        candidates[0].score - candidates[1].score <= 15 &&
        candidates[0].faq.id !== candidates[1].faq.id &&
        candidates[0].faq.category !== candidates[1].faq.category) {
        const top = candidates.slice(0, 3).map(c => c.faq);
        return { type: "ambiguous", candidates: top };
    }

    return { type: "found", faq: candidates[0].faq };
}
