"""
GraphIQ Streamlit 진입점.
Backend(API) URL: GRAPHIQ_API_URL 환경변수 또는 http://localhost:8000
"""
import streamlit as st
from src.components.sidebar import render_sidebar
from src.services import api_client

SOURCE_META = {
    "DB": {"emoji": "🟢", "label": "DB 직접 조회", "desc": "Neo4j에서 가져온 실제 데이터입니다."},
    "DB_EMPTY": {"emoji": "🟡", "label": "DB 조회 결과 없음", "desc": "쿼리는 실행됐지만 해당 데이터가 없습니다."},
    "LLM": {"emoji": "🔴", "label": "LLM 추론", "desc": "DB 조회 실패. 환각 가능성이 있습니다."},
}

st.set_page_config(
    page_title="금융회사지배구조 — 주주 네트워크",
    page_icon="🔗",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
.stApp { background:#060810; color:#e8edf8; }
[data-testid="stSidebar"] { background:#0b0f1a; border-right:1px solid #1a2540; }
h1, h2, h3 { font-family:"Space Mono",monospace; color:#e8edf8 !important; }
[data-testid="stChatMessage"] { background:#0f1624; border:1px solid #1a2540; border-radius:8px; margin-bottom:6px; }
.stButton>button { background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.3); color:#00ff88; border-radius:4px; }
.stButton>button:hover { background:rgba(0,255,136,0.18); }
[data-testid="stMetricValue"] { color:#00ff88 !important; font-family:"Space Mono",monospace; }
code, .stCode { background:#0a0d18 !important; color:#4d9fff !important; }
.stSpinner > div { border-top-color: #00ff88 !important; }
</style>
""", unsafe_allow_html=True)

if "messages" not in st.session_state:
    st.session_state.messages = []
if "pending" not in st.session_state:
    st.session_state.pending = None


def _on_reset():
    st.session_state.messages = []
    try:
        api_client.delete_chat()
    except Exception:
        pass


render_sidebar(on_reset_click=_on_reset)

st.markdown("# 🔗 GraphIQ")
st.caption("자연어로 질문하면 Neo4j 그래프 DB에서 답변을 찾아드립니다.")

# 그래프 시각화 UI 링크
col1, col2 = st.columns([3, 1])
with col1:
    if not st.session_state.messages:
        st.info("💡 주주, 지분율, 임원보수 등을 자연어로 질문해 보세요. 왼쪽 예시를 눌러 시작할 수 있습니다.")
with col2:
    st.markdown("### 🎨 [그래프 시각화 UI →](http://localhost:8080/graph.html)")

st.divider()

for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])
        if msg["role"] == "assistant":
            src = msg.get("source", "LLM")
            meta = SOURCE_META.get(src, SOURCE_META["LLM"])
            st.caption(f"{meta['emoji']} **{meta['label']}** — {meta['desc']}")
            if msg.get("cypher"):
                with st.expander("🔍 생성된 Cypher (고급)"):
                    st.code(msg["cypher"], language="cypher")
            if msg.get("hints"):
                st.caption(f"🧠 벡터 힌트: {', '.join(msg['hints'])}")
            if msg.get("raw"):
                with st.expander(f"📋 원본 결과 ({len(msg['raw'])}건)"):
                    st.json(msg["raw"][:10])
            if msg.get("elapsed"):
                st.caption(f"⏱️ {msg['elapsed']}초")

question = st.chat_input("주주, 지분율, 임원보수 등 자유롭게 질문하세요...") or st.session_state.pop("pending", None)

if question:
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("그래프 DB 탐색 중..."):
            try:
                d = api_client.post_chat(question)
                answer = d["answer"]
                cypher = d.get("cypher", "")
                raw = d.get("raw", [])
                hints = d.get("hints", [])
                source = d.get("source", "LLM")
                confidence = d.get("confidence", "LOW")
                elapsed = d.get("elapsed", 0)
            except Exception as e:
                answer = "서버에 연결할 수 없습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요."
                cypher, raw, hints, elapsed = "", [], [], 0
                source, confidence = "LLM", "LOW"
                if "ConnectError" in type(e).__name__ or "connect" in str(e).lower():
                    answer = "서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해 주세요."

        st.markdown(answer)
        meta = SOURCE_META.get(source, SOURCE_META["LLM"])
        st.caption(f"{meta['emoji']} **{meta['label']}** — {meta['desc']}")
        if cypher:
            with st.expander("🔍 생성된 Cypher (고급)"):
                st.code(cypher, language="cypher")
        if hints:
            st.caption(f"🧠 벡터 힌트: {', '.join(hints)}")
        if raw:
            with st.expander(f"📋 원본 결과 ({len(raw)}건)"):
                st.json(raw[:10])
        if elapsed:
            st.caption(f"⏱️ {elapsed}초")

    st.session_state.messages.append({
        "role": "assistant",
        "content": answer,
        "cypher": cypher,
        "raw": raw,
        "hints": hints,
        "source": source,
        "confidence": confidence,
        "elapsed": elapsed,
    })
