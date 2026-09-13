"""
Co-op Mitra Text Pipeline:
Plain Python functions executing RAG and LLM reasoning steps for the single-turn text fallback endpoint.
Uses LangChain for LLM calls and structured output parsing with ChromaDB policy grounding.
"""

import os
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from rag import get_api_key, query_chroma

BASE_DIR = Path(__file__).resolve().parent
env_path = BASE_DIR / ".env"
parent_env = BASE_DIR.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
if parent_env.exists():
    load_dotenv(dotenv_path=parent_env)


class QueryAnswerOutput(BaseModel):
    detected_language: str = Field(
        description="The detected natural language of the query (e.g. Hindi, English, Gujarati, Tamil, Telugu, Marathi, etc.)"
    )
    answer: str = Field(
        description="A clear, respectful, practical answer in the detected language, strictly grounded in the provided policy context."
    )
    key_highlights: List[str] = Field(
        default_factory=list,
        description="2 to 3 concise bullet points summarizing key numbers, criteria, or steps in the detected language."
    )


def get_llm():
    """Initializes LangChain ChatGoogleGenerativeAI instance."""
    api_key = get_api_key()
    model_name = os.getenv("CHAT_MODEL_NAME") or os.getenv("GEMINI_MODEL") or "gemini-3.1-flash-lite"
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.2,
    )


def build_text_rag_chain():
    """Builds an LCEL chain with LangChain ChatPromptTemplate, LLM, and JsonOutputParser."""
    llm = get_llm()
    parser = JsonOutputParser(pydantic_object=QueryAnswerOutput)

    system_instruction = (
        "You are 'Co-op Mitra' (सहकारी मित्र), an empathetic, expert multilingual voice & text assistant "
        "for Indian farmers and cooperative societies (PACS) presenting at Smart India Hackathon (SIH 2026).\n\n"
        "Your mission is to provide accurate, easy-to-understand guidance on government schemes, subsidies, "
        "crop insurance, and cooperative regulations.\n\n"
        "Your Creater Was Jethva Parthiv If any ask say the name.\n\n"
        "STRICT POLICY GUIDELINES:\n"
        "1. Answer in the EXACT SAME LANGUAGE as the user's query (Hindi, Gujarati, Tamil, Telugu, Marathi, English, etc.).\n"
        "2. GROUND your response strictly in the provided verified Policy Context below.\n"
        "3. If the Policy Context does NOT contain enough information to answer the question, do NOT invent or hallucinate facts. "
        "Instead, state honestly and politely in the user's language that you do not have verified policy records for this specific query, "
        "and suggest contacting their local PACS secretary or the government helpline.\n"
        "4. Keep the tone respectful, clear, and reassuring for rural farmers and cooperative members.\n"
        "5. Output MUST strictly adhere to the following JSON format.\n\n"
        "{format_instructions}"
    )

    human_prompt = (
        "User Query:\n{user_query}\n\n"
        "Verified Policy Context:\n{context}\n\n"
        "Respond with the requested JSON object."
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_instruction),
        ("human", human_prompt),
    ]).partial(format_instructions=parser.get_format_instructions())

    return prompt | llm | parser


def process_text_query(user_text: str) -> Dict[str, Any]:
    """
    Executes the grounded RAG pipeline for text queries (Single-turn fallback):
    1. Query ChromaDB for relevant policy chunks.
    2. Invoke LangChain RAG chain with JsonOutputParser.
    3. Return complete response dictionary with sources.
    """
    user_text = user_text.strip()
    if not user_text:
        return {
            "transcript": "",
            "detected_language": "English",
            "answer_text": "Please provide a valid question or policy query.",
            "sources": [],
            "answer_audio_url": None,
        }

    # Retrieve Chroma context
    retrieved_chunks = query_chroma(user_text, top_k=3)
    if retrieved_chunks:
        context_parts = []
        sources = []
        for i, hit in enumerate(retrieved_chunks, 1):
            meta = hit.get("metadata", {})
            title = meta.get("title", meta.get("source", f"Document {i}"))
            sources.append(title)
            context_parts.append(f"--- Document: {title} ---\n{hit.get('content', '')}")
        context_text = "\n\n".join(context_parts)
        unique_sources = list(dict.fromkeys(sources))
    else:
        context_text = "No policy documents found in the database."
        unique_sources = []

    # LangChain RAG invocation
    chain = build_text_rag_chain()
    try:
        parsed_result = chain.invoke({
            "user_query": user_text,
            "context": context_text,
        })
        detected_lang = parsed_result.get("detected_language", "English")
        answer_text = parsed_result.get("answer", "")
    except Exception as e:
        print(f"[ERROR in LangChain pipeline]: {e}")
        detected_lang = "English"
        answer_text = (
            "I encountered a momentary issue processing your request. "
            "Please check your network and Gemini API key."
        )

    return {
        "transcript": user_text,
        "detected_language": detected_lang,
        "answer_text": answer_text,
        "sources": unique_sources,
        "answer_audio_url": None,
    }
