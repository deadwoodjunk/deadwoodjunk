"""GMP監査ロールプレイ訓練アプリ（Streamlit）。

Claudeが被監査者を演じ、ユーザーが監査人として面談を行う。所見を記録し、
面談終了時にAIトレーナーから総合的な講評を受ける。
"""
from __future__ import annotations

import os

import anthropic
import streamlit as st

from gmp_audit_agent import (
    DIFFICULTY_LEVELS,
    SCENARIOS,
    evaluate_audit,
    get_scenario,
    respond_as_auditee,
)

st.set_page_config(page_title="GMP監査ロールプレイ訓練", page_icon="🏭", layout="wide")

st.title("🏭 GMP監査ロールプレイ訓練アプリ")
st.caption(
    "Claudeが被監査者（auditee）を演じます。あなたは監査人として面談を行い、"
    "気付いた事項を所見として記録し、面談終了後にAIトレーナーから講評を受けます。"
)


def init_session() -> None:
    st.session_state.setdefault("messages", [])
    st.session_state.setdefault("findings", [])
    st.session_state.setdefault("evaluation", None)
    st.session_state.setdefault("scenario_id", SCENARIOS[0].id)
    st.session_state.setdefault("difficulty", "中級")


def reset_session(*, keep_settings: bool = True) -> None:
    st.session_state["messages"] = []
    st.session_state["findings"] = []
    st.session_state["evaluation"] = None
    if not keep_settings:
        st.session_state["scenario_id"] = SCENARIOS[0].id
        st.session_state["difficulty"] = "中級"


init_session()

# ----- サイドバー：設定 -----
with st.sidebar:
    st.header("⚙️ 設定")
    api_key = st.text_input(
        "Anthropic API Key",
        type="password",
        value=os.environ.get("ANTHROPIC_API_KEY", ""),
        help="https://console.anthropic.com/ で発行できます。",
    )

    st.markdown("---")
    st.subheader("シナリオ選択")

    scenario_titles = {s.id: s.title for s in SCENARIOS}
    current_index = list(scenario_titles.keys()).index(st.session_state["scenario_id"])
    selected_id = st.selectbox(
        "監査対象シナリオ",
        options=list(scenario_titles.keys()),
        format_func=lambda x: scenario_titles[x],
        index=current_index,
        label_visibility="collapsed",
    )

    st.subheader("難易度")
    difficulty = st.radio(
        "被監査者の協力度",
        options=list(DIFFICULTY_LEVELS.keys()),
        index=list(DIFFICULTY_LEVELS.keys()).index(st.session_state["difficulty"]),
        horizontal=True,
        label_visibility="collapsed",
    )
    st.caption(DIFFICULTY_LEVELS[difficulty])

    if (
        selected_id != st.session_state["scenario_id"]
        or difficulty != st.session_state["difficulty"]
    ):
        st.session_state["scenario_id"] = selected_id
        st.session_state["difficulty"] = difficulty
        reset_session(keep_settings=True)
        st.rerun()

    st.markdown("---")
    if st.button("🔄 セッションをリセット", use_container_width=True):
        reset_session(keep_settings=True)
        st.rerun()

    st.markdown("---")
    st.markdown("**モデル**：`claude-opus-4-7`")
    st.caption("Anthropic Claude API（prompt caching 有効）")


scenario = get_scenario(st.session_state["scenario_id"])

# ----- シナリオ概要 -----
with st.expander(
    f"📋 シナリオブリーフィング：{scenario.title}",
    expanded=not st.session_state["messages"],
):
    st.markdown(f"**概要**：{scenario.summary}")
    st.markdown("**サイト情報**")
    st.code(scenario.site_overview, language="text")
    st.markdown(f"**面談相手**：{scenario.auditee_role}")
    st.markdown("**推奨確認領域**（参考。すべてに触れる必要はありません）")
    for f in scenario.suggested_focus:
        st.markdown(f"- {f}")
    st.caption(
        "実際の監査では、書類レビュー → 面談 → 現場確認 → 締めくくり面談の流れですが、"
        "本訓練は面談部分にフォーカスしています。"
    )

# ----- 2カラム：チャット ＋ 所見 -----
col_chat, col_findings = st.columns([3, 2], gap="large")

with col_chat:
    st.subheader("💬 監査面談")

    chat_container = st.container(height=520, border=True)
    with chat_container:
        if not st.session_state["messages"]:
            st.info(
                "下の入力欄から面談を開始してください。"
                "例：「本日はお時間いただきありがとうございます。早速ですが、"
                "御社の逸脱管理SOPの概要をご説明いただけますか。」"
            )
        for msg in st.session_state["messages"]:
            avatar = "🧑‍💼" if msg["role"] == "user" else "🏭"
            with st.chat_message(msg["role"], avatar=avatar):
                st.markdown(msg["content"])

with col_findings:
    st.subheader("📝 所見（Findings）")
    st.caption(
        "気付いた事項を「観察事実 → GMP要件との乖離 → リスク」の順で簡潔に。"
        "最後の講評で品質が評価されます。"
    )

    with st.form("add_finding_form", clear_on_submit=True):
        category = st.selectbox(
            "区分",
            [
                "Critical（重大）",
                "Major（重要）",
                "Minor（軽微）",
                "Observation（観察事項）",
            ],
            index=2,
        )
        finding_text = st.text_area(
            "所見内容",
            placeholder=(
                "例：CAPA有効性確認の実施記録について、QA部長は口頭で「実施している」"
                "と回答したが、具体的な評価指標および記録の所在を提示できなかった。"
                "PIC/S GMP第1章で要求されるCAPAの effectiveness の体系的検証が"
                "実装されていない疑いがあり、是正措置の信頼性に関わる。"
            ),
            height=140,
            label_visibility="collapsed",
        )
        submitted = st.form_submit_button(
            "➕ 所見を追加", use_container_width=True, type="secondary"
        )
        if submitted and finding_text.strip():
            st.session_state["findings"].append(
                {"category": category, "text": finding_text.strip()}
            )
            st.rerun()

    findings_box = st.container(height=300, border=True)
    with findings_box:
        if st.session_state["findings"]:
            for i, f in enumerate(st.session_state["findings"]):
                cols = st.columns([5, 1])
                cols[0].markdown(f"**{i + 1}. [{f['category']}]**")
                if cols[1].button("🗑", key=f"del_{i}", help="この所見を削除"):
                    st.session_state["findings"].pop(i)
                    st.rerun()
                st.markdown(f["text"])
                st.divider()
        else:
            st.caption("まだ所見はありません。")


# ----- チャット入力（最下部にピン留めされる） -----
if st.session_state["evaluation"] is None:
    prompt = st.chat_input(
        "監査人として質問・依頼を入力（例：「逸脱判定基準のSOPを見せてください」）"
    )
    if prompt:
        if not api_key:
            st.error("サイドバーで Anthropic API Key を設定してください。")
            st.stop()

        st.session_state["messages"].append({"role": "user", "content": prompt})

        try:
            client = anthropic.Anthropic(api_key=api_key)
            with st.spinner("被監査者が考えています..."):
                reply, _ = respond_as_auditee(
                    client,
                    scenario,
                    st.session_state["difficulty"],
                    st.session_state["messages"],
                )
        except anthropic.APIStatusError as e:
            st.session_state["messages"].pop()
            st.error(f"APIエラー（{e.status_code}）：{e.message}")
            st.stop()
        except Exception as e:
            st.session_state["messages"].pop()
            st.error(f"予期せぬエラー：{e}")
            st.stop()

        st.session_state["messages"].append({"role": "assistant", "content": reply})
        st.rerun()


# ----- 監査終了 → 講評 -----
st.markdown("---")

if st.session_state["evaluation"] is None:
    end_col, _ = st.columns([2, 5])
    with end_col:
        end_btn = st.button(
            "🎯 監査を終了して講評を受ける",
            type="primary",
            disabled=not st.session_state["messages"] or not api_key,
            use_container_width=True,
        )
    if not st.session_state["messages"]:
        st.caption("まずは面談を進めてから講評に進んでください。")

    if end_btn:
        try:
            client = anthropic.Anthropic(api_key=api_key)
            with st.spinner("AIトレーナーが講評を作成しています..."):
                evaluation, _ = evaluate_audit(
                    client,
                    scenario,
                    st.session_state["messages"],
                    st.session_state["findings"],
                )
        except anthropic.APIStatusError as e:
            st.error(f"APIエラー（{e.status_code}）：{e.message}")
            st.stop()
        except Exception as e:
            st.error(f"評価生成エラー：{e}")
            st.stop()
        st.session_state["evaluation"] = evaluation
        st.rerun()
else:
    st.subheader("🎓 講評（AIトレーナーより）")
    with st.container(border=True):
        st.markdown(st.session_state["evaluation"])

    retry_col, _ = st.columns([2, 5])
    with retry_col:
        if st.button("🔁 もう一度挑戦する", type="primary", use_container_width=True):
            reset_session(keep_settings=True)
            st.rerun()
