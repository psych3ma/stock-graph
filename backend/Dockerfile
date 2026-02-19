FROM python:3.11-slim
WORKDIR /app

# P0: PyGraphviz 지원을 위한 Graphviz 시스템 라이브러리 설치
RUN apt-get update && \
    apt-get install -y graphviz graphviz-dev pkg-config && \
    rm -rf /var/lib/apt/lists/*

# 기본 requirements (NetworkX 포함)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# P0: PyGraphviz 선택 설치 (실패해도 계속 진행, NetworkX 폴백 사용)
COPY requirements-pygraphviz.txt .
RUN pip install --no-cache-dir -r requirements-pygraphviz.txt || echo "PyGraphviz 설치 실패, NetworkX만 사용"

COPY . .
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "app.main:api", "--host", "0.0.0.0", "--port", "8000"]
