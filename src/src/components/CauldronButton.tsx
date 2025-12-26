import { useState, useEffect, useRef, ReactNode } from 'react';

interface CauldronButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

interface Bubble {
  id: number;
  x: number; // percent 0-100
  y: number; // pixels (relative to canvas bottom, negative is up)
  velocityY: number; // pixels per millisecond
  size: number;
  startTime: number;
  lifespan: number; // milliseconds
}

export function CauldronButton({ children, onClick, disabled, className = '' }: CauldronButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLButtonElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const idCounterRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [hovered, setHovered] = useState(false);

  // Configuration
  const MAX_BUBBLES = 6; 
  const SPAWN_INTERVAL_BASE = 1500;
  const SPAWN_INTERVAL_RANDOM = 600;
  const FRICTION = 0.992; // Retain 99.2% velocity per ~16ms frame (adjustable)

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let nextSpawnTime = performance.now() + 200;

    const spawnBubble = (currentTime: number) => {
      const id = idCounterRef.current++;
      const lifespan = 2500 + Math.random() * 2000; // 2.5s - 4.5s
      
      // Random starting speed (pixels per ms)
      // 0.03 = 30px/sec, 0.08 = 80px/sec
      const startSpeed = 0.03 + Math.random() * 0.01; 

      const newBubble: Bubble = {
        id,
        x: 15 + Math.random() * 70, 
        y: 10, // Start slightly below/at bottom edge (positive is down, we draw at height+y)
               // Actually logic: y=0 is start, we subtract velocity.
               // Let's say y starts at 0.
        velocityY: startSpeed,
        size: 4 + Math.random() * 3,
        startTime: currentTime,
        lifespan,
      };

      bubblesRef.current.push(newBubble);
      
      if (bubblesRef.current.length > MAX_BUBBLES) {
        bubblesRef.current.shift();
      }

      nextSpawnTime = currentTime + SPAWN_INTERVAL_BASE + Math.random() * SPAWN_INTERVAL_RANDOM;
    };

    const render = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = container.clientWidth;
      const displayHeight = container.clientHeight;

      // Handle resizing
      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      const isDark = document.documentElement.classList.contains('dark');

      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Avoid huge jumps if tab was inactive
      const safeDelta = Math.min(deltaTime, 50);

      if (time >= nextSpawnTime) {
        spawnBubble(time);
      }

      // Update bubbles
      bubblesRef.current.forEach(bubble => {
        // Physics update
        bubble.y -= bubble.velocityY * safeDelta;
        
        // Apply friction
        // We want velocity to decay.
        // v = v * friction ^ (dt / 16)
        const frameRatio = safeDelta / 16;
        bubble.velocityY *= Math.pow(FRICTION, frameRatio);
      });

      // Filter and Draw
      bubblesRef.current = bubblesRef.current.filter(bubble => {
        const age = time - bubble.startTime;
        const progress = age / bubble.lifespan;

        if (progress >= 1) return false;

        // Calculate opacity
        // Fade in quickly
        // Then fade out from "a certain point" (e.g. 50%)
        let opacity = 0;
        if (progress < 0.1) {
          // Fade in 0 -> 10%
          opacity = (progress / 0.1) * 0.8;
        } else if (progress < 0.5) {
          // Stable
          opacity = 0.8;
        } else {
          // Fade out 50% -> 100%
          const fadeProgress = (progress - 0.5) / 0.5;
          opacity = 0.8 * (1 - fadeProgress);
        }

        // Scale effect (popping in)
        let scale = 1;
        if (progress < 0.1) {
           scale = 0.5 + 0.5 * (progress / 0.1);
        }

        const xPos = (bubble.x / 100) * displayWidth;
        const yPos = displayHeight + bubble.y; // bubble.y is negative moving up
        
        const radius = (bubble.size * scale) / 2;

        if (opacity <= 0.01) return true; // Keep updating until dead or close enough

        ctx.save();
        ctx.globalAlpha = opacity;
        
        const gradient = ctx.createRadialGradient(
          xPos - radius * 0.4,
          yPos - radius * 0.4,
          0,
          xPos,
          yPos,
          radius
        );
        
        gradient.addColorStop(0, 'rgba(224, 231, 255, 0.9)');
        gradient.addColorStop(0.4, 'rgba(165, 180, 252, 0.6)');
        gradient.addColorStop(0.7, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        
        const shadowColor = isDark ? 'rgba(129, 140, 248, 0.5)' : 'rgba(99, 102, 241, 0.5)';
        ctx.shadowBlur = 6;
        ctx.shadowColor = shadowColor;
        
        ctx.beginPath();
        ctx.arc(xPos, yPos, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.stroke();

        ctx.restore();

        return true;
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <span
      className={`cauldron-wrap ${hovered ? 'is-hovered' : ''} ${disabled ? 'is-disabled' : ''}`}
      onMouseEnter={() => {
        if (!disabled) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button 
        ref={containerRef}
        onClick={onClick} 
        disabled={disabled} 
        className={`btn btn-cauldron btn-lg ${className}`}
      >
        <canvas
          ref={canvasRef}
          className="cauldron-bubbles"
          aria-hidden="true"
          style={{ 
            position: 'absolute', 
            inset: 0, 
            pointerEvents: 'none',
            zIndex: 2,
            width: '100%',
            height: '100%'
          }}
        />
        {children}
      </button>
    </span>
  );
}