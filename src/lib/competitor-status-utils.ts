// Competitor status utilities
import { useMemo } from 'react';
import type { CompetitorStatus } from '@/types/database';

// Hook to get status color for custom styling
export function useCompetitorStatusColor(status: CompetitorStatus['status']) {
  return useMemo(() => {
    switch (status) {
      case 'pending': return 'yellow';
      case 'analyzing': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      default: return 'gray';
    }
  }, [status]);
}