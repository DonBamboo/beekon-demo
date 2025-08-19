import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWebsiteStatusContext } from '@/contexts/WebsiteStatusContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { copyToClipboard, formatDebugData, subscribeToDebugEvents, getDebugEvents, clearDebugEvents, type DebugEvent } from '@/lib/debug-utils';

interface LegacyDebugEvent {
  id: string;
  timestamp: number;
  type: 'real-time' | 'app-state' | 'ui-event' | 'manual';
  source: string;
  websiteId?: string;
  status?: string;
  data: unknown;
}

type CombinedDebugEvent = DebugEvent | LegacyDebugEvent;

export function RealTimeDebugger() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<CombinedDebugEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DebugEvent['category']>('all');
  const eventsRef = useRef<HTMLDivElement>(null);
  
  const { state: appState } = useAppState();
  const { websites, currentWorkspace } = useWorkspace();
  const websiteStatusContext = useWebsiteStatusContext();
  const { toast } = useToast();

  // Subscribe to global debug events
  useEffect(() => {
    const unsubscribe = subscribeToDebugEvents((event: DebugEvent) => {
      setEvents(prev => {
        const updated = [...prev, event];
        return updated.slice(-200); // Keep last 200 events
      });
    });

    // Load existing events
    setEvents(getDebugEvents().slice(-200));

    return unsubscribe;
  }, []);

  // Track legacy events for backward compatibility
  const addEvent = useCallback((event: Omit<LegacyDebugEvent, 'id' | 'timestamp'>) => {
    const newEvent: LegacyDebugEvent = {
      ...event,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };
    
    setEvents(prev => {
      const updated = [...prev, newEvent];
      return updated.slice(-200); // Keep last 200 events
    });
  }, []);

  // Filter events based on current filters
  const filteredEvents = events.filter(event => {
    // Type filter
    if (filter !== 'all') {
      const eventType = 'severity' in event ? 
        (event.severity === 'high' || event.severity === 'critical' ? 'error' :
         event.severity === 'medium' ? 'warning' : 'info') :
        'info';
      if (eventType !== filter) return false;
    }

    // Category filter
    if (categoryFilter !== 'all' && 'category' in event) {
      if (event.category !== categoryFilter) return false;
    }

    return true;
  });

  // Listen for custom events
  useEffect(() => {
    const handleWebsiteStatusUpdate = (event: CustomEvent) => {
      addEvent({
        type: 'ui-event',
        source: 'custom-event',
        websiteId: event.detail?.websiteId,
        status: event.detail?.status,
        data: event.detail,
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('websiteStatusUpdate', handleWebsiteStatusUpdate as EventListener);
      
      return () => {
        window.removeEventListener('websiteStatusUpdate', handleWebsiteStatusUpdate as EventListener);
      };
    }
    return undefined;
  }, [addEvent]);

  // Track app state changes
  useEffect(() => {
    addEvent({
      type: 'app-state',
      source: 'app-state-change',
      data: {
        websiteCount: appState.workspace.websites.length,
        websites: appState.workspace.websites.map(w => ({
          id: w.id,
          domain: w.domain,
          status: w.crawl_status,
          updated_at: w.updated_at
        }))
      },
    });
  }, [appState.workspace.websites, addEvent]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && eventsRef.current) {
      eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
    }
  }, [filteredEvents, autoScroll]);

  // Manual refresh function
  const triggerManualRefresh = useCallback(() => {
    addEvent({
      type: 'manual',
      source: 'manual-refresh',
      data: { action: 'force-refresh' },
    });

    // Dispatch custom event to force UI refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('websiteStatusUpdate', { 
        detail: { 
          source: 'manual-refresh',
          timestamp: Date.now(),
          allWebsites: true
        } 
      }));
    }
  }, [addEvent]);

  const clearEvents = useCallback(() => {
    clearDebugEvents();
    setEvents([]);
  }, []);

  // Copy functionality
  const copyEvent = useCallback(async (event: CombinedDebugEvent) => {
    const eventType = 'category' in event ? event.category : event.type;
    const formattedData = formatDebugData(event, {
      eventType,
      workspace: currentWorkspace?.name,
      websiteCount: websites?.length,
      connectionStatus: websiteStatusContext.isConnected,
    });
    
    const success = await copyToClipboard(formattedData);
    if (success) {
      toast({
        title: "Event Copied",
        description: `${eventType} event copied to clipboard`,
      });
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy event to clipboard",
        variant: "destructive",
      });
    }
  }, [currentWorkspace?.name, websites?.length, websiteStatusContext.isConnected, toast]);

  // Get event icon based on type and severity
  const getEventIcon = (event: CombinedDebugEvent) => {
    if ('severity' in event) {
      switch (event.severity) {
        case 'critical':
        case 'high':
          return <AlertTriangle className="h-3 w-3 text-red-500" />;
        case 'medium':
          return <AlertCircle className="h-3 w-3 text-yellow-500" />;
        case 'low':
        default:
          return <Info className="h-3 w-3 text-blue-500" />;
      }
    }
    return <Info className="h-3 w-3 text-gray-500" />;
  };

  // Get event color based on type and severity
  const getEventColor = (event: CombinedDebugEvent): string => {
    if ('category' in event) {
      switch (event.category) {
        case 'component':
        case 'real-time':
          return '#10b981'; // Green
        case 'service':
        case 'database':
          return '#3b82f6'; // Blue
        case 'auth':
          return '#8b5cf6'; // Purple
        case 'network':
          return '#06b6d4'; // Cyan
        case 'performance':
          return '#f59e0b'; // Amber
        case 'ui':
          return '#ec4899'; // Pink
        default:
          return '#6b7280'; // Gray
      }
    }
    
    // Legacy event colors
    switch (event.type) {
      case 'real-time': return '#10b981';
      case 'app-state': return '#3b82f6';
      case 'ui-event': return '#f59e0b';
      default: return '#8b5cf6';
    }
  };

  const copyAllEvents = useCallback(async () => {
    const formattedData = formatDebugData(events, {
      eventType: 'all-events',
      workspace: currentWorkspace?.name,
      websiteCount: websites?.length,
      connectionStatus: websiteStatusContext.isConnected,
    });
    
    const success = await copyToClipboard(formattedData);
    if (success) {
      toast({
        title: "All Events Copied",
        description: `${events.length} events copied to clipboard`,
      });
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy events to clipboard",
        variant: "destructive",
      });
    }
  }, [events, currentWorkspace?.name, websites?.length, websiteStatusContext.isConnected, toast]);

  const copyAppStateEvents = useCallback(async () => {
    const appStateEvents = events.filter(event => event.type === 'app-state');
    const formattedData = formatDebugData(appStateEvents, {
      eventType: 'app-state-events',
      workspace: currentWorkspace?.name,
      websiteCount: websites?.length,
      connectionStatus: websiteStatusContext.isConnected,
    });
    
    const success = await copyToClipboard(formattedData);
    if (success) {
      toast({
        title: "App State Events Copied",
        description: `${appStateEvents.length} app state events copied to clipboard`,
      });
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy app state events to clipboard",
        variant: "destructive",
      });
    }
  }, [events, currentWorkspace?.name, websites?.length, websiteStatusContext.isConnected, toast]);

  // Only show when DEBUG_MODE is explicitly enabled
  if (!import.meta.env.VITE_DEBUG_MODE || import.meta.env.VITE_DEBUG_MODE !== 'true') {
    return null;
  }

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999 }}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant={isOpen ? "default" : "outline"}
        size="sm"
      >
        🔍 Debug ({events.length})
      </Button>
      
      {isOpen && (
        <Card style={{ 
          position: 'absolute', 
          top: 40, 
          right: 0, 
          width: 600, 
          maxHeight: 500,
          backgroundColor: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Real-Time Debug Monitor
              <div className="flex gap-2">
                <Button
                  onClick={copyAppStateEvents}
                  variant="outline"
                  size="sm"
                  title="Copy app-state events"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  App State
                </Button>
                <Button
                  onClick={copyAllEvents}
                  variant="outline"
                  size="sm"
                  title="Copy all events"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  All
                </Button>
                <Button
                  onClick={triggerManualRefresh}
                  variant="outline"
                  size="sm"
                >
                  Force Refresh
                </Button>
                <Button
                  onClick={clearEvents}
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
                <Button
                  onClick={() => setAutoScroll(!autoScroll)}
                  variant={autoScroll ? "default" : "outline"}
                  size="sm"
                >
                  {autoScroll ? "📍" : "📌"}
                </Button>
              </div>
            </CardTitle>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>Workspace: <Badge variant="outline">{currentWorkspace?.name || 'None'}</Badge></div>
              <div>Websites: <Badge variant="outline">{websites?.length || 0}</Badge></div>
              <div>Connected: <Badge variant={websiteStatusContext.isConnected ? "default" : "destructive"}>
                {websiteStatusContext.isConnected ? "Yes" : "No"}
              </Badge></div>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              ref={eventsRef}
              style={{
                height: 300,
                overflow: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                backgroundColor: '#f8fafc'
              }}
            >
              {/* Filter controls */}
              <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  style={{
                    fontSize: '10px',
                    padding: '2px 4px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="error">Errors</option>
                  <option value="warning">Warnings</option>
                  <option value="info">Info</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
                  style={{
                    fontSize: '10px',
                    padding: '2px 4px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                  }}
                >
                  <option value="all">All Categories</option>
                  <option value="component">Component</option>
                  <option value="service">Service</option>
                  <option value="auth">Auth</option>
                  <option value="database">Database</option>
                  <option value="real-time">Real-time</option>
                  <option value="network">Network</option>
                  <option value="performance">Performance</option>
                  <option value="ui">UI</option>
                  <option value="validation">Validation</option>
                </select>
              </div>

              {filteredEvents.map((event) => (
                <div 
                  key={event.id}
                  style={{
                    marginBottom: '4px',
                    padding: '4px',
                    borderLeft: `3px solid ${getEventColor(event)}`,
                    backgroundColor: 'white',
                    borderRadius: '2px',
                    position: 'relative'
                  }}
                >
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#6b7280', 
                    marginBottom: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {getEventIcon(event)}
                      <span>
                        {new Date(event.timestamp).toLocaleTimeString()} | 
                        {'category' in event ? event.category : event.type} | 
                        {event.source}
                      </span>
                    </div>
                    <button
                      onClick={() => copyEvent(event)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                        fontSize: '10px',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      title="Copy this event"
                    >
                      <Copy style={{ width: '10px', height: '10px' }} />
                    </button>
                  </div>

                  <div style={{ fontSize: '10px', color: '#374151', marginBottom: '2px' }}>
                    {'message' in event ? event.message : 'Legacy event'}
                  </div>

                  {(event.websiteId || ('websiteId' in event && event.websiteId)) && (
                    <div style={{ fontSize: '10px', color: '#374151' }}>
                      Website: {event.websiteId || ('websiteId' in event ? event.websiteId : '')} 
                      {'status' in event && event.status ? ` → ${event.status}` : ''}
                    </div>
                  )}

                  <div style={{ fontSize: '10px', color: '#1f2937', maxHeight: '60px', overflow: 'auto' }}>
                    {'details' in event ? 
                      JSON.stringify(event.details, null, 1) : 
                      ('data' in event ? JSON.stringify(event.data, null, 1) : 'No details')
                    }
                  </div>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                  {events.length === 0 ? 'No events captured yet...' : 'No events match current filters...'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}