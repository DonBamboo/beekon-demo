import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '@/hooks/appStateHooks';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWebsiteStatusContext } from '@/contexts/WebsiteStatusContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy } from 'lucide-react';
import { copyToClipboard, formatDebugData } from '@/lib/debug-utils';

interface DebugEvent {
  id: string;
  timestamp: number;
  type: 'real-time' | 'app-state' | 'ui-event' | 'manual';
  source: string;
  websiteId?: string;
  status?: string;
  data: unknown;
}

export function RealTimeDebugger() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventsRef = useRef<HTMLDivElement>(null);
  
  const { state: appState } = useAppState();
  const { websites, currentWorkspace } = useWorkspace();
  const websiteStatusContext = useWebsiteStatusContext();
  const { toast } = useToast();

  // Track events
  const addEvent = useCallback((event: Omit<DebugEvent, 'id' | 'timestamp'>) => {
    const newEvent: DebugEvent = {
      ...event,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
    };
    
    setEvents(prev => {
      const updated = [...prev, newEvent];
      return updated.slice(-100); // Keep last 100 events
    });
  }, []);

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
  }, [events, autoScroll]);

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
    setEvents([]);
  }, []);

  // Copy functionality
  const copyEvent = useCallback(async (event: DebugEvent) => {
    const formattedData = formatDebugData(event, {
      eventType: event.type,
      workspace: currentWorkspace?.name,
      websiteCount: websites?.length,
      connectionStatus: websiteStatusContext.isConnected,
    });
    
    const success = await copyToClipboard(formattedData);
    if (success) {
      toast({
        title: "Event Copied",
        description: `${event.type} event copied to clipboard`,
      });
    } else {
      toast({
        title: "Copy Failed",
        description: "Failed to copy event to clipboard",
        variant: "destructive",
      });
    }
  }, [currentWorkspace?.name, websites?.length, websiteStatusContext.isConnected, toast]);

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
              {events.map((event) => (
                <div 
                  key={event.id}
                  style={{
                    marginBottom: '4px',
                    padding: '4px',
                    borderLeft: `3px solid ${
                      event.type === 'real-time' ? '#10b981' :
                      event.type === 'app-state' ? '#3b82f6' :
                      event.type === 'ui-event' ? '#f59e0b' :
                      '#8b5cf6'
                    }`,
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
                    <span>
                      {new Date(event.timestamp).toLocaleTimeString()} | {event.type} | {event.source}
                    </span>
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
                  {event.websiteId && (
                    <div style={{ fontSize: '10px', color: '#374151' }}>
                      Website: {event.websiteId} → {event.status}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: '#1f2937', maxHeight: '60px', overflow: 'auto' }}>
                    {JSON.stringify(event.data, null, 1)}
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                  No events captured yet...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}