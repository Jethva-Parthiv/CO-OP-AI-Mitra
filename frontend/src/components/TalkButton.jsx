import React from 'react';
import { Mic, PhoneOff, Loader2, Volume2, Sparkles, Radio } from 'lucide-react';

/**
 * Real-time Gemini Live Conversation Toggle & State Indicator.
 *
 * Props:
 * - isLive: boolean (whether persistent live session is active)
 * - status: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
 * - onToggleConversation: () => void (starts or ends continuous session)
 * - disabled: boolean
 */
export default function TalkButton({
  isLive = false,
  status = 'idle',
  onToggleConversation,
  disabled = false,
}) {
  const handleClick = () => {
    if (disabled) return;
    onToggleConversation?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
      {/* Primary Action Button */}
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Animated Rings for Active States */}
        {isLive && status === 'listening' && (
          <div
            className="recording-pulse"
            style={{
              position: 'absolute',
              width: '105px',
              height: '105px',
              borderRadius: '50%',
              backgroundColor: 'rgba(16, 185, 129, 0.25)',
              zIndex: 1,
            }}
          />
        )}

        {isLive && status === 'thinking' && (
          <div
            className="recording-pulse"
            style={{
              position: 'absolute',
              width: '105px',
              height: '105px',
              borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.25)',
              zIndex: 1,
            }}
          />
        )}

        {isLive && status === 'speaking' && (
          <div
            className="recording-pulse"
            style={{
              position: 'absolute',
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              backgroundColor: 'rgba(5, 150, 105, 0.3)',
              zIndex: 1,
            }}
          />
        )}

        <button
          onClick={handleClick}
          disabled={disabled || status === 'connecting'}
          aria-label={isLive ? 'End live conversation' : 'Start live conversation'}
          style={{
            position: 'relative',
            zIndex: 2,
            width: '88px',
            height: '88px',
            borderRadius: '50%',
            border: 'none',
            cursor: disabled || status === 'connecting' ? 'not-allowed' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: !isLive
              ? '0 10px 25px -3px rgba(6, 78, 59, 0.4), 0 4px 6px -4px rgba(6, 78, 59, 0.2)'
              : status === 'speaking'
              ? '0 12px 28px -4px rgba(5, 150, 105, 0.5), 0 6px 12px -4px rgba(5, 150, 105, 0.3)'
              : status === 'thinking'
              ? '0 12px 28px -4px rgba(217, 119, 6, 0.5), 0 6px 12px -4px rgba(217, 119, 6, 0.3)'
              : '0 12px 28px -4px rgba(16, 185, 129, 0.4), 0 6px 12px -4px rgba(16, 185, 129, 0.3)',
            backgroundColor: !isLive
              ? '#065f46'
              : status === 'speaking'
              ? '#047857'
              : status === 'thinking'
              ? '#d97706'
              : '#059669',
            color: '#ffffff',
            transform: isLive ? 'scale(1.05)' : 'scale(1)',
          }}
        >
          {status === 'connecting' && <Loader2 size={36} className="animate-spin-slow" />}

          {!isLive && status !== 'connecting' && <Mic size={38} strokeWidth={2.3} />}

          {isLive && status === 'listening' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <Radio size={32} className="animate-pulse" />
              <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em' }}>LIVE</span>
            </div>
          )}

          {isLive && status === 'thinking' && <Sparkles size={34} className="animate-spin-slow" />}

          {isLive && status === 'speaking' && (
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

      {/* Dynamic Status Text & Subtitle - Fixed slot heights prevent any layout fluctuation */}
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          minHeight: '86px',
        }}
      >
        {/* Title Slot (Fixed height: 24px) */}
        <div style={{ height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {!isLive && status !== 'connecting' && (
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>
              लाइव बातचीत शुरू करें • Start Live Conversation
            </span>
          )}

          {status === 'connecting' && (
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#d97706' }}>
              Gemini Live सत्र शुरू हो रहा है... • Connecting to Gemini Live
            </span>
          )}

          {isLive && status === 'listening' && (
            <>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 10px #10b981',
                }}
              />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#047857' }}>
                सुन रहे हैं • Listening...
              </span>
            </>
          )}

          {isLive && status === 'thinking' && (
            <>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  boxShadow: '0 0 10px #f59e0b',
                }}
              />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#b45309' }}>
                नीति जांच रहे हैं • Thinking & Querying Policies...
              </span>
            </>
          )}

          {isLive && status === 'speaking' && (
            <>
              <Volume2 size={18} color="#059669" />
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}>
                उत्तर सुना रहे हैं • Speaking Response
              </span>
            </>
          )}
        </div>

        {/* Subtitle / Tip Slot (Fixed height: 22px) */}
        <div style={{ height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!isLive && status !== 'connecting' && (
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Continuous, real-time voice call with instant barge-in (कटौती सक्षम)
            </span>
          )}

          {status === 'connecting' && (
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Opening persistent full-duplex audio stream
            </span>
          )}

          {isLive && status === 'listening' && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Speak freely in Hindi, Gujarati, English — no tapping needed
            </span>
          )}

          {isLive && status === 'thinking' && (
            <span style={{ fontSize: '12px', color: 'var(--text-light)' }}>
              Retrieving verified rules from ChromaDB knowledge base
            </span>
          )}

          {isLive && status === 'speaking' && (
            <span
              style={{
                fontSize: '11px',
                color: '#065f46',
                backgroundColor: '#ecfdf5',
                padding: '2px 8px',
                borderRadius: '10px',
                fontWeight: 600,
                border: '1px solid #a7f3d0',
              }}
            >
              💡 Speak anytime to interrupt (बीच में कभी भी बोल सकते हैं)
            </span>
          )}
        </div>

        {/* Action Button Slot (Fixed height: 32px) */}
        <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isLive && (
            <button
              onClick={onToggleConversation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fca5a5',
                borderRadius: '20px',
                padding: '4px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fecaca';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fee2e2';
              }}
            >
              <PhoneOff size={13} />
              <span>End Conversation • बातचीत समाप्त करें</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
