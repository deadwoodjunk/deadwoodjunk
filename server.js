const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  サーバー側 API キー管理（環境変数から取得）
//  クライアントには一切キーを公開しない
// ============================================================
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY  || '';

function resolveKey() {
  if (GROQ_API_KEY && GROQ_API_KEY.startsWith('gsk_'))   return { key: GROQ_API_KEY,   provider: 'groq' };
  if (OPENAI_API_KEY && OPENAI_API_KEY.startsWith('sk-')) return { key: OPENAI_API_KEY, provider: 'openai' };
  return null;
}

// ── ヘルスチェック ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const cred = resolveKey();
  res.json({ ok: true, aiEnabled: !!cred, provider: cred?.provider || null });
});

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
    if (trans && trans.toLowerCase() !== text.toLowerCase().slice(0, 50)) return trans;
    return '';
  } catch (e) {
    console.warn('Translation error:', e.message);
    return '';
  }
}

// ============================================================
//  EuropePMC 論文検索（最大3件）
// ============================================================
async function searchEuropePMC(term) {
  try {
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
    const termLower   = term.toLowerCase().replace(/[（(）)\s]/g, '').trim();
    const searchQuery = termMap[termLower] || `${term} pharmaceutical drug discovery`;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(searchQuery)}&resultType=lite&pageSize=5&format=json`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const hits = (data?.resultList?.result || []).filter(h => h.title && h.pmid).slice(0, 3);
    if (!hits.length) return [];

    return await Promise.all(hits.map(async h => {
      const titleJa = await translateToJa(h.title);
      const authorArr = h.authorString ? h.authorString.split(',') : [];
      const authors = authorArr.slice(0, 3).map(a => a.trim()).join(', ')
                    + (authorArr.length > 3 ? ' et al.' : '');
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
  } catch (e) {
    console.warn('EuropePMC error:', e.message);
    return [];
  }
}

// ============================================================
//  Wikipedia 検索（日本語→英語フォールバック）
// ============================================================
const WIKI_UA = 'PharmaAIApp/1.0 (pharmaai@example.com)';

async function searchWikipedia(term) {
  try {
    const url  = `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': WIKI_UA } });
    const data = await res.json();
    const hits = data?.query?.search || [];
    if (hits.length) return { title: hits[0].title, url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(hits[0].title)}`, lang: 'ja' };
    return await searchWikipediaEn(term);
  } catch (e) {
    try { return await searchWikipediaEn(term); } catch { return null; }
  }
}

async function searchWikipediaEn(term) {
  try {
    const url  = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': WIKI_UA } });
    const data = await res.json();
    const hits = data?.query?.search || [];
    if (!hits.length) return null;
    return { title: hits[0].title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hits[0].title)}`, lang: 'en' };
  } catch { return null; }
}

// ============================================================
//  参考文献 API
// ============================================================
app.post('/api/references', async (req, res) => {
  const { term } = req.body;
  if (!term?.trim()) return res.status(400).json({ error: '用語が必要です' });
  console.log(`▶ /api/references  term=${term}`);
  const [papers, wiki] = await Promise.all([searchEuropePMC(term.trim()), searchWikipedia(term.trim())]);
  res.json({ papers, wiki });
});

// ============================================================
//  AI 用語解説 API（ストリーミング SSE）
//  ※ クライアントからAPIキーを受け取らない。サーバー環境変数のみ使用。
// ============================================================
app.post('/api/explain', async (req, res) => {
  const { term } = req.body;

  if (!term?.trim()) return res.status(400).json({ error: '用語を入力してください' });

  const cred = resolveKey();
  if (!cred) {
    return res.status(503).json({ error: 'AI_UNAVAILABLE' });
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

  const isGroq   = cred.provider === 'groq';
  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const model    = isGroq ? 'llama-3.1-8b-instant' : 'gpt-3.5-turbo';

  console.log(`▶ /api/explain  provider=${cred.provider}  model=${model}  term=${term}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `次の製薬・AI専門用語を解説してください：「${term.trim()}」` }
        ],
        stream: true, temperature: 0.7, max_tokens: 700
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errMsg = status === 429 ? 'RATE_LIMIT' : status === 401 ? 'INVALID_KEY' : 'API_ERROR';
      console.error(`API error ${status}`);
      res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
      res.end(); return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        const t = line.trim();
        if (!t || t === 'data: [DONE]') continue;
        if (t.startsWith('data: ')) {
          try {
            const json    = JSON.parse(t.slice(6));
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
  const cred = resolveKey();
  console.log(`✅ PharmaAI サーバー起動 → http://0.0.0.0:${PORT}`);
  console.log(`   AI: ${cred ? `有効 (${cred.provider})` : '無効 — GROQ_API_KEY または OPENAI_API_KEY を設定してください'}`);
});
