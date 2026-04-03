# EXIT RADAR PRO 웹 추가 기능 탭 개발 계획서 v2

## 기능명
**전환 지표 탭 (Trend Reversal Intelligence)**

---

## 1. 개발 목적
이 기능의 목적은 나스닥 1일봉 기준으로 **상승 추세 → 하락 전환**, **하락 추세 → 상승 전환** 가능성을 정량적으로 보여주는 것이다.  
기존 EXIT Radar가 개별 종목의 리스크를 보여주는 구조라면, 이 탭은 그 위에서 **시장 전체의 전환 환경**을 먼저 판단하게 해주는 상위 컨텍스트 레이어다.

즉 사용자 흐름은 다음과 같다.

1. 시장 전환 위험/기회 확인
2. 워치리스트 종목별 EXIT 위험 확인
3. 내부자/기관/가격 신호와 결합해 실행 판단

이 기능은 기존 리스크 피드와 충돌하지 않고, 오히려 **“왜 지금 이 종목을 줄여야 하는가”** 를 시장 레벨에서 설명해주는 역할을 한다.

기존 EXIT Radar는 내부자 거래, 기관 보유, 가격 및 거래량 이상 신호를 통합해 보유/관망/비중축소 판단을 지원하는 구조로 정의되어 있다. 또한 API 서버와 워커를 분리하고, 외부 데이터는 서버에서 정규화 후 DB 저장, 클라이언트는 저장된 결과를 조회하는 구조를 유지하는 것이 핵심 원칙이다. fileciteturn4file0  
현재 개발 환경도 MongoDB + Redis 기반 구성이 전제되어 있어, 신규 전환 지표 기능 역시 동일한 저장소/큐 체계 위에 올리는 것이 적절하다. fileciteturn4file1

---

## 2. 기능 정의
전환 지표 탭은 나스닥 일봉 시계열을 기준축으로 두고, 아래 **8개 지표**를 통합 분석한다.

### 핵심 전환 신호군
- **VXN**
- **HY OAS**
- **DGS2**
- **SOX**

### 보조 컨텍스트 신호군
- 원유(WTI)
- VIX
- 달러 인덱스(DXY)
- 거래량

이 탭에서 제공할 핵심 출력값은 다음 4가지다.

### 2.1 전환 확률 점수
현재 시점이 다음 중 어디에 가까운지 확률형 점수로 제시한다.

- 상승 지속
- 상승 후 하락 전환 후보
- 하락 지속
- 하락 후 상승 전환 후보

### 2.2 전환 근거 카드
단순 점수만 보여주지 않고, 어떤 통계 조건이 충족됐는지 설명한다.

예시:
- VXN 3일 상승 및 20DMA 상회
- HY OAS 확대
- DGS2 5일 상승
- SOX 상대강도 악화
- VIX 단기 급등
- Nasdaq 20일 수익률 과열권

### 2.3 컨펌 단계 표시
전환 신호를 한 번에 확정하지 않고 단계형으로 표시한다.

- Observe
- Warn
- Confirmed

### 2.4 백테스트 기반 신뢰도
현재 신호와 유사한 과거 사례가 몇 번 있었고, 그 뒤 5일/10일/20일 수익률이 어땠는지를 보여준다.

---

## 3. 제품 포지셔닝
이 기능은 단순 보조 차트가 아니라 **의사결정 엔진 보조 탭**이다.

따라서 UI 명칭은 아래 후보 중 하나로 제안한다.

- 전환 지표
- 시장 전환 레이더
- Trend Radar
- Macro Reversal Lab

EXIT Radar의 기존 다크모드, 카드형, 숫자 중심 UI 원칙과 결합했을 때 가장 일관성 있는 확장 기능이다. 기존 명세는 다크 네이비 배경, 카드 기반 정보 분리, 빠르게 읽히는 숫자 중심 구조를 강조한다. fileciteturn4file0

---

## 4. 사용자 대상
주요 사용자는 다음과 같다.

- 나스닥/미국 성장주 투자자
- QQQ, TQQQ, 개별 기술주 투자자
- 익절/비중축소 타이밍을 찾는 사용자
- 단순 뉴스보다 정량 신호를 선호하는 사용자

이 기능은 기존 EXIT Radar가 정의한 성장주/테마주 중심 사용자군과 동일한 니즈를 가진다. fileciteturn4file0

---

## 5. 기능 범위

### 5.1 포함 범위
- 나스닥 일봉 기반 전환 점수 계산
- VXN/HY OAS/DGS2/SOX 기반 핵심 신호 계산
- VIX/DXY/WTI/거래량 기반 보조 신호 계산
- 과거 유사 사례 조회
- 차트 오버레이 시각화
- 신호 설명 카드
- 시장 레벨 알림 조건 생성

### 5.2 제외 범위
- 자동 매매 실행
- 초단타 분봉 신호
- 사용자의 임의 지표 수식 편집기
- 실시간 틱 레벨 분석

---

## 6. 시스템 구조
기존 아키텍처를 그대로 재사용한다.

- **Frontend(Web)**: React 또는 Next.js
- **Backend API**: Node.js + TypeScript
- **DB**: MongoDB
- **Queue / Cache**: Redis
- **Worker**: 일별 지표 계산 및 백테스트 캐싱
- **외부 데이터 소스**:
  - Nasdaq price history
  - VIX / VXN
  - DXY
  - WTI
  - HY OAS
  - DGS2
  - SOX
  - 거래량 공급자

기존 EXIT Radar는 API 서버와 워커를 분리하고, 외부 데이터는 서버에서 정규화 후 DB에 저장하며, 프론트는 저장된 결과만 조회하는 구조를 채택하고 있다. 따라서 전환 지표 기능도 **실시간 계산이 아니라 사전 계산 + 캐시 조회 구조**로 구현하는 것이 적절하다. fileciteturn4file0

---

## 7. 핵심 모듈 설계

### 7.1 MarketContextCollector
역할:
- 나스닥 일봉 수집
- VIX, VXN, DXY, WTI, HY OAS, DGS2, SOX, 거래량 수집
- 날짜 정렬 및 결측치 처리
- 공통 거래일 기준 시계열 생성

### 7.2 ReversalFeatureEngine
역할:
- 수익률 계산
- 이동평균 대비 괴리율 계산
- VIX/VXN 변화율 계산
- DXY/DGS2 변화율 계산
- WTI 변화율 계산
- HY OAS 변화율 및 분위수 계산
- SOX 상대강도 계산
- 거래량/20DMA 비율 계산
- 과열/침체/공포/완화/신용경색/리더십 약화 상태 파생 변수 생성

추가 feature 예시:
- `vxnChange3d`
- `vxnVs20dma`
- `hyOasChange5d`
- `hyOasPercentile`
- `dgs2Change5d`
- `dgs2Vs20dma`
- `soxReturn5d`
- `soxRelativeStrength5d`
- `soxVs50dma`
- `volumeVs20dma`

### 7.3 ReversalRuleEngine
역할:
- 룰 기반 신호 계산
- 상승 전환 후보 / 하락 전환 후보 판정
- 단계형 상태값 생성
- 설명 가능한 조건 로그 저장

#### 하락 후 상승 전환 후보
- 최근 20일 나스닥 수익률 ≤ -5%
- **VXN 고점권 후 둔화**
- **HY OAS 확대 멈춤 또는 축소 전환**
- **DGS2 하락 또는 안정**
- **SOX 상대강도 개선**
- 보조: DXY 약세, WTI 약세 마무리, 거래량 확대

#### 상승 후 하락 전환 후보
- 최근 20일 나스닥 수익률 ≥ +5%
- **VXN 재상승**
- **HY OAS 확대**
- **DGS2 상승**
- **SOX 상대강도 악화**
- 보조: VIX 급등, DXY 강세, WTI 약세, 거래량 증가

### 7.4 ReversalBacktestEngine
역할:
- 현재 조건과 유사한 과거 사례 검색
- 이후 5/10/20거래일 수익률 분포 계산
- hit rate, 평균수익률, 최대낙폭 계산
- 신호 신뢰도 점수 산출

### 7.5 ReversalSnapshotService
역할:
- 프론트에 바로 전달 가능한 요약 결과 생성
- 상태 카드, 점수, 설명, 차트 오버레이, 사례 통계 반환

### 7.6 AlertTriggerEngine
역할:
- 시장 전환 경고 알림 생성
- 기존 alerts 체계와 연결
- 사용자별 알림 허용 여부 반영

기존 명세에도 alerts, risk snapshot, sync state, factors 개념이 정의되어 있으므로, 이 기능은 별도 시스템이 아니라 기존 snapshot/factor/alert 구조의 확장판으로 구현하는 것이 효율적이다. fileciteturn4file0

---

## 8. 점수 체계 제안

### 8.1 상승 전환 점수
- VXN 둔화: 20%
- HY OAS 축소: 20%
- DGS2 안정/하락: 15%
- SOX 상대강도 개선: 20%
- VIX 둔화: 10%
- DXY 약세: 5%
- WTI 안정/약세 종료: 5%
- 거래량 확인: 5%

### 8.2 하락 전환 점수
- VXN 재확대: 20%
- HY OAS 확대: 20%
- DGS2 상승: 15%
- SOX 상대강도 악화: 20%
- VIX 급등: 10%
- DXY 강세: 5%
- WTI 약세: 5%
- 거래량 경고: 5%

### 8.3 단계 표시
- **Observe**
- **Warn**
- **Confirmed**

### 8.4 지표 그룹별 설명 예시
- “나스닥 전용 변동성(VXN)이 재상승 중입니다.”
- “하이일드 스프레드가 확대되며 위험자산 회피가 강화되고 있습니다.”
- “2년물 금리 상승으로 성장주 할인율 부담이 커지고 있습니다.”
- “SOX가 나스닥 대비 약세로 전환되어 내부 리더십이 약화되었습니다.”

---

## 9. 데이터 모델 제안
기존 모델과 별도로 아래 컬렉션을 추가한다.

### 9.1 MarketIndicatorBar
- `date`
- `indexClose`
- `indexVolume`
- `vixClose`
- `vxnClose`
- `dxyClose`
- `wtiClose`
- `hyOas`
- `dgs2`
- `soxClose`
- `sourceStatus`
- `createdAt`

### 9.2 ReversalFeatureSnapshot
- `date`
- `tickerScope` (`NASDAQ`)
- `return5d`
- `return10d`
- `return20d`
- `vixChange3d`
- `vxnChange3d`
- `vxnVs20dma`
- `dxyChange5d`
- `wtiChange5d`
- `hyOasChange5d`
- `hyOasPercentile`
- `dgs2Change5d`
- `dgs2Vs20dma`
- `soxReturn5d`
- `soxRelativeStrength5d`
- `soxVs50dma`
- `volumeVs20dma`
- `regimeTag`
- `createdAt`

### 9.3 ReversalSignalSnapshot
- `date`
- `signalType` (`BOTTOM_CANDIDATE`, `TOP_CANDIDATE`)
- `score`
- `stage` (`OBSERVE`, `WARN`, `CONFIRMED`)
- `coreSignals[]`
- `supportSignals[]`
- `signalBreakdown`
- `riskTheme`
- `confidence`
- `matchedHistoricalCases`
- `expected5d`
- `expected10d`
- `expected20d`
- `createdAt`

### 9.4 ReversalBacktestStat
- `ruleId`
- `sampleCount`
- `winRate5d`
- `winRate10d`
- `avgReturn5d`
- `avgReturn10d`
- `avgReturn20d`
- `maxDrawdownAvg`
- `updatedAt`

### 9.5 MarketAlertItem
- `id`
- `category` (`MARKET_REVERSAL`)
- `title`
- `body`
- `level`
- `read`
- `createdAt`

---

## 10. API 설계
기존 `/v1` 네임스페이스 안에 추가한다.

### 10.1 시장 전환 요약
- `GET /v1/market/reversal/summary`

응답 예시 항목:
- `currentStage`
- `currentScore`
- `signalType`
- `confidence`
- `coreSignalScore`
- `supportSignalScore`
- `dominantDrivers[]`
- `summaryText`
- `updatedAt`

### 10.2 지표 상세
- `GET /v1/market/reversal/details`

응답 예시 항목:
- feature snapshot
- `vxn`
- `hyOas`
- `dgs2`
- `sox`
- `signalBreakdown`
- `regimeExplanation`
- 차트용 overlay 데이터

### 10.3 과거 유사 사례
- `GET /v1/market/reversal/cases?signalType=TOP_CANDIDATE&limit=20`

### 10.4 룰북 조회
- `GET /v1/market/reversal/rules`

### 10.5 강제 재계산
- `POST /v1/market/reversal/refresh`

기존 API 구조가 워치리스트, 티커, 레이더, 알림, 디바이스 단위로 나뉘어 있으므로, 신규 기능도 `market/reversal` 네임스페이스로 분리하는 것이 일관성이 높다. fileciteturn4file0

---

## 11. 프론트엔드 화면 설계

### 11.1 탭 위치
상단 네비게이션 또는 사이드 메뉴에 `전환 지표` 탭 추가

### 11.2 화면 구성

#### A. 헤더 요약 카드
- 현재 상태: 상승 후 하락 경고 / 하락 후 상승 관찰 등
- 총점
- 핵심 신호 점수
- 보조 신호 점수
- 마지막 업데이트 시각

#### B. 핵심 전환 신호 카드 영역
4개 카드:
- VXN
- HY OAS
- DGS2
- SOX

#### C. 보조 신호 카드 영역
4개 카드:
- VIX
- DXY
- WTI
- 거래량

#### D. 메인 차트
- 나스닥 일봉
- 전환 후보 마커
- VXN / HY OAS / DGS2 / SOX 토글 오버레이

#### E. 설명 패널
섹션 구분:
- 변동성
- 신용
- 금리
- 리더십
- 매크로 보조 신호

#### F. 과거 사례 테이블
- 날짜
- 당시 신호
- 이후 5일/10일/20일 수익률
- 성공/실패 여부

#### G. 액션 가이드 박스
- “시장 전환 경고 단계입니다.”
- “공격적 신규 진입보다 익절/현금 비중 관리 우선”
- “개별 종목 신호와 함께 확인 필요”

기존 UI 원칙상 카드 기반, 배지 중심 레벨 표시, 핵심 숫자 강조, 짧고 명확한 설명이 중요하므로 이 탭도 동일 원칙으로 구현해야 한다. fileciteturn4file0

---

## 12. UX 원칙
- 복잡한 통계식은 숨기고 결과만 명확히 보여준다.
- 점수만 보여주지 않고 이유를 함께 보여준다.
- 경고/확인/해제 흐름이 직관적이어야 한다.
- 개별 종목 화면으로 자연스럽게 이어져야 한다.
- “시장 경고 → 내 종목 위험 확인” 흐름이 한 번에 이어져야 한다.
- 사용자는 현재 전환 위험의 **주요 원인(공포 / 신용 / 금리 / 리더십)** 을 즉시 이해할 수 있어야 한다.

---

## 13. 개발 단계

### Phase 1. 데이터 파이프라인
- 나스닥/VIX/VXN/DXY/WTI/HY OAS/DGS2/SOX/거래량 수집기 구현
- MongoDB 적재
- Redis 캐시 설계
- 일별 워커 스케줄 구성

### Phase 2. 지표 엔진
- feature 계산
- 룰 기반 전환 판정
- snapshot 저장
- 설명 문자열 생성

### Phase 3. 백테스트 엔진
- 과거 사례 매칭
- 5/10/20일 성과 집계
- confidence 계산
- rule별 성능 저장

### Phase 4. API
- summary/details/cases/rules API 구현
- refresh endpoint 구현
- 에러/빈 상태 처리

### Phase 5. 웹 UI
- 전환 지표 탭
- 메인 차트 + 카드 + 테이블
- 로딩/빈 상태/오류 상태
- 다크모드 UI 반영

### Phase 6. 알림 연동
- 시장 전환 경고 알림 생성
- 기존 alerts 화면 연결
- 사용자 설정 반영

### Phase 7. 고도화
- AI 요약 코멘트
- 종목별 시장 민감도 결합
- 포트폴리오 위험 레이더
- 룰 버전 관리 및 A/B 테스트

---

## 14. 비기능 요구사항

### 성능
- summary API는 500ms 내 응답 목표
- details API는 캐시 우선
- 차트 데이터는 range selector 제공

### 안정성
- 일부 지표 소스 누락 시 graceful fallback
- 마지막 정상 snapshot 유지
- `sourceStatus` 표시

### 보안
- 외부 API 키는 서버 환경변수에만 저장
- 클라이언트 직접 호출 금지

### 확장성
- 지표 추가 시 feature engine과 rule engine만 확장하면 되도록 설계
- provider 교체 가능 구조 유지

### 유지보수성
- 룰 정의는 코드 하드코딩보다 JSON/설정 기반 분리 권장
- 백테스트 로직과 실시간 판정 로직 분리

이 방향은 기존 명세의 “외부 데이터는 서버에서 정규화 후 DB 저장”, “provider/repository 교체가 쉬운 구조”, “확장성 유지”, “View에 비즈니스 로직 최소화” 원칙과 일치한다. fileciteturn4file0

---

## 15. 성공 기준
이 기능은 아래 조건을 만족하면 1차 성공으로 본다.

- 사용자가 현재 시장 전환 상태를 한 화면에서 이해할 수 있다
- 전환 점수와 근거가 함께 제공된다
- VXN·HY OAS·DGS2·SOX 기반으로 전환 위험의 주된 원인이 설명된다
- 과거 유사 사례와 성과 통계가 제공된다
- 기존 워치리스트/리스크 피드와 자연스럽게 연결된다
- 알림으로 시장 전환 경고를 받을 수 있다

---

## 16. 최종 구현 방향
실전적으로는 아래 구조가 가장 적절하다.

### 핵심 전환 엔진
- VXN
- HY OAS
- DGS2
- SOX

### 보조 컨텍스트 엔진
- VIX
- DXY
- WTI
- 거래량

이렇게 분리하면 사용자가 지표가 많아도 복잡하다고 느끼지 않고, **무엇이 핵심 경고인지** 를 즉시 이해할 수 있다.

### 1차 MVP
- VXN + HY OAS + DGS2 + SOX 중심 핵심 엔진
- VIX + DXY + WTI + 거래량 보조 엔진
- 요약 카드 + 설명 카드 + 과거 사례 테이블

### 2차 고도화
- 거래량 정교화
- AI 코멘트
- 사용자별 전환 알림 규칙

### 3차 확장
- 개별 종목별 시장 전환 민감도 결합
- 포트폴리오 위험 레이더
- 백테스트 리포트 다운로드

---

## 17. 결론
전환 지표 탭은 EXIT Radar Pro 웹에서 단순 참고 차트가 아니라, **시장 레벨의 추세 전환 가능성을 정량적으로 해석해주는 핵심 보조 기능**이다.

특히 **VXN·HY OAS·DGS2·SOX** 를 핵심 전환 지표로 채택함으로써, 기존의 원유·VIX·달러·거래량보다 더 직접적으로 **나스닥 전환의 원인과 구조**를 설명할 수 있다.

이 기능이 완성되면 사용자는 다음 순서로 판단할 수 있다.

1. 시장 전환 위험 확인
2. 보유 종목의 EXIT 위험 확인
3. 내부자/기관/가격 신호까지 결합해 실행 판단

즉, EXIT Radar Pro는 단순 종목 리스크 앱을 넘어 **시장 전환 + 종목 EXIT 리스크를 함께 판단하는 통합 의사결정 플랫폼**으로 확장될 수 있다.
