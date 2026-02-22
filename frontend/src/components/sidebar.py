"""사이드바: DB 현황, 예시 질문, 대화 초기화."""
import streamlit as st

from src.services import api_client

EXAMPLE_QUESTIONS = [
    "지분율 50% 이상인 최대주주 목록",
    "국민연금이 5% 이상 보유한 회사",
    "2022년 등기임원 평균보수 TOP 5",
    "3개 이상 법인에 투자한 주주",
    "법인 주주가 있는 회사 목록",
]


def render_sidebar(on_example_click=None, on_reset_click=None):
    with st.sidebar:
        st.markdown("## 🔗 금융회사지배구조")
        st.caption("주주 네트워크 자연어 질의 서비스")
        st.divider()

        # DB 현황 (로드 시 1회 + 새로고침 버튼)
        if "db_stats" not in st.session_state:
            st.session_state.db_stats = None
        if st.button("📊 DB 현황 새로고침", use_container_width=True):
            st.session_state.db_stats = None
        try:
            if st.session_state.db_stats is None:
                st.session_state.db_stats = api_client.get_stats()
            data = st.session_state.db_stats
            cols = st.columns(2)
            for i, node in enumerate(data.get("nodes", [])[:4]):
                cols[i % 2].metric(node.get("l") or "기타", f"{node.get('n', 0):,}")
        except Exception:
            st.caption("API 연결 후 DB 현황을 불러옵니다.")

        st.divider()
        st.markdown("**💡 예시 질문**")
        for ex in EXAMPLE_QUESTIONS:
            if st.button(ex, key=f"ex_{hash(ex)}"):
                if on_example_click:
                    on_example_click(ex)
                else:
                    st.session_state.pending = ex
                st.rerun()

        st.divider()
        if st.button("🗑️ 대화 초기화", use_container_width=True):
            if on_reset_click:
                on_reset_click()
            else:
                st.session_state.messages = []
                try:
                    api_client.delete_chat()
                except Exception:
                    pass
            st.rerun()
