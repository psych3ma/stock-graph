#!/usr/bin/env python3
"""Neo4j 스키마 상세 분석 - 시각화 검증용"""
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
graph.refresh_schema()

print("=" * 70)
print("🔍 Neo4j 스키마 상세 분석")
print("=" * 70)

# 1. 모든 노드 레이블 조회
print("\n1️⃣ 노드 레이블 (모든 조합):")
labels_query = """
    MATCH (n)
    RETURN DISTINCT labels(n) AS labels, count(n) AS cnt
    ORDER BY cnt DESC
    LIMIT 20
"""
for row in graph.query(labels_query):
    labels = row.get("labels", [])
    cnt = row.get("cnt", 0)
    labels_str = str(labels)
    print(f"   {labels_str:<40} {cnt:>8,}개")

# 2. Company 노드 속성 샘플
print("\n2️⃣ Company 노드 속성 샘플:")
company_sample = graph.query("""
    MATCH (c:Company)
    RETURN properties(c) AS props
    LIMIT 1
""")
if company_sample:
    props = company_sample[0].get("props", {})
    print(f"   속성 키: {list(props.keys())[:10]}")
    print(f"   샘플: {dict(list(props.items())[:5])}")

# 3. Person 노드 속성 샘플
print("\n3️⃣ Person 노드 속성 샘플:")
person_sample = graph.query("""
    MATCH (p:Person)
    RETURN properties(p) AS props
    LIMIT 1
""")
if person_sample:
    props = person_sample[0].get("props", {})
    print(f"   속성 키: {list(props.keys())[:10]}")
    print(f"   샘플: {dict(list(props.items())[:5])}")

# 4. Stockholder 레이블 존재 여부
print("\n4️⃣ Stockholder 레이블 확인:")
stockholder_check = graph.query("""
    MATCH (n)
    WHERE 'Stockholder' IN labels(n)
    RETURN labels(n) AS labels, count(n) AS cnt
    LIMIT 5
""")
if stockholder_check:
    for row in stockholder_check:
        print(f"   {row.get('labels')}: {row.get('cnt')}개")
else:
    print("   ⚠️ 'Stockholder' 레이블이 없습니다!")

# 5. MajorShareholder 레이블 존재 여부
print("\n5️⃣ MajorShareholder 레이블 확인:")
major_check = graph.query("""
    MATCH (n)
    WHERE 'MajorShareholder' IN labels(n)
    RETURN labels(n) AS labels, count(n) AS cnt
    LIMIT 5
""")
if major_check:
    for row in major_check:
        print(f"   {row.get('labels')}: {row.get('cnt')}개")
else:
    print("   ⚠️ 'MajorShareholder' 레이블이 없습니다!")

# 6. HOLDS_SHARES 관계 구조
print("\n6️⃣ HOLDS_SHARES 관계 구조:")
holds_shares_sample = graph.query("""
    MATCH (a)-[r:HOLDS_SHARES]->(b)
    RETURN labels(a) AS fromLabels, labels(b) AS toLabels, 
           keys(r) AS relProps, count(r) AS cnt
    LIMIT 5
""")
for row in holds_shares_sample:
    print(f"   {row.get('fromLabels')} -[:HOLDS_SHARES]-> {row.get('toLabels')}")
    print(f"      속성: {row.get('relProps')}")
    print(f"      개수: {row.get('cnt')}개")
    print()

# 7. 실제 관계 패턴 확인
print("\n7️⃣ 실제 관계 패턴 (Person/Company → Company):")
pattern_check = graph.query("""
    MATCH (a)-[r:HOLDS_SHARES]->(c:Company)
    RETURN DISTINCT labels(a) AS fromLabels, count(r) AS cnt
    ORDER BY cnt DESC
    LIMIT 10
""")
for row in pattern_check:
    print(f"   {row.get('fromLabels')} -> Company: {row.get('cnt')}개")

# 8. 속성명 확인 (stockName vs name)
print("\n8️⃣ Person 노드의 주주명 속성 확인:")
person_name_check = graph.query("""
    MATCH (p:Person)
    WHERE p.stockName IS NOT NULL OR p.name IS NOT NULL
    RETURN keys(p) AS keys, count(p) AS cnt
    LIMIT 1
""")
if person_name_check:
    keys = person_name_check[0].get("keys", [])
    print(f"   속성 키: {keys}")
    if "stockName" in keys:
        print("   ✅ stockName 속성 존재")
    if "name" in keys:
        print("   ⚠️ name 속성도 존재 (stockName 우선 사용)")

print("\n" + "=" * 70)
