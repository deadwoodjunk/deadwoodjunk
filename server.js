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

// ── AI 用語解説 プロキシ API（ストリーミング） ─────────────
// フロントからAPIキーを受け取り、OpenAIへ転送する
app.post('/api/explain', async (req, res) => {
  const { term, apiKey } = req.body;

  if (!term || !term.trim()) {
    return res.status(400).json({ error: '用語を入力してください' });
  }
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'APIキーが必要です' });
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

  // モデル優先順（429時は次のモデルにフォールバック）
  const MODELS = ['gpt-3.5-turbo', 'gpt-4o-mini'];
  let response = null;
  let usedModel = MODELS[0];

  try {
    for (const model of MODELS) {
      usedModel = model;
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
          max_tokens:  600
        })
      });
      // 429以外のエラーか成功ならループ終了
      if (response.ok || response.status !== 429) break;
      console.warn(`${model} → 429, trying next model...`);
      // 少し待ってから次のモデルを試す
      await new Promise(r => setTimeout(r, 1500));
    }

    if (!response.ok) {
      let errMsg = 'AI接続エラーが発生しました';
      if (response.status === 401) errMsg = 'INVALID_KEY';
      else if (response.status === 429) errMsg = 'RATE_LIMIT';
      else if (response.status === 402) errMsg = 'QUOTA_EXCEEDED';
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
