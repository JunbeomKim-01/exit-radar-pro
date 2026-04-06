import os
import json
import asyncio
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

async def test():
    client = AsyncOpenAI(api_key="ollama", base_url="http://localhost:11434/v1")
    response = await client.chat.completions.create(
        model="deepseek-r1:8b",
        messages=[
            {"role": "system", "content": "분류기입니다. JSON만 출력하세요."},
            {"role": "user", "content": "삼성전자 가자!"},
        ],
        response_format={"type": "json_object"}
    )
    print("RAW CONTENT:")
    print(response.choices[0].message.content)

asyncio.run(test())
