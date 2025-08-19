import { Suspense, useEffect } from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import { useTrueNavigation } from '@/hooks/useTrueNavigation';
import { InlineLoading } from '@/components/LoadingStates';

// Import pages directly (no lazy loading for instant navigation)
import Dashboard from '@/pages/Dashboard';
import Analysis from '@/pages/Analysis';
import Competitors from '@/pages/Competitors';
import Settings from '@/pages/Settings';
import Websites from '@/pages/Websites';

/**
 * Unified dashboard container that provides instant navigation between core pages.
 * This component never unmounts, preserving all state and cache across navigation.
 */
export function AppDashboard() {
  const { getCurrentPage } = useAppState();
  const { currentPath } = useTrueNavigation();
  const currentPage = getCurrentPage();

  // Remove leading slash and handle default case
  const page = currentPage.replace('/', '') || 'dashboard';
  
  // Debug logging for navigation
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🏠 AppDashboard render (persistent):', {
        currentPage,
        currentPath,
        resolvedPage: page
      });
    }
  }, [currentPage, currentPath, page]);
  
  // Scroll restoration - always start at top when navigating to a new page
  useEffect(() => {
    // Scroll to top whenever the page changes
    window.scrollTo(0, 0);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📜 Scroll restored to top for page:', page);
    }
  }, [page]); // Trigger whenever the active page changes

  // All pages are always mounted, only visibility changes
  const isPageActive = (pageName: string) => page === pageName;
  
  // Render all pages simultaneously with visibility toggling
  const renderPersistentPages = () => (
    <>
      {/* Dashboard Page */}
      <div 
        style={{ display: isPageActive('dashboard') ? 'block' : 'none' }}
        className="page-container"
      >
        <Dashboard />
      </div>
      
      {/* Analysis Page */}
      <div 
        style={{ display: isPageActive('analysis') ? 'block' : 'none' }}
        className="page-container"
      >
        <Analysis />
      </div>
      
      {/* Competitors Page */}
      <div 
        style={{ display: isPageActive('competitors') ? 'block' : 'none' }}
        className="page-container"
      >
        <Competitors />
      </div>
      
      {/* Websites Page */}
      <div 
        style={{ display: isPageActive('websites') ? 'block' : 'none' }}
        className="page-container"
      >
        <Websites />
      </div>
      
      {/* Settings Page - Keep lazy loading for less critical page */}
      <div 
        style={{ display: isPageActive('settings') ? 'block' : 'none' }}
        className="page-container"
      >
        <Suspense fallback={<InlineLoading message="Loading settings..." />}>
          <Settings />
        </Suspense>
      </div>
    </>
  );

  return (
    <div className="app-dashboard">
      {/* Debug info when DEBUG_MODE is enabled */}
      {import.meta.env.VITE_DEBUG_MODE === 'true' && (
        <div className="fixed top-2 right-2 z-50 bg-black/80 text-white text-xs p-2 rounded">
          Page: {page} | URL: {currentPath} | Mode: Persistent
        </div>
      )}
      {renderPersistentPages()}
    </div>
  );
}

export default AppDashboard;