const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ヘルスチェック ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ============================================================
//  MyMemory 無料翻訳 API（英語→日本語）
// ============================================================
async function translateToJa(text) {
  if (!text || text.trim().length === 0) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|ja`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const trans = data?.responseData?.translatedText || '';
    // MyMemoryが翻訳失敗すると英語のまま返すことがある
    if (trans && trans.toLowerCase() !== text.toLowerCase().slice(0, 50)) {
      return trans;
    }
    return '';
  } catch (e) {
    console.warn('Translation error:', e.message);
    return '';
  }
}

// ============================================================
//  EuropePMC 論文検索（最大3件・関連度順）
// ============================================================
async function searchEuropePMC(term) {
  try {
    // 英語検索クエリマッピング
    const termMap = {
      'llm': 'large language model pharmaceutical',
      'alphafold': 'AlphaFold protein structure drug discovery',
      '構造ベース創薬': 'structure-based drug design AI',
      'sbdd': 'structure-based drug design',
      '低分子創薬': 'small molecule drug discovery AI',
      '分散型臨床試験': 'decentralized clinical trial DCT',
      'dct': 'decentralized clinical trial',
      '治験効率化': 'clinical trial efficiency AI',
      'アダプティブデザイン': 'adaptive design clinical trial',
      'rwd': 'real world data evidence pharmaceutical',
      'rwe': 'real world evidence drug approval',
      'バイオマーカー': 'biomarker drug development clinical trial',
      'マルチオミクス': 'multi-omics drug discovery',
      'バイオインフォマティクス': 'bioinformatics drug discovery',
      'admet': 'ADMET prediction machine learning',
      'admet予測': 'ADMET prediction AI drug discovery',
      'ファーマコビジランス': 'pharmacovigilance AI automation',
      'pv': 'pharmacovigilance signal detection AI',
      '希少疾患': 'rare disease drug development AI',
      'オーファン': 'orphan drug rare disease',
      'ectd': 'eCTD regulatory submission AI',
      'レギュラトリーサイエンス': 'regulatory science AI pharmaceutical',
      '生成ai': 'generative AI drug discovery',
      '機械学習': 'machine learning drug discovery',
      'ml': 'machine learning pharmaceutical drug discovery',
      'nlp': 'natural language processing pharmaceutical',
      '自然言語処理': 'natural language processing clinical trial',
      'バーチャルスクリーニング': 'virtual screening machine learning',
      'de novo': 'de novo drug design generative AI',
    };

    const termLower = term.toLowerCase().replace(/[（(）)\s]/g, '').trim();
    const searchQuery = termMap[termLower] || `${term} pharmaceutical drug discovery`;

    // EuropePMC REST API（sort未指定＝デフォルト関連度順）
    const searchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(searchQuery)}&resultType=lite&pageSize=5&format=json`;
    const res  = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const hits = data?.resultList?.result || [];
    if (!hits.length) return [];

    // 上位3件（PMIDあるものを優先）
    const top3 = hits
      .filter(h => h.title && h.pmid)
      .slice(0, 3);

    // 各論文タイトルを日本語に翻訳（並行処理）
    const withTrans = await Promise.all(top3.map(async (h) => {
      const titleJa = await translateToJa(h.title);
      const authors = h.authorString
        ? h.authorString.split(',').slice(0, 3).map(a => a.trim()).join(', ') +
          (h.authorString.split(',').length > 3 ? ' et al.' : '')
        : '';
      return {
        pmid:    h.pmid,
        title:   h.title,
        titleJa,
        journal: h.journalTitle || h.source || '',
        authors,
        year:    h.pubYear || '',
        url:     `https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`
      };
    }));

    return withTrans;

  } catch (e) {
    console.warn('EuropePMC search error:', e.message);
    return [];
  }
}

// ============================================================
//  Wikipedia 日本語ページ検索
// ============================================================
const WIKI_UA = 'PharmaAIApp/1.0 (pharmaai@example.com)';

async function searchWikipedia(term) {
  try {
    // まず日本語Wikipediaで検索
    const searchUrl = `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json`;
    const res  = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': WIKI_UA }
    });
    const data = await res.json();
    const hits = data?.query?.search || [];
    if (hits.length) {
      const page = hits[0];
      return {
        title: page.title,
        url:   `https://ja.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        lang:  'ja'
      };
    }
    // 日本語で見つからなければ英語版を試す
    return await searchWikipediaEn(term);
  } catch (e) {
    console.warn('Wikipedia JP error:', e.message);
    try { return await searchWikipediaEn(term); } catch { return null; }
  }
}

async function searchWikipediaEn(term) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json`;
    const res  = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': WIKI_UA }
    });
    const data = await res.json();
    const hits = data?.query?.search || [];
    if (!hits.length) return null;
    const page = hits[0];
    return {
      title: page.title,
      url:   `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      lang:  'en'
    };
  } catch (e) {
    return null;
  }
}

// ============================================================
//  参考文献 API エンドポイント
// ============================================================
app.post('/api/references', async (req, res) => {
  const { term } = req.body;
  if (!term || !term.trim()) {
    return res.status(400).json({ error: '用語が必要です' });
  }
  console.log(`▶ /api/references  term=${term}`);
  const [papers, wiki] = await Promise.all([
    searchEuropePMC(term.trim()),
    searchWikipedia(term.trim())
  ]);
  res.json({ papers, wiki });
});

// ============================================================
//  AI 用語解説 プロキシ API（ストリーミング）
// ============================================================
app.post('/api/explain', async (req, res) => {
  const { term, apiKey, provider } = req.body;

  if (!term || !term.trim()) {
    return res.status(400).json({ error: '用語を入力してください' });
  }
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'APIキーが必要です' });
  }

  // SSE ヘッダー
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const systemPrompt = `あなたは製薬業界・創薬・臨床試験・AIテクノロジーに精通した日本人の専門家アドバイザーです。
製薬会社の営業担当者が、社内外で使われる専門用語を素早く理解し、商談や提案で活用できるよう、
わかりやすく・実践的に説明してください。

必ず以下のJSON形式のみで返答してください（余分なテキスト・コードブロック不要）：
{
  "meaning": "意味・解説（200字程度、専門知識がない人にも伝わる平易な表現）",
  "talk": "営業トーク例（実際の商談で使えるセリフ形式、150字程度、具体的な数字や事例を含む）",
  "category": "AI技術 / 創薬 / 臨床試験 / 分子・生物 / 規制・薬事 / その他 のいずれか",
  "icon": "内容に合う絵文字1文字",
  "related": ["関連用語1", "関連用語2", "関連用語3"]
}`;

  const isGroq   = provider === 'groq' || apiKey.trim().startsWith('gsk_');
  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const model    = isGroq ? 'llama-3.1-8b-instant' : 'gpt-3.5-turbo';

  console.log(`▶ /api/explain  provider=${isGroq?'groq':'openai'}  model=${model}  term=${term}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `次の製薬・AI専門用語を解説してください：「${term.trim()}」` }
        ],
        stream:      true,
        temperature: 0.7,
        max_tokens:  700
      })
    });

    if (!response.ok) {
      let errMsg = 'AI接続エラーが発生しました';
      if (response.status === 401) errMsg = 'INVALID_KEY';
      else if (response.status === 429) errMsg = 'RATE_LIMIT';
      else if (response.status === 402 || response.status === 403) errMsg = 'QUOTA_EXCEEDED';
      console.error(`API error ${response.status}: ${errMsg}`);
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end();
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t === 'data: [DONE]') continue;
        if (t.startsWith('data: ')) {
          try {
            const json = JSON.parse(t.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
          } catch {}
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'AI接続エラー: ' + err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ PharmaAI サーバー起動 → http://0.0.0.0:${PORT}`);
});
