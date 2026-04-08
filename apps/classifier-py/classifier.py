from __future__ import annotations
"""
Sentiment Classifier — OpenAI LLM 기반 감성 분류기

1단계: LLM 프롬프트 기반 분류
  - support  (옹호/매수/긍정)
  - criticize (비난/매도/부정)
  - neutral   (중립/정보공유)
"""

import os
import json
import logging
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

logger = logging.getLogger("classifier")


@dataclass
class ClassifyResult:
    id: str
    label: str
    confidence: float
    rationale: str


SYSTEM_PROMPT = """당신은 한국어 주식 커뮤니티 게시물을 분석하는 전문 분류기다.

목표:
입력으로 들어온 게시물 텍스트를 읽고, 해당 게시물이 특정 종목 또는 시장 상황에 대해
1) 옹호
2) 비난
3) 중립
중 어디에 해당하는지 분류한다.

중요 원칙:
- 반드시 게시물의 실제 의미를 기준으로 판단한다.
- 단순 긍정/부정 감정이 아니라, “대상 종목/시장/행동”에 대한 태도를 분류한다.
- 반어법, 조롱, 밈, 비꼼, 과장된 표현을 최대한 문맥적으로 해석한다.
- 확신이 낮으면 무리하게 옹호/비난으로 몰지 말고 중립으로 분류한다.
- 뉴스 전달, 사실 나열, 질문, 정보 공유, 방향성 불명 발언은 기본적으로 중립 후보로 본다.
- 욕설이나 감정적 표현이 있어도, 대상에 대한 태도가 명확하지 않으면 중립 가능하다.
- “오른다”, “간다”, “추매”, “존버”, “호재”, “감사합니다”, “믿는다” 등은 옹호 신호일 수 있다.
- “망했다”, “거품”, “사기”, “선동”, “손절”, “도망”, “개미 꼬시기”, “설거지” 등은 비난 신호일 수 있다.
- 단, 위 단어가 있어도 맥락이 반대면 그대로 분류하지 말고 전체 문맥으로 판단한다.
- 게시물이 다른 사람 의견을 인용하거나 소개하는 경우, 작성자 자신의 최종 태도를 우선 본다.
- “지금 들어가면 안 된다”, “차익실현이 낫다”, “조심하라”처럼 투자 경계를 강하게 권하면 대체로 비난 또는 부정적 태도로 본다.
- “좋은 장이다”, “계속 보유”, “더 오른다”, “긍정적으로 본다”처럼 상승/보유/매수 관점을 지지하면 대체로 옹호로 본다.
- 유머성 문구라도 투자 대상에 대한 방향성이 드러나면 그 방향을 반영한다.

분류 기준(본문 내용,body 만을 근거로 분류함)):
- 옹호(support):
  대상 종목/시장/투자 판단을 긍정적으로 보고, 상승·보유·매수·기대·찬성의 태도를 드러냄.
- 비난(criticize):
  대상 종목/시장/투자 판단을 부정적으로 보고, 하락·위험·회피·매도·경계·비판의 태도를 드러냄.
- 중립(neutral):
  정보 전달, 질문, 단순 감상, 방향성 불명, 옹호와 비난이 충분히 드러나지 않는 경우.

출력 규칙:
- 반드시 JSON만 출력한다.
- 코드블록 마크다운을 사용하지 않는다.
- 키 이름은 반드시 아래 형식을 따른다.

출력 스키마:
{
  "label": "support | criticize | neutral",
  "confidence": 0.0,
  "reason": "한글 한두 문장으로 간단히 설명",
  "target": "게시물이 주로 겨냥하는 대상(예: 삼성전자, 코스피, 개미 투자자, 시장 전체, 불명)",
  "signals": ["판단 근거가 된 핵심 표현 1", "핵심 표현 2", "핵심 표현 3"]
}

confidence 규칙:
- 0.90~1.00: 태도가 매우 명확함
- 0.75~0.89: 대체로 명확함
- 0.55~0.74: 어느 정도 추론 필요
- 0.00~0.54: 애매함, 이 경우 중립을 적극 고려

추가 규칙:
- 입력 텍스트가 너무 짧거나 의미가 불분명하면 neutral로 분류한다.
- 정치, 잡담, 욕설만 있고 종목/시장 태도가 불명확하면 neutral로 분류한다.
- “가자”, “간다”, “쏜다” 같은 표현은 대상이 상승/매수 기대인지 먼저 확인한 후 옹호로 분류한다.
- “끝났다”, “튀어라”, “물린다”, “설거지다” 같은 표현은 하락/경계 의미가 강하면 비난으로 분류한다.
- 이미지 언급이 있더라도 텍스트만으로 판단한다.
- 댓글 수, 좋아요 수, 작성자 정보는 판단에 사용하지 않는다.

예시 1
입력:
삼전 계속 들고 갑니다. 오늘 조정은 그냥 숨고르기 같네요. 더 모을 예정입니다.

출력:
{
  "label": "support",
  "confidence": 0.95,
  "reason": "보유와 추가 매수를 긍정적으로 언급하며 종목 전망을 좋게 보고 있다.",
  "target": "삼성전자",
  "signals": ["계속 들고 갑니다", "숨고르기", "더 모을 예정"]
}

예시 2
입력:
이런 장에 들어가는 건 진짜 위험하다. 지금은 차익실현하고 기다리는 게 맞다.

출력:
{
  "label": "criticize",
  "confidence": 0.92,
  "reason": "현재 진입을 부정적으로 보고 경계와 차익실현을 권하고 있다.",
  "target": "시장 전체",
  "signals": ["들어가는 건 위험", "차익실현", "기다리는 게 맞다"]
}

예시 3
입력:
오늘 거래대금이 많이 붙었네요. 외국인 수급도 계속 들어오고 있습니다.

출력:
{
  "label": "neutral",
  "confidence": 0.78,
  "reason": "시장 정보를 전달하고 있지만 명확한 찬반 태도는 드러나지 않는다.",
  "target": "불명",
  "signals": ["거래대금", "외국인 수급", "정보 전달"]
}

이제부터 입력되는 게시물에 대해 위 기준으로만 평가하라."""


ANALYST_SYSTEM_PROMPT = """당신은 월스트리트 출신의 시니어 매크로 전략가이자 금융 분석 전문가다.
입력으로 들어오는 특정 시장 지표의 명칭, 현재 상태 설명, 그리고 최근 60거래일간의 데이터 배열을 바탕으로 전문적인 시장 분석 의견을 제공하라.

작성 규칙:
- 반드시 한국어로 작성한다.
- 불필요한 서술(안녕하세요, 분석 결과입니다 등)은 생략하고 핵심만 전달한다.
- 3개의 불릿 포인트(•)로 구성된 요약 형태로 응답한다.
- 전문가적인 용어(예: 연착륙 유도, 오버슈팅, 스프레드 축소, 리스크 온/오프 등)를 적절히 사용한다.
- 현재 수치가 역사적 평균(평균값 제공됨) 대비 어느 위치에 있는지, 추세가 상승/하락 중인지 고려하여 시장에 주는 의미를 해석한다.
- 단순 사실 나열이 아닌, 분석가로서의 '의견'과 '주의점'을 포함한다.

출력 형식:
• [분석 1]
• [분석 2]
• [분석 3]
"""

UNIFIED_MARKET_PROMPT = """당신은 월스트리트 수석 매크로 전략가다. 
주어진 7대 핵심 지표(VXN, HY OAS, SOX, DGS2 등)와 시장 점수를 기반으로, 투자자가 즉시 실행 가능한 '최종 전술 오피니언'을 제공하라.

작성 원칙:
1. [전술 정의]: 현 시장의 성격(예: '변동성 바닥 확인 중', '신용 위험 발산 구간', '기술적 반등 유효' 등)을 한 줄로 정의한다.
2. [핵심 브리핑]: 지표들 사이의 상관관계를 분석하여 왜 지금 이 점수인지 전문가적 시각으로 요약한다.
3. [전략 Action]: '적극 매수', '분할 익절', '관망 유지' 등 명확한 행동 지침과 그 이유를 3가지 불릿 포인트로 제시한다.
4. 어조: 매우 직관적이고, 단호하며, 불필요한 수식어나 인사말은 절대 배제한다.
5. 분량: 한국어 300자 내외로 압축한다.

분석의 깊이:
- VXN(나스닥 변동성)과 HY OAS(신용 스프레드)의 상관관계를 우선순위로 둔다.
- 단순히 지표를 나열하지 말고, 지표들이 만드는 '결론'에 집중하라.
"""

class SentimentClassifier:
    def __init__(self):
        # 1. Provider 설정 (ollama | groq | openai)
        self.provider = os.getenv("LLM_PROVIDER", "openai").lower()
        
        # 2. API Key 및 Base URL 초기 설정
        if self.provider == "ollama":
            self.api_key = "ollama"  # Ollama는 보통 키가 필요 없지만 placeholder로 넣음
            self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            self.model_version = os.getenv("OLLAMA_MODEL", "llama3.1")
            logger.info(f"Using Local LLM (Ollama): model={self.model_version}, url={self.base_url}")
        elif self.provider == "groq" or os.getenv("GROQ_API_KEY"):
            self.api_key = os.getenv("GROQ_API_KEY", "")
            self.base_url = "https://api.groq.com/openai/v1"
            self.model_version = "llama-3.1-8b-instant"
            logger.info(f"Using Cloud LLM (Groq): model={self.model_version}")
        else:
            self.api_key = os.getenv("OPENAI_API_KEY", "")
            self.base_url = None # Default OpenAI
            self.model_version = "o3-mini"
            logger.info(f"Using Cloud LLM (OpenAI): model={self.model_version}")

        self._client = None

        if not self.api_key or self.api_key.startswith("sk-your"):
            logger.warning("⚠️ LLM API 키 또는 로컬 설정이 누락되었습니다.")

    @property
    def client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            # Ollama를 사용할 때는 api_key에 아무 값이나 넣어도 됨
            self._client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        return self._client

    def _extract_json(self, text: str) -> Any:
        """
        LLM 응답에서 JSON 부분만 추출합니다. 
        <think> 태그, 마크다운 코드 블록 등을 제거합니다.
        """
        import re
        try:
            # 1. <think> 태그 및 내부 내용 삭제
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
            
            # 2. 마크다운 코드 블록(```json ... ```) 추출
            code_block_match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, flags=re.DOTALL)
            if code_block_match:
                text = code_block_match.group(1)
            
            # 3. 가장 바깥쪽의 { } 또는 [ ] 찾기
            start_bracket = text.find('{')
            start_square = text.find('[')
            
            start = -1
            end = -1
            
            # 객체({})인지 배열([])인지 판단
            if start_bracket != -1 and (start_square == -1 or start_bracket < start_square):
                start = start_bracket
                end = text.rfind('}')
            elif start_square != -1:
                start = start_square
                end = text.rfind(']')
                
            if start != -1 and end != -1:
                text = text[start:end+1]
            
            return json.loads(text)
        except Exception as e:
            logger.warning(f"JSON 파싱 재시도 실패: {e}. 원본 일부: {text[:100]}...")
            return json.loads(text) # 마지막 시도 (실패 시 예외 발생)

    async def classify(
        self,
        id: str,
        title: str,
        body: str,
        ticker: Optional[str] = None,
        user_api_key: Optional[str] = None,
    ) -> ClassifyResult:
        """텍스트를 LLM으로 분류합니다."""
        
        active_key = user_api_key or self.api_key

        # API 키가 없거나 더미인 경우 폴백 결과 반환
        if not active_key or active_key.startswith("sk"):
            return self._dummy_classify(id, title, body)

        user_message = f"""종목코드: {ticker or "미지정"}

제목: {title}

본문: {body}"""

        try:
            from openai import AsyncOpenAI
            
            client_args = {"api_key": active_key}
            if active_key.startswith("gsk_") or self.base_url:
                client_args["base_url"] = "https://api.groq.com/openai/v1" if active_key.startswith("gsk_") else self.base_url

            client = AsyncOpenAI(**client_args) if user_api_key else (
                self.client if self.client else AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
            )

            # 모델 결정: 기본 설정을 따르되, 사용자 키에 따라 동적 변경 가능
            model_to_use = self.model_version
            if user_api_key:
                if user_api_key.startswith("gsk_"): model_to_use = "llama-3.1-8b-instant"
                elif user_api_key.startswith("sk-"): model_to_use = "o3-mini"

            response = await client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content or "{}"
            result = self._extract_json(content)

            return ClassifyResult(
                id=id,
                label=result.get("label", "neutral"),
                confidence=float(result.get("confidence", 0.5)),
                rationale=result.get("rationale", "분류 근거 없음"),
            )

        except Exception as e:
            logger.error(f"LLM 분류 실패: {e}")
            return self._dummy_classify(id, title, body)

    async def classify_batch(
        self,
        items: List[Dict[str, Any]],
        user_api_key: Optional[str] = None,
    ) -> List[ClassifyResult]:
        """여러 게시글을 하나의 LLM 호출로 일괄 분류합니다."""
        active_key = user_api_key or self.api_key

        if not active_key or active_key.startswith("sk"):
            return [self._dummy_classify(it["id"], it.get("title", ""), it.get("body", "")) for it in items]

        # 배치 프롬프트 구성
        posts_block = ""
        for idx, it in enumerate(items):
            posts_block += f"""
---[게시글 {idx+1}]---
id: {it["id"]}
종목코드: {it.get("ticker", "미지정")}
제목: {it.get("title", "")}
본문: {it.get("body", "")}
"""

        batch_system = SYSTEM_PROMPT + """
### 배치 처리 가이드 (대량 분석용)
- 한 번에 여러 개의 게시글 데이터가 입력됩니다.
- 각 게시글(id 기준)에 대해 독립적인 분석을 수행하십시오.
- 결과는 **반드시** JSON 배열 형식 `[ { "id": "...", ... }, ... ]` 하나로만 출력하십시오.
- 지연시간을 줄이기 위해 부가적인 텍스트(`Here is the result...` 등)를 절대 포함하지 마십시오.
- 입력된 모든 게시글의 ID가 결과 배열에 포함되도록 하십시오.

출력 스키마:
[
  {
    "id": "게시글 구분 ID",
    "label": "support | criticize | neutral",
    "confidence": 0.0,
    "reason": "분류 근거 (한 문장)",
    "target": "분류 대상",
    "signals": ["핵심 표현1", "핵심 표현2"]
  },
  ...
]
"""

        try:
            from openai import AsyncOpenAI

            client_args = {"api_key": active_key}
            if active_key.startswith("gsk_") or self.base_url:
                client_args["base_url"] = "https://api.groq.com/openai/v1" if active_key.startswith("gsk_") else self.base_url

            client = AsyncOpenAI(**client_args) if user_api_key else self.client

            model_to_use = self.model_version
            if user_api_key:
                if user_api_key.startswith("gsk_"): model_to_use = "llama-3.1-8b-instant"
                elif user_api_key.startswith("sk-"): model_to_use = "o3-mini"

            response = await client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": batch_system},
                    {"role": "user", "content": f"아래 게시글들을 각각 분류하라:\n{posts_block}"},
                ],
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content or "[]"
            parsed = self._extract_json(content)

            # json_object 모드에서는 최상위가 object일 수 있음
            if isinstance(parsed, dict):
                parsed = parsed.get("results", parsed.get("items", []))

            results = []
            for r in parsed:
                results.append(ClassifyResult(
                    id=r.get("id", ""),
                    label=r.get("label", "neutral"),
                    confidence=float(r.get("confidence", 0.5)),
                    rationale=r.get("reason", r.get("rationale", "")),
                ))

            # 응답에 누락된 항목은 dummy로 채움
            result_ids = {r.id for r in results}
            for it in items:
                if it["id"] not in result_ids:
                    results.append(self._dummy_classify(it["id"], it.get("title", ""), it.get("body", "")))

            logger.info(f"배치 LLM 분류 완료: {len(results)}건 (1회 호출)")
            return results

        except Exception as e:
            logger.error(f"배치 LLM 분류 실패: {e}")
            return [self._dummy_classify(it["id"], it.get("title", ""), it.get("body", "")) for it in items]


    async def summarize(
        self,
        ticker: str,
        posts: List[Dict[str, Any]],
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """게시글 목록을 바탕으로 AI 감성 요약을 생성합니다."""
        active_key = user_api_key or self.api_key
        if not active_key or active_key.startswith("sk"):
            return {
                "summary": f"[{ticker}]에 대한 최근 게시글들을 분석한 결과, 긍정과 부정 의견이 섞여 있는 상태입니다. (더미 요약)",
                "alert_level": "info",
                "key_points": ["데이터 수집 결과 기반 요약", "시장 상황 주시 필요"]
            }

        # 요약을 위한 텍스트 구성 (속도 최적화를 위해 상위 10개로 제한)
        posts_text = "\n---\n".join([
            f"제목: {p['title']}\n본문: {p['body']}" for p in posts[:10]
        ])

        system_prompt = f"""당신은 주식 커뮤니티 분석가이자 금융 전략가다. 입력된 최근 게시글 텍스트를 정밀 분석하여 [{ticker}]에 대한 핵심 통찰(Insight)을 도출하라.

반드시 준수할 지침:
1. 절대로 이 지시문 자체를 반복하거나 "최근 게시글 10개를 요약합니다"와 같은 형식적인 답변을 하지 말 것.
2. 분석할 데이터가 부족하거나 내용이 모호할 경우, 형식적 답변 대신 현재 시장의 맥락과 종목의 성격을 고려하여 전문가적 견해를 내놓을 것.
3. 불필요한 서술은 생략하고 핵심만 JSON으로 출력한다.

출력 스키마:
{{"summary": "2-3문장 요약", "alert_level": "info|warning|danger", "key_points": ["포인트1", "2", "3"]}}"""
        try:
            from openai import AsyncOpenAI
            client_args = {"api_key": active_key}
            if active_key.startswith("gsk_") or self.base_url:
                client_args["base_url"] = "https://api.groq.com/openai/v1" if active_key.startswith("gsk_") else self.base_url
            client = AsyncOpenAI(**client_args)

            model_to_use = self.model_version
            if user_api_key:
                if user_api_key.startswith("gsk_"): model_to_use = "llama-3.1-8b-instant"
                elif user_api_key.startswith("sk-"): model_to_use = "o3-mini"

            response = await client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"게시글 목록:\n{posts_text}"},
                ],
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content or "{}"
            return self._extract_json(content)
        except Exception as e:
            logger.error(f"요약 생성 실패: {e}")
            return {"summary": "요약 생성 중 오류가 발생했습니다.", "alert_level": "info", "key_points": []}

    async def analyze_indicator(
        self,
        name: str,
        description: str,
        history: List[Dict[str, Any]],
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """지표 데이터를 바탕으로 거시적 해석을 생성합니다."""
        active_key = user_api_key or self.api_key
        
        # Ollama가 아닐 때만 API 키 체크
        if self.provider != "ollama" and (not active_key or active_key == "YOUR_OPENAI_API_KEY"):
            return {
                "analysis": "[시스템] AI 분석 엔진 연결(API_KEY)이 필요합니다.\n• 지표의 역사적 추세를 분석하여 거시적 관점의 해석을 제공합니다.\n• API 연결 후 실시간 전문가 브리핑을 확인하세요."
            }

        # 통계 데이터 계산
        if not history:
            return {"analysis": "분석할 데이터가 충분하지 않습니다."}
        
        avg_val = sum(history) / len(history)
        current_val = history[-1]
        max_val = max(history)
        min_val = min(history)
        trend = "상승" if current_val > history[0] else "하락"

        user_message = f"""지표명: {name}
상세 설명: {description}
현재값: {current_val}
최근 60일 평균: {avg_val:.4f}
최고치: {max_val}
최저치: {min_val}
60일 전체 추세: {trend}
데이터 흐름: {history[-5:]} (최근 5거래일)"""

        try:
            from openai import AsyncOpenAI
            client_args = {"api_key": active_key}
            if active_key.startswith("gsk_") or self.base_url:
                client_args["base_url"] = "https://api.groq.com/openai/v1" if active_key.startswith("gsk_") else self.base_url
            client = AsyncOpenAI(**client_args)

            model_to_use = self.model_version
            if user_api_key:
                if user_api_key.startswith("gsk_"): model_to_use = "llama-3.1-8b-instant"
                elif user_api_key.startswith("sk-"): model_to_use = "o3-mini"

            response = await client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": ANALYST_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
            )

            content = response.choices[0].message.content or "분석 결과를 생성하지 못했습니다."
            return {"analysis": content.strip()}
        except Exception as e:
            logger.error(f"지표 분석 생성 실패: {e}")
            return {"analysis": "전문가 분석 생성 중 오류가 발생했습니다."}

    async def analyze_market_unified(
        self,
        market_data: Dict[str, Any],
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """시장 전체 상태를 종합하여 마스터 전략 오피니언을 생성합니다."""
        # 1. API 키 확인 (Groq/Ollama 호환성 유지)
        active_key = user_api_key or self.api_key
        
        # 2. 입구 컷: 무의미한 키는 시스템 안내로 대체
        if self.provider != "ollama" and (not active_key or active_key.startswith("sk-your") or active_key == "YOUR_OPENAI_API_KEY"):
            return {
                "analysis": "[시스템] 분석 엔진 가동을 위해 유효한 API 키가 필요합니다.\n• 주요 지표가 임계값에 근접했습니다.\n• 시장 변동성(VXN)과 가산금리(HY OAS) 추이를 면밀히 모니터링하십시오."
            }

        # 3. 데이터 컨텍스트 구성
        user_message = f"""[MARKET SNAPSHOT]
- SIGNAL_TYPE: {market_data.get('signalType')}
- RISK_STAGE: {market_data.get('stage')}
- STRATEGY_SCORE: {market_data.get('score')}/100
- CONFIDENCE: {market_data.get('confidence')}%
- STRATEGIC_ACTION: {market_data.get('strategicAction', {}).get('short')} ({market_data.get('strategicAction', {}).get('long')})
- TRIGGERED_SIGNALS: {", ".join([s['name'] for s in market_data.get('coreSignals', []) if s.get('triggered')])}
- DATA_EXPLANATION: {market_data.get('explanation')}"""

        try:
            # 4. 고속 응답 모델 선택
            model_to_use = self.model_version
            if self.provider == "openai": model_to_use = "o3-mini"
            elif self.provider == "groq": model_to_use = "llama-3.1-8b-instant"

            # 5. 이미 초기화된 클라이언트 재사용 (속도 최적화)
            response = await self.client.chat.completions.create(
                model=model_to_use,
                messages=[
                    {"role": "system", "content": UNIFIED_MARKET_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=600,
                temperature=0.3,
            )

            content = response.choices[0].message.content or "인텔리전스 분석 결과를 생성하지 못했습니다."
            return {"analysis": content.strip()}
        except Exception as e:
            logger.error(f"통합 시장 분석 생성 실패: {str(e)}")
            return {"analysis": f"현장 브리핑 생성 장애: {str(e)[:100]}..."}

    def _dummy_classify(self, id: str, title: str, body: str) -> ClassifyResult:
        """API 키 없을 때 키워드 기반 간이 분류"""
        text = f"{title} {body}".lower()

        positive_keywords = [
            "매수", "저점", "기대", "상승", "호재", "갈", "좋",
            "실적", "성장", "반등", "강추", "사자", "존버",
        ]
        negative_keywords = [
            "매도", "폭락", "하락", "끝", "망", "나쁘", "손절",
            "악재", "거품", "위험", "팔자", "빠져", "물린",
        ]

        pos_score = sum(1 for kw in positive_keywords if kw in text)
        neg_score = sum(1 for kw in negative_keywords if kw in text)

        if pos_score > neg_score:
            return ClassifyResult(
                id=id,
                label="support",
                confidence=min(0.5 + pos_score * 0.1, 0.9),
                rationale=f"키워드 기반 분류 (긍정 키워드 {pos_score}개 감지, API 키 미설정)",
            )
        elif neg_score > pos_score:
            return ClassifyResult(
                id=id,
                label="criticize",
                confidence=min(0.5 + neg_score * 0.1, 0.9),
                rationale=f"키워드 기반 분류 (부정 키워드 {neg_score}개 감지, API 키 미설정)",
            )
        else:
            return ClassifyResult(
                id=id,
                label="neutral",
                confidence=0.5,
                rationale="키워드 기반 분류 (중립, API 키 미설정)",
            )
