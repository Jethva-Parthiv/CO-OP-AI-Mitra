"""
Co-op Mitra Pipeline: Plain Python functions executing the RAG and LLM reasoning steps.
Uses LangChain for LLM calls and structured output parsing.
Fallback to Google SDK for any errors in LangChain multimodal audio handling.
"""

import os
import json
import base64
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import JsonOutputParser

from rag import get_api_key, query_chroma
from tts import generate_tts_audio

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


class AudioTranscriptionOutput(BaseModel):
    transcript: str = Field(description="Exact verbatim transcription of spoken words in original script/language")
    language: str = Field(description="Name of the spoken natural language (e.g. Hindi, English, Gujarati, Marathi, Tamil, etc.)")


def get_llm():
    """Initializes LangChain ChatGoogleGenerativeAI instance."""
    api_key = get_api_key()
    # Preferred model from master prompt: gemini-3.1-flash-lite
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


def transcribe_and_detect_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> Dict[str, str]:
    """
    Directly transcribes spoken audio and detects language natively using Gemini.
    Primary: LangChain ChatGoogleGenerativeAI with multimodal message.
    Fallback: Google GenAI SDK if LangChain encounters any multimodal formatting error.
    """
    api_key = get_api_key()
    model_name = os.getenv("CHAT_MODEL_NAME") or os.getenv("GEMINI_MODEL") or "gemini-3.1-flash-lite"
    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")

    prompt_text = (
        "You are a native Indian speech-to-text engine. "
        "Listen to this recorded audio from an Indian farmer or cooperative member. "
        "1. Transcribe the spoken question verbatim in its native script (e.g. Devanagari for Hindi/Marathi, Gujarati script, Tamil, Telugu, or English). "
        "2. Identify the spoken language name (e.g. Hindi, English, Gujarati, Tamil, Telugu, Marathi). "
        "Reply with ONLY a JSON object: {\"transcript\": \"...\", \"language\": \"...\"}"
    )

    # Attempt 1: Try via LangChain multimodal HumanMessage
    try:
        llm = get_llm()
        message = HumanMessage(
            content=[
                {"type": "text", "text": prompt_text},
                {
                    "type": "media",
                    "mime_type": mime_type,
                    "data": b64_audio,
                },
            ]
        )
        response = llm.invoke([message])
        response_text = response.content if hasattr(response, "content") else str(response)

        # Parse JSON from response
        # Clean any markdown code blocks
        clean_json = response_text.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        return {
            "transcript": data.get("transcript", "").strip(),
            "language": data.get("language", "English").strip(),
        }
    except Exception as lc_err:
        print(f"[LangChain Audio Notice]: {lc_err}. Using Google GenAI SDK direct audio fallback as instructed...")

    # Attempt 2: Fallback to Google GenAI SDK
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        response = client.models.generate_content(
            model=model_name,
            contents=[audio_part, prompt_text],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text.strip())
        return {
            "transcript": data.get("transcript", "").strip(),
            "language": data.get("language", "English").strip(),
        }
    except Exception as sdk_err:
        print(f"[Google SDK Audio Error]: {sdk_err}")
        return {
            "transcript": "",
            "language": "English",
        }


def process_text_query(user_text: str) -> Dict[str, Any]:
    """
    Executes the grounded RAG pipeline for text queries:
    1. Query ChromaDB for relevant policy chunks.
    2. Invoke LangChain RAG chain with JsonOutputParser.
    3. Synthesize speech using edge-tts/gTTS.
    4. Return complete response dictionary.
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

    # Synthesize audio with edge-tts / gTTS
    audio_file = generate_tts_audio(answer_text, detected_lang)
    audio_url = f"/audio/{audio_file}" if audio_file else None

    return {
        "transcript": user_text,
        "detected_language": detected_lang,
        "answer_text": answer_text,
        "sources": unique_sources,
        "answer_audio_url": audio_url,
    }


def process_audio_query(audio_bytes: bytes, mime_type: str = "audio/webm") -> Dict[str, Any]:
    """
    Executes the voice query pipeline:
    1. Direct native Gemini speech recognition & language detection.
    2. Grounded ChromaDB retrieval using the transcribed query.
    3. LangChain RAG response generation in the farmer's native tongue.
    4. Regional TTS synthesis.
    """
    # Step 1: Native speech transcription & language detection
    transcription = transcribe_and_detect_audio(audio_bytes, mime_type)
    transcript = transcription.get("transcript", "").strip()
    detected_lang = transcription.get("language", "English").strip()

    if not transcript:
        fallback_msg = (
            "क्षमा करें, आवाज़ स्पष्ट नहीं सुनाई दी। कृपया दोबारा बोलें। "
            "/ Sorry, I could not hear the audio clearly. Please try speaking again."
        )
        audio_file = generate_tts_audio(fallback_msg, "Hindi")
        return {
            "transcript": "(Audio unclear / अस्पष्ट ऑडियो)",
            "detected_language": "Hindi",
            "answer_text": fallback_msg,
            "sources": [],
            "answer_audio_url": f"/audio/{audio_file}" if audio_file else None,
        }

    # Step 2: Retrieve Chroma context using the transcribed text
    retrieved_chunks = query_chroma(transcript, top_k=3)
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

    # Step 3: LangChain RAG generation
    chain = build_text_rag_chain()
    try:
        parsed_result = chain.invoke({
            "user_query": transcript,
            "context": context_text,
        })
        # Prefer language detected from the audio turn
        final_lang = parsed_result.get("detected_language") or detected_lang
        answer_text = parsed_result.get("answer", "")
    except Exception as e:
        print(f"[ERROR in LangChain audio pipeline]: {e}")
        final_lang = detected_lang
        answer_text = (
            "I could not process the policy answer right now. "
            "Please verify your connection and try again."
        )

    # Step 4: Text-to-speech generation
    audio_file = generate_tts_audio(answer_text, final_lang)
    audio_url = f"/audio/{audio_file}" if audio_file else None

    return {
        "transcript": transcript,
        "detected_language": final_lang,
        "answer_text": answer_text,
        "sources": unique_sources,
        "answer_audio_url": audio_url,
    }
