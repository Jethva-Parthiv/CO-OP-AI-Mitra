import React, { useState, useEffect, useRef } from 'react';
import { Send, RotateCcw, AlertTriangle, Globe, Radio } from 'lucide-react';
import ConversationView from './components/ConversationView';
import TalkButton from './components/TalkButton';
import { checkHealth, sendTextMessage } from './api';
import audioStreamer from './utils/audioStreamer';

function getWebSocketUrl(path) {
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) {
    const parsed = new URL(apiBase, loc.origin);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${parsed.host}${path}`;
  }
  // Connect directly to backend port 8000 in dev mode to bypass Node proxy socket drops
  if (loc.port === '5173') {
    return `${protocol}//${loc.hostname}:8000${path}`;
  }
  return `${protocol}//${loc.host}${path}`;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
  const [inputText, setInputText] = useState('');
  const [lastLanguage, setLastLanguage] = useState(null);
  const [backendHealth, setBackendHealth] = useState({ online: false, keyConfigured: false });
  const [errorMessage, setErrorMessage] = useState(null);

  const wsRef = useRef(null);
  const currentUserMsgIdRef = useRef(null);
  const currentAssistantMsgIdRef = useRef(null);

  // Check health on mount
  useEffect(() => {
    async function verifyBackend() {
      const health = await checkHealth();
      if (health.status === 'ok') {
        setBackendHealth({
          online: true,
          keyConfigured: Boolean(health.gemini_api_key_configured),
        });
      } else {
        setBackendHealth({ online: false, keyConfigured: false });
      }
    }
    verifyBackend();
    const interval = setInterval(verifyBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  // AudioStreamer playback state sync
  useEffect(() => {
    audioStreamer.onPlayStart = () => {
      setStatus('speaking');
    };
    audioStreamer.onPlayEnd = () => {
      setStatus((prev) => (prev === 'speaking' ? 'listening' : prev));
    };
    return () => {
      audioStreamer.cleanup();
    };
  }, []);

  // Start live WebSocket conversation with Gemini Live API
  const startLiveConversation = async () => {
    setErrorMessage(null);
    setStatus('connecting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Microphone access is not supported in this browser.');
      setStatus('idle');
      return;
    }

    try {
      const wsUrl = getWebSocketUrl('/chat/live');
      console.log('[Live] Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('[Live] WebSocket connected. Starting mic capture...');
        setIsLive(true);
        setStatus('listening');

        try {
          await audioStreamer.startRecording((pcmChunk) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(pcmChunk);
            }
          });
        } catch (micErr) {
          console.error('[Live] Microphone capture failed:', micErr);
          setErrorMessage('Could not start microphone. Please check your browser permissions.');
          endLiveConversation();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleLiveServerEvent(msg);
        } catch (err) {
          console.warn('[Live] Non-JSON message from server:', event.data);
        }
      };

      ws.onerror = (err) => {
        console.error('[Live] WebSocket error:', err);
        setErrorMessage('Connection error with Gemini Live session. Please try restarting.');
      };

      ws.onclose = (event) => {
        console.log('[Live] WebSocket closed:', event.code, event.reason);
        audioStreamer.stopRecording();
        audioStreamer.stopAndClear();
        setIsLive(false);
        setStatus('idle');
        currentUserMsgIdRef.current = null;
        currentAssistantMsgIdRef.current = null;
      };
    } catch (err) {
      console.error('[Live] Failed to open WebSocket session:', err);
      setErrorMessage('Failed to connect to Live session: ' + (err.message || 'Network error'));
      setStatus('idle');
    }
  };

  // End live conversation
  const endLiveConversation = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
    audioStreamer.cleanup();
    setIsLive(false);
    setStatus('idle');
    currentUserMsgIdRef.current = null;
    currentAssistantMsgIdRef.current = null;
  };

  const handleToggleConversation = () => {
    if (isLive) {
      endLiveConversation();
    } else {
      startLiveConversation();
    }
  };

  // Handle incoming server events from Gemini Live
  const handleLiveServerEvent = (msg) => {
    const type = msg.type;

    if (type === 'session_started') {
      setStatus('listening');
    } else if (type === 'audio') {
      // Streamed 24kHz PCM chunk
      audioStreamer.enqueueAudioChunk(msg.data);
    } else if (type === 'interrupted') {
      // NATIVE BARGE-IN: User spoke while assistant was talking!
      console.log('[Live] Interruption event received -> Halting playback instantly.');
      audioStreamer.stopAndClear();
      setStatus('listening');

      // Mark the active assistant message as interrupted
      if (currentAssistantMsgIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgIdRef.current
              ? { ...m, interrupted: true, isStreaming: false }
              : m
          )
        );
        currentAssistantMsgIdRef.current = null;
      }
    } else if (type === 'user_transcription') {
      // User speech transcription (live interim hypothesis or final recognized text)
      const incoming = (msg.text || '').trim();
      const finished = Boolean(msg.finished);
      if (!incoming) return;

      if (!currentUserMsgIdRef.current) {
        const newId = `user_${Date.now()}`;
        currentUserMsgIdRef.current = newId;
        setMessages((prev) => [
          ...prev,
          {
            id: newId,
            sender: 'user',
            text: incoming,
            isVoice: true,
            isStreaming: !finished,
          },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentUserMsgIdRef.current
              ? { ...m, text: incoming, isStreaming: !finished }
              : m
          )
        );
      }

      if (finished) {
        currentUserMsgIdRef.current = null;
      }
    } else if (type === 'assistant_transcription' || type === 'assistant_text') {
      // Incremental assistant speech transcription (streamed delta text)
      const delta = msg.delta !== undefined ? msg.delta : (msg.text || '');
      if (!delta) return;

      if (!currentAssistantMsgIdRef.current) {
        const newId = `asst_${Date.now()}`;
        currentAssistantMsgIdRef.current = newId;
        setMessages((prev) => [
          ...prev,
          {
            id: newId,
            sender: 'assistant',
            text: delta,
            isStreaming: true,
            sources: [],
          },
        ]);
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgIdRef.current
              ? {
                  ...m,
                  text: m.text + delta,
                  isStreaming: true,
                }
              : m
          )
        );
      }
    } else if (type === 'tool_call') {
      // RAG Grounding Search executed
      setStatus('thinking');
      const sources = msg.sources || [];
      if (currentAssistantMsgIdRef.current && sources.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgIdRef.current
              ? { ...m, sources: Array.from(new Set([...(m.sources || []), ...sources])) }
              : m
          )
        );
      }
    } else if (type === 'state') {
      if (msg.state === 'thinking') {
        setStatus('thinking');
      } else if (msg.state === 'listening' && !audioStreamer.isPlaying) {
        setStatus('listening');
      }
    } else if (type === 'turn_complete') {
      if (currentAssistantMsgIdRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAssistantMsgIdRef.current
              ? { ...m, isStreaming: false }
              : m
          )
        );
        currentAssistantMsgIdRef.current = null;
      }
      if (!audioStreamer.isPlaying) {
        setStatus('listening');
      }
    } else if (type === 'error') {
      setErrorMessage(msg.message || 'An error occurred during the live session.');
      setStatus('listening');
    }
  };

  // Submit typed text message (Reliable single-turn fallback)
  const handleSendText = async (textToSend = null) => {
    const query = (textToSend || inputText).trim();
    if (!query || status === 'thinking' || status === 'connecting') return;

    // Stop current audio if playing
    audioStreamer.stopAndClear();
    setErrorMessage(null);
    setInputText('');

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      isVoice: false,
    };
    setMessages((prev) => [...prev, userMsg]);

    // If live session is active, send text through the live WebSocket
    if (isLive && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setStatus('thinking');
      wsRef.current.send(JSON.stringify({ type: 'text', text: query }));
      return;
    }

    // Otherwise use HTTP fallback
    setStatus('thinking');
    try {
      const response = await sendTextMessage(query);

      const assistantMsg = {
        id: `asst_${Date.now()}`,
        sender: 'assistant',
        text: response.answer_text,
        detected_language: response.detected_language,
        sources: response.sources || [],
        answer_audio_url: response.answer_audio_url,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setLastLanguage(response.detected_language);
      setStatus(isLive ? 'listening' : 'idle');
    } catch (err) {
      console.error('Text chat error:', err);
      setErrorMessage(err.message || 'Failed to process query.');
      setStatus(isLive ? 'listening' : 'idle');
    }
  };

  const handleResetConversation = () => {
    audioStreamer.stopAndClear();
    setMessages([]);
    setLastLanguage(null);
    setErrorMessage(null);
    currentUserMsgIdRef.current = null;
    currentAssistantMsgIdRef.current = null;
    if (isLive) {
      setStatus('listening');
    } else {
      setStatus('idle');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '960px',
        margin: '0 auto',
        backgroundColor: 'rgba(255, 255, 255, 0.78)',
        boxShadow: 'var(--shadow-xl)',
        position: 'relative',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--card-border)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            🌾
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  margin: 0,
                }}
              >
                सहकारी मित्र • Co-op Mitra
              </h1>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid #fde68a',
                  letterSpacing: '0.04em',
                }}
              >
                LIVE AUDIO
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', margin: 0 }}>
              Real-Time Interruptible Voice Assistant • Gemini 3.1 Flash Live
            </p>
          </div>
        </div>

        {/* Right Status Badges & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Live Session Active Indicator */}
          {isLive && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#ecfdf5',
                color: '#065f46',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid #a7f3d0',
              }}
            >
              <Radio size={13} className="animate-pulse" color="#059669" />
              <span>Live Session Active</span>
            </div>
          )}

          {/* Last Turn Language Badge */}
          {lastLanguage && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#f8fafc',
                color: '#334155',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid #e2e8f0',
              }}
            >
              <Globe size={13} />
              <span>{lastLanguage}</span>
            </div>
          )}

          {/* Backend Health Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: backendHealth.online ? '#f0fdf4' : '#fef2f2',
              color: backendHealth.online ? '#15803d' : '#b91c1c',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              border: `1px solid ${backendHealth.online ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: backendHealth.online ? '#16a34a' : '#dc2626',
              }}
            />
            <span>{backendHealth.online ? 'Backend Online' : 'Connecting...'}</span>
          </div>

          {/* Reset Button */}
          {messages.length > 0 && (
            <button
              onClick={handleResetConversation}
              title="Reset conversation"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 0.2s',
              }}
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </header>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#fffbeb',
            color: '#b45309',
            padding: '10px 16px',
            fontSize: '13px',
            borderBottom: '1px solid #fde68a',
          }}
        >
          <AlertTriangle size={16} color="#d97706" />
          <span style={{ flex: 1 }}>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#92400e',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Conversation Transcript */}
      <ConversationView
        messages={messages}
        onSelectPrompt={(text) => handleSendText(text)}
        onAudioPlayStart={() => setStatus('speaking')}
        onAudioPlayEnd={() => setStatus(isLive ? 'listening' : 'idle')}
      />

      {/* Bottom Voice & Text Interaction Area */}
      <footer
        style={{
          borderTop: '1px solid var(--card-border)',
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(10px)',
          padding: '18px 20px 22px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        {/* Real-time Conversation Toggle Button */}
        <TalkButton
          isLive={isLive}
          status={status}
          onToggleConversation={handleToggleConversation}
          disabled={!backendHealth.online}
        />

        {/* Text Input Bar Fallback (Single-turn Stage Reliability) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendText();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            maxWidth: '680px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
            padding: '4px 6px',
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={status === 'thinking' || status === 'connecting'}
            placeholder="Single-turn text backup: Type in Hindi, Gujarati, English... (मैसेज लिखें)"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              padding: '10px 14px',
              fontSize: '14px',
              fontFamily: 'inherit',
              color: 'var(--text-main)',
            }}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || status === 'thinking' || status === 'connecting'}
            aria-label="Send text question"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: inputText.trim() ? 'var(--primary)' : '#e2e8f0',
              color: inputText.trim() ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '8px',
              width: '40px',
              height: '40px',
              cursor: inputText.trim() ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </footer>
    </div>
  );
}
