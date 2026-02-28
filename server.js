const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const yaml     = require('js-yaml');
const OpenAI   = require('openai');

const app  = express();
const PORT = 3000;

// ── OpenAI クライアント初期化 ───────────────────────────────
const configPath = path.join(process.env.HOME || '/root', '.genspark_llm.yaml');
let config = null;
try {
  const fileContents = fs.readFileSync(configPath, 'utf8');
  config = yaml.load(fileContents);
} catch (e) {
  console.warn('YAML config not found, using env vars');
}

const apiKey  = config?.openai?.api_key  || process.env.OPENAI_API_KEY  || process.env.GENSPARK_TOKEN;
const baseURL = config?.openai?.base_url || process.env.OPENAI_BASE_URL || 'https://www.genspark.ai/api/llm_proxy/v1';

// YAMLに${GENSPARK_TOKEN}が書いてある場合は環境変数から取得
const resolvedKey = (apiKey === '${GENSPARK_TOKEN}')
  ? (process.env.GENSPARK_TOKEN || process.env.OPENAI_API_KEY)
  : apiKey;

const openai = new OpenAI({ apiKey: resolvedKey, baseURL });

console.log(`✅ PharmaAI サーバー設定`);
console.log(`   Base URL: ${baseURL}`);
console.log(`   API Key : ${resolvedKey ? resolvedKey.slice(0,16)+'...' : '未設定'}`);

// ── ミドルウェア ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── ヘルスチェック ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, baseURL }));

// ── AI 用語解説 API（ストリーミング） ──────────────────────
app.post('/api/explain', async (req, res) => {
  const { term } = req.body;
  if (!term || !term.trim()) {
    return res.status(400).json({ error: '用語を入力してください' });
  }

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

  // SSE ヘッダー
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `次の製薬・AI専門用語を解説してください：「${term.trim()}」` }
      ],
      stream:      true,
      temperature: 0.7,
      max_tokens:  800
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('OpenAI error:', err.message);
    const msg = err.status === 401
      ? 'APIキーが無効です。設定を確認してください。'
      : `AI接続エラー: ${err.message}`;
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ PharmaAI サーバー起動 → http://0.0.0.0:${PORT}`);
});
