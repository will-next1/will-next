document.addEventListener('DOMContentLoaded', () => {
    const chatButton = document.getElementById('chatbot-button');
    const chatWindow = document.getElementById('chatbot-window');
    const closeBtn = document.getElementById('chatbot-close');
    const messages = document.getElementById('chatbot-messages');
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');

    if (!chatButton || !chatWindow || !closeBtn || !messages || !input || !sendBtn) {
        return;
    }

    let currentCategory = null; // 現在の会話カテゴリーを一時記憶
    let lastFaqId = null; // 直前に表示した回答。タブを閉じれば消える。
    let previousBodyOverflow = '';

    // スクロール位置に関係なく、メニューと問い合わせ先へ移動できる。
    const toolbar = document.createElement('div');
    toolbar.id = 'chatbot-toolbar';
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'choice-btn';
    menuButton.textContent = '最初のメニュー';
    menuButton.onclick = () => { currentCategory = null; lastFaqId = null; showInitialMenu(); };
    const contactLink = document.createElement('a');
    contactLink.className = 'action-link';
    contactLink.textContent = '問い合わせる';
    contactLink.href = 'https://will-next1.github.io/will-next/#contact';
    contactLink.target = '_blank';
    contactLink.rel = 'noopener noreferrer';
    toolbar.append(menuButton, contactLink);
    chatWindow.insertBefore(toolbar, document.getElementById('chatbot-input-area'));

    function openChat() {
        chatWindow.style.display = 'flex';
        chatWindow.setAttribute('aria-hidden', 'false');
        chatWindow.setAttribute('aria-modal', window.matchMedia('(max-width: 480px)').matches ? 'true' : 'false');
        chatButton.style.display = 'none';
        chatButton.setAttribute('aria-expanded', 'true');
        document.body.classList.add('chatbot-open');
        previousBodyOverflow = document.body.style.overflow;
        if (window.matchMedia('(max-width: 480px)').matches) {
            document.body.style.overflow = 'hidden';
        }
    }

    function closeChat() {
        chatWindow.style.display = 'none';
        chatWindow.setAttribute('aria-hidden', 'true');
        chatButton.style.display = 'flex';
        chatButton.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('chatbot-open');
        document.body.style.overflow = previousBodyOverflow;
        chatButton.focus();
    }

    // チャットを開く
    chatButton.addEventListener('click', async () => {
        openChat();

        // 初回のみデータ読み込みと初期メッセージ表示
        if (messages.children.length === 0) {
            await loadFaqData();
            showDisclaimer();
            showInitialMenu();
            messages.scrollTop = 0;
        }
        closeBtn.focus();
    });

    // チャットを閉じる
    closeBtn.addEventListener('click', closeChat);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatWindow.style.display === 'flex') {
            closeChat();
        }
    });

    // 送信ボタン
    sendBtn.addEventListener('click', handleSend);

    // Enterキーで送信
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) handleSend();
    });

    function handleSend() {
        const text = input.value.trim();
        if (!text) return;

        // 文字数チェック
        if (text.length > MAX_INPUT_LENGTH) {
            appendBotMessage(`申し訳ありません。入力は${MAX_INPUT_LENGTH}文字以内でお願いします。`);
            return;
        }

        // ユーザーのメッセージを表示
        appendMessage('user', text);
        input.value = '';

        // 検索処理
        const result = searchAnswer(text, currentCategory, lastFaqId);

            if (result.type === "found") {
                currentCategory = result.faq.category;
                appendBotAnswer(result.faq, result.contextFaqId);
            } else if (result.type === "ambiguous") {
                lastFaqId = null;
                showDisambiguation(result.candidates);
            } else if (result.type === 'message') {
                appendMessage('bot', result.text);
            } else {
                lastFaqId = null;
                appendBotMessage('申し訳ありません。ご質問に合う回答を見つけられませんでした。');
                showNotFoundOptions();
            }
    }

    // テキストメッセージを追加（textContentで安全に出力）
    function appendMessage(sender, text) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    // ボットのメッセージ（HTML許可 ※JSON由来のみ）
    function appendBotMessage(html) {
        const div = document.createElement('div');
        div.className = 'message bot';
        div.innerHTML = html;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    // 検索結果を表示
    function appendBotAnswer(faq, contextFaqId = null) {
        lastFaqId = contextFaqId || faq.id;
        const wrapper = document.createElement('div');
        wrapper.className = 'message bot';

        const title = document.createElement('p');
        title.innerHTML = `<strong>${escapeHtml(faq.title)}</strong>`;
        wrapper.appendChild(title);

        const body = document.createElement('p');
        body.innerHTML = faq.answer; // JSONデータ由来（管理者が管理）
        wrapper.appendChild(body);

        if (faq.link) {
            const link = document.createElement('a');
            link.href = faq.link;
            link.className = 'action-link';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = faq.linkText || '詳細はこちら';
            wrapper.appendChild(link);
        }

        // 関連する質問（id参照方式）
        if (faq.related && faq.related.length > 0) {
            const relLabel = document.createElement('p');
            relLabel.style.cssText = 'margin-top:10px; font-size:12px; color:#666;';
            relLabel.textContent = '関連する質問：';
            wrapper.appendChild(relLabel);

            faq.related.forEach(relatedId => {
                const relatedFaq = findFaqById(relatedId);
                if (!relatedFaq) return;
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = relatedFaq.title;
                btn.onclick = () => {
                    appendMessage('user', relatedFaq.title);
                    currentCategory = relatedFaq.category;
                    appendBotAnswer(relatedFaq);
                };
                wrapper.appendChild(btn);
            });
        }

        messages.appendChild(wrapper);
        // 長い回答でも、料金や結論がある先頭から読めるようにする。
        messages.scrollTop = wrapper.offsetTop - messages.offsetTop;
    }

    // 聞き返し（複数候補を提示）
    function showDisambiguation(candidates) {
        const div = document.createElement('div');
        div.className = 'message bot';

        const p = document.createElement('p');
        p.textContent = 'どのサービス・内容についてのご質問ですか？';
        div.appendChild(p);

        candidates.forEach(faq => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = faq.title;
            btn.onclick = () => {
                appendMessage('user', faq.title);
                currentCategory = faq.category;
                appendBotAnswer(faq);
            };
            div.appendChild(btn);
        });

        messages.appendChild(div);
        messages.scrollTop = div.offsetTop - messages.offsetTop;
    }

    // 回答が見つからなかった場合の選択肢
    function showNotFoundOptions() {
        const div = document.createElement('div');
        div.className = 'message bot';

        const options = [
            { text: '質問を言い換える', action: () => input.focus() },
            { text: 'よくある質問を見る', action: () => { currentCategory = null; lastFaqId = null; showInitialMenu(); } },
            { text: '問い合わせる', action: () => window.open('https://will-next1.github.io/will-next/#contact', '_blank', 'noopener,noreferrer') }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = opt.text;
            btn.onclick = opt.action;
            div.appendChild(btn);
        });

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    // 免責事項・注意表示
    function showDisclaimer() {
        appendBotMessage(
            '<span style="font-size:11px; color:#888;">' +
            'サービス内容や料金について、登録済みの回答をご案内します。AIによる自由な会話ではありません。<br>' +
            'このチャットでは、お問い合わせ・ご予約の受付は完了しません。個別のご相談は「問い合わせる」からお進みください。<br>' +
            '※電話番号などの個人情報、パスワード、認証コードは入力しないでください。<br>' +
            '※表示される料金・条件は変更になる場合があります。正式な内容はお問い合わせください。' +
            '</span>'
        );
    }

    // 初期メニュー表示
    function showInitialMenu() {
        const div = document.createElement('div');
        div.className = 'message bot';

        const p = document.createElement('p');
        p.textContent = 'ご質問をお選びいただくか、下部のフォームから直接入力してください。';
        div.appendChild(p);

        const categories = [
            { label: 'ホームページ制作', category: 'ホームページ制作' },
            { label: '美容サロンの集客支援', category: '美容サロンの集客支援' },
            { label: 'ホームページ診断', category: 'ホームページ診断' },
            { label: '料金・お支払い・契約', category: '契約・料金・支払い' },
            { label: 'AI活用サポート', category: 'AI活用サポート' },
            { label: 'お問い合わせ・受付時間', category: 'お問い合わせ' }
        ];

        categories.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = item.label;
            btn.onclick = () => {
                currentCategory = item.category;
                lastFaqId = null;
                appendMessage('user', item.label);
                showCategorySubMenu(item.category, item.label);
            };
            div.appendChild(btn);
        });

        messages.appendChild(div);
        messages.scrollTop = div.offsetTop - messages.offsetTop;
    }

    // カテゴリー選択後のサブ選択肢表示
    function showCategorySubMenu(category, displayLabel = category, offset = 0) {
        const faqs = getFaqsByCategory(category);
        const div = document.createElement('div');
        div.className = 'message bot';

        const p = document.createElement('p');
        p.textContent = `「${displayLabel}」について、どの内容でしょうか？`;
        div.appendChild(p);

        if (faqs.length > 0) {
            const pageSize = 6;
            faqs.slice(offset, offset + pageSize).forEach(faq => {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = faq.title;
                btn.onclick = () => {
                    appendMessage('user', faq.title);
                    currentCategory = faq.category;
                    appendBotAnswer(faq);
                };
                div.appendChild(btn);
            });
            if (offset + pageSize < faqs.length) {
                const more = document.createElement('button');
                more.className = 'choice-btn';
                more.textContent = 'ほかの質問を見る';
                more.onclick = () => { lastFaqId = null; currentCategory = category; showCategorySubMenu(category, displayLabel, offset + pageSize); };
                div.appendChild(more);
            }
        } else {
            const hint = document.createElement('p');
            hint.style.cssText = 'font-size:13px; color:#666;';
            hint.textContent = 'このカテゴリーの質問はまだ登録されていません。下のフォームからご質問ください。';
            div.appendChild(hint);
        }

        messages.appendChild(div);
        messages.scrollTop = div.offsetTop - messages.offsetTop;
    }

    // HTMLエスケープ（タイトル等の安全な表示用）
    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
});
