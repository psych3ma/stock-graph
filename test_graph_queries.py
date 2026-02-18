#!/usr/bin/env python3
"""그래프 API 쿼리 검증 - 실제 데이터와 비교"""
import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph

load_dotenv()

graph = Neo4jGraph(
    url=os.getenv("NEO4J_URI"),
    username=os.getenv("NEO4J_USER", "neo4j"),
    password=os.getenv("NEO4J_PASSWORD"),
    enhanced_schema=True,
)

print("=" * 70)
print("🔍 그래프 API 쿼리 검증")
print("=" * 70)

# 1. 현재 API의 노드 쿼리 테스트
print("\n1️⃣ 노드 조회 쿼리 검증:")
print("-" * 70)

# Company 노드
company_q = """
    MATCH (c:Company)
    RETURN id(c) AS id, c.companyName AS label, c.bizno AS bizno,
           coalesce(c.isActive, true) AS active
    LIMIT 10
"""
company_nodes = graph.query(company_q)
print(f"Company 노드: {len(company_nodes)}개 (limit 10)")
for i, row in enumerate(company_nodes[:3], 1):
    print(f"   {i}. {row.get('label')} (id={row.get('id')})")

# Stockholder 노드
stockholder_q = """
    MATCH (s:Stockholder)
    RETURN id(s) AS id, labels(s) AS labels,
           coalesce(s.stockName, s.companyName, 'Unknown') AS label,
           coalesce(s.shareholderType, 'PERSON') AS shareholderType
    LIMIT 10
"""
stockholder_nodes = graph.query(stockholder_q)
print(f"\nStockholder 노드: {len(stockholder_nodes)}개 (limit 10)")
for i, row in enumerate(stockholder_nodes[:3], 1):
    labels = row.get('labels', [])
    print(f"   {i}. {row.get('label')} (id={row.get('id')}, labels={labels})")

# 2. 현재 API의 엣지 쿼리 테스트
print("\n2️⃣ 엣지 조회 쿼리 검증:")
print("-" * 70)

edge_q = """
    MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
    RETURN id(s) AS fromId, id(c) AS toId, r.stockRatio AS ratio
    ORDER BY r.stockRatio DESC
    LIMIT 10
"""
edges = graph.query(edge_q)
print(f"엣지: {len(edges)}개 (limit 10)")
for i, row in enumerate(edges[:3], 1):
    print(f"   {i}. n{row.get('fromId')} -> n{row.get('toId')} ({row.get('ratio')}%)")

# 3. 실제 관계 패턴 확인 (모든 HOLDS_SHARES 관계)
print("\n3️⃣ 실제 HOLDS_SHARES 관계 패턴 (전체):")
print("-" * 70)

pattern_q = """
    MATCH (a)-[r:HOLDS_SHARES]->(b)
    RETURN DISTINCT labels(a) AS fromLabels, labels(b) AS toLabels, count(r) AS cnt
    ORDER BY cnt DESC
"""
patterns = graph.query(pattern_q)
total_edges = sum(r.get('cnt', 0) for r in patterns)
print(f"총 관계 수: {total_edges:,}개")
for row in patterns:
    from_labels = str(row.get('fromLabels', []))
    to_labels = str(row.get('toLabels', []))
    cnt = row.get('cnt', 0)
    print(f"   {from_labels} -> {to_labels}: {cnt:,}개")

# 4. 현재 쿼리로 매칭되는 관계 수 확인
print("\n4️⃣ 현재 API 쿼리 매칭률:")
print("-" * 70)

current_match_q = """
    MATCH (s:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
    RETURN count(r) AS cnt
"""
current_match = graph.query(current_match_q)
current_count = current_match[0].get('cnt', 0) if current_match else 0
print(f"현재 쿼리 매칭: {current_count:,}개")
print(f"전체 관계: {total_edges:,}개")
if current_count == total_edges:
    print("   ✅ 모든 관계가 매칭됨!")
else:
    missing = total_edges - current_count
    print(f"   ⚠️ {missing:,}개 관계가 누락됨 ({missing/total_edges*100:.1f}%)")

# 5. 누락된 관계 패턴 확인
if current_count < total_edges:
    print("\n5️⃣ 누락된 관계 패턴:")
    print("-" * 70)
    missing_q = """
        MATCH (a)-[r:HOLDS_SHARES]->(b)
        WHERE NOT ('Stockholder' IN labels(a) AND 'Company' IN labels(b))
        RETURN DISTINCT labels(a) AS fromLabels, labels(b) AS toLabels, count(r) AS cnt
        ORDER BY cnt DESC
    """
    missing_patterns = graph.query(missing_q)
    for row in missing_patterns:
        from_labels = str(row.get('fromLabels', []))
        to_labels = str(row.get('toLabels', []))
        cnt = row.get('cnt', 0)
        print(f"   {from_labels} -> {to_labels}: {cnt:,}개")

# 6. Company:Stockholder 노드가 제대로 조회되는지 확인
print("\n6️⃣ Company:Stockholder 노드 조회 확인:")
print("-" * 70)

company_stockholder_q = """
    MATCH (c:Company:Stockholder)
    RETURN id(c) AS id, c.companyName AS label, labels(c) AS labels
    LIMIT 5
"""
company_stockholders = graph.query(company_stockholder_q)
print(f"Company:Stockholder 노드: {len(company_stockholders)}개")
for i, row in enumerate(company_stockholders, 1):
    print(f"   {i}. {row.get('label')} (id={row.get('id')}, labels={row.get('labels')})")

# 7. Company:Stockholder -> Company 관계 확인
print("\n7️⃣ Company:Stockholder -> Company 관계 확인:")
print("-" * 70)

cs_rel_q = """
    MATCH (cs:Company:Stockholder)-[r:HOLDS_SHARES]->(c:Company)
    RETURN count(r) AS cnt
"""
cs_rel = graph.query(cs_rel_q)
cs_count = cs_rel[0].get('cnt', 0) if cs_rel else 0
print(f"Company:Stockholder -> Company 관계: {cs_count:,}개")

print("\n" + "=" * 70)
