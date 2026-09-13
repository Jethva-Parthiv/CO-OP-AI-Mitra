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
                        if "bytes" in msg and msg["bytes"]:
                            pcm_data = msg["bytes"]
                            # Forward 16kHz PCM audio chunk to Gemini
                            await session.send_realtime_input(
                                media=types.Blob(
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
                                            media=types.Blob(
                                                data=pcm_data,
                                                mime_type="audio/pcm;rate=16000",
                                            )
                                        )
                                elif ptype == "text":
                                    user_text = payload.get("text", "").strip()
                                    if user_text:
                                        logger.info(f"[Live] User text input: {user_text}")
                                        await session.send_realtime_input(text=user_text)
                                elif ptype == "ping":
                                    await websocket.send_json({"type": "pong"})
                            except json.JSONDecodeError:
                                pass
                except (WebSocketDisconnect, asyncio.CancelledError):
                    logger.info("[Live] Client reader disconnected or cancelled.")
                except Exception as e:
                    logger.warning(f"[Live] Exception in client_to_gemini: {e}")

            # Task 2: Forward from Gemini Live session -> client WebSocket
            async def gemini_to_client():
                try:
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
                                logger.info("[Live] Gemini signaled interruption (barge-in).")
                                await websocket.send_json({"type": "interrupted"})
                                await websocket.send_json({"type": "state", "state": "listening"})

                            # User speech transcription
                            if sc.input_transcription and sc.input_transcription.text:
                                await websocket.send_json({
                                    "type": "user_transcription",
                                    "text": sc.input_transcription.text,
                                    "finished": bool(sc.input_transcription.finished),
                                })

                            # Assistant speech transcription
                            if sc.output_transcription and sc.output_transcription.text:
                                await websocket.send_json({
                                    "type": "assistant_transcription",
                                    "text": sc.output_transcription.text,
                                    "finished": bool(sc.output_transcription.finished),
                                })

                            # Model output turn (audio PCM 24kHz or text)
                            if sc.model_turn:
                                for part in sc.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        # Base64 encode 24kHz PCM chunk
                                        b64_pcm = base64.b64encode(part.inline_data.data).decode("ascii")
                                        await websocket.send_json({
                                            "type": "audio",
                                            "data": b64_pcm,
                                        })
                                    if part.text:
                                        await websocket.send_json({
                                            "type": "assistant_text",
                                            "text": part.text,
                                        })

                            # Turn complete
                            if sc.turn_complete:
                                await websocket.send_json({"type": "turn_complete"})
                                await websocket.send_json({"type": "state", "state": "listening"})

                except (WebSocketDisconnect, asyncio.CancelledError):
                    logger.info("[Live] Gemini reader disconnected or cancelled.")
                except Exception as e:
                    logger.error(f"[Live] Exception in gemini_to_client: {e}")

            # Run both tasks concurrently until disconnect
            task1 = asyncio.create_task(client_to_gemini())
            task2 = asyncio.create_task(gemini_to_client())

            done, pending = await asyncio.wait(
                [task1, task2],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for p in pending:
                p.cancel()

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
