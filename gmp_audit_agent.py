"""GMP監査ロールプレイ訓練アプリのコアロジック。

Claudeを被監査者（auditee）役として動作させ、訓練終了後はAIトレーナーとして
ユーザー（監査人役）の面談と所見記述を評価する。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import anthropic

MODEL = "claude-opus-4-7"


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    summary: str
    site_overview: str
    auditee_role: str
    auditee_persona: str
    hidden_issues: list[str]
    learning_objectives: list[str]
    suggested_focus: list[str]


SCENARIOS: list[Scenario] = [
    Scenario(
        id="deviation",
        title="経口固形製剤工場の逸脱管理レビュー",
        summary=(
            "経口固形製剤（錠剤・カプセル剤）を製造する国内工場で、過去1年間の"
            "逸脱管理状況をレビューする監査。QA部長との面談から開始する。"
        ),
        site_overview=(
            "・所在地：日本国内・経口固形製剤工場（錠剤・カプセル剤）\n"
            "・年間製造ロット数：約500ロット\n"
            "・主要顧客：国内大手製薬企業3社\n"
            "・過去1年の逸脱件数：72件（重大3件／中等度18件／軽微51件）\n"
            "・直近のPMDA査察：2年前（GMP適合・改善指示なし）"
        ),
        auditee_role="品質保証（QA）部長 田中（製造業出身、現職5年）",
        auditee_persona=(
            "・基本的に協力的だが、自工場の弱みを積極的には開示しない\n"
            "・「重大」逸脱の定義について自社の基準を持っており、原因を製造側に押し付ける傾向がある\n"
            "・是正措置（CAPA）の有効性確認が形式的になっていることに本人は気付いていない\n"
            "・データを求めると「準備に時間がかかる」と渋る場面がある\n"
            "・専門用語を多用するが、追及されると曖昧な回答になる"
        ),
        hidden_issues=[
            "重大逸脱3件のうち1件で、CAPA有効性確認（effectiveness check）が"
            "未実施のまま完了報告されている",
            "繰り返し発生している軽微逸脱（製造記録の記入漏れ）に対して、"
            "根本原因分析が「教育を再実施」で終わる表面的なもの",
            "逸脱の判定基準（重大／中等度／軽微）が文書化されておらず、"
            "QA部長個人の主観に依存している",
            "現場から品質部門への逸脱報告が、規定の24時間を超えるケースが散見される",
            "顧客への通知基準が顧客毎にバラバラで、社内SOPに統一基準がない",
        ],
        learning_objectives=[
            "逸脱の分類基準とその一貫性を確認する質問の立て方",
            "CAPAの有効性確認をエビデンスで検証する手法",
            "繰り返し発生する軽微逸脱のトレンディングの重要性",
            "顧客通知・規制当局報告の判断プロセスの確認",
        ],
        suggested_focus=[
            "逸脱判定基準のSOPと実際の判定記録",
            "重大逸脱のCAPA完了報告と、その後の有効性確認記録",
            "軽微逸脱のトレンディング報告書",
            "顧客通知記録（逸脱関連）",
        ],
    ),
    Scenario(
        id="data_integrity",
        title="海外原薬製造所のデータインテグリティ監査",
        summary=(
            "ジェネリック原薬を製造する海外サイトで、HPLC分析を中心とした"
            "データインテグリティ（DI）を監査する。1年前のFDA Form 483対応後の"
            "状況確認も兼ねる。"
        ),
        site_overview=(
            "・所在地：インド・ハイデラバード近郊\n"
            "・主要設備：HPLC 12台、GC 6台、UV 8台\n"
            "・LIMS導入：3年前（紙記録との並行運用が継続）\n"
            "・直近の海外当局査察：FDA Form 483発行（1年前、Repeat Inspection完了）\n"
            "・面談言語：英語（地の文を英訳付きで応答してよい）"
        ),
        auditee_role="品質管理（QC）課長 Sharma（分析化学出身、現職8年）",
        auditee_persona=(
            "・誠実だが、自分の管轄外（IT部門・古いシステム）について曖昧\n"
            "・FDA 483対応の経験から、DIの教科書的な回答はすぐ出てくる\n"
            "・「監査証跡（audit trail）レビュー」は実施していると主張するが、"
            "具体的方法を聞くと答えに詰まる\n"
            "・古いHPLCシステム（QualPump-2008モデル）について言及を避ける傾向\n"
            "・分析者の権限管理について、システム管理者と自分の区別が曖昧"
        ),
        hidden_issues=[
            "HPLC 12台のうち2台（QualPump-2008、古いモデル）が監査証跡機能を持たず、"
            "紙記録のみで運用されている",
            "分析者全員にシステム管理者権限が付与されており、データ削除・改変が可能",
            "再注入（reinjection）が頻繁に行われており、その理由記録が"
            "「instrument issue」とのみ記載されているケースが多い",
            "監査証跡レビューは「月1回サンプリング」が規定だが、レビュー記録が"
            "遡って一括作成された痕跡がある",
            "電子データのバックアップは実施しているが、復元テストが過去2年間未実施",
        ],
        learning_objectives=[
            "ALCOA+原則に基づく具体的な質問の立て方",
            "監査証跡をリアルタイムでデモ確認する手法",
            "ユーザー権限・アクセス制御の検証方法",
            "再注入・再分析の正当性をエビデンスで検証する観点",
            "ハイブリッド運用（紙＋電子）における二重記録の確認",
        ],
        suggested_focus=[
            "HPLC機器一覧と監査証跡機能の有無",
            "ユーザーアカウント・権限マトリクス",
            "監査証跡レビューSOPと実施記録",
            "再注入記録（直近3ヶ月）",
            "バックアップ・復元手順と実施記録",
        ],
    ),
    Scenario(
        id="sterile",
        title="無菌注射剤ラインの環境モニタリング監査",
        summary=(
            "プレフィルドシリンジを製造する無菌注射剤工場で、グレードA充填エリアの"
            "環境モニタリング（EM）プログラムと汚染管理戦略を監査する。"
        ),
        site_overview=(
            "・所在地：国内・無菌注射剤専門工場\n"
            "・製品：プレフィルドシリンジ／バイアル充填\n"
            "・グレードA：RABS（Restricted Access Barrier System）\n"
            "・モニタリング項目：浮遊菌・落下菌・付着菌・微粒子・温湿度・差圧\n"
            "・直近1年でグレードA浮遊菌のアラート3件／アクション0件"
        ),
        auditee_role="無菌保証マネージャー 佐藤（微生物学専門、現職12年）",
        auditee_persona=(
            "・知識豊富で専門的な議論を歓迎する姿勢\n"
            "・自部署のプログラムに自信を持っており、批判には冷静に反論する\n"
            "・アラート／アクションリミットの設定根拠について当初は教科書的説明\n"
            "・「適切に管理している」と繰り返し、具体的記録を求められて初めて踏み込む\n"
            "・実際の調査記録を見ると、対応が定型化している"
        ),
        hidden_issues=[
            "アラートリミットの統計的根拠（過去データからの算出）が5年前のまま更新されていない",
            "浮遊菌アラート3件すべて「特異な事象なし／傾向継続観察」で終結、"
            "根本原因調査は実施していない",
            "落下菌（settle plate）の暴露時間が部位によって4時間／2時間と混在しており、"
            "SOPでは4時間統一の記載と矛盾",
            "オペレーターのガウニング適格性再認定が、規定の年1回ではなく"
            "2年に1回になっているケースがある",
            "メディアフィル（培地充填試験）のworst case条件設定の科学的根拠が不明確",
        ],
        learning_objectives=[
            "EMプログラム設計（サンプリングポイント・頻度・リミット）の妥当性検証",
            "アラート／アクション発生時の調査と是正の実態確認",
            "トレンディングデータから傾向を引き出す質問技法",
            "Annex 1（2022改訂）を踏まえたCCS（汚染管理戦略）の議論",
        ],
        suggested_focus=[
            "EM SOPとサンプリングプラン",
            "アラート／アクション履歴と調査記録",
            "ガウニング適格性記録",
            "メディアフィル記録",
            "CCS（Contamination Control Strategy）文書",
        ],
    ),
]


def get_scenario(scenario_id: str) -> Scenario:
    for s in SCENARIOS:
        if s.id == scenario_id:
            return s
    raise ValueError(f"Unknown scenario id: {scenario_id}")


DIFFICULTY_LEVELS: dict[str, str] = {
    "初級": (
        "初級モード：問いに対して比較的素直に答え、矛盾も少ない。ヒントとなる"
        "キーワードを自然に織り込んでよい。ただし、本当の問題（hidden_issues）"
        "まで自分から開示してはいけない。"
    ),
    "中級": (
        "中級モード：質問の角度が甘いと一般論で逃げる。問題の核心に近づく具体的な"
        "質問が来た時にのみ、断片的に情報を出す。曖昧な質問には曖昧に答えてよい。"
    ),
    "上級": (
        "上級モード：自工場を守る姿勢を強く保つ。監査人が証拠（記録・データ・"
        "実物）を求めて初めて、限定的に情報を開示する。言質を取られないよう"
        "可能な限り抽象的に話す。鋭い質問には沈黙や話題転換を試みることもある。"
    ),
}


def build_auditee_system_prompt(scenario: Scenario, difficulty: str) -> str:
    issues = "\n".join(f"- {i}" for i in scenario.hidden_issues)
    diff_instruction = DIFFICULTY_LEVELS[difficulty]
    return f"""あなたは医薬品GMP監査のロールプレイ訓練において、被監査側（auditee）を演じます。監査人役のユーザーが訓練として監査面談を行います。あなたは現実的で、教育的価値のある被監査者を演じてください。

# 演じる人物
{scenario.auditee_role}

# 工場・サイト概要（あなたが代表する施設）
{scenario.site_overview}

# 人物の性格・行動パターン
{scenario.auditee_persona}

# 難易度設定
{diff_instruction}

# このシナリオに隠された問題点（auditeeであるあなたは、自分から開示してはいけません）
{issues}

# ロールプレイのルール
1. 一人称・口調・専門用語の使い方を、上記人物像に合わせて自然に演じる。
2. 自分から「実は問題があります」と告白することは絶対にしない。鋭い質問・要求があった時にだけ、徐々に情報を出す。
3. 監査人が「記録を見せてください」「データを出してください」と要求したら、まず「準備します」「あとで提示します」と一旦受けて、その内容を口頭で簡単に説明する（実物の記録は存在しない設定なので、あなたが代弁する形になる）。
4. 監査人が事実誤認や見当違いの質問をした場合、丁寧に訂正・補足する。
5. メタ発言（「これはロールプレイです」「あなたは監査人役です」など）は絶対にしない。
6. 1回の応答は原則300字以内。長すぎる説明はしない。聞かれたことに端的に答えるのがリアル。
7. 監査人が同じ論点に複数回切り込んできた場合、徐々に詳細を開示してよい（追及への自然な反応）。

ロールプレイを開始してください。最初の発話は監査人（ユーザー）から来ます。挨拶・着席の場面から自然に始めてください。"""


def build_evaluator_system_prompt(scenario: Scenario) -> str:
    issues = "\n".join(f"- {i}" for i in scenario.hidden_issues)
    objectives = "\n".join(f"- {o}" for o in scenario.learning_objectives)
    focus = "\n".join(f"- {f}" for f in scenario.suggested_focus)
    return f"""あなたは医薬品GMP監査の熟練トレーナーです。監査訓練ロールプレイの会話履歴と、訓練生（監査人役）が記録した所見（Findings）を見て、訓練生に建設的なフィードバックを提供します。

# 訓練シナリオ
{scenario.title}
{scenario.summary}

# このシナリオの学習目標
{objectives}

# 推奨確認領域
{focus}

# 本来発見されるべき隠れた問題点
{issues}

# フィードバックの構成（必ずこの構成・見出しで出力してください）

## 1. 監査面談の総評
3〜5文で、面談全体の進め方を総括する。

## 2. 良かった点
箇条書きで3〜5項目。具体的な発言や所見を引用しながら評価する。

## 3. 改善点・見落としたポイント
箇条書きで、訓練生が発見できなかった「隠れた問題点」を具体的に指摘する。それぞれについて「どう質問していれば発見できたか」を1文添える。

## 4. 所見（Findings）の品質評価
訓練生が記録した所見を、観察事実・GMP要件・リスク評価・推奨対応の4観点で評価する。GMP所見記述の改善例を1〜2件、Before/After形式で具体的に提示する。所見が空の場合は、所見を書くべきだった事項を3件挙げる。

## 5. 次回への学習ポイント
箇条書きで3項目。次回ロールプレイで意識すべき具体的な行動。

## 6. 総合スコア
100点満点。内訳を必ず明記：
- 質問の質：__/30
- 網羅性：__/30
- 所見記述：__/20
- リスクベース思考：__/20
- 合計：__/100

評価は厳しめに、しかし建設的に。実務の監査現場で通用するレベルを目指す指導をしてください。日本語で出力してください。"""


def respond_as_auditee(
    client: anthropic.Anthropic,
    scenario: Scenario,
    difficulty: str,
    history: list[dict[str, str]],
) -> tuple[str, Any]:
    """被監査者役としての応答を生成する。"""
    system_prompt = build_auditee_system_prompt(scenario, difficulty)
    response = client.messages.create(
        model=MODEL,
        max_tokens=700,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=history,
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    return text, response.usage


def evaluate_audit(
    client: anthropic.Anthropic,
    scenario: Scenario,
    history: list[dict[str, str]],
    findings: list[dict[str, str]],
) -> tuple[str, Any]:
    """監査面談と所見を評価し、講評を生成する。"""
    system_prompt = build_evaluator_system_prompt(scenario)

    if findings:
        findings_text = "\n".join(
            f"{i + 1}. [{f.get('category', '?')}] {f.get('text', '')}"
            for i, f in enumerate(findings)
        )
    else:
        findings_text = "（訓練生は所見を1件も記録しなかった）"

    transcript_lines: list[str] = []
    for msg in history:
        speaker = "監査人（訓練生）" if msg["role"] == "user" else "被監査者"
        transcript_lines.append(f"{speaker}：{msg['content']}")
    transcript = "\n\n".join(transcript_lines) if transcript_lines else "（会話なし）"

    user_message = (
        "以下は監査ロールプレイの会話履歴と、訓練生が記録した所見です。"
        "指定された構成でフィードバックを生成してください。\n\n"
        f"# 会話履歴\n{transcript}\n\n"
        f"# 訓練生が記録した所見\n{findings_text}"
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=3500,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_message}],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    return text, response.usage
