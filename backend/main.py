import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

from pipeline import process_text_query
from live_manager import handle_live_session

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


@app.post("/chat/audio", response_model=ChatResponse)
async def chat_audio_endpoint(
    file: UploadFile = File(...),
    conversation_id: Optional[str] = Form(None),
):
    """
    Voice-based chat endpoint:
    1. Sends audio directly to Gemini for native transcription & language detection.
    2. Retrieves top-k policy documents from ChromaDB.
    3. LangChain generates grounded answer in detected regional language.
    4. Synthesizes voice audio via edge-tts/gTTS.
    """
    if not file:
        raise HTTPException(status_code=400, detail="Audio file is required.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty.")

    mime_type = file.content_type or "audio/webm"
    result = process_audio_query(audio_bytes, mime_type=mime_type)

    return ChatResponse(
        transcript=result.get("transcript", ""),
        detected_language=result.get("detected_language", "English"),
        answer_text=result.get("answer_text", ""),
        sources=result.get("sources", []),
        answer_audio_url=result.get("answer_audio_url"),
    )


@app.get("/audio/{file_id}")
def get_audio_file(file_id: str):
    """Serves synthesized TTS audio files to the frontend."""
    # Sanitize file_id to prevent directory traversal
    safe_name = Path(file_id).name
    file_path = AUDIO_OUTPUT_DIR / safe_name

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found or expired.")

    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg",
        filename=safe_name,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)
