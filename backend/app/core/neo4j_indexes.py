"""
Neo4j 인덱스 및 제약 조건 관리.
앱 기동 시 또는 수동 호출로 인덱스 생성/확인.
"""
import logging
from typing import List, Tuple

from neo4j.exceptions import ClientError

from app.services import graph_service

logger = logging.getLogger(__name__)


# ── 인덱스 정의 (우선순위별) ────────────────────────────────────────────────

# P0 - Critical: 성능에 직접적인 영향
CRITICAL_INDEXES: List[Tuple[str, str]] = [
    # 텍스트 검색 인덱스 (Neo4j 5.x+)
    (
        "company_name_text",
        "CREATE TEXT INDEX company_name_text IF NOT EXISTS FOR (c:Company) ON (c.companyName)",
    ),
    (
        "stockholder_name_text",
        "CREATE TEXT INDEX stockholder_name_text IF NOT EXISTS FOR (s:Stockholder) ON (s.stockName)",
    ),
    # 범위 검색 인덱스 (지분율 필터링)
    (
        "holds_shares_ratio",
        "CREATE INDEX holds_shares_ratio IF NOT EXISTS FOR ()-[r:HOLDS_SHARES]-() ON (r.stockRatio)",
    ),
]

# P1 - High: 데이터 무결성 및 고유성
UNIQUE_CONSTRAINTS: List[Tuple[str, str]] = [
    (
        "bizno_unique",
        "CREATE CONSTRAINT bizno_unique IF NOT EXISTS FOR (c:Company) REQUIRE c.bizno IS UNIQUE",
    ),
]

# P2 - Medium: 존재 제약 조건 및 복합 인덱스
EXISTENCE_CONSTRAINTS: List[Tuple[str, str]] = [
    (
        "company_name_exists",
        "CREATE CONSTRAINT company_name_exists IF NOT EXISTS FOR (c:Company) REQUIRE c.companyName IS NOT NULL",
    ),
]

COMPOSITE_INDEXES: List[Tuple[str, str]] = [
    (
        "company_active",
        "CREATE INDEX company_active IF NOT EXISTS FOR (c:Company) ON (c.isActive, c.companyName)",
    ),
]


def ensure_indexes() -> dict:
    """
    모든 필수 인덱스 및 제약 조건을 생성합니다.
    
    Returns:
        {
            "created": [인덱스명 리스트],
            "skipped": [인덱스명 리스트],
            "errors": [에러 메시지 리스트]
        }
    """
    graph = graph_service.get_graph()
    created = []
    skipped = []
    errors = []
    
    all_indexes = (
        CRITICAL_INDEXES
        + [(name, query) for name, query in UNIQUE_CONSTRAINTS]
        + [(name, query) for name, query in EXISTENCE_CONSTRAINTS]
        + [(name, query) for name, query in COMPOSITE_INDEXES]
    )
    
    for name, query in all_indexes:
        try:
            graph.query(query)
            created.append(name)
            logger.info(f"✅ Index/Constraint created: {name}")
        except ClientError as e:
            # 이미 존재하거나 Neo4j 버전 미지원 등
            error_code = getattr(e, "code", "")
            if "already exists" in str(e).lower() or error_code == "Neo.ClientError.Schema.EquivalentSchemaRuleAlreadyExists":
                skipped.append(name)
                logger.debug(f"⏭️  Index/Constraint already exists: {name}")
            else:
                errors.append(f"{name}: {str(e)}")
                logger.warning(f"⚠️  Failed to create {name}: {e}")
        except Exception as e:
            errors.append(f"{name}: {str(e)}")
            logger.error(f"❌ Unexpected error creating {name}: {e}", exc_info=True)
    
    result = {
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }
    
    logger.info(
        f"Index creation summary: {len(created)} created, "
        f"{len(skipped)} skipped, {len(errors)} errors"
    )
    
    return result


def verify_indexes() -> dict:
    """
    현재 생성된 인덱스 및 제약 조건을 확인합니다.
    
    Returns:
        {
            "indexes": [인덱스 정보 리스트],
            "constraints": [제약 조건 정보 리스트]
        }
    """
    graph = graph_service.get_graph()
    
    try:
        # 인덱스 조회
        indexes_query = "SHOW INDEXES"
        indexes_result = graph.query(indexes_query)
        
        # 제약 조건 조회
        constraints_query = "SHOW CONSTRAINTS"
        constraints_result = graph.query(constraints_query)
        
        return {
            "indexes": [dict(row) for row in indexes_result],
            "constraints": [dict(row) for row in constraints_result],
        }
    except Exception as e:
        logger.error(f"Failed to verify indexes: {e}", exc_info=True)
        return {"indexes": [], "constraints": [], "error": str(e)}


# ── 앱 기동 시 자동 실행 (선택적) ────────────────────────────────────────────

def init_indexes_on_startup():
    """
    앱 기동 시 인덱스를 자동 생성합니다.
    main.py에서 호출하거나 별도 스크립트로 실행.
    """
    try:
        result = ensure_indexes()
        if result["errors"]:
            logger.warning(
                f"Some indexes failed to create: {result['errors']}. "
                "The app will continue, but performance may be degraded."
            )
        return result
    except Exception as e:
        logger.error(f"Failed to initialize indexes on startup: {e}", exc_info=True)
        # 앱 기동은 계속 진행 (인덱스 없이도 동작 가능)
        return {"created": [], "skipped": [], "errors": [str(e)]}
