import os
import json
from typing import Type, TypeVar, Optional, Any
from pydantic import BaseModel
from .utils import logger

T = TypeVar("T", bound=BaseModel)

async def ainvoke_llm(
    model: Optional[str] = None,
    system_prompt: str = "",
    user_message: str = "",
    response_format: Optional[Type[T]] = None,
    temperature: float = 0.1
) -> Any:
    """
    Invokes Claude (Anthropic) LLM and returns response, optionally parsed into a Pydantic model.
    """
    import anthropic

    if not model:
        model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("No ANTHROPIC_API_KEY found in environment variables.")
        return None

    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=60.0)

    try:
        params = {
            "model": model,
            "max_tokens": 4096,
            "temperature": temperature,
            "messages": [{"role": "user", "content": user_message}],
        }
        if system_prompt:
            params["system"] = system_prompt

        response = await client.messages.create(**params)

        raw_text = response.content[0].text

        if response_format:
            # Parse JSON from response into Pydantic model
            # Claude may wrap JSON in ```json ... ``` blocks
            text = raw_text.strip()
            if text.startswith("```"):
                # Remove markdown code block
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])

            data = json.loads(text)
            return response_format(**data)
        else:
            return raw_text

    except Exception as e:
        logger.error(f"LLM invocation failed: {e}")
        return None
