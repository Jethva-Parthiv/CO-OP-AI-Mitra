import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
from contextlib import asynccontextmanager

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

from pipeline import process_text_query
from live_manager import handle_live_session
from rag import get_chroma_collection
from ingest import ingest_policies


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes and auto-ingests policy documents into ChromaDB on cold-start (e.g. Render)."""
    try:
        col = get_chroma_collection()
        if col.count() == 0:
            print("[Startup] ChromaDB collection is empty. Auto-ingesting policy documents...", flush=True)
            ingest_policies()
            print(f"[Startup] Ingested {col.count()} policy chunks into ChromaDB.", flush=True)
        else:
            print(f"[Startup] ChromaDB collection active with {col.count()} policy chunks.", flush=True)
    except Exception as err:
        print(f"[Startup] ChromaDB auto-check note: {err}", flush=True)
    yield


app = FastAPI(
    title="Co-op Mitra — Multilingual Voice Chatbot API",
    description="Backend API for farmers and cooperative societies (SIH 2026)",
    version="1.0.0",
    lifespan=lifespan,
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


@app.websocket("/chat/live")
async def chat_live_websocket(websocket: WebSocket):
    """
    Real-time, bidirectional voice streaming endpoint powered by Gemini Live API (gemini-3.1-flash-live-preview).
    Streams 16kHz PCM from browser, executes search_policies tool via ChromaDB,
    and streams 24kHz audio + native barge-in events back to the client.
    """
    await handle_live_session(websocket)


@app.post("/chat/text", response_model=ChatResponse)
def chat_text_endpoint(req: TextChatRequest):
    """
    Text-based grounded RAG chat endpoint (Single-turn fallback).
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
