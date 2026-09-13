# 🌾 Co-op Mitra (सहकारी मित्र)
### Real-Time, Interruptible Voice Assistant for Farmers & Cooperative Societies (PACS) — SIH 2026

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react)](https://react.dev)
[![Gemini Live](https://img.shields.io/badge/AI-Gemini_3.1_Flash_Live-4285F4?logo=google)](https://aistudio.google.com)
[![ChromaDB](https://img.shields.io/badge/VectorDB-ChromaDB-FF6B6B)](https://www.trychroma.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📖 Real-Time Voice Conversation (Phone Call Experience)

Unlike traditional turn-based bots ("press button → record → send → wait → play"), **Co-op Mitra** operates as a **live, continuous, interruptible voice conversation** powered by the **Gemini Live API (`gemini-3.1-flash-live-preview`)**.

- **Natural Phone Call Feel**: The farmer toggles "Start conversation" once. The microphone is continuously live.
- **Native Voice Activity Detection (VAD)**: The model automatically detects when the farmer starts and stops speaking.
- **Instant Barge-In (Interruption Capability)**: If the farmer cuts in mid-sentence while the assistant is speaking, the model immediately stops speaking, the frontend instantly halts queued audio playback, and the system transitions back to listening within a fraction of a second.
- **Zero Hallucination with Live RAG Tool-Calling**: While conversing, the Live session autonomously triggers the `search_policies(query)` function tool, querying a local **ChromaDB** store embedded with `gemini-embedding-001` to fetch verified government rules, subsidies, and schemes.
- **Multilingual Recognition & Generation**: Speaks natively in Hindi, Gujarati, Marathi, Tamil, Telugu, English, and more, responding in the exact language spoken by the farmer.

---

## 🏗️ System Architecture

```
React (16kHz PCM mic stream) ⇄ WebSocket (WS /chat/live) ⇄ FastAPI ⇄ Gemini Live session (gemini-3.1-flash-live-preview)
                                                                            │
                                                                            └─ Function Tool: search_policies(query)
                                                                                   │
                                                                                   ▼
                                                                           ChromaDB Vector Store
                                                                           (gemini-embedding-001)
```

1. **Client Audio Stream**: Web Audio API captures continuous microphone input downsampled to 16kHz 16-bit linear PCM and streams chunks over the WebSocket.
2. **Gemini Live Session**: Server connects to `client.aio.live.connect(model="gemini-3.1-flash-live-preview")` with function tool declarations and bidirectional audio streaming.
3. **Mid-Stream RAG Tool Call**: When a policy question is asked, Gemini calls `search_policies` mid-conversation. FastAPI queries ChromaDB and returns verified chunks via `session.send_tool_response()`.
4. **Real-Time Playback & Barge-In**: Gemini streams raw 24kHz PCM audio back to the frontend. If the user interrupts, Gemini emits `interrupted: true`, and the client instantly purges all scheduled audio buffers (`audioStreamer.stopAndClear()`).
5. **Fallback Single-Turn Text**: `POST /chat/text` remains available as a reliable backup input method.

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.10+ and [`uv`](https://github.com/astral-sh/uv) (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Node.js 18+ and `npm`
- A free Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

---

### 1. Backend Setup

```bash
# Navigate to the backend folder
cd backend

# Synchronize virtual environment and dependencies
uv sync

# Create your .env file
cp .env.example .env
```

Open `backend/.env` and ensure your Gemini API key is set:
```env
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
LIVE_MODEL_NAME=gemini-3.1-flash-live-preview
CHAT_MODEL_NAME=gemini-3.1-flash-lite
EMBEDDING_MODEL=models/gemini-embedding-001
CHROMA_PERSIST_DIR=data/chroma_db
POLICIES_DIR=data/policies
PORT=8000
HOST=0.0.0.0
```

#### Ingest Policy Documents (Run Once)
```bash
uv run python ingest.py
```

#### Run the Backend Server
```bash
uv run uvicorn main:app --reload --port 8000
```
Backend will be live at: `http://localhost:8000` (WebSocket endpoint at `ws://localhost:8000/chat/live`).

---

### 2. Frontend Setup

In a separate terminal:
```bash
# Navigate to the frontend folder
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🎯 Rehearsal & Live Presentation Checklist

- [x] **Start Live Conversation**: Click the center button once. State transitions to `listening`.
- [x] **Speak Naturally**: Ask *"पीएम किसान योजना में सालाना कितनी सहायता मिलती है?"* — model searches ChromaDB and speaks the verified answer directly.
- [x] **Test Barge-In / Interruption**: Speak while the assistant is talking. The assistant stops immediately and the UI visibly snaps to `listening`.
- [x] **Regional Language**: Ask in Gujarati, Marathi, or Telugu; answered in the same language.
- [x] **Out-of-Scope Guardrail**: Ask an irrelevant question (e.g. sports score); model politely explains it only has verified government policy records.
- [x] **Single-Turn Text Fallback**: Type a question in the bottom input bar to verify the single-turn text fallback.
- [x] **Reconnect / Reset**: Toggle "End Conversation" or click Reset; socket cleanly cleans up and restarts without memory leaks.
