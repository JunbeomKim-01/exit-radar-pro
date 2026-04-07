from __future__ import annotations
"""
Toss Community Sentiment Classifier — FastAPI 서비스

엔드포인트:
  POST /classify/post   — 단건 분류
  POST /classify/batch  — 배치 분류
  POST /extract/ticker  — 종목/티커 추출
  GET  /health          — 헬스 체크
"""

import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
import uvicorn

from classifier import SentimentClassifier
from text_cleaner import TextCleaner
from ticker_extractor import TickerExtractor

# 환경변수 로드
env_path = os.path.join(os.path.dirname(__file__), "../../.env")
load_dotenv(dotenv_path=env_path)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("classifier-api")

# ─── App ───
app = FastAPI(
    title="Toss Sentiment Classifier",
    description="한국어 주식 커뮤니티 텍스트 감성 분류 API",
    version="0.1.0",
)

# ─── Services ───
text_cleaner = TextCleaner()
classifier = SentimentClassifier()
ticker_extractor = TickerExtractor()


# ─── Models ───
class ClassifyPostRequest(BaseModel):
    id: str
    title: str
    body: str
    ticker: Optional[str] = None
    openai_api_key: Optional[str] = None


class ClassifyResponse(BaseModel):
    id: str
    label: str  # "support" | "criticize" | "neutral"
    confidence: float
    rationale: str


class BatchClassifyRequest(BaseModel):
    items: List[ClassifyPostRequest]
    openai_api_key: Optional[str] = None


class BatchClassifyResponse(BaseModel):
    results: List[ClassifyResponse]


class TickerExtractRequest(BaseModel):
    text: str


class TickerExtractResponse(BaseModel):
    tickers: List[str]


class SummarizeRequest(BaseModel):
    ticker: str
    posts: List[dict]
    openai_api_key: Optional[str] = None


class SummarizeResponse(BaseModel):
    summary: str
    alert_level: str  # "info" | "warning" | "danger"
    key_points: List[str]


class IndicatorAnalysisRequest(BaseModel):
    name: str
    description: str
    history: List[float]
    openai_api_key: Optional[str] = None


class IndicatorAnalysisResponse(BaseModel):
    analysis: str


class AnalyzeMarketRequest(BaseModel):
    market_data: Dict
    openai_api_key: Optional[str] = None


# ─── Endpoints ───
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "classifier-py",
        "model_version": classifier.model_version,
    }


@app.post("/classify/post", response_model=ClassifyResponse)
async def classify_post(req: ClassifyPostRequest):
    """단건 감성 분류"""
    try:
        # 텍스트 정제
        cleaned_title = text_cleaner.clean(req.title)
        cleaned_body = text_cleaner.clean(req.body)
        #logger.info(f"제목 : {req.title}")
        #logger.info(f"내용 : {req.body}")
        # 분류
        result = await classifier.classify(
            id=req.id,
            title=f"사용자 : {cleaned_title[0:1]}****",
            body=req.body,
            ticker=req.ticker,
            user_api_key=req.openai_api_key,
        )

        logger.info(f"분류 완료: {req.id} → {result.label} ({result.confidence:.2f})")
        return result

    except Exception as e:
        logger.error(f"분류 오류: {req.id} — {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/classify/batch", response_model=BatchClassifyResponse)
async def classify_batch(req: BatchClassifyRequest):
    """배치 감성 분류 — 단일 LLM 호출로 모든 게시글을 한 번에 분류"""
    try:
        items = [
            {
                "id": item.id,
                "title": text_cleaner.clean(item.title),
                "body": item.body,
                "ticker": item.ticker,
            }
            for item in req.items
        ]

        results = await classifier.classify_batch(
            items=items,
            user_api_key=req.openai_api_key,
        )

        logger.info(f"배치 분류 완료: {len(results)}건 (1회 LLM 호출)")
        return BatchClassifyResponse(
            results=[
                ClassifyResponse(
                    id=r.id, label=r.label, confidence=r.confidence, rationale=r.rationale
                )
                for r in results
            ]
        )
    except Exception as e:
        logger.error(f"배치 분류 오류: {e}")
        # 전체 실패 시 모두 neutral fallback
        return BatchClassifyResponse(
            results=[
                ClassifyResponse(id=item.id, label="neutral", confidence=0.0, rationale=f"배치 분류 실패: {str(e)}")
                for item in req.items
            ]
        )


@app.post("/extract/ticker", response_model=TickerExtractResponse)
async def extract_ticker(req: TickerExtractRequest):
    """텍스트에서 종목/티커 추출"""
    tickers = ticker_extractor.extract(req.text)
    return TickerExtractResponse(tickers=tickers)


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize_posts(req: SummarizeRequest):
    """게시글 목록 기반 감성 요약 생성"""
    try:
        result = await classifier.summarize(
            ticker=req.ticker,
            posts=req.posts,
            user_api_key=req.openai_api_key,
        )
        return result
    except Exception as e:
        logger.error(f"요약 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/indicator", response_model=IndicatorAnalysisResponse)
async def analyze_indicator(req: IndicatorAnalysisRequest):
    """지표 데이터 기반 전문가 분석 생성"""
    try:
        result = await classifier.analyze_indicator(
            name=req.name,
            description=req.description,
            history=req.history,
            user_api_key=req.openai_api_key,
        )
        return result
    except Exception as e:
        logger.error(f"지표 분석 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/market", response_model=IndicatorAnalysisResponse)
async def analyze_market(req: AnalyzeMarketRequest):
    """시장 전체 상태 기반 마스터 전략 생성"""
    try:
        result = await classifier.analyze_market_unified(
            market_data=req.market_data,
            user_api_key=req.openai_api_key,
        )
        return result
    except Exception as e:
        logger.error(f"시장 통합 분석 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("CLASSIFIER_PORT", "8001"))
    logger.info(f"🐍 분류 서비스 시작: http://localhost:{port} (Reload Enabled)")
    # reload=True 기능을 위해 문자열 형태의 앱 경로 전달
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
