import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

interface UseIntersectionObserverReturn {
  ref: React.RefObject<HTMLDivElement>;
  isIntersecting: boolean;
  disconnect: () => void;
}

export function useIntersectionObserver({
  threshold = 0.1,
  rootMargin = '200px',
  enabled = true,
}: UseIntersectionObserverOptions = {}): UseIntersectionObserverReturn {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const disconnect = () => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    setIsIntersecting(false);
  };

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    const element = ref.current;
    if (!element) return;

    // Check if IntersectionObserver is supported
    if (!window.IntersectionObserver) {
      // IntersectionObserver is not supported
      return;
    }

    disconnect(); // Clean up any existing observer

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold,
        rootMargin,
      }
    );

    observerRef.current = observer;
    observer.observe(element);

    return () => {
      disconnect();
    };
  }, [threshold, rootMargin, enabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    ref,
    isIntersecting,
    disconnect,
  };
}