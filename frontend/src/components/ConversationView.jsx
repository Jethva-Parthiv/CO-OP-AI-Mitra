import React, { useRef, useEffect } from 'react';
import ChatBubble from './ChatBubble';
import { HelpCircle, Sparkles, ShieldCheck, Cpu } from 'lucide-react';

const DEMO_PROMPTS = [
  {
    title: 'PM-KISAN Benefits',
    query: 'What is the annual financial assistance under PM-KISAN and how is it disbursed?',
    lang: 'English',
  },
  {
    title: 'पीएम किसान ई-केवाईसी (Hindi)',
    query: 'पीएम किसान योजना में ₹2000 की किस्त पाने के लिए ई-केवाईसी कैसे करें?',
    lang: 'हिन्दी',
  },
  {
    title: 'Kisan Credit Card Interest',
    query: 'What is the effective interest rate under KCC for prompt repayment?',
    lang: 'English',
  },
  {
    title: 'PACS Computerization',
    query: 'How does PACS computerization and cloud ERP help cooperative farmers?',
    lang: 'English',
  },
  {
    title: 'फसल बीमा दावा (Hindi)',
    query: 'फसल खराब होने पर कितने घंटे में बीमा कंपनी या पैक्स को सूचना देनी होती है?',
    lang: 'हिन्दी',
  },
  {
    title: 'Agri Infrastructure Fund',
    query: 'What is the interest subvention under Agriculture Infrastructure Fund (AIF)?',
    lang: 'English',
  },
];

export default function ConversationView({
  messages = [],
  onSelectPrompt,
  onAudioPlayStart,
  onAudioPlayEnd,
}) {
  const containerRef = useRef(null);
  const isAutoScrollActiveRef = useRef(true);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Auto-scroll only if user is already near bottom (within 120px)
    isAutoScrollActiveRef.current = scrollHeight - scrollTop - clientHeight < 120;
  };

  useEffect(() => {
    if (containerRef.current && isAutoScrollActiveRef.current) {
      requestAnimationFrame(() => {
        if (containerRef.current && isAutoScrollActiveRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 16px',
          textAlign: 'center',
          minHeight: '400px',
        }}
      >
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(6, 78, 59, 0.3)',
            marginBottom: '18px',
          }}
        >
          <Sparkles size={34} />
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--primary)',
            marginBottom: '8px',
            letterSpacing: '-0.02em',
          }}
        >
          सहकारी मित्र • Co-op Mitra
        </h2>

        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-muted)',
            maxWidth: '560px',
            lineHeight: 1.6,
            marginBottom: '28px',
          }}
        >
          Multilingual voice assistant for Indian farmers and Primary Agricultural Credit Societies (PACS).
          Press the microphone button below to ask your question by voice, or select a sample query to test.
        </p>

        {/* Feature Badges */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #a7f3d0',
            }}
          >
            <ShieldCheck size={16} />
            <span>100% Policy Grounded (Zero Hallucinations)</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #fde68a',
            }}
          >
            <Cpu size={16} />
            <span>Native Voice Input & Regional TTS</span>
          </div>
        </div>

        {/* Quick Suggestion Prompt Chips */}
        <div style={{ width: '100%', maxWidth: '640px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-light)',
              marginBottom: '14px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <HelpCircle size={15} />
            <span>Try Asking / पूछ कर देखें:</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '10px',
            }}
          >
            {DEMO_PROMPTS.map((item, idx) => (
              <button
                key={idx}
                onClick={() => onSelectPrompt?.(item.query)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#059669';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
                    {item.title}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      backgroundColor: '#f1f5f9',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      color: '#475569',
                    }}
                  >
                    {item.lang}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  "{item.query}"
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 12px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {messages.map((msg) => (
        <ChatBubble
          key={msg.id}
          message={msg}
          onAudioPlayStart={onAudioPlayStart}
          onAudioPlayEnd={onAudioPlayEnd}
        />
      ))}
    </div>
  );
}
