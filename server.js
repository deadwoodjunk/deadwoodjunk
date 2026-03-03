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
    const url  = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=en|ja`;
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
//  EuropePMC 論文検索（医薬品名で検索・最大3件）
// ============================================================
async function searchEuropePMC(drugName) {
  try {
    // 薬品名から英語検索クエリを生成
    const drugMap = {
      'ジャディアンス': 'empagliflozin clinical trial Japan',
      'フォシーガ': 'dapagliflozin Japan clinical',
      'カナグル': 'canagliflozin Japan',
      'オゼンピック': 'semaglutide GLP-1 Japan',
      'マンジャロ': 'tirzepatide Japan clinical',
      'キイトルーダ': 'pembrolizumab Japan cancer',
      'オプジーボ': 'nivolumab Japan cancer immunotherapy',
      'タグリッソ': 'osimertinib EGFR Japan lung cancer',
      'エンレスト': 'sacubitril valsartan heart failure Japan',
      'ザーコリ': 'crizotinib ALK Japan',
      'イブランス': 'palbociclib breast cancer Japan',
      'リンパーザ': 'olaparib BRCA Japan',
      'ベージニオ': 'abemaciclib breast cancer Japan',
      'スキリージ': 'risankizumab Japan psoriasis',
      'ヒュミラ': 'adalimumab Japan',
      'ステラーラ': 'ustekinumab Japan',
      'コセンティクス': 'secukinumab Japan psoriasis',
      'エリキュース': 'apixaban anticoagulant Japan',
      'イグザレルト': 'rivaroxaban Japan',
      'プラザキサ': 'dabigatran Japan',
    };
    const key = drugName.replace(/\s/g, '');
    const query = drugMap[key] || `${drugName} Japan pharmaceutical clinical`;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=lite&pageSize=5&format=json`;
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
//  PMDA 添付文書検索（薬品名でPMDA検索URLを生成）
// ============================================================
function getPmdaUrl(drugName) {
  // PMDA医薬品検索URL
  return `https://www.pmda.go.jp/PmdaSearch/iyakuSearch/#contents=iyakuSearch&kw=${encodeURIComponent(drugName)}&kw_name=${encodeURIComponent(drugName)}`;
}

// ============================================================
//  Wikipedia 検索（日本語→英語フォールバック）
// ============================================================
const WIKI_UA = 'PharmaInfoJapan/1.0 (pharmainfo@example.com)';

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
//  参考文献 API（PMDA + PubMed + Wikipedia）
// ============================================================
app.post('/api/references', async (req, res) => {
  const { term } = req.body;
  if (!term?.trim()) return res.status(400).json({ error: '薬品名が必要です' });
  console.log(`▶ /api/references  drug=${term}`);
  const [papers, wiki] = await Promise.all([
    searchEuropePMC(term.trim()),
    searchWikipedia(term.trim())
  ]);
  const pmda = getPmdaUrl(term.trim());
  res.json({ papers, wiki, pmda });
});

// ============================================================
//  AI 医薬品情報 API（ストリーミング SSE）
// ============================================================
app.post('/api/explain', async (req, res) => {
  const { term } = req.body;
  if (!term?.trim()) return res.status(400).json({ error: '薬品名を入力してください' });

  const cred = resolveKey();
  if (!cred) return res.status(503).json({ error: 'AI_UNAVAILABLE' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const systemPrompt = `あなたは日本の製薬業界に精通したMR（医薬情報担当者）向けの専門アドバイザーです。
日本で承認・販売されている医療用医薬品について、MRが担当医師・薬剤師への訪問活動に活用できる実践的な情報を提供してください。

【重要】必ず最後の"}"まで含む完全なJSONを出力してください。途中で切らないでください。
余分なテキストやコードブロック記号は不要です。JSONオブジェクトのみ返してください。

{
  "brand": "ブランド名",
  "generic": "一般名",
  "company": "製造販売元（日本法人名）",
  "category": "薬効分類",
  "indication": "日本での主な適応症",
  "icon": "絵文字1文字",
  "overview": "製品概要：作用機序・特徴・承認情報（150字以内）",
  "strategy": "製品戦略：日本での位置づけ・ターゲット患者層・ガイドライン記載（150字以内）",
  "competitors": [
    {"name": "競合薬名", "company": "会社名", "point": "差別化ポイント（50字以内）"}
  ],
  "challenges": "課題・リスク：副作用・禁忌・処方障壁・後発品リスク（120字以内）",
  "mrTalk": "MR訴求トーク例：担当医への面談で使えるセリフ（120字以内）"
}`;

  const isGroq   = cred.provider === 'groq';
  const endpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  // llama-3.3-70b-versatile: 高性能・JSON出力安定・Groq無料枠対応
  const model    = isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

  console.log(`▶ /api/explain  provider=${cred.provider}  drug=${term}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `次の日本の医療用医薬品について情報をまとめてください：「${term.trim()}」` }
        ],
        stream: true, temperature: 0.3, max_tokens: 2000
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
  console.log(`✅ PharmaInfo Japan サーバー起動 → http://0.0.0.0:${PORT}`);
  console.log(`   AI: ${cred ? `有効 (${cred.provider})` : '無効 — GROQ_API_KEY を設定してください'}`);
});
