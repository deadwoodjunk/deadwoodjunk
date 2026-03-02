# 💊 PharmaAI 用語辞典

製薬業界の営業担当者向け AI 専門用語解説ツール。  
用語を入力すると「意味・解説」「営業トーク例」「関連用語」「参考文献（PubMed / Wikipedia）」をAIがリアルタイム生成します。

---

## 🚀 機能

- **AI リアルタイム解説** — Groq (Llama-3.1) による高速ストリーミング生成
- **営業トーク例** — 商談で即使えるセリフ形式で出力
- **参考文献** — EuropePMC 論文（英語タイトル＋日本語訳）＋ Wikipedia リンク
- **サンプル用語集 22件** — AI なしでもカテゴリ・キーワード検索可能
- **レスポンシブ対応** — スマートフォンでも快適に利用可能

---

## 🛠 技術スタック

| 種別 | 技術 |
|------|------|
| サーバー | Node.js + Express |
| AI | Groq API (llama-3.1-8b-instant) / OpenAI フォールバック |
| 論文検索 | EuropePMC REST API |
| 翻訳 | MyMemory 無料翻訳 API |
| 百科事典 | Wikipedia API (日本語 / 英語) |
| ホスティング | Render (無料プラン) |

---

## ⚙️ Render へのデプロイ手順

1. [render.com](https://render.com) でアカウント作成（GitHub でサインイン）
2. **New → Web Service** → このリポジトリを選択
3. 以下を確認:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Environment Variables** に追加:
   ```
   GROQ_API_KEY = gsk_xxxxxxxxxxxxxxxxxxxx
   ```
5. **Create Web Service** をクリック → 約2〜3分で公開完了

---

## 🔑 Groq API Key の取得方法

1. [console.groq.com/keys](https://console.groq.com/keys) にアクセス
2. Google アカウントでサインアップ（無料）
3. "Create API Key" → `gsk_...` をコピー
4. Render の環境変数 `GROQ_API_KEY` に貼り付け

---

## 🏃 ローカル起動

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env を編集して GROQ_API_KEY を設定

# サーバー起動
npm start
# → http://localhost:3000
```
