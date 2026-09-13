import React, { useState, useEffect, useRef } from 'react';
import { Send, RotateCcw, AlertTriangle, CheckCircle, Wifi, Globe, Volume2 } from 'lucide-react';
import ConversationView from './components/ConversationView';
import TalkButton from './components/TalkButton';
import { checkHealth, sendTextMessage, sendAudioMessage, resolveAudioUrl } from './api';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'processing' | 'speaking'
  const [inputText, setInputText] = useState('');
  const [lastLanguage, setLastLanguage] = useState(null);
  const [backendHealth, setBackendHealth] = useState({ online: false, keyConfigured: false });
  const [errorMessage, setErrorMessage] = useState(null);

  // Audio recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const activeAudioRef = useRef(null);

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

  // Stop current active playing audio
  const stopCurrentAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (status === 'speaking') {
      setStatus('idle');
    }
  };

  // Play audio response automatically
  const playResponseAudio = (audioUrl) => {
    if (!audioUrl) {
      setStatus('idle');
      return;
    }

    stopCurrentAudio();
    const fullUrl = resolveAudioUrl(audioUrl);
    const audio = new Audio(fullUrl);
    activeAudioRef.current = audio;

    setStatus('speaking');

    audio.onended = () => {
      setStatus('idle');
      activeAudioRef.current = null;
    };

    audio.onerror = (e) => {
      console.warn('[Audio Playback Error]:', e);
      setStatus('idle');
      activeAudioRef.current = null;
    };

    audio.play().catch((err) => {
      console.warn('Auto-play blocked by browser policy:', err);
      setStatus('idle');
    });
  };

  // Start microphone recording
  const handleStartRecording = async () => {
    stopCurrentAudio();
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Detect best supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Stop all audio tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        if (audioBlob.size < 1000) {
          setStatus('idle');
          setErrorMessage('Recording was too short. Please hold to speak your question.');
          return;
        }

        await processAudioSubmission(audioBlob);
      };

      recorder.start();
      setStatus('recording');
    } catch (err) {
      console.error('Microphone error:', err);
      setStatus('idle');
      setErrorMessage(
        'Microphone permission denied or unavailable. Please enable microphone permissions in your browser.'
      );
    }
  };

  // Stop microphone recording and submit
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.stop();
      setStatus('processing');
    }
  };

  // Submit audio blob to backend
  const processAudioSubmission = async (audioBlob) => {
    setStatus('processing');
    setErrorMessage(null);

    const tempUserMsgId = `user_${Date.now()}`;
    // Add temporary visual bubble for user speech
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserMsgId,
        sender: 'user',
        text: '🎙️ Spoken question recorded. Transcribing via Gemini...',
        isVoice: true,
      },
    ]);

    try {
      const response = await sendAudioMessage(audioBlob);

      // Update the user message with transcribed text
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempUserMsgId
            ? {
                ...msg,
                text: response.transcript || '(Spoken Audio Question)',
                detected_language: response.detected_language,
              }
            : msg
        )
      );

      // Add assistant response
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

      // Auto-play spoken response
      if (response.answer_audio_url) {
        playResponseAudio(response.answer_audio_url);
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error('Audio processing error:', err);
      setErrorMessage(err.message || 'Failed to process voice query.');
      setStatus('idle');
    }
  };

  // Submit typed text message
  const handleSendText = async (textToSend = null) => {
    const query = (textToSend || inputText).trim();
    if (!query || status === 'processing') return;

    stopCurrentAudio();
    setErrorMessage(null);
    setInputText('');

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      isVoice: false,
    };

    setMessages((prev) => [...prev, userMsg]);
    setStatus('processing');

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

      if (response.answer_audio_url) {
        playResponseAudio(response.answer_audio_url);
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error('Text chat error:', err);
      setErrorMessage(err.message || 'Failed to process query.');
      setStatus('idle');
    }
  };

  const handleResetConversation = () => {
    stopCurrentAudio();
    setMessages([]);
    setLastLanguage(null);
    setErrorMessage(null);
    setStatus('idle');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '960px',
        margin: '0 auto',
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
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
                SIH 2026
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-light)', margin: 0 }}>
              Multilingual Voice Assistant for Farmers & Cooperative Societies
            </p>
          </div>
        </div>

        {/* Right Status Badges & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Last Turn Language Badge */}
          {lastLanguage && (
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
                fontWeight: 600,
                border: '1px solid #a7f3d0',
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
        onAudioPlayEnd={() => setStatus('idle')}
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
          gap: '16px',
        }}
      >
        {/* Large Centered Talk Button */}
        <TalkButton
          status={status}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onStopSpeaking={stopCurrentAudio}
          disabled={!backendHealth.online}
        />

        {/* Text Input Bar Fallback (Stage reliability) */}
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
            disabled={status === 'processing' || status === 'recording'}
            placeholder="Or type in Hindi, Gujarati, English... (मैसेज लिखें)"
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
            disabled={!inputText.trim() || status === 'processing' || status === 'recording'}
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
