# Toss Community Sentiment Agent

안티그래비트가 바로 구현에 착수할 수 있도록 정리한 실행용 README입니다.

## 1. 프로젝트 개요

이 프로젝트의 목표는 **토스증권 로그인 이후 접근 가능한 커뮤니티 글/댓글을 수집**하고, 이를 AI로 분류하여 **옹호 / 비난 / 중립 비율**을 계산하는 것입니다.

핵심 목표:
- 특정 종목 또는 전체 커뮤니티의 분위기를 수치화
- 시간에 따른 여론 변화 추적
- 종목별 옹호/비난 비율 시각화
- 향후 알림 및 대시보드 기능으로 확장

> 중요한 원칙: 인증은 사용자가 직접 수행하며, 시스템은 로그인 완료 후의 세션만 재사용한다.

---

## 2. 범위

### 포함
- 토스증권 웹 로그인 이후 세션 확보
- 커뮤니티 게시글 및 댓글 수집
- 텍스트 정제
- AI 기반 라벨 분류 (`support`, `criticize`, `neutral`)
- 종목별/시간별 비율 계산
- 결과 조회 API 및 대시보드용 데이터 제공

### 제외
- 주문 실행
- 투자 판단 자동화
- 인증 우회
- 서비스 약관을 우회하기 위한 기능

---

## 3. 권장 기술 스택

### 수집 / 세션 / API
- **TypeScript**
- **Playwright**
- **Fastify** 또는 **NestJS**
- **Prisma**
- **PostgreSQL**
- **Redis** (선택)

### AI 분류
- **Python**
- **FastAPI**
- **pandas**
- **scikit-learn** 또는 **transformers**
- 초기에는 LLM 분류, 이후 소형 분류기 학습

### 프런트엔드(선택)
- React
- Next.js
- Tailwind CSS

---

## 4. 아키텍처

```text
[User]
  -> Dashboard / Admin UI

[TypeScript Layer]
  - Login Agent (Playwright)
  - Session Manager
  - Community Scraper
  - Scheduler / Job Runner
  - API Server
  - DB Writer

[Python AI Layer]
  - Text Cleaner
  - Ticker Extractor
  - Sentiment Classifier
  - Ratio Aggregator

[Storage]
  - PostgreSQL
  - Redis (optional)
  - local logs / object storage
```

---

## 5. 동작 흐름

1. 사용자가 로그인 버튼 클릭
2. Playwright가 토스증권 웹 로그인 페이지를 연다
3. 사용자가 QR 인증 또는 개인정보 인증을 직접 완료한다
4. 로그인 완료 후 세션(쿠키, localStorage, 필요한 상태값)을 저장한다
5. 스케줄러 또는 수동 요청으로 커뮤니티 글을 수집한다
6. 원문 데이터를 DB에 저장한다
7. Python 분류기가 텍스트를 라벨링한다
8. 집계 테이블에 종목별/시간별 비율을 저장한다
9. API 또는 대시보드에서 조회한다

---

## 6. 핵심 모듈 정의

### 6.1 Login Agent
책임:
- 로그인 브라우저 실행
- 사용자 인증 대기
- 인증 완료 후 세션 저장

주의사항:
- 인증을 자동으로 통과하려고 시도하지 않는다
- 로그인 실패 또는 세션 만료를 명확히 표시한다

### 6.2 Session Manager
책임:
- 저장된 세션 로드
- 세션 유효성 점검
- 만료 시 재로그인 요구
- 계정별 세션 분리 보관

### 6.3 Community Scraper
책임:
- 커뮤니티 목록 페이지 접근
- 게시글 / 상세 / 댓글 수집
- 가능하다면 내부 API(XHR/fetch) 구조 파악
- 수집 대상 정규화

수집 필드 초안:
- `post_id`
- `title`
- `body`
- `comments`
- `ticker`
- `board_name`
- `created_at`
- `author_hash`
- `url`
- `raw_json`

### 6.4 AI Classifier
책임:
- 한국어 주식 커뮤니티 텍스트 정제
- 종목/티커 추출
- 라벨 분류
- confidence score 산출

기본 라벨:
- `support`
- `criticize`
- `neutral`

추가 후보 라벨:
- `sarcasm`
- `panic`
- `promotion`
- `information`

### 6.5 Analytics / Alert Agent
책임:
- 종목별 비율 계산
- 급변 탐지
- 알림 트리거 생성

예시 규칙:
- 최근 1시간 비난 비율이 20%p 이상 급증
- 최근 3일 평균 대비 특정 종목 게시글 수가 2배 이상 증가
- 댓글 증가 + 비난 증가 동시 발생

---

## 7. 데이터 모델 초안

### posts
- `id`
- `source`
- `ticker`
- `title`
- `body`
- `author_hash`
- `created_at`
- `url`
- `raw_json`
- `inserted_at`

### comments
- `id`
- `post_id`
- `body`
- `author_hash`
- `created_at`
- `inserted_at`

### sentiment_results
- `id`
- `target_type` (`post` / `comment`)
- `target_id`
- `label`
- `confidence`
- `rationale`
- `model_version`
- `created_at`

### sentiment_aggregates
- `id`
- `ticker`
- `window_type` (`1h`, `24h`, `7d`)
- `support_ratio`
- `criticize_ratio`
- `neutral_ratio`
- `post_count`
- `computed_at`

### sessions
- `id`
- `account_name`
- `encrypted_blob`
- `expires_at`
- `updated_at`

---

## 8. API 초안

### 인증
- `POST /auth/login/start`
- `GET /auth/status`
- `POST /auth/logout`

### 수집
- `POST /crawl/run`
- `GET /crawl/jobs`
- `GET /crawl/jobs/:id`

### 게시글
- `GET /posts?ticker=...&from=...&to=...`
- `GET /posts/:id`

### 감성/분류
- `GET /sentiment/ratio?ticker=...&range=24h`
- `GET /sentiment/timeline?ticker=...`
- `POST /classify/retry/:targetId`

### 알림
- `GET /alerts`
- `POST /alerts/rules`

---

## 9. Python 서비스 인터페이스

### 엔드포인트
- `POST /classify/post`
- `POST /classify/batch`
- `POST /extract/ticker`
- `GET /health`

### 분류 요청 예시

```json
{
  "id": "post_123",
  "title": "이 종목 아직 끝난 거 아님",
  "body": "오늘 눌렸다고 끝난 거 아니다. 실적 보면 오히려 저점 매수 구간.",
  "ticker": "000000"
}
```

### 분류 응답 예시

```json
{
  "id": "post_123",
  "label": "support",
  "confidence": 0.87,
  "rationale": "저점 매수와 실적 기대를 근거로 긍정적 의견을 제시함"
}
```

---

## 10. 분류 전략

### 1단계: LLM 기반 초기 분류
- 소량 데이터에 빠르게 대응
- 프롬프트 기반 `support / criticize / neutral` 분류
- 샘플 검수로 기준 정립

### 2단계: 데이터 축적
- 사람이 일부 샘플 검수
- 주식 커뮤니티 특화 라벨셋 보정
- 욕설, 반어, 밈 사전 구축

### 3단계: 경량 모델 운영
- 로컬/사내 운영 가능한 소형 분류기 학습
- confidence 낮은 케이스만 LLM fallback

### 텍스트 처리 포인트
- 종목명 / 티커 추출
- 중복 제거
- 이모지 / 반복문자 / 줄임말 정규화
- 반어 표현 보정
- 한국 주식 커뮤니티 은어 사전 적용

---

## 11. MVP 정의

### MVP 1
- 로그인 세션 확보
- 특정 게시판 또는 특정 종목 게시글 최근 100~300개 수집
- 게시글 본문 기준 3분류
- 일별 / 주별 비율 집계
- 결과 JSON/CSV export

### MVP 2
- 댓글 포함
- 종목 자동 인식
- 종목별 비교 차트
- 알림 규칙 설정

### MVP 3
- 내부 API 기반 수집 최적화
- 실시간성 개선
- sarcasm / 선동 / 정보공유 분리

---

## 12. 비기능 요구사항

### 안정성
- 요청 간 지연 삽입
- 과도한 병렬 호출 금지
- 크롤링 실패 시 재시도 정책 필요

### 보안
- 세션 저장 데이터 암호화
- 작성자 식별 정보는 해시 처리 또는 저장 최소화
- 민감 데이터 최소 수집 원칙 적용

### 관측성
- 로그인/수집/분류/집계 단계별 로그 필요
- 실패 원인 추적 가능해야 함
- 잡 단위 실행 기록 남길 것

---

## 13. 안전 및 정책 제약

반드시 지킬 것:
- 사용자가 직접 인증 수행
- 인증 우회 시도 금지
- 자동 주문/자동 의사결정 금지
- 사용자 계정 범위 내 읽기 작업만 수행
- 원문 데이터와 작성자 정보 저장 최소화
- 결과는 참고용 지표로만 제공

---

## 14. 추천 디렉터리 구조

```text
project-root/
  apps/
    scraper-ts/
    api-ts/
    dashboard-web/
    classifier-py/
  packages/
    shared-types/
    session-core/
    sentiment-core/
  infra/
    docker/
    scripts/
  docs/
    architecture.md
    prompts.md
    labeling-guide.md
```

---

## 15. 안티그래비트 작업 순서

### Phase 1
- [ ] Playwright 로그인 플로우 구현
- [ ] 세션 저장 및 복원 구현
- [ ] 커뮤니티 페이지 접근 확인
- [ ] 게시글 목록/상세 추출 구현

### Phase 2
- [ ] PostgreSQL 스키마 생성
- [ ] 수집 데이터 적재 파이프라인 구현
- [ ] Python 분류 서비스 골격 구현
- [ ] 3분류 API 연결

### Phase 3
- [ ] 집계 테이블 생성
- [ ] 종목별 비율 계산 로직 구현
- [ ] 간단한 조회 API 제공
- [ ] CSV export 지원

### Phase 4
- [ ] 대시보드 화면 구현
- [ ] 알림 규칙 추가
- [ ] 운영 로그/에러 처리 강화

---

## 16. 첫 번째 산출물

안티그래비트의 첫 번째 목표는 아래 4개입니다.

1. 로그인 후 세션 저장이 가능한 Playwright 스크립트
2. 게시글 100건 수집이 가능한 스크래퍼
3. Python 분류 API와의 연동
4. 종목 1개 기준 `support / criticize / neutral` 비율 반환 API

---

## 17. 성공 기준

초기 성공 기준은 다음과 같습니다.
- 사용자가 로그인 후 세션을 저장할 수 있다
- 특정 종목 관련 게시글을 안정적으로 수집할 수 있다
- 게시글별 라벨링 결과를 저장할 수 있다
- 최근 24시간 기준 옹호/비난/중립 비율을 반환할 수 있다

---

## 18. 메모

이 프로젝트의 가장 어려운 부분은 단순 크롤링이 아니라 다음 3가지다.
- 세션 안정성
- 토스증권 웹 구조 변경 대응
- 한국어 투자 커뮤니티 문맥 분류 정확도

따라서 초기 단계에서는 **빠른 MVP**를 우선하고, 이후 내부 API 분석과 분류기 고도화로 확장하는 것이 바람직하다.
