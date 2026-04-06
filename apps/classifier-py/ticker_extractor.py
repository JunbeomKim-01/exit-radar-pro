from __future__ import annotations
"""
Ticker Extractor — 텍스트에서 종목명/티커를 추출합니다.

MVP 구현:
  - 6자리 숫자 코드 패턴 매칭 (예: 005930)
  - 주요 종목명 사전 매칭 (삼성전자, 카카오 등)
  - 추후 NER 모델로 업그레이드 가능
"""

import re
import logging
from typing import Dict, List, Optional, Set

logger = logging.getLogger("ticker-extractor")


# 주요 종목명 ↔ 코드 매핑 (MVP용 기본 사전)
TICKER_MAP: Dict[str, str] = {
    # 대형주
    "삼성전자": "005930",
    "SK하이닉스": "000660",
    "LG에너지솔루션": "373220",
    "삼성바이오": "207940",
    "삼성바이오로직스": "207940",
    "현대차": "005380",
    "현대자동차": "005380",
    "기아": "000270",
    "기아차": "000270",
    "셀트리온": "068270",
    "KB금융": "105560",
    "신한지주": "055550",
    "POSCO홀딩스": "005490",
    "포스코홀딩스": "005490",
    "NAVER": "035420",
    "네이버": "035420",
    "카카오": "035720",
    "LG화학": "051910",
    "삼성SDI": "006400",
    "현대모비스": "012330",
    "카카오뱅크": "323410",
    "카뱅": "323410",
    "두산에너빌리티": "034020",
    "한화에어로스페이스": "012450",
    "한화에어로": "012450",
    "에코프로비엠": "247540",
    "에코프로": "086520",
    # 자주 언급되는 종목
    "삼전": "005930",
    "하닉": "000660",
    "하이닉스": "000660",
    "엘지엔솔": "373220",
    "테슬라": "TSLA",
    "애플": "AAPL",
    "엔비디아": "NVDA",
}

# 6자리 숫자 코드 패턴
TICKER_CODE_PATTERN = re.compile(r"\b(\d{6})\b")


class TickerExtractor:
    def __init__(self, custom_map: Optional[Dict[str, str]] = None):
        self.ticker_map = {**TICKER_MAP}
        if custom_map:
            self.ticker_map.update(custom_map)

        # 역방향 매핑 (코드 → 이름들)
        self.code_to_names: Dict[str, List[str]] = {}
        for name, code in self.ticker_map.items():
            if code not in self.code_to_names:
                self.code_to_names[code] = []
            self.code_to_names[code].append(name)

    def extract(self, text: str) -> List[str]:
        """텍스트에서 종목 코드(티커)를 추출합니다."""
        found_tickers: Set[str] = set()

        # 1. 6자리 숫자 코드 직접 매칭
        for match in TICKER_CODE_PATTERN.finditer(text):
            code = match.group(1)
            # 실제 종목 코드인지 기본 검증 (00으로 시작하는 경우가 많음)
            found_tickers.add(code)

        # 2. 종목명 사전 매칭 (긴 이름부터 매칭하여 부분 매칭 방지)
        sorted_names = sorted(self.ticker_map.keys(), key=len, reverse=True)
        for name in sorted_names:
            if name in text:
                found_tickers.add(self.ticker_map[name])

        result = sorted(found_tickers)
        if result:
            logger.info(f"종목 추출: {result}")

        return result

    def get_name(self, code: str) -> str | None:
        """코드에 해당하는 가장 대표적인 종목명을 반환합니다."""
        names = self.code_to_names.get(code, [])
        return names[0] if names else None
