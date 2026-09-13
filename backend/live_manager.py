import os
import json
import base64
import asyncio
import logging
from typing import Optional, List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from rag import get_api_key, query_chroma

logger = logging.getLogger("coop_mitra.live")

SYSTEM_INSTRUCTION = (
    "You are 'Co-op Mitra' (सहकारी मित्र), a warm, empathetic, and knowledgeable real-time voice assistant "
    "for Indian farmers and Primary Agricultural Credit Societies (PACS) presenting at Smart India Hackathon (SIH 2026).\n\n"
    "CREATOR INFORMATION:\n"
    "Your creator and developer is Jethva Parthiv. If anyone asks who created, made, or developed you, "
    "proudly and respectfully say that you were created by Jethva Parthiv.\n\n"
    "STRICT OPERATIONAL GUIDELINES:\n"
    "1. Detect the user's spoken natural language and ALWAYS speak back in the exact same language "
    "(e.g., Hindi, Gujarati, Marathi, Tamil, Telugu, Bengali, Punjabi, English, etc.).\n"
    "2. Whenever the user asks about policies, government schemes (such as PM-KISAN, Kisan Credit Card / KCC, "
    "PMFBY crop insurance, Agriculture Infrastructure Fund / AIF, PACS computerization, fertilizer subsidies), "
    "ALWAYS call the `search_policies` tool first to retrieve verified knowledge base context.\n"
    "3. Ground your spoken answer ONLY in the facts returned by `search_policies`. "
    "If the search result indicates no relevant policy information, say honestly and politely in the user's language "
    "that you do not have verified policy records for this specific query, and suggest contacting their local PACS secretary or Kisan helpline (1551).\n"
    "4. Keep your spoken responses concise, respectful, and direct (typically 2-3 spoken sentences), "
    "ideal for a natural phone call / live audio conversation. Do not read out raw URLs or formatting marks."
)

SEARCH_POLICIES_TOOL = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="search_policies",
            description=(
                "Searches verified policy documents for Indian government schemes, PACS rules, "
                "subsidies, crop insurance, and agricultural credit."
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "query": types.Schema(
                        type="STRING",
                        description="The search query or topic to look up in the policy database.",
                    )
                },
                required=["query"],
            ),
        )
    ]
)


def execute_policy_search(query: str) -> tuple[str, List[str]]:
    """
    Searches ChromaDB for relevant policy chunks using gemini-embedding-001.
    Returns: (formatted_context_str, list_of_source_titles)
    """
    logger.info(f"[Live Tool] Executing search_policies for query: '{query}'")
    hits = query_chroma(query, top_k=3)
    if not hits:
        return (
            "No matching policy documents found in the database. "
            "Advise the farmer politely that verified records are not available for this question.",
            [],
        )

    context_parts = []
    sources = []
    for i, hit in enumerate(hits, 1):
        meta = hit.get("metadata", {})
        title = meta.get("title", meta.get("source", f"Document {i}"))
        sources.append(title)
        context_parts.append(f"--- Document: {title} ---\n{hit.get('content', '')}")

    unique_sources = list(dict.fromkeys(sources))
    return "\n\n".join(context_parts), unique_sources


async def handle_live_session(websocket: WebSocket):
    """
    Manages a single client WebSocket connection paired with a stateful Gemini Live session.
    Streams 16kHz PCM audio from browser into Gemini; streams 24kHz PCM audio & transcripts out to browser.
    Handles barge-in interruptions and real-time RAG tool execution.
    """
    await websocket.accept()
    logger.info("[Live] WebSocket client connected.")

    api_key = get_api_key()
    client = genai.Client(api_key=api_key)
    model_name = os.getenv("LIVE_MODEL_NAME", "gemini-3.1-flash-live-preview")

    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=SYSTEM_INSTRUCTION)]
        ),
        tools=[SEARCH_POLICIES_TOOL],
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    try:
        async with client.aio.live.connect(model=model_name, config=config) as session:
            logger.info(f"[Live] Successfully opened Gemini Live session ({model_name}).")
            await websocket.send_json({"type": "session_started", "model": model_name})
            await websocket.send_json({"type": "state", "state": "listening"})

            # Task 1: Forward from client WebSocket -> Gemini Live session
            async def client_to_gemini():
                try:
                    while True:
                        msg = await websocket.receive()
                        if msg.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in msg and msg["bytes"]:
                            pcm_data = msg["bytes"]
                            # Forward 16kHz PCM audio chunk to Gemini (using audio= parameter)
                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=pcm_data,
                                    mime_type="audio/pcm;rate=16000",
                                )
                            )
                        elif "text" in msg and msg["text"]:
                            try:
                                payload = json.loads(msg["text"])
                                ptype = payload.get("type")

                                if ptype == "audio":
                                    pcm_data = base64.b64decode(payload.get("data", ""))
                                    if pcm_data:
                                        await session.send_realtime_input(
                                            audio=types.Blob(
                                                data=pcm_data,
                                                mime_type="audio/pcm;rate=16000",
                                            )
                                        )
                                elif ptype == "text":
                                    user_text = payload.get("text", "").strip()
                                    if user_text:
                                        print(f"[Live] User text input: {user_text}", flush=True)
                                        await session.send_realtime_input(text=user_text)
                                elif ptype == "ping":
                                    await websocket.send_json({"type": "pong"})
                            except json.JSONDecodeError:
                                pass
                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass
                except Exception as e:
                    print(f"[Live] Exception in client_to_gemini: {e}", flush=True)

            # Task 2: Forward from Gemini Live session -> client WebSocket (continuous multi-turn)
            async def gemini_to_client():
                try:
                    while True:
                        async for response in session.receive():
                            # 1. Handle tool calls (RAG Grounding)
                            if response.tool_call:
                                await websocket.send_json({"type": "state", "state": "thinking"})
                                tool_responses = []

                                for fc in response.tool_call.function_calls:
                                    if fc.name == "search_policies":
                                        query_arg = fc.args.get("query", "")
                                        context_result, sources = execute_policy_search(query_arg)

                                        # Notify client about tool execution & sources
                                        await websocket.send_json({
                                            "type": "tool_call",
                                            "name": "search_policies",
                                            "query": query_arg,
                                            "sources": sources,
                                        })

                                        tool_responses.append(
                                            types.FunctionResponse(
                                                name=fc.name,
                                                id=fc.id,
                                                response={"result": context_result},
                                            )
                                        )
                                    else:
                                        tool_responses.append(
                                            types.FunctionResponse(
                                                name=fc.name,
                                                id=fc.id,
                                                response={"error": f"Unknown function {fc.name}"},
                                            )
                                        )

                                if tool_responses:
                                    await session.send_tool_response(function_responses=tool_responses)

                            # 2. Handle server content
                            sc = response.server_content
                            if sc:
                                # Instant barge-in notification
                                if sc.interrupted:
                                    print("[Live] Gemini signaled interruption (barge-in).", flush=True)
                                    await websocket.send_json({"type": "interrupted"})
                                    await websocket.send_json({"type": "state", "state": "listening"})

                                # Real-time interim user speech transcription (live while speaking)
                                if sc.interim_input_transcription and sc.interim_input_transcription.text:
                                    await websocket.send_json({
                                        "type": "user_transcription",
                                        "text": sc.interim_input_transcription.text,
                                        "is_interim": True,
                                        "finished": False,
                                    })

                                # Final user speech transcription (when user pauses/finishes speaking)
                                if sc.input_transcription and sc.input_transcription.text:
                                    await websocket.send_json({
                                        "type": "user_transcription",
                                        "text": sc.input_transcription.text,
                                        "is_interim": False,
                                        "finished": True,
                                    })

                                # Assistant speech transcription (incremental delta chunks)
                                if sc.output_transcription and sc.output_transcription.text:
                                    await websocket.send_json({
                                        "type": "assistant_transcription",
                                        "delta": sc.output_transcription.text,
                                        "text": sc.output_transcription.text,
                                        "finished": bool(sc.output_transcription.finished),
                                    })

                                # Model output turn (audio PCM 24kHz or text fallback)
                                if sc.model_turn:
                                    for part in sc.model_turn.parts:
                                        if part.inline_data and part.inline_data.data:
                                            # Base64 encode 24kHz PCM chunk
                                            b64_pcm = base64.b64encode(part.inline_data.data).decode("ascii")
                                            await websocket.send_json({
                                                "type": "audio",
                                                "data": b64_pcm,
                                            })
                                        elif part.text and not sc.output_transcription:
                                            # Text fallback only if output_transcription is absent
                                            await websocket.send_json({
                                                "type": "assistant_transcription",
                                                "delta": part.text,
                                                "text": part.text,
                                            })

                                # Turn complete (Gemini finished generation; playback will continue until finished)
                                if sc.turn_complete:
                                    await websocket.send_json({"type": "turn_complete"})

                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass
                except Exception as e:
                    print(f"[Live] Exception in gemini_to_client: {e}", flush=True)

            # Run both tasks concurrently until disconnect
            task1 = asyncio.create_task(client_to_gemini())
            task2 = asyncio.create_task(gemini_to_client())

            done, pending = await asyncio.wait(
                [task1, task2],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for p in pending:
                p.cancel()
            for d in done:
                if not d.cancelled() and d.exception():
                    print(f"[Live Error in task]: {d.exception()}", flush=True)

    except WebSocketDisconnect:
        logger.info("[Live] WebSocket disconnected normally.")
    except Exception as e:
        logger.error(f"[Live] Error during live session: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        logger.info("[Live] Session closed.")
