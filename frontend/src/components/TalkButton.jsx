import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Volume2, VolumeX, AlertCircle } from 'lucide-react';

/**
 * Large, state-driven Voice Talk Button.
 * States: 'idle' | 'recording' | 'processing' | 'speaking'
 */
export default function TalkButton({
  status = 'idle', // 'idle' | 'recording' | 'processing' | 'speaking'
  onStartRecording,
  onStopRecording,
  onStopSpeaking,
  disabled = false,
}) {
  const [recordSeconds, setRecordSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (status === 'recording') {
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleClick = () => {
    if (disabled) return;
    if (status === 'idle') {
      onStartRecording?.();
    } else if (status === 'recording') {
      onStopRecording?.();
    } else if (status === 'speaking') {
      onStopSpeaking?.();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      {/* Primary Interaction Button */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulsing ring during recording */}
        {status === 'recording' && (
          <div
            className="recording-pulse"
            style={{
              position: 'absolute',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.25)',
              zIndex: 1,
            }}
          />
        )}

        <button
          onClick={handleClick}
          disabled={disabled || status === 'processing'}
          aria-label={
            status === 'recording'
              ? 'Stop recording'
              : status === 'speaking'
              ? 'Stop speaking'
              : 'Press to talk'
          }
          style={{
            position: 'relative',
            zIndex: 2,
            width: '84px',
            height: '84px',
            borderRadius: '50%',
            border: 'none',
            cursor: disabled || status === 'processing' ? 'not-allowed' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow:
              status === 'recording'
                ? '0 10px 25px -5px rgba(239, 68, 68, 0.5), 0 8px 10px -6px rgba(239, 68, 68, 0.4)'
                : status === 'speaking'
                ? '0 10px 25px -5px rgba(16, 185, 129, 0.5), 0 8px 10px -6px rgba(16, 185, 129, 0.4)'
                : '0 10px 20px -3px rgba(6, 78, 59, 0.35), 0 4px 6px -4px rgba(6, 78, 59, 0.2)',
            backgroundColor:
              status === 'recording'
                ? '#ef4444'
                : status === 'processing'
                ? '#f59e0b'
                : status === 'speaking'
                ? '#10b981'
                : '#065f46',
            color: '#ffffff',
            transform: status === 'recording' ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          {status === 'idle' && <Mic size={36} strokeWidth={2.2} />}
          {status === 'recording' && <Square size={30} fill="#ffffff" />}
          {status === 'processing' && <Loader2 size={36} className="animate-spin-slow" />}
          {status === 'speaking' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '24px' }}>
              <span className="sound-bar" />
              <span className="sound-bar" />
              <span className="sound-bar" />
              <span className="sound-bar" />
              <span className="sound-bar" />
            </div>
          )}
        </button>
      </div>

      {/* Dynamic Status Text & Subtitle */}
      <div style={{ textAlign: 'center' }}>
        {status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary)' }}>
              बोलने के लिए दबाएं • Tap to Speak
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Ask in Hindi, Gujarati, Marathi, Tamil, Telugu, English
            </span>
          </div>
        )}

        {status === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#dc2626' }}>
                Recording... {formatTimer(recordSeconds)}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: '#b91c1c' }}>
              Tap button again when finished speaking
            </span>
          </div>
        )}

        {status === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#d97706' }}>
              नीति खोज रहे हैं • Analyzing & Grounding...
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Gemini Direct Audio & Policy Retrieval
            </span>
          </div>
        )}

        {status === 'speaking' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={16} color="#059669" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#059669' }}>
                उत्तर सुना रहे हैं • Speaking Response
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Tap button to stop audio
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
