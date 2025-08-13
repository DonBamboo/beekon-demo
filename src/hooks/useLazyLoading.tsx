import React, { Suspense } from "react";
import { ChartSkeleton } from "../components/LoadingStates";

// Higher-order component for creating lazy components
export function withLazyLoading<T extends React.ComponentType<any>>(
  Component: T,
  fallback: React.ComponentType = () => React.createElement(ChartSkeleton)
) {
  type Props = React.ComponentProps<T>;

  const LazyComponent: React.ComponentType<Props> = React.lazy(async () => ({
    default: Component,
  }));

  return React.memo((props: Props) => (
    <Suspense fallback={React.createElement(fallback)}>
      <LazyComponent {...props} />
    </Suspense>
  ));
}

// Hook for lazy loading components conditionally
export function useLazyComponent<
  T extends React.ComponentType<Record<string, unknown>>
>(componentLoader: () => Promise<{ default: T }>, shouldLoad: boolean = true) {
  const [Component, setComponent] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (shouldLoad && !Component && !isLoading) {
      setIsLoading(true);
      setError(null);

      componentLoader()
        .then(({ default: LoadedComponent }) => {
          setComponent(() => LoadedComponent);
        })
        .catch((err) => {
          setError(
            err instanceof Error ? err : new Error("Failed to load component")
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [shouldLoad, Component, isLoading, componentLoader]);

  return { Component, isLoading, error };
}

// Intersection Observer based lazy loading
export function useIntersectionLazyLoading<
  T extends React.ComponentType<Record<string, unknown>>
>(
  componentLoader: () => Promise<{ default: T }>,
  options: IntersectionObserverInit = {}
) {
  const [Component, setComponent] = React.useState<T | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [ref, setRef] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!ref || Component || isLoading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsLoading(true);
          setError(null);

          componentLoader()
            .then(({ default: LoadedComponent }) => {
              setComponent(() => LoadedComponent);
            })
            .catch((err) => {
              setError(
                err instanceof Error
                  ? err
                  : new Error("Failed to load component")
              );
            })
            .finally(() => {
              setIsLoading(false);
            });

          observer.disconnect();
        }
      },
      {
        rootMargin: "50px",
        threshold: 0.1,
        ...options,
      }
    );

    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, Component, isLoading, componentLoader, options]);

  return { Component, isLoading, error, ref: setRef };
}
