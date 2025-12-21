import { useState, useEffect, useRef, ReactNode } from 'react';

interface Bubble {
  id: number;
  left: number;
  size: number;
  duration: number;
}

interface CauldronButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const MAX_BUBBLES = 4;

export function CauldronButton({ children, onClick, disabled, className = '' }: CauldronButtonProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    const spawnBubble = () => {
      const id = idRef.current++;
      const duration = 2.5 + Math.random() * 1.5;
      
      const newBubble: Bubble = {
        id,
        left: 15 + Math.random() * 70,
        size: 4 + Math.random() * 3,
        duration,
      };
      
      setBubbles(prev => {
        const limited = prev.length >= MAX_BUBBLES ? prev.slice(1) : prev;
        return [...limited, newBubble];
      });

      setTimeout(() => {
        setBubbles(prev => prev.filter(b => b.id !== id));
      }, duration * 1000 + 50);
    };

    const initialTimeout = setTimeout(spawnBubble, 500);
    const interval = setInterval(spawnBubble, 1800 + Math.random() * 700);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const wrapClassName = [
    'cauldron-wrap',
    isHovered ? 'is-hovered' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={wrapClassName}
      onMouseEnter={() => {
        if (!disabled) setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button onClick={onClick} disabled={disabled} className={`btn btn-cauldron btn-lg ${className}`}>
        <div className="cauldron-bubbles" aria-hidden="true">
          {bubbles.map(bubble => (
            <span
              key={bubble.id}
              className="cauldron-bubble"
              style={{
                left: `${bubble.left}%`,
                width: `${bubble.size}px`,
                height: `${bubble.size}px`,
                animationDuration: `${bubble.duration}s`,
              }}
            />
          ))}
        </div>
        {children}
      </button>
    </span>
  );
}

