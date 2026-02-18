#!/usr/bin/env python3
"""Neo4j 연결 테스트 스크립트"""
import os
import sys
from dotenv import load_dotenv

# .env 로드
load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")

print("=" * 60)
print("🔌 Neo4j 연결 테스트")
print("=" * 60)
print(f"URI      : {NEO4J_URI}")
print(f"USER     : {NEO4J_USER}")
print(f"PASSWORD : {'*' * len(NEO4J_PASSWORD) if NEO4J_PASSWORD else '(없음)'}")
print()

if not NEO4J_URI or not NEO4J_PASSWORD:
    print("❌ NEO4J_URI 또는 NEO4J_PASSWORD가 설정되지 않았습니다.")
    sys.exit(1)

try:
    from neo4j import GraphDatabase
    from langchain_neo4j import Neo4jGraph
    
    print("📦 라이브러리 로드 완료")
    print()
    
    # 1. 기본 드라이버 연결 테스트
    print("1️⃣ 기본 Neo4j 드라이버 연결 테스트...")
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    
    with driver.session() as session:
        result = session.run("RETURN 1 as test")
        record = result.single()
        if record and record["test"] == 1:
            print("   ✅ 기본 연결 성공!")
    
    # 2. Neo4jGraph (LangChain) 연결 테스트
    print()
    print("2️⃣ Neo4jGraph (LangChain) 연결 테스트...")
    graph = Neo4jGraph(
        url=NEO4J_URI,
        username=NEO4J_USER,
        password=NEO4J_PASSWORD,
        enhanced_schema=True,
    )
    graph.refresh_schema()
    print("   ✅ Neo4jGraph 연결 성공!")
    
    # 3. 스키마 및 노드/관계 통계
    print()
    print("3️⃣ DB 스키마 및 통계 조회...")
    print()
    
    # 노드 통계
    nodes_query = "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC LIMIT 10"
    nodes = graph.query(nodes_query)
    
    print("📊 노드 통계:")
    total_nodes = 0
    for row in nodes:
        label = row.get("label") or "기타"
        cnt = row.get("cnt", 0)
        total_nodes += cnt
        print(f"   {label:<25} {cnt:>10,}개")
    
    if not nodes:
        print("   (노드가 없습니다)")
    else:
        print(f"   {'총계':<25} {total_nodes:>10,}개")
    
    print()
    
    # 관계 통계
    rels_query = "MATCH ()-[r]->() RETURN type(r) AS rel_type, count(r) AS cnt ORDER BY cnt DESC LIMIT 10"
    rels = graph.query(rels_query)
    
    print("🔗 관계 통계:")
    total_rels = 0
    for row in rels:
        rel_type = row.get("rel_type") or "기타"
        cnt = row.get("cnt", 0)
        total_rels += cnt
        print(f"   {rel_type:<25} {cnt:>10,}개")
    
    if not rels:
        print("   (관계가 없습니다)")
    else:
        print(f"   {'총계':<25} {total_rels:>10,}개")
    
    # 4. Company 노드 샘플 확인
    print()
    print("4️⃣ Company 노드 샘플 (최대 5개)...")
    company_query = "MATCH (c:Company) RETURN c.companyName AS name, c.bizno AS bizno LIMIT 5"
    companies = graph.query(company_query)
    
    if companies:
        for i, row in enumerate(companies, 1):
            name = row.get("name", "N/A")
            bizno = row.get("bizno", "N/A")
            print(f"   {i}. {name} (사업자번호: {bizno})")
    else:
        print("   (Company 노드가 없습니다)")
    
    print()
    print("=" * 60)
    print("✅ Neo4j 연결 및 데이터 조회 성공!")
    print("=" * 60)
    
    driver.close()
    
except ImportError as e:
    print(f"❌ 라이브러리 누락: {e}")
    print("   설치: pip install neo4j langchain-neo4j python-dotenv")
    sys.exit(1)
except Exception as e:
    print(f"❌ 연결 실패: {e}")
    print()
    print("가능한 원인:")
    print("  1. Neo4j Aura URI/비밀번호 오류")
    print("  2. 네트워크 연결 문제")
    print("  3. Neo4j 서버가 다운됨")
    sys.exit(1)
