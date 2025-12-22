import { OverlayScrollbars } from 'overlayscrollbars';
import { useEffect, useRef, ReactNode } from 'react';
import type { PartialOptions } from 'overlayscrollbars';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical' | 'both';
}

const baseOptions: PartialOptions = {
  scrollbars: {
    theme: 'os-theme-custom',
    autoHide: 'leave',
    autoHideDelay: 400,
    clickScroll: true,
  },
};

export function ScrollArea({ 
  children, 
  className = '', 
  orientation = 'both',
}: ScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osInstanceRef = useRef<OverlayScrollbars | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only initialize if not already initialized
    if (!osInstanceRef.current) {
      osInstanceRef.current = OverlayScrollbars(container, {
        ...baseOptions,
        overflow: {
          x: orientation === 'vertical' ? 'hidden' : 'scroll',
          y: orientation === 'horizontal' ? 'hidden' : 'scroll',
        },
      });
    }

    return () => {
      osInstanceRef.current?.destroy();
      osInstanceRef.current = null;
    };
  }, []); // Empty deps - only run on mount/unmount

  return (
    <div 
      ref={containerRef} 
      className={className}
      data-overlayscrollbars-initialize
    >
      {children}
    </div>
  );
}

// Horizontal-only scroll area with fixed height for tab lists
// Supports drag-to-scroll anywhere in the area
export function HScrollArea({ 
  children, 
  className = '',
  height,
  dragScroll = true,
}: { 
  children: ReactNode; 
  className?: string;
  height?: string | number;
  dragScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osInstanceRef = useRef<OverlayScrollbars | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only initialize if not already initialized
    if (!osInstanceRef.current) {
      osInstanceRef.current = OverlayScrollbars(container, {
        ...baseOptions,
        overflow: {
          x: 'scroll',
          y: 'hidden',
        },
      });
    }

    return () => {
      osInstanceRef.current?.destroy();
      osInstanceRef.current = null;
    };
  }, []); // Empty deps - only run on mount/unmount

  // Get the viewport element from OverlayScrollbars
  const getViewport = () => {
    return osInstanceRef.current?.elements().viewport ?? null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!dragScroll) return;
    const viewport = getViewport();
    if (!viewport) return;
    
    isDragging.current = true;
    startX.current = e.pageX - viewport.offsetLeft;
    scrollLeft.current = viewport.scrollLeft;
    containerRef.current?.classList.add('drag-scrolling');
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !dragScroll) return;
    e.preventDefault();
    
    const viewport = getViewport();
    if (!viewport) return;
    
    const x = e.pageX - viewport.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    viewport.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    containerRef.current?.classList.remove('drag-scrolling');
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    containerRef.current?.classList.remove('drag-scrolling');
  };

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={height ? { height, cursor: dragScroll ? 'grab' : undefined } : { cursor: dragScroll ? 'grab' : undefined }}
      data-overlayscrollbars-initialize
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}
