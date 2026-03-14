import os
import json
from typing import Type, TypeVar, Optional, Any
from pydantic import BaseModel
from openai import AsyncOpenAI
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
    Invokes LLM and returns response, optionally parsed into a Pydantic model.
    """
    if not model:
        model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        # Try to find in other env vars if exists
        api_key = os.getenv("LLM_API_KEY") or os.getenv("VITE_OPENAI_API_KEY")
    
    if not api_key:
        logger.error("No OpenAI API key found in environment variables.")
        return None

    client = AsyncOpenAI(api_key=api_key, timeout=60.0)

    try:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_message})

        params = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }

        if response_format:
            # Use OpenAI Structured Outputs if supported
            response = await client.beta.chat.completions.parse(
                **params,
                response_format=response_format,
            )
            return response.choices[0].message.parsed
        else:
            response = await client.chat.completions.create(**params)
            return response.choices[0].message.content

    except Exception as e:
        logger.error(f"LLM invocation failed: {e}")
        return None
