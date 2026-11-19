const chatbotSiteRoot = new URL('../', document.currentScript.src);

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
    const publishedSite = 'https://will-next1.github.io/will-next/';

    function configureLink(link, href) {
        const sameSite = href.startsWith(publishedSite);
        const destination = new URL(sameSite ? href.slice(publishedSite.length) : href, chatbotSiteRoot);
        if (sameSite && destination.protocol === 'file:' && destination.pathname.endsWith('/')) {
            destination.pathname += 'index.html';
        }
        link.href = destination.href;
        const pagePath = url => url.pathname.replace(/index\.html$/, '');
        if (sameSite && destination.hash && pagePath(destination) === pagePath(window.location)) {
            link.removeAttribute('target');
            link.addEventListener('click', () => closeChat());
        } else if (['http:', 'https:', 'file:'].includes(destination.protocol)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    }

    function consultationLink(text = '問い合わせる', href = publishedSite + '#contact') {
        const link = document.createElement('a');
        link.className = 'action-link';
        link.textContent = text;
        configureLink(link, href);
        return link;
    }

    // スクロール位置に関係なく、メニューと問い合わせ先へ移動できる。
    const toolbar = document.createElement('div');
    toolbar.id = 'chatbot-toolbar';
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'choice-btn';
    menuButton.textContent = '最初のメニュー';
    menuButton.onclick = () => { currentCategory = null; lastFaqId = null; showInitialMenu(); };
    const contactLink = consultationLink();
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
            showInitialMenu();
            messages.scrollTop = 0;
        }
        closeBtn.focus();
    });

    // チャットを閉じる
    closeBtn.addEventListener('click', closeChat);

    document.addEventListener('keydown', (e) => {
        if (chatWindow.style.display !== 'flex') return;
        if (e.key === 'Escape') {
            closeChat();
        }
        if (e.key !== 'Tab' || chatWindow.getAttribute('aria-modal') !== 'true') return;
        const controls = Array.from(chatWindow.querySelectorAll('button, a[href], input, summary'))
            .filter(control => !control.disabled && control.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
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
        body.querySelectorAll('a[href]').forEach(link => configureLink(link, link.getAttribute('href')));
        wrapper.appendChild(body);

        if (faq.link) {
            wrapper.appendChild(consultationLink(faq.linkText || '詳細はこちら', faq.link));
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
            { text: '質問を言い換える', action: () => {
                appendMessage('bot', '「ホームページの料金」「初回相談は無料？」「納期」など、知りたいことを短く入力してみてください。');
                input.focus();
            } },
            { text: 'よくある質問を見る', action: () => { currentCategory = null; lastFaqId = null; showInitialMenu(); } }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = opt.text;
            btn.onclick = opt.action;
            div.appendChild(btn);
        });

        div.appendChild(consultationLink());
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    // 初期メニュー表示
    function showInitialMenu() {
        const div = document.createElement('div');
        div.className = 'message bot chatbot-menu';

        const p = document.createElement('p');
        p.textContent = '項目を選ぶか、下の入力欄で質問してください。';
        div.appendChild(p);

        const categories = [
            { label: 'ホームページ制作', category: 'ホームページ制作',
                featured: ['website-scope', 'website-price', 'website-period', 'website-update-options', 'website-mobile', 'website-renewal'] },
            { label: '美容サロンの集客支援', category: '美容サロンの集客支援',
                featured: ['salon-consulting-about', 'salon-plan-comparison', 'salon-sales-growth', 'salon-visit-area', 'salon-acquisition', 'salon-remote'] },
            { label: 'ホームページ診断', category: 'ホームページ診断',
                featured: ['audit-about', 'audit-price', 'audit-items', 'audit-delivery', 'audit-limits', 'audit-apply'] },
            { label: '料金・お支払い・契約', category: '契約・料金・支払い',
                featured: ['consultation-free', 'payment-method', 'payment-credit', 'payment-estimate-cancel', 'payment-monthly', 'payment-invoice'] },
            { label: 'AI活用サポート', category: 'AI活用サポート',
                featured: ['ai-support-about', 'ai-price', 'ai-beginner', 'ai-writing', 'ai-safe-use', 'ai-automation'] },
            { label: 'AIエージェント活用', category: 'AIエージェント', featured: [] },
            { label: 'お問い合わせ・受付時間', category: 'お問い合わせ',
                featured: ['contact-general', 'contact-line', 'consultation-availability', 'service-overview', 'contact-start', 'company-representative'] }
        ];

        const options = document.createElement('div');
        options.className = 'chatbot-menu-options';
        categories.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'choice-btn';
            btn.textContent = item.label;
            btn.onclick = () => {
                currentCategory = item.category;
                lastFaqId = null;
                appendMessage('user', item.label);
                showCategorySubMenu(item);
            };
            options.appendChild(btn);
        });
        div.appendChild(options);

        const notice = document.createElement('p');
        notice.className = 'chatbot-notice';
        notice.textContent = '個人情報・パスワード・認証コードは入力しないでください。';
        div.appendChild(notice);
        const details = document.createElement('details');
        details.className = 'chatbot-notice';
        const summary = document.createElement('summary');
        summary.textContent = 'チャットのご利用について';
        const terms = document.createElement('p');
        terms.textContent = '登録済みの回答をご案内します。個別のご相談・ご予約は「問い合わせる」へ。料金・条件は変更される場合があります。';
        details.append(summary, terms);
        div.appendChild(details);

        messages.appendChild(div);
        messages.scrollTop = div.offsetTop - messages.offsetTop;
    }

    // カテゴリー選択後のサブ選択肢表示
    function showCategorySubMenu(item, offset = 0) {
        const { category, label, featured } = item;
        const primary = featured.map(findFaqById).filter(faq => faq?.category === category);
        const faqs = [...primary, ...getFaqsByCategory(category).filter(faq => !featured.includes(faq.id))];
        const div = document.createElement('div');
        div.className = 'message bot';

        const p = document.createElement('p');
        p.textContent = `「${label}」について、どの内容でしょうか？`;
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
                more.onclick = () => { lastFaqId = null; currentCategory = category; showCategorySubMenu(item, offset + pageSize); };
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
