# 🌾 Co-op Mitra (सहकारी मित्र)
### Multilingual Voice Chatbot for Farmers & Cooperative Societies (PACS) — SIH 2026 MVP

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react)](https://react.dev)
[![Gemini](https://img.shields.io/badge/AI-Gemini_2.5_Flash-4285F4?logo=google)](https://aistudio.google.com)
[![ChromaDB](https://img.shields.io/badge/VectorDB-ChromaDB-FF6B6B)](https://www.trychroma.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📖 Problem & Solution Summary

Indian farmers and Primary Agricultural Credit Society (PACS) members frequently encounter barriers in understanding government agricultural schemes, subsidies, and cooperative regulations due to fragmented information, dense bureaucratic English documents, and low digital literacy. **Co-op Mitra** solves this by offering a zero-friction voice assistant: a farmer simply taps a button, speaks their question naturally in their mother tongue (Hindi, Gujarati, Marathi, Tamil, Telugu, English, etc.), and receives an instant, verified spoken and textual answer in the same language. The answers are strictly grounded in an authoritative government scheme knowledge base to ensure zero hallucination of critical financial and legal terms.

---

## 🏗️ System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               FARMER / MEMBER                │
                    │      (Spoken Voice or Typed Query)           │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            React Frontend (Vite)             │
                    │  • 4-State TalkButton (Idle/Rec/Proc/Speak)  │
                    │  • Chat Transcript & Audio Auto-Player       │
                    │  • Language Detection & Policy Source Pills  │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP POST (/chat/audio, /chat/text)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            FastAPI Backend (`uv`)            │
                    ├──────────────────────────────────────────────┤
                    │                                              │
                    │  1. Native Multimodal Audio Transcription    │
                    │     └─► Gemini Flash (Direct Audio Input)    │
                    │                                              │
                    │  2. Semantic Query Embedding                 │
                    │     └─► Gemini Embedding (models/embedding-001│
                    │                                              │
                    │  3. Local Vector Search                      │
                    │     └─► ChromaDB Policy Store (Top-k Chunks) │
                    │                                              │
                    │  4. Grounded Reasoning & Translation         │
                    │     └─► LangChain + ChatGoogleGenerativeAI   │
                    │         (Strictly Grounded, Structured JSON) │
                    │                                              │
                    │  5. Regional Neural Voice Synthesis          │
                    │     └─► edge-tts (Regional Indian Neural)    │
                    │         + gTTS Fallback Engine               │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼
                                 Spoken Audio + Transcript
```

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

Open `backend/.env` and add your Gemini API key:
```env
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=models/embedding-001
CHROMA_PERSIST_DIR=data/chroma_db
POLICIES_DIR=data/policies
AUDIO_OUTPUT_DIR=temp_audio
PORT=8000
HOST=0.0.0.0
```

#### Ingest Policy Documents (Run Once Before First Use)
Ingest the curated government policy documents into ChromaDB:
```bash
uv run python ingest.py
```

#### Run the Backend Server
```bash
uv run uvicorn main:app --reload --port 8000
```
Backend will be live at: `http://localhost:8000` (API docs at `http://localhost:8000/docs`).

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
Open `http://localhost:5173` in your browser to start the conversation!

---

## 🎯 Verified Demo Questions (SIH 2026 Presentation)

Try asking these questions either by voice or using the fallback text input:

| Topic | Sample Question | Grounded Key Answer |
|---|---|---|
| **PM-KISAN** | *"What is the annual financial assistance under PM-KISAN?"* | ₹6,000 per year in three equal 4-monthly installments of ₹2,000 via DBT. |
| **PM-KISAN (Hindi)** | *"पीएम किसान योजना में ₹2000 की किस्त पाने के लिए क्या जरूरी है?"* | ई-केवाईसी (e-KYC), आधार सीडिंग, और राज्य राजस्व विभाग द्वारा भूमि सीडिंग अनिवार्य है। |
| **KCC Loan** | *"What is the effective interest rate on Kisan Credit Card?"* | 4% per annum for prompt repayment (7% base after 2% subvention, minus 3% prompt incentive). |
| **PACS Computerization** | *"How does PACS computerization help cooperative farmers?"* | Cloud-based ERP linking PACS to DCCBs, transparent digital audit, and multi-purpose business services (CSCs, fertilizer distribution). |
| **PMFBY (Crop Loss)** | *"What is the deadline to report crop loss under PM Fasal Bima Yojana?"* | Within **72 hours** of localized calamity to insurance company, bank, or PACS. |
| **Out-of-Scope Guardrail** | *"Who won the IPL cricket tournament in 2024?"* | The bot will decline politely stating it only has verified government policy records. |

---

## ⚠️ Known Limitations (MVP Scope)

- **Seed Knowledge Base**: The MVP is pre-loaded with 6 core agricultural and cooperative policies (`PM-KISAN`, `KCC`, `PMFBY`, `PACS Computerization`, `AIF`, `e-NAM`). Queries outside these policies will be politely declined.
- **Gemini Free-Tier Rate Limits**: The free tier of Gemini API is subject to RPM (requests-per-minute) thresholds. If rate limits are reached, wait 10 seconds before the next turn.
- **Browser Audio Permissions**: Direct audio capture requires microphone permissions enabled in the browser (`chrome://settings/content/microphone` or `localhost` permission prompt).
