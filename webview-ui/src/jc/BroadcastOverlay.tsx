import { useEffect, useState } from 'react';

interface BroadcastMessage {
  text: string;
  timestamp: number;
}

interface BroadcastOverlayProps {
  message: BroadcastMessage | null;
}

const DISPLAY_DURATION = 5000; // 5 seconds
const FADE_DURATION = 500;

export function BroadcastOverlay({ message }: BroadcastOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (!message) return;
    setDisplayText(message.text);
    setVisible(true);
    setFading(false);

    const fadeTimer = setTimeout(() => setFading(true), DISPLAY_DURATION - FADE_DURATION);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setFading(false);
    }, DISPLAY_DURATION);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [message]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION}ms ease-out`,
      }}
    >
      {/* Dimmed background band */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
          height: 80,
          background: 'rgba(0, 0, 0, 0.85)',
          borderTop: '2px solid #ffd700',
          borderBottom: '2px solid #ffd700',
        }}
      />
      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          padding: '0 20px',
          maxWidth: '80%',
        }}
      >
        {/* Title badge */}
        <div
          style={{
            fontSize: '14px',
            color: '#ffd700',
            letterSpacing: '3px',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          OWNER BROADCAST
        </div>
        {/* Message text */}
        <div
          style={{
            fontSize: '24px',
            color: '#ffffff',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(255, 215, 0, 0.3)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {displayText}
        </div>
      </div>
    </div>
  );
}

export type { BroadcastMessage };
