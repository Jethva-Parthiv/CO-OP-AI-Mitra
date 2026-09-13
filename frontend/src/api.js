/**
 * API client for Co-op Mitra FastAPI Backend.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Checks backend health and Gemini API key status.
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[API] Health check failed:', err);
    return { status: 'offline', error: err.message };
  }
}

/**
 * Sends a typed text query to the RAG backend.
 */
export async function sendTextMessage(message, conversationId = null) {
  const res = await fetch(`${API_BASE}/chat/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorBody.detail || `Server error (${res.status})`);
  }

  return await res.json();
}

/**
 * Sends a recorded voice audio blob to the backend.
 * Uses native Gemini audio transcription and RAG pipeline.
 */
export async function sendAudioMessage(audioBlob, conversationId = null) {
  const formData = new FormData();
  // Provide filename with extension matching blob type
  const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
  formData.append('file', audioBlob, `speech_recording.${extension}`);

  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  const res = await fetch(`${API_BASE}/chat/audio`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorBody.detail || `Voice processing error (${res.status})`);
  }

  return await res.json();
}

/**
 * Resolves full audio URL for playback.
 */
export function resolveAudioUrl(relativeOrAbsolute) {
  if (!relativeOrAbsolute) return null;
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute;
  }
  return `${API_BASE}${relativeOrAbsolute}`;
}
