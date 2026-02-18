.PHONY: install install-be install-fe test run-be run-fe stop-be check-be serve-graph up down env check-docker

env:
	cp -n .env.example .env 2>/dev/null || true
	@echo "✅ .env 파일 생성됨. Neo4j와 OpenAI 키를 입력하세요."

install: install-be install-fe

install-be:
	cd backend && pip install -r requirements.txt

install-fe:
	cd frontend && pip install -r requirements.txt

test:
	cd backend && PYTHONPATH=. pytest tests -v

# Backend 연결 확인 (브라우저 연결 실패 시 진단용)
check-be:
	@echo "Backend 연결 확인 중... (http://localhost:8000/ping)"
	@curl -sf http://localhost:8000/ping >/dev/null && echo "✅ Backend 정상. 브라우저에서 '다시 시도' 또는 새로고침하세요." || (echo "❌ Backend에 연결되지 않습니다."; echo ""; echo "다음 순서로 실행하세요:"; echo "  1. make stop-be   (포트 8000 사용 중이면)"; echo "  2. make run-be   (새 터미널에서 백엔드 실행)"; echo "  3. 브라우저에서 이 페이지 새로고침"; echo ""; exit 1)

run-be:
	@pid=$$(lsof -ti :8000 2>/dev/null); \
	if [ -n "$$pid" ]; then \
	  echo "⚠️  포트 8000이 이미 사용 중입니다 (PID $$pid)."; \
	  echo "   먼저 실행: make stop-be"; \
	  echo "   그 다음:   make run-be"; \
	  exit 1; \
	fi
	@echo "🚀 Backend 시작: http://localhost:8000"
	cd backend && PYTHONPATH=. uvicorn app.main:api --reload --host 0.0.0.0 --port 8000

# 포트 8000 사용 중인 프로세스 종료 (Address already in use 시 사용)
stop-be:
	@pid=$$(lsof -ti :8000 2>/dev/null); \
	if [ -n "$$pid" ]; then \
	  echo "포트 8000 사용 중인 프로세스 종료: $$pid"; \
	  kill -9 $$pid 2>/dev/null || true; \
	  echo "✅ 종료됨. 이제 make run-be 로 다시 시작하세요."; \
	else \
	  echo "포트 8000에서 실행 중인 프로세스 없음."; \
	fi

run-fe:
	@echo "🎨 Frontend 시작: http://localhost:8501"
	cd frontend && streamlit run main.py --server.port 8501

# 그래프 HTML을 http로 서빙 (file:// 로 열면 연결 실패할 때 사용)
serve-graph:
	@echo "📂 그래프 UI: http://localhost:8080/graph.html (Backend는 make run-be 로 별도 실행)"
	cd frontend && python3 -m http.server 8080

check-docker:
	@which docker > /dev/null 2>&1 || (echo "❌ Docker가 설치되어 있지 않습니다." && echo "   설치: https://www.docker.com/products/docker-desktop" && echo "   또는 'make run-be' 와 'make run-fe' 로 로컬 실행 가능" && exit 1)
	@which docker-compose > /dev/null 2>&1 || docker compose version > /dev/null 2>&1 || (echo "❌ docker-compose가 없습니다." && exit 1)

up: check-docker
	@echo "🐳 Docker Compose로 서비스 시작..."
	docker compose up --build

down: check-docker
	docker compose down

help:
	@echo "GraphIQ Makefile 명령어:"
	@echo ""
	@echo "  make env          - .env 파일 생성"
	@echo "  make install      - 의존성 설치 (backend + frontend)"
	@echo "  make run-be       - Backend 로컬 실행 (포트 8000)"
	@echo "  make stop-be      - 포트 8000 사용 프로세스 종료 (Address already in use 시)"
	@echo "  make check-be     - Backend 연결 확인 (연결 실패 시 진단)"
	@echo "  make run-fe       - Frontend 로컬 실행 (포트 8501)"
	@echo "  make serve-graph  - 그래프 HTML 서빙 (http://localhost:8080/graph.html)"
	@echo "  make up           - Docker Compose로 전체 실행"
	@echo "  make test         - Backend 테스트 실행"
	@echo ""
	@echo "💡 Docker 없이 실행:"
	@echo "   1. make install"
	@echo "   2. 터미널 1: make run-be"
	@echo "   3. 터미널 2: make run-fe"
