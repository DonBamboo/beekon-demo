import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppState } from '@/hooks/appStateHooks';

/**
 * True SPA navigation hook that bypasses React Router for internal navigation.
 * Updates URL without triggering route changes, providing instant navigation.
 */
export function useTrueNavigation() {
  const location = useLocation();
  const { navigateToPage, getCurrentPage } = useAppState();

  // Parse current page from URL
  const getCurrentPageFromUrl = useCallback((pathname: string): string => {
    // Extract the main page from pathname (e.g., "/analysis/xyz" -> "/analysis")
    const pathParts = pathname.split('/').filter(Boolean);
    return pathParts.length > 0 ? `/${pathParts[0]}` : '/dashboard';
  }, []);

  // Sync URL changes to global state (for back/forward, direct access)
  useEffect(() => {
    const currentUrlPath = getCurrentPageFromUrl(location.pathname);
    const currentGlobalPage = getCurrentPage();
    
    if (currentGlobalPage !== currentUrlPath) {
      navigateToPage(currentUrlPath);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 URL sync (true navigation):', {
          from: currentGlobalPage,
          to: currentUrlPath,
          fullPath: location.pathname
        });
      }
    }
  }, [location.pathname, navigateToPage, getCurrentPage, getCurrentPageFromUrl]);

  // Navigate without React Router - pure URL manipulation
  const navigateTo = useCallback((path: string) => {
    // Update global state immediately for instant UI response
    navigateToPage(path);
    
    // Update URL without triggering React Router navigation
    if (location.pathname !== path) {
      window.history.pushState(null, '', path);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🚀 True navigation (no reload):', {
          newPath: path,
          previousPath: location.pathname,
          method: 'pushState'
        });
      }
    }
  }, [navigateToPage, location.pathname]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const newPath = getCurrentPageFromUrl(window.location.pathname);
      navigateToPage(newPath);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Browser navigation (back/forward):', {
          newPath,
          fullPath: window.location.pathname
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigateToPage, getCurrentPageFromUrl]);

  return {
    navigateTo,
    currentPath: location.pathname,
    currentPage: getCurrentPage(),
  };
}