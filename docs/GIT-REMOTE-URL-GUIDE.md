# Git 원격 저장소 URL 설정 가이드

**작성 일자**: 2026-02-19

---

## 📋 현재 원격 저장소 URL 확인

### 명령어

```bash
# 원격 저장소 목록 확인
git remote -v

# 특정 원격 저장소 URL 확인
git config --get remote.origin.url
```

---

## 🔧 원격 저장소 URL 설정 방법

### 1. 원격 저장소 추가 (처음 설정)

**명령어**:
```bash
git remote add origin <URL>
```

**예시**:
```bash
# HTTPS 방식
git remote add origin https://github.com/username/repo.git

# SSH 방식
git remote add origin git@github.com:username/repo.git
```

---

### 2. 원격 저장소 URL 변경

**명령어**:
```bash
git remote set-url origin <새로운_URL>
```

**예시**:
```bash
# HTTPS로 변경
git remote set-url origin https://github.com/username/repo.git

# SSH로 변경
git remote set-url origin git@github.com:username/repo.git
```

---

### 3. 원격 저장소 URL 확인

**명령어**:
```bash
# 간단 확인
git remote -v

# 상세 확인
git config --get remote.origin.url

# 모든 원격 저장소 확인
git remote show origin
```

---

## 🌐 URL 형식

### HTTPS 방식

**형식**:
```
https://github.com/username/repository.git
```

**장점**:
- 설정 간단 (인증 정보만 입력)
- 방화벽 통과 용이

**단점**:
- 매번 인증 정보 입력 필요 (토큰 사용 시 해결)

**예시**:
```bash
git remote set-url origin https://github.com/psych3ma/fnco-graph.git
```

---

### SSH 방식

**형식**:
```
git@github.com:username/repository.git
```

**장점**:
- 인증 정보 자동 사용 (SSH 키 설정 시)
- 보안성 높음

**단점**:
- SSH 키 설정 필요
- 방화벽 설정 필요할 수 있음

**예시**:
```bash
git remote set-url origin git@github.com:psych3ma/fnco-graph.git
```

---

## 🔍 현재 프로젝트 설정 확인

### 확인 명령어

```bash
# 원격 저장소 목록
git remote -v

# 현재 URL 확인
git config --get remote.origin.url
```

**예상 결과**:
```
origin  https://github.com/psych3ma/fnco-graph.git (fetch)
origin  https://github.com/psych3ma/fnco-graph.git (push)
```

---

## 📝 URL 변경 예시

### HTTPS로 변경

```bash
git remote set-url origin https://github.com/psych3ma/fnco-graph.git
```

### SSH로 변경

```bash
git remote set-url origin git@github.com:psych3ma/fnco-graph.git
```

### 커스텀 도메인 사용

```bash
# 예: GitHub Enterprise 또는 자체 Git 서버
git remote set-url origin https://git.example.com/username/repo.git
```

---

## ✅ 변경 후 확인

### 1. URL 확인

```bash
git remote -v
```

### 2. 연결 테스트

```bash
git fetch origin
```

### 3. Push 테스트

```bash
git push origin main
```

---

## 🎯 권장 설정

### 개인 프로젝트

**SSH 방식 권장**:
```bash
git remote set-url origin git@github.com:username/repo.git
```

**이유**:
- 인증 자동화
- 보안성 높음

---

### 팀 프로젝트

**HTTPS 방식 권장**:
```bash
git remote set-url origin https://github.com/username/repo.git
```

**이유**:
- 설정 간단
- 방화벽 통과 용이

---

## 📚 관련 파일

### Git 설정 파일

**위치**: `.git/config`

**내용 예시**:
```ini
[remote "origin"]
    url = https://github.com/psych3ma/fnco-graph.git
    fetch = +refs/heads/*:refs/remotes/origin/*
```

**직접 편집 가능**:
- `.git/config` 파일을 직접 편집하여 URL 변경 가능
- 하지만 `git remote set-url` 명령어 사용 권장

---

## 🔧 문제 해결

### 인증 오류 시

**HTTPS 방식**:
- Personal Access Token 사용
- GitHub Settings → Developer settings → Personal access tokens

**SSH 방식**:
- SSH 키 설정 확인: `ssh -T git@github.com`
- SSH 키 추가: GitHub Settings → SSH and GPG keys

---

### 연결 테스트

```bash
# HTTPS
git ls-remote https://github.com/username/repo.git

# SSH
git ls-remote git@github.com:username/repo.git
```

---

## 🎯 결론

**원격 저장소 URL 설정 위치**:
1. **명령어로 설정**: `git remote set-url origin <URL>`
2. **설정 파일**: `.git/config` (직접 편집 가능하나 권장하지 않음)

**확인 방법**:
- `git remote -v`
- `git config --get remote.origin.url`

**권장 방식**:
- 개인 프로젝트: SSH
- 팀 프로젝트: HTTPS
