import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, User, Sparkles, BookOpen, Globe } from 'lucide-react';
import { resolveAudioUrl } from '../api';

export default function ChatBubble({ message, onAudioPlayStart, onAudioPlayEnd }) {
  const isUser = message.sender === 'user';
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onAudioPlayEnd?.(message.id);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [message.id, onAudioPlayEnd]);

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.warn('Audio play prevented:', err);
      });
      onAudioPlayStart?.(message.id);
    }
  };

  const restartAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((err) => {
      console.warn('Audio play prevented:', err);
    });
    onAudioPlayStart?.(message.id);
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '18px',
        padding: '0 4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isUser ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: '85%',
        }}
      >
        {/* Avatar Icon */}
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: isUser ? 'var(--primary)' : '#fef3c7',
            color: isUser ? '#ffffff' : '#b45309',
            boxShadow: 'var(--shadow-sm)',
            border: isUser ? 'none' : '1px solid #fde68a',
          }}
        >
          {isUser ? <User size={20} /> : <Sparkles size={20} />}
        </div>

        {/* Message Content Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: isUser ? 'var(--primary)' : 'var(--card-bg)',
            color: isUser ? '#ffffff' : 'var(--text-main)',
            padding: '14px 18px',
            borderRadius: isUser ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
            boxShadow: isUser
              ? '0 4px 12px rgba(6, 78, 59, 0.2)'
              : '0 4px 14px rgba(0, 0, 0, 0.06)',
            border: isUser ? 'none' : '1px solid var(--card-border)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Header row for Assistant: Language Badge & Sender Name */}
          {!isUser && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '6px',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  letterSpacing: '0.02em',
                }}
              >
                सहकारी मित्र • Co-op Mitra
              </span>

              {message.detected_language && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#ecfdf5',
                    color: '#065f46',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: '1px solid #a7f3d0',
                  }}
                >
                  <Globe size={12} />
                  <span>{message.detected_language}</span>
                </div>
              )}
            </div>
          )}

          {/* User Voice Indicator */}
          {isUser && message.isVoice && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                opacity: 0.85,
                marginBottom: '2px',
              }}
            >
              <Volume2 size={13} />
              <span>Spoken Question / आवाज़ द्वारा</span>
            </div>
          )}

          {/* Message Text Body */}
          <div
            style={{
              fontSize: '15px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.text}
            {message.isStreaming && (
              <span className="animate-pulse" style={{ display: 'inline-block', marginLeft: '4px' }}>
                ▍
              </span>
            )}
          </div>

          {/* Interrupted Tag */}
          {!isUser && message.interrupted && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#d97706',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                padding: '2px 8px',
                borderRadius: '6px',
                marginTop: '2px',
                fontWeight: 600,
              }}
            >
              <span>⚡ Interrupted by user • बीच में टोका गया</span>
            </div>
          )}

          {/* Audio Player Bar (for Assistant responses with audio) */}
          {!isUser && message.answer_audio_url && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                padding: '8px 12px',
                marginTop: '4px',
                border: '1px solid #e2e8f0',
              }}
            >
              <audio
                ref={audioRef}
                src={resolveAudioUrl(message.answer_audio_url)}
                preload="metadata"
              />

              <button
                onClick={togglePlayAudio}
                aria-label={isPlaying ? 'Pause spoken response' : 'Play spoken response'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isPlaying ? '#059669' : '#065f46',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  transition: 'background 0.2s',
                }}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
                <span>{isPlaying ? 'Pause' : 'Listen / सुनें'}</span>
              </button>

              <button
                onClick={restartAudio}
                title="Replay from start"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RotateCcw size={16} />
              </button>

              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>
                {isPlaying ? 'Playing neural voice...' : 'Spoken Audio'}
              </span>
            </div>
          )}

          {/* Policy Sources List */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: '#64748b',
                  fontWeight: 600,
                }}
              >
                <BookOpen size={12} />
                <span>Verified Sources:</span>
              </div>
              {message.sources.map((src, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '11px',
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {src}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
