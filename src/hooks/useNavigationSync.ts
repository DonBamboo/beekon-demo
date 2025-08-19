import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '@/hooks/appStateHooks';

/**
 * Synchronizes URL changes with global navigation state.
 * This hook ensures that direct URL navigation and back/forward buttons work correctly
 * with our SPA-style navigation system.
 */
export function useNavigationSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const { navigateToPage, getCurrentPage } = useAppState();

  // Sync URL changes to global state (handles back/forward, direct URL access)
  useEffect(() => {
    const currentGlobalPage = getCurrentPage();
    const currentUrlPath = location.pathname;
    
    // Only update global state if URL changed from external source (not our navigation)
    if (currentGlobalPage !== currentUrlPath) {
      navigateToPage(currentUrlPath);
      
    }
  }, [location.pathname, navigateToPage, getCurrentPage]);

  // Function to navigate programmatically (updates both state and URL)
  const navigateTo = (path: string) => {
    // Update global state first for instant UI response
    navigateToPage(path);
    
    // Update URL if different (handles browser history)
    if (location.pathname !== path) {
      navigate(path, { replace: false });
      
    }
  };

  return {
    navigateTo,
    currentPath: location.pathname,
    currentPage: getCurrentPage(),
  };
}