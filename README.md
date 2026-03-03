# 💊 PharmaInfo Japan

日本の医療用医薬品向け **MR（医薬情報担当者）営業支援ツール**。  
薬品名を入力するだけで「製品概要」「製品戦略」「競合情報」「課題・リスク」「MR訴求トーク例」「参考文献」をAIがリアルタイム生成します。

**公開URL**: https://deadwoodjunk.onrender.com

---

## 🚀 機能

- **AI リアルタイム解説** — Groq (Llama-3.1) による高速ストリーミング生成
- **製品戦略・競合情報** — 日本市場での位置づけ・競合薬との差別化ポイント
- **MR訴求トーク例** — 担当医師・薬剤師への面談で即使えるセリフ形式
- **参考文献自動取得** — PMDA添付文書検索 + PubMed論文（英語タイトル＋日本語訳）+ Wikipedia
- **サンプル医薬品10件** — ジャディアンス・キイトルーダ・オゼンピックなど主要薬をカード表示
- **レスポンシブ対応** — スマートフォンでも快適に利用可能

---

## 💊 対応薬品

糖尿病、がん、循環器、免疫・炎症など主要な医療用医薬品全般に対応（何でも検索可能）。

---

## 🛠 技術スタック

| 種別 | 技術 |
|------|------|
| サーバー | Node.js + Express |
| AI | Groq API (llama-3.1-8b-instant) / OpenAI フォールバック |
| 論文検索 | EuropePMC REST API |
| 翻訳 | MyMemory 無料翻訳 API |
| 添付文書 | PMDA 医薬品検索 |
| 百科事典 | Wikipedia API (日本語 / 英語) |
| ホスティング | Render (無料プラン) |

---

## ⚙️ Render へのデプロイ手順

1. [render.com](https://render.com) でアカウント作成（GitHub でサインイン）
2. **New → Web Service** → このリポジトリを選択
3. 以下を確認:
   - **Branch**: `genspark_ai_developer`
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

---

## ⚠️ 免責事項

本ツールの情報は参考用です。必ず添付文書・PMDA情報を確認してください。
