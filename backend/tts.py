import os
import re
import uuid
import asyncio
from pathlib import Path
from typing import Optional
import edge_tts
from gtts import gTTS
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

AUDIO_OUTPUT_DIR = BASE_DIR / os.getenv("AUDIO_OUTPUT_DIR", "temp_audio")
AUDIO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# High-quality Microsoft Neural Voices for Indian languages
EDGE_VOICE_MAP = {
    "hindi": "hi-IN-SwaraNeural",
    "english": "en-IN-NeerjaNeural",
    "gujarati": "gu-IN-DhwaniNeural",
    "marathi": "mr-IN-AarohiNeural",
    "tamil": "ta-IN-PallaviNeural",
    "telugu": "te-IN-ShrutiNeural",
    "bengali": "bn-IN-TanishaaNeural",
    "kannada": "kn-IN-SapnaNeural",
    "malayalam": "ml-IN-SobhanaNeural",
    "punjabi": "pa-IN-OjasNeural",
    "urdu": "ur-IN-GulNeural",
}

# Fallback ISO 639-1 language codes for gTTS
GTTS_LANG_MAP = {
    "hindi": "hi",
    "english": "en",
    "gujarati": "gu",
    "marathi": "mr",
    "tamil": "ta",
    "telugu": "te",
    "bengali": "bn",
    "kannada": "kn",
    "malayalam": "ml",
    "punjabi": "pa",
    "urdu": "ur",
}


def clean_text_for_speech(text: str) -> str:
    """Strip markdown formatting and symbols so TTS reads smoothly."""
    # Remove markdown headers, bold, italics, bullet asterisks
    text = re.sub(r"[#*_`~>\[\]\(\)]", " ", text)
    # Remove excessive whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def detect_voice_key(language_name: str) -> str:
    """Normalize language string to match voice map."""
    lang_lower = (language_name or "english").lower().strip()
    for key in EDGE_VOICE_MAP:
        if key in lang_lower:
            return key
    return "hindi" if "hi" in lang_lower else "english"


async def _synthesize_edge(text: str, voice: str, output_file: Path) -> bool:
    """Attempt edge-tts neural voice synthesis."""
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_file))
        return output_file.exists() and output_file.stat().st_size > 0
    except Exception as e:
        print(f"[TTS WARNING] edge-tts error with voice {voice}: {e}")
        return False


def _synthesize_gtts(text: str, lang_code: str, output_file: Path) -> bool:
    """Fallback synthesis using gTTS."""
    try:
        tts = gTTS(text=text, lang=lang_code, slow=False)
        tts.save(str(output_file))
        return output_file.exists() and output_file.stat().st_size > 0
    except Exception as e:
        print(f"[TTS ERROR] gTTS fallback failed: {e}")
        return False


def generate_tts_audio(text: str, language: str = "English") -> Optional[str]:
    """
    Synthesizes speech from text in the designated Indian language.
    Tries edge-tts first (natural regional neural voice), then falls back to gTTS.
    Returns the generated audio filename (e.g., '123e4567.mp3') or None if failed.
    """
    clean_text = clean_text_for_speech(text)
    if not clean_text:
        return None

    lang_key = detect_voice_key(language)
    edge_voice = EDGE_VOICE_MAP.get(lang_key, "hi-IN-SwaraNeural")
    gtts_lang = GTTS_LANG_MAP.get(lang_key, "hi")

    filename = f"{uuid.uuid4().hex}.mp3"
    output_path = AUDIO_OUTPUT_DIR / filename

    print(f"[TTS] Synthesizing speech for language '{language}' (key: {lang_key}) -> voice: {edge_voice}")

    # 1. Try edge-tts
    try:
        # If running in an active event loop or thread
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # In an existing loop, run edge synthesis in a separate task or runner
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                success = executor.submit(
                    lambda: asyncio.run(_synthesize_edge(clean_text, edge_voice, output_path))
                ).result(timeout=15)
        else:
            success = asyncio.run(_synthesize_edge(clean_text, edge_voice, output_path))

        if success:
            return filename
    except Exception as e:
        print(f"[TTS WARNING] edge-tts execution error: {e}. Falling back to gTTS...")

    # 2. Fallback to gTTS
    print(f"[TTS] Falling back to gTTS for language code '{gtts_lang}'...")
    if _synthesize_gtts(clean_text, gtts_lang, output_path):
        return filename

    # 3. Final English gTTS fallback if regional language fails
    if gtts_lang != "en":
        print("[TTS] Falling back to English gTTS...")
        if _synthesize_gtts(clean_text, "en", output_path):
            return filename

    return None
