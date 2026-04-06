from __future__ import annotations

"""
Text Cleaner — 텍스트 정제 모듈
커뮤니티 텍스트 정제

처리 항목:
  - 연속 이모지 제거
  - 반복 문자 축약 (ㅋㅋㅋㅋ → ㅋㅋ)
  - 과도한 공백/줄바꿈 정리
  - URL 제거
  - 특수문자 정규화
"""

import re
import logging

logger = logging.getLogger("text-cleaner")


class TextCleaner:
    # 이모지 패턴
    EMOJI_PATTERN = re.compile(
        "["
        "\U0001f600-\U0001f64f"  # 이모티콘
        "\U0001f300-\U0001f5ff"  # 기호 & 그림
        "\U0001f680-\U0001f6ff"  # 교통 & 지도
        "\U0001f1e0-\U0001f1ff"  # 국기
        "\U00002702-\U000027b0"
        "\U000024c2-\U0001f251"
        "]+",
        flags=re.UNICODE,
    )

    # URL 패턴
    URL_PATTERN = re.compile(
        r"https?://\S+|www\.\S+", flags=re.IGNORECASE
    )

    # 한글 자모 반복 패턴 (ㅋㅋㅋㅋ, ㅎㅎㅎㅎ, ㅠㅠㅠ 등)
    JAMO_REPEAT_PATTERN = re.compile(r"([ㄱ-ㅎㅏ-ㅣ])\1{2,}")

    # 같은 문자 반복 패턴 (3회 이상)
    CHAR_REPEAT_PATTERN = re.compile(r"(.)\1{2,}")

    # 과도한 공백
    MULTI_SPACE_PATTERN = re.compile(r"[ \t]+")
    MULTI_NEWLINE_PATTERN = re.compile(r"\n{3,}")

    def clean(self, text: str) -> str:
        """텍스트 정제 파이프라인"""
        if not text:
            return ""

        result = text

        # 1. URL 제거
        result = self.URL_PATTERN.sub("", result)

        # 2. 이모지 제거
        result = self.EMOJI_PATTERN.sub("", result)

        # 3. 자모 반복 축약 (ㅋㅋㅋㅋㅋ → ㅋㅋ)
        result = self.JAMO_REPEAT_PATTERN.sub(r"\1\1", result)

        # 4. 문자 반복 축약 (ㅋㅋ는 유지하되, 3회 이상 반복은 2회로)
        result = self.CHAR_REPEAT_PATTERN.sub(r"\1\1", result)

        # 5. 공백 정리
        result = self.MULTI_SPACE_PATTERN.sub(" ", result)
        result = self.MULTI_NEWLINE_PATTERN.sub("\n\n", result)

        # 6. 앞뒤 공백 제거
        result = result.strip()

        return result

    def clean_for_classification(self, title: str, body: str) -> str:
        """분류용 텍스트 결합 정제"""
        cleaned_title = self.clean(title)
        cleaned_body = self.clean(body)

        # 제목과 본문 결합 (제목이 본문 시작과 겹치면 제거)
        if cleaned_body.startswith(cleaned_title):
            return cleaned_body

        return f"{cleaned_title}\n\n{cleaned_body}"
