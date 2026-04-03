# EXIT Radar 개발 명세서

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | EXIT Radar |
| 프로젝트 목적 | 투자자가 보유 종목의 출구 리스크를 빠르게 파악하고, 보유/관망/일부익절/비중축소 등의 판단을 할 수 있도록 지원하는 모바일 앱 |
| 핵심 가치 | 내부자 거래, 기관 보유 변화, 가격/거래량 이상 신호를 통합하여 행동 가능한 리스크 정보 제공 |
| 대상 플랫폼 | Flutter 모바일 앱 / Node.js 백엔드 / MongoDB / Redis |
| 개발 방향 | 객체지향 기반, MVC 패턴, Repository 구조, 확장성 중심 설계 |

---

## 2. 핵심 기능 명세

| 기능 ID | 기능명 | 설명 | 입력 | 출력 | 비고 |
|---|---|---|---|---|---|
| F-01 | 워치리스트 조회 | 등록된 관심 종목 목록 조회 | 사용자 요청 | 워치리스트 리스트 | 홈/워치리스트 화면 연동 |
| F-02 | 워치리스트 추가 | 티커를 워치리스트에 등록 | ticker | 등록 결과, sync 예약 | 중복 입력 방지 |
| F-03 | 워치리스트 삭제 | 등록된 종목 삭제 | ticker | 삭제 결과 | 스와이프 삭제 지원 |
| F-04 | 레이더 피드 조회 | 리스크 높은 순으로 종목 정렬 표시 | 없음 | 리스크 피드 리스트 | 홈 화면 핵심 기능 |
| F-05 | 종목 요약 조회 | 개별 종목의 리스크 요약 정보 조회 | ticker | 점수, 레벨, 액션, 요약 | 상세 화면 상단 |
| F-06 | 시그널 조회 | 위험 시그널 목록 조회 | ticker | 시그널 리스트 | 추세 훼손, 거래량 이상 등 |
| F-07 | 내부자 거래 조회 | SEC 기반 내부자 거래 내역 조회 | ticker | insider trade 리스트 | 매수/매도 구분 포함 |
| F-08 | 기관 보유 조회 | 기관 보유 및 증감 정보 조회 | ticker | institution holding 리스트 | 향후 trim/increase 확장 |
| F-09 | 가격 히스토리 조회 | 가격 및 거래량 히스토리 조회 | ticker | OHLCV 리스트 | 차트 표시용 |
| F-10 | 종목 수동 새로고침 | 개별 종목 데이터 재동기화 요청 | ticker | refresh 요청 결과 | 워커 큐 연동 |
| F-11 | 알림 조회 | 리스크 이벤트 알림 목록 조회 | 없음 | alert 리스트 | 읽음 처리 가능 |
| F-12 | 알림 읽음 처리 | 특정 알림을 읽음 상태로 전환 | alert id | 처리 결과 | 상세 화면 이동 연계 |
| F-13 | 디바이스 등록 | 푸시 알림용 디바이스 등록 | token | 등록 결과 | 향후 푸시 연동 |
| F-14 | 디바이스 해제 | 등록된 디바이스 제거 | token | 삭제 결과 | 로그아웃/재설치 대응 |
| F-15 | 설정 조회 | 서버/앱 상태 확인 | 없음 | 설정 정보 | 개발/운영 확인용 |

---

## 3. 화면 명세

| 화면 ID | 화면명 | 목적 | 주요 구성 요소 | 진입 경로 |
|---|---|---|---|---|
| S-01 | 홈 화면 | 리스크 높은 종목을 빠르게 파악 | 타이틀, 레이더 피드, 점수/레벨 배지, 액션 문구 | 앱 시작 시 기본 |
| S-02 | 워치리스트 화면 | 관심 종목 추가/삭제/조회 | 티커 입력창, 추가 버튼, 종목 리스트, 빈 상태 메시지 | 하단 탭 |
| S-03 | 티커 상세 화면 | 개별 종목 분석 정보 종합 조회 | 헤더 카드, 점수, 차트, 시그널, 내부자 거래, 기관 보유, sync 상태 | 홈/워치리스트 선택 |
| S-04 | 알림 화면 | 최근 리스크 이벤트 확인 | 알림 리스트, 레벨 색상, 시간, 상세 이동 | 하단 탭 |
| S-05 | 설정 화면 | 앱 환경/상태 관리 | 서버 정보, 알림 상태, 앱 버전, 디버그 옵션 | 하단 탭 또는 메뉴 |

---

## 4. 사용자 흐름

| 흐름 ID | 시나리오 | 절차 |
|---|---|---|
| U-01 | 종목 추가 | 사용자가 티커 입력 → 추가 요청 → 서버 등록 → sync 예약 → 워치리스트 갱신 |
| U-02 | 홈 분석 확인 | 앱 실행 → 레이더 피드 호출 → 리스크 높은 종목 순 정렬 → 카드 표시 |
| U-03 | 상세 분석 확인 | 종목 선택 → 요약/시그널/차트/내부자/기관 API 호출 → 상세 화면 렌더링 |
| U-04 | 수동 새로고침 | 상세 화면에서 새로고침 버튼 클릭 → refresh API 호출 → sync 상태 표시 |
| U-05 | 알림 확인 | 알림 화면 진입 → alert 조회 → 항목 선택 → 읽음 처리 → 상세 이동 |

---

## 5. 시스템 아키텍처

| 계층 | 기술 | 역할 |
|---|---|---|
| Frontend | Flutter | 사용자 UI/UX 제공 |
| Backend API | Node.js + TypeScript | 앱 요청 처리, 데이터 제공 |
| Database | MongoDB | 종목, 리스크 스냅샷, 알림 등 저장 |
| Cache / Queue | Redis | sync 큐, 캐시, 중복 처리 |
| Worker | Node.js Worker | 종목별 외부 데이터 수집 및 정규화 |
| External Provider | Alpha Vantage, SEC Form 4 | 가격/거래량/내부자 데이터 제공 |

---

## 6. Flutter 구조 명세

| 계층 | 역할 | 구성 요소 |
|---|---|---|
| Model | API 응답 및 도메인 데이터 구조 | DTO, Entity, Parser |
| View | 화면과 UI 렌더링 | Screen, Widget, Layout |
| Controller | 상태 관리 및 사용자 액션 처리 | 화면 단위 Controller |
| Repository | API와 비즈니스 계층 연결 | Interface, Impl |
| Service | HTTP 통신 및 공통 처리 | API Client, Error Handler |

### 구조 원칙
| 항목 | 내용 |
|---|---|
| 설계 패턴 | MVC + Repository |
| 목표 | 테스트 용이성, 유지보수성, API 변경 대응 |
| 원칙 | View에는 비즈니스 로직 최소화, Controller는 상태 관리 집중 |
| 확장성 | Mock/실데이터 교체 가능, 로컬 캐시/추가 Provider 확장 용이 |

---

## 7. API 명세

### 7.1 워치리스트 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | /v1/watchlist | 워치리스트 조회 | - | 워치리스트 배열 |
| POST | /v1/watchlist | 종목 추가 | `{ "ticker": "AAPL" }` | 등록 결과 |
| DELETE | /v1/watchlist/:ticker | 종목 삭제 | Path: ticker | 삭제 결과 |

### 7.2 티커 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | /v1/tickers/:ticker/summary | 종목 요약 조회 | Path: ticker | score, level, action, summary |
| GET | /v1/tickers/:ticker/signals | 위험 시그널 조회 | Path: ticker | signal 리스트 |
| GET | /v1/tickers/:ticker/insiders | 내부자 거래 조회 | Path: ticker | insider trade 리스트 |
| GET | /v1/tickers/:ticker/price-history | 가격 히스토리 조회 | Path: ticker | OHLCV 배열 |
| GET | /v1/tickers/:ticker/institutions | 기관 보유 조회 | Path: ticker | institution 리스트 |
| POST | /v1/tickers/:ticker/refresh | 수동 새로고침 | Path: ticker | refresh 상태 |

### 7.3 레이더 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | /v1/radar/feed | 레이더 피드 조회 | - | 종목 리스크 피드 배열 |

### 7.4 알림 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| GET | /v1/alerts | 알림 목록 조회 | - | alert 배열 |
| PATCH | /v1/alerts/:id/read | 알림 읽음 처리 | Path: id | 처리 결과 |

### 7.5 디바이스 API

| Method | Endpoint | 설명 | Request | Response |
|---|---|---|---|---|
| POST | /v1/devices/register | 디바이스 등록 | token 정보 | 등록 결과 |
| DELETE | /v1/devices/:token | 디바이스 삭제 | Path: token | 삭제 결과 |

---

## 8. 데이터 모델 명세

### 8.1 WatchlistItem

| 필드명 | 타입 | 설명 |
|---|---|---|
| ticker | string | 종목 티커 |
| companyName | string | 종목명 |
| createdAt | datetime | 등록 시각 |

### 8.2 RiskSnapshot

| 필드명 | 타입 | 설명 |
|---|---|---|
| ticker | string | 종목 티커 |
| companyName | string | 종목명 |
| score | number | 리스크 점수 |
| level | string | Low / Medium / High / Critical |
| action | string | 보유 / 관망 / 일부익절 / 비중축소 |
| summary | string | 요약 설명 |
| factors | array | 리스크 요인 목록 |
| snapshot | object | 계산된 스냅샷 데이터 |
| institutionSummary | object | 기관 요약 |
| asOf | datetime | 기준 시각 |

### 8.3 RiskFactor

| 필드명 | 타입 | 설명 |
|---|---|---|
| type | string | 시그널 유형 |
| title | string | 시그널 제목 |
| description | string | 상세 설명 |
| weight | number | 반영 가중치 |
| detectedAt | datetime | 감지 시각 |

### 8.4 PriceBar

| 필드명 | 타입 | 설명 |
|---|---|---|
| time | datetime | 시점 |
| open | number | 시가 |
| high | number | 고가 |
| low | number | 저가 |
| close | number | 종가 |
| volume | number | 거래량 |

### 8.5 InsiderTrade

| 필드명 | 타입 | 설명 |
|---|---|---|
| insiderName | string | 내부자 이름 |
| role | string | 직책 |
| side | string | BUY / SELL |
| shares | number | 거래 수량 |
| pricePerShare | number | 주당 가격 |
| transactionDate | date | 거래일 |
| filingDate | date | 신고일 |

### 8.6 InstitutionHolding

| 필드명 | 타입 | 설명 |
|---|---|---|
| institutionName | string | 기관명 |
| shares | number | 보유 수량 |
| change | number | 증감 수량/비율 |
| reportDate | date | 보고 기준일 |

### 8.7 AlertItem

| 필드명 | 타입 | 설명 |
|---|---|---|
| id | string | 알림 ID |
| ticker | string | 관련 종목 |
| title | string | 알림 제목 |
| body | string | 알림 내용 |
| level | string | 위험 레벨 |
| read | boolean | 읽음 여부 |
| score | number | 관련 점수 |
| createdAt | datetime | 생성 시각 |

### 8.8 SyncState

| 필드명 | 타입 | 설명 |
|---|---|---|
| running | boolean | 현재 동기화 실행 여부 |
| lastAttemptAt | datetime | 마지막 시도 시각 |
| lastSuccessAt | datetime | 마지막 성공 시각 |
| lastError | string | 마지막 에러 메시지 |

---

## 9. 외부 API 활용 명세

| 외부 API | 활용 목적 | 사용 데이터 |
|---|---|---|
| Alpha Vantage | 시세/가격/거래량 조회 | price history, volume, daily data |
| SEC Form 4 | 내부자 거래 조회 | insider buy/sell transactions |
| 향후 뉴스 API | 뉴스 감성 분석 | headline, sentiment |
| 향후 AI API | 리스크 코멘트 생성 | 요약 문구, 액션 가이드 |

---

## 10. UI/UX 디자인 명세

### 10.1 디자인 방향

| 항목 | 내용 |
|---|---|
| 기본 모드 | 다크 모드 |
| 디자인 성격 | 경고 레이더형 투자 대시보드 |
| 정보 구조 | 숫자 중심 + 카드 기반 |
| 핵심 목표 | 사용자가 3초 안에 위험 종목을 파악 가능하도록 설계 |

### 10.2 컬러 시스템

| 요소 | 컬러 방향 |
|---|---|
| Background | 다크 네이비 |
| Card | 차콜 |
| Primary Text | 밝은 회백색 |
| Secondary Text | 중간 회색 |
| Low | 녹색 |
| Medium | 노란색 |
| High | 주황색 |
| Critical | 빨간색 |

### 10.3 컴포넌트 원칙

| 요소 | 원칙 |
|---|---|
| 카드 | radius 20~24 |
| 배지 | 위험 레벨 중심 표시 |
| 숫자 | 점수/비율은 크게 강조 |
| 설명 | 짧고 명확한 텍스트 |
| 리스트 | 스크롤 피로 최소화, 간결한 구성 |

### 10.4 화면 UX 원칙

| 화면 | UX 원칙 |
|---|---|
| 홈 | 위험 종목 우선 노출 |
| 워치리스트 | 추가/삭제를 최대한 단순화 |
| 상세 | 왜 위험한지 근거 중심으로 설명 |
| 알림 | 즉시 상세 이동 가능 |
| 설정 | 운영 상태를 직관적으로 표시 |

---

## 11. 예외 처리 정책

| 상황 | 처리 방식 |
|---|---|
| 잘못된 티커 입력 | 사용자 친화적 에러 메시지 표시 |
| 네트워크 오류 | 재시도 버튼 제공 |
| 데이터 없음 | 빈 상태 UI로 처리 |
| sync 실패 | 마지막 성공 시각 + 에러 표시 |
| 일부 데이터 누락 | placeholder 또는 명시적 상태값 표시 |

---

## 12. 비기능 요구사항

| 구분 | 요구사항 |
|---|---|
| 성능 | 첫 화면 렌더링이 빨라야 하며 차트는 부드럽게 동작해야 함 |
| 안정성 | 일부 데이터 누락 시에도 전체 화면이 깨지지 않아야 함 |
| 보안 | API 키는 앱에 저장하지 않고 서버 환경변수에서만 관리 |
| 확장성 | Provider 추가, 뉴스 분석, AI 요약 기능 확장이 쉬워야 함 |
| 유지보수성 | View/Controller/Repository 책임 분리가 명확해야 함 |

---

## 13. 테스트 명세

| 테스트 유형 | 범위 |
|---|---|
| 단위 테스트 | 모델 파싱, Repository 변환, Controller 상태 전이 |
| UI 테스트 | 워치리스트 추가/삭제, 상세 진입, 새로고침, 알림 처리 |
| 통합 테스트 | 앱-백엔드 연동, summary/signals/price-history 렌더링 |
| 예외 테스트 | API 실패, 빈 데이터, sync 실패 처리 |

---

## 14. 향후 확장 로드맵

| 단계 | 내용 |
|---|---|
| Phase 1 | 워치리스트, 홈 피드, 상세, insiders, institutions, alerts, settings |
| Phase 2 | 푸시 알림, 뉴스 감성 분석, AI 요약, 포트폴리오 리스크 |
| Phase 3 | 자동완성 검색, 리스크 백테스트, 사용자별 알림 규칙, 멀티 마켓 지원 |

---

## 15. 결론

EXIT Radar는 단순 시세 확인 앱이 아니라,  
**투자자의 출구 시점을 판단하도록 돕는 리스크 인텔리전스 앱**이다.

핵심 우선순위는 다음과 같다.

1. 워치리스트 추가/삭제
2. 종목 상세 분석
3. 홈 레이더 피드
4. 알림 시스템
5. 확장 가능한 MVC + Repository 구조 유지
