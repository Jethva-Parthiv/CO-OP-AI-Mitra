import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

from pipeline import process_text_query

app = FastAPI(
    title="Co-op Mitra — Multilingual Voice Chatbot API",
    description="Backend API for farmers and cooperative societies (SIH 2026)",
    version="1.0.0",
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TextChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    transcript: str
    detected_language: str
    answer_text: str
    sources: List[str]
    answer_audio_url: Optional[str] = None


@app.get("/health")
def health_check():
    """Liveness check for presentation demo."""
    api_key_set = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    return {
        "status": "ok",
        "service": "co-op-mitra-backend",
        "gemini_api_key_configured": api_key_set,
    }


@app.post("/chat/text", response_model=ChatResponse)
def chat_text_endpoint(req: TextChatRequest):
    """
    Text-based grounded RAG chat endpoint.
    Retrieves policy documents from ChromaDB and generates a grounded response with LangChain Gemini.
    """
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Query message cannot be empty.")

    result = process_text_query(req.message)
    return ChatResponse(
        transcript=result.get("transcript", req.message),
        detected_language=result.get("detected_language", "English"),
        answer_text=result.get("answer_text", ""),
        sources=result.get("sources", []),
        answer_audio_url=result.get("answer_audio_url"),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)
