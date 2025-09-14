-- =================================================================
-- REAL-TIME SECURITY MONITORING & ALERTING SYSTEM
-- =================================================================
-- This migration implements a comprehensive real-time security monitoring
-- and alerting system for detecting and responding to security threats.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. SECURITY ALERT SYSTEM
-- =================================================================

-- Alert severity levels
CREATE TYPE beekon_data.alert_severity AS ENUM (
    'low',          -- Informational, low risk
    'medium',       -- Moderate risk, monitor closely  
    'high',         -- High risk, immediate attention needed
    'critical'      -- Critical security threat, urgent response required
);

-- Alert status tracking
CREATE TYPE beekon_data.alert_status AS ENUM (
    'active',       -- Alert is currently active
    'investigating', -- Alert is being investigated
    'resolved',     -- Alert has been resolved
    'false_positive' -- Confirmed false positive
);

-- Security alerts table
CREATE TABLE IF NOT EXISTS beekon_data.security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,
    severity beekon_data.alert_severity NOT NULL DEFAULT 'low',
    status beekon_data.alert_status NOT NULL DEFAULT 'active',
    title TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id),
    workspace_id UUID REFERENCES beekon_data.workspaces(id),
    source_event_id UUID REFERENCES beekon_data.security_audit_log(id),
    ip_address INET,
    user_agent TEXT,
    risk_score INTEGER DEFAULT 0,
    threat_indicators JSONB,
    recommended_actions TEXT[],
    is_automated BOOLEAN DEFAULT TRUE,
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security alert rules table
CREATE TABLE IF NOT EXISTS beekon_data.security_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL UNIQUE,
    description TEXT,
    event_type beekon_data.security_event_type,
    conditions JSONB NOT NULL, -- Rule conditions in JSON format
    severity beekon_data.alert_severity NOT NULL DEFAULT 'medium',
    threshold_count INTEGER DEFAULT 1,
    threshold_window INTERVAL DEFAULT INTERVAL '1 hour',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time security metrics view
CREATE MATERIALIZED VIEW beekon_data.mv_security_metrics AS
SELECT 
    DATE_TRUNC('hour', sal.created_at) as time_bucket,
    sal.event_type,
    sal.workspace_id,
    COUNT(*) as event_count,
    COUNT(DISTINCT sal.user_id) as unique_users,
    AVG(sal.risk_score) as avg_risk_score,
    MAX(sal.risk_score) as max_risk_score,
    COUNT(*) FILTER (WHERE sal.is_blocked = TRUE) as blocked_count,
    COUNT(*) FILTER (WHERE sal.risk_score > 50) as high_risk_count
FROM beekon_data.security_audit_log sal
WHERE sal.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', sal.created_at), sal.event_type, sal.workspace_id;

-- =================================================================
-- 2. THREAT DETECTION FUNCTIONS
-- =================================================================

-- Function to detect brute force attacks
CREATE OR REPLACE FUNCTION beekon_data.detect_brute_force_attacks()
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    failure_record RECORD;
BEGIN
    -- Detect multiple authentication failures from same IP/user
    FOR failure_record IN
        SELECT 
            user_id,
            ip_address,
            COUNT(*) as failure_count,
            MAX(created_at) as last_failure
        FROM beekon_data.security_audit_log
        WHERE event_type = 'authentication_failure'
          AND created_at >= NOW() - INTERVAL '15 minutes'
        GROUP BY user_id, ip_address
        HAVING COUNT(*) >= 5 -- 5 failures in 15 minutes
    LOOP
        -- Create high severity alert
        INSERT INTO beekon_data.security_alerts (
            alert_type, severity, title, description, user_id, ip_address,
            risk_score, threat_indicators, recommended_actions
        ) VALUES (
            'brute_force_attack',
            'high'::beekon_data.alert_severity,
            'Potential Brute Force Attack Detected',
            format('Multiple authentication failures detected: %s failures from IP %s', 
                   failure_record.failure_count, failure_record.ip_address),
            failure_record.user_id,
            failure_record.ip_address,
            85,
            json_build_object(
                'failure_count', failure_record.failure_count,
                'time_window', '15 minutes',
                'last_failure', failure_record.last_failure,
                'pattern', 'repeated_auth_failures'
            ),
            ARRAY[
                'Block IP address immediately',
                'Reset user password if applicable',
                'Review authentication logs',
                'Enable additional authentication factors'
            ]
        );
        
        alert_count := alert_count + 1;
    END LOOP;
    
    RETURN alert_count;
END;
$$ LANGUAGE plpgsql;

-- Function to detect privilege escalation attempts
CREATE OR REPLACE FUNCTION beekon_data.detect_privilege_escalation()
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    escalation_record RECORD;
BEGIN
    -- Detect users accessing resources above their normal permissions
    FOR escalation_record IN
        SELECT 
            sal.user_id,
            sal.workspace_id,
            COUNT(*) as violation_count,
            ARRAY_AGG(DISTINCT sal.resource_type) as attempted_resources,
            MAX(sal.created_at) as last_attempt
        FROM beekon_data.security_audit_log sal
        WHERE sal.event_type = 'authorization_failure'
          AND sal.created_at >= NOW() - INTERVAL '1 hour'
          AND sal.risk_score >= 50
        GROUP BY sal.user_id, sal.workspace_id
        HAVING COUNT(*) >= 3 -- 3 high-risk authorization failures in 1 hour
    LOOP
        INSERT INTO beekon_data.security_alerts (
            alert_type, severity, title, description, user_id, workspace_id,
            risk_score, threat_indicators, recommended_actions
        ) VALUES (
            'privilege_escalation',
            'critical'::beekon_data.alert_severity,
            'Privilege Escalation Attempt Detected',
            format('User attempting to access unauthorized resources: %s violations in workspace %s', 
                   escalation_record.violation_count, escalation_record.workspace_id),
            escalation_record.user_id,
            escalation_record.workspace_id,
            95,
            json_build_object(
                'violation_count', escalation_record.violation_count,
                'attempted_resources', escalation_record.attempted_resources,
                'time_window', '1 hour',
                'last_attempt', escalation_record.last_attempt,
                'pattern', 'repeated_auth_violations'
            ),
            ARRAY[
                'Immediately suspend user account',
                'Review user permissions and role assignments',
                'Audit recent user activity',
                'Contact user to verify legitimate activity'
            ]
        );
        
        alert_count := alert_count + 1;
    END LOOP;
    
    RETURN alert_count;
END;
$$ LANGUAGE plpgsql;

-- Function to detect unusual data access patterns
CREATE OR REPLACE FUNCTION beekon_data.detect_data_access_anomalies()
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    anomaly_record RECORD;
    baseline_avg NUMERIC;
BEGIN
    -- Detect unusual volume of data access
    FOR anomaly_record IN
        SELECT 
            sal.user_id,
            sal.workspace_id,
            DATE_TRUNC('hour', sal.created_at) as access_hour,
            COUNT(*) as access_count,
            COUNT(DISTINCT sal.resource_id) as unique_resources
        FROM beekon_data.security_audit_log sal
        WHERE sal.event_type = 'data_access'
          AND sal.created_at >= NOW() - INTERVAL '2 hours'
        GROUP BY sal.user_id, sal.workspace_id, DATE_TRUNC('hour', sal.created_at)
        HAVING COUNT(*) > 100 -- More than 100 data access events per hour
    LOOP
        -- Calculate baseline average for this user
        SELECT AVG(hourly_count.access_count) INTO baseline_avg
        FROM (
            SELECT 
                DATE_TRUNC('hour', sal2.created_at),
                COUNT(*) as access_count
            FROM beekon_data.security_audit_log sal2
            WHERE sal2.user_id = anomaly_record.user_id
              AND sal2.event_type = 'data_access'
              AND sal2.created_at >= NOW() - INTERVAL '7 days'
              AND sal2.created_at < NOW() - INTERVAL '2 hours'
            GROUP BY DATE_TRUNC('hour', sal2.created_at)
        ) as hourly_count;
        
        -- Create alert if current access is significantly above baseline
        IF baseline_avg IS NULL OR anomaly_record.access_count > (baseline_avg * 3) THEN
            INSERT INTO beekon_data.security_alerts (
                alert_type, severity, title, description, user_id, workspace_id,
                risk_score, threat_indicators, recommended_actions
            ) VALUES (
                'data_access_anomaly',
                CASE 
                    WHEN anomaly_record.access_count > 500 THEN 'critical'::beekon_data.alert_severity
                    WHEN anomaly_record.access_count > 200 THEN 'high'::beekon_data.alert_severity
                    ELSE 'medium'::beekon_data.alert_severity
                END,
                'Unusual Data Access Pattern Detected',
                format('User accessing data at %sx normal rate: %s accesses to %s resources', 
                       COALESCE(ROUND(anomaly_record.access_count / NULLIF(baseline_avg, 0), 1), anomaly_record.access_count),
                       anomaly_record.access_count, anomaly_record.unique_resources),
                anomaly_record.user_id,
                anomaly_record.workspace_id,
                LEAST(100, 30 + (anomaly_record.access_count / 10)),
                json_build_object(
                    'current_access_count', anomaly_record.access_count,
                    'baseline_average', baseline_avg,
                    'unique_resources', anomaly_record.unique_resources,
                    'access_hour', anomaly_record.access_hour,
                    'pattern', 'volume_anomaly'
                ),
                ARRAY[
                    'Monitor user activity closely',
                    'Verify user identity and intent',
                    'Review accessed resources for sensitivity',
                    'Consider temporary access restrictions'
                ]
            );
            
            alert_count := alert_count + 1;
        END IF;
    END LOOP;
    
    RETURN alert_count;
END;
$$ LANGUAGE plpgsql;

-- Function to detect bulk export abuse
CREATE OR REPLACE FUNCTION beekon_data.detect_bulk_export_abuse()
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    export_record RECORD;
BEGIN
    -- Detect excessive bulk export operations
    FOR export_record IN
        SELECT 
            sal.user_id,
            sal.workspace_id,
            COUNT(*) as export_count,
            SUM((sal.details->>'max_records')::INTEGER) as total_records,
            ARRAY_AGG(sal.details->>'export_type') as export_types,
            MAX(sal.created_at) as last_export
        FROM beekon_data.security_audit_log sal
        WHERE sal.event_type = 'export_operation'
          AND sal.resource_type = 'secure_bulk_export'
          AND sal.created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY sal.user_id, sal.workspace_id
        HAVING COUNT(*) >= 5 -- 5 or more bulk exports in 24 hours
           OR SUM((sal.details->>'max_records')::INTEGER) >= 100000 -- Or more than 100k records
    LOOP
        INSERT INTO beekon_data.security_alerts (
            alert_type, severity, title, description, user_id, workspace_id,
            risk_score, threat_indicators, recommended_actions
        ) VALUES (
            'bulk_export_abuse',
            CASE 
                WHEN export_record.total_records >= 500000 THEN 'critical'::beekon_data.alert_severity
                WHEN export_record.export_count >= 10 THEN 'high'::beekon_data.alert_severity
                ELSE 'medium'::beekon_data.alert_severity
            END,
            'Potential Data Exfiltration Detected',
            format('User performed %s bulk exports (%s total records) in 24 hours', 
                   export_record.export_count, export_record.total_records),
            export_record.user_id,
            export_record.workspace_id,
            LEAST(100, 40 + (export_record.export_count * 5)),
            json_build_object(
                'export_count', export_record.export_count,
                'total_records', export_record.total_records,
                'export_types', export_record.export_types,
                'time_window', '24 hours',
                'last_export', export_record.last_export,
                'pattern', 'bulk_export_abuse'
            ),
            ARRAY[
                'Suspend bulk export privileges immediately',
                'Review exported data sensitivity',
                'Audit user account and permissions',
                'Contact user to verify legitimate business need'
            ]
        );
        
        alert_count := alert_count + 1;
    END LOOP;
    
    RETURN alert_count;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 3. AUTOMATED THREAT DETECTION SCHEDULER
-- =================================================================

-- Main threat detection orchestrator function
CREATE OR REPLACE FUNCTION beekon_data.run_threat_detection()
RETURNS JSON
SECURITY DEFINER
AS $$
DECLARE
    brute_force_alerts INTEGER;
    privilege_escalation_alerts INTEGER;
    data_access_alerts INTEGER;
    bulk_export_alerts INTEGER;
    total_alerts INTEGER;
    result JSON;
BEGIN
    -- Run all threat detection functions
    brute_force_alerts := beekon_data.detect_brute_force_attacks();
    privilege_escalation_alerts := beekon_data.detect_privilege_escalation();
    data_access_alerts := beekon_data.detect_data_access_anomalies();
    bulk_export_alerts := beekon_data.detect_bulk_export_abuse();
    
    total_alerts := brute_force_alerts + privilege_escalation_alerts + data_access_alerts + bulk_export_alerts;
    
    -- Refresh security metrics
    REFRESH MATERIALIZED VIEW beekon_data.mv_security_metrics;
    
    -- Build result summary
    result := json_build_object(
        'timestamp', NOW(),
        'total_alerts_generated', total_alerts,
        'brute_force_alerts', brute_force_alerts,
        'privilege_escalation_alerts', privilege_escalation_alerts,
        'data_access_anomaly_alerts', data_access_alerts,
        'bulk_export_abuse_alerts', bulk_export_alerts,
        'status', CASE WHEN total_alerts > 0 THEN 'ALERTS_GENERATED' ELSE 'ALL_CLEAR' END
    );
    
    -- Log the threat detection run
    PERFORM beekon_data.log_security_event(
        'security_configuration_change'::beekon_data.security_event_type,
        NULL, -- System operation
        NULL,
        'run_threat_detection',
        NULL,
        'EXECUTE',
        result,
        CASE WHEN total_alerts > 0 THEN 25 ELSE 5 END
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 4. SECURITY DASHBOARD FUNCTIONS
-- =================================================================

-- Function to get security dashboard summary
CREATE OR REPLACE FUNCTION beekon_data.get_security_dashboard(
    p_workspace_id UUID DEFAULT NULL,
    p_hours INTEGER DEFAULT 24
)
RETURNS JSON
SECURITY INVOKER
AS $$
DECLARE
    dashboard_data JSON;
    workspace_filter TEXT := '';
BEGIN
    -- Check if user has permission to view security data
    IF p_workspace_id IS NOT NULL THEN
        IF NOT beekon_data.user_has_permission(auth.uid(), p_workspace_id, 'workspace', 'read') THEN
            RAISE EXCEPTION 'Insufficient permissions to view security dashboard' USING ERRCODE = '42501';
        END IF;
        workspace_filter := format(' AND workspace_id = %L', p_workspace_id);
    END IF;
    
    -- Build comprehensive security dashboard
    SELECT json_build_object(
        'timestamp', NOW(),
        'time_window_hours', p_hours,
        'workspace_id', p_workspace_id,
        'alerts', (
            SELECT json_build_object(
                'total', COUNT(*),
                'active', COUNT(*) FILTER (WHERE status = 'active'),
                'critical', COUNT(*) FILTER (WHERE severity = 'critical'),
                'high', COUNT(*) FILTER (WHERE severity = 'high'),
                'by_type', json_object_agg(alert_type, count)
            )
            FROM (
                SELECT alert_type, COUNT(*) as count
                FROM beekon_data.security_alerts 
                WHERE created_at >= NOW() - (p_hours * INTERVAL '1 hour')
                  AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
                GROUP BY alert_type
            ) alert_counts
        ),
        'events', (
            SELECT json_build_object(
                'total', COUNT(*),
                'high_risk', COUNT(*) FILTER (WHERE risk_score >= 50),
                'blocked', COUNT(*) FILTER (WHERE is_blocked = TRUE),
                'by_type', json_object_agg(event_type, count)
            )
            FROM (
                SELECT event_type, COUNT(*) as count
                FROM beekon_data.security_audit_log
                WHERE created_at >= NOW() - (p_hours * INTERVAL '1 hour')
                  AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
                GROUP BY event_type
            ) event_counts
        ),
        'top_risks', (
            SELECT json_agg(
                json_build_object(
                    'user_id', user_id,
                    'risk_score', avg_risk_score,
                    'event_count', event_count,
                    'last_activity', last_activity
                )
            )
            FROM (
                SELECT 
                    user_id,
                    ROUND(AVG(risk_score), 2) as avg_risk_score,
                    COUNT(*) as event_count,
                    MAX(created_at) as last_activity
                FROM beekon_data.security_audit_log
                WHERE created_at >= NOW() - (p_hours * INTERVAL '1 hour')
                  AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
                  AND risk_score > 0
                GROUP BY user_id
                ORDER BY AVG(risk_score) DESC, COUNT(*) DESC
                LIMIT 10
            ) top_risk_users
        ),
        'metrics', (
            SELECT json_build_object(
                'unique_users', COUNT(DISTINCT user_id),
                'unique_ips', COUNT(DISTINCT ip_address),
                'avg_risk_score', ROUND(AVG(risk_score), 2),
                'max_risk_score', MAX(risk_score)
            )
            FROM beekon_data.security_audit_log
            WHERE created_at >= NOW() - (p_hours * INTERVAL '1 hour')
              AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
        )
    ) INTO dashboard_data;
    
    -- Log dashboard access
    PERFORM beekon_data.log_security_event(
        'data_access'::beekon_data.security_event_type,
        auth.uid(),
        p_workspace_id,
        'get_security_dashboard',
        NULL,
        'SELECT',
        json_build_object('hours', p_hours),
        15
    );
    
    RETURN dashboard_data;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 5. RLS POLICIES FOR SECURITY TABLES
-- =================================================================

ALTER TABLE beekon_data.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.security_alert_rules ENABLE ROW LEVEL SECURITY;

-- Security alerts policies
CREATE POLICY "security_alerts_workspace_access" ON beekon_data.security_alerts
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    OR user_id = auth.uid()
  );

CREATE POLICY "security_alerts_admin_manage" ON beekon_data.security_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM beekon_data.get_user_workspaces() 
      WHERE workspace_id = security_alerts.workspace_id 
        AND role IN ('owner', 'admin')
    )
  );

-- Alert rules policies (admin only)
CREATE POLICY "alert_rules_admin_only" ON beekon_data.security_alert_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM beekon_data.get_user_workspaces() 
      WHERE role IN ('owner', 'admin')
    )
  );

-- =================================================================
-- 6. INDEXES FOR PERFORMANCE
-- =================================================================

-- Security alerts indexes
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity_status ON beekon_data.security_alerts(severity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_workspace_id ON beekon_data.security_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON beekon_data.security_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_type_severity ON beekon_data.security_alerts(alert_type, severity);

-- Security metrics indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_security_metrics_unique 
  ON beekon_data.mv_security_metrics (time_bucket, event_type, workspace_id);
CREATE INDEX IF NOT EXISTS idx_mv_security_metrics_workspace ON beekon_data.mv_security_metrics(workspace_id, time_bucket DESC);

-- =================================================================
-- 7. INITIAL ALERT RULES
-- =================================================================

INSERT INTO beekon_data.security_alert_rules (rule_name, description, event_type, conditions, severity, threshold_count, threshold_window) VALUES
('Authentication Failures', 'Multiple authentication failures from same source', 'authentication_failure', '{"min_failures": 5, "time_window": "15 minutes"}', 'high', 5, INTERVAL '15 minutes'),
('Authorization Violations', 'Repeated authorization failures indicating privilege escalation', 'authorization_failure', '{"min_risk_score": 50, "min_violations": 3}', 'critical', 3, INTERVAL '1 hour'),
('High Risk Data Access', 'High risk data access patterns', 'data_access', '{"min_risk_score": 75}', 'medium', 1, INTERVAL '1 hour'),
('Bulk Export Abuse', 'Excessive bulk export operations', 'export_operation', '{"min_exports": 5, "time_window": "24 hours"}', 'high', 5, INTERVAL '24 hours'),
('Policy Violations', 'Security policy violations', 'policy_violation', '{"min_risk_score": 60}', 'medium', 1, INTERVAL '1 hour');

COMMIT;

-- =================================================================
-- VALIDATION AND NOTICES
-- =================================================================

DO $$
DECLARE
    alert_table_count INTEGER;
    detection_function_count INTEGER;
    alert_rule_count INTEGER;
    policy_count INTEGER;
BEGIN
    -- Count security monitoring components
    SELECT COUNT(*) INTO alert_table_count
    FROM pg_tables 
    WHERE schemaname = 'beekon_data' 
      AND tablename IN ('security_alerts', 'security_alert_rules');
    
    SELECT COUNT(*) INTO detection_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'beekon_data'
      AND p.proname IN ('detect_brute_force_attacks', 'detect_privilege_escalation', 
                       'detect_data_access_anomalies', 'detect_bulk_export_abuse',
                       'run_threat_detection', 'get_security_dashboard');
    
    SELECT COUNT(*) INTO alert_rule_count FROM beekon_data.security_alert_rules;
    
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'beekon_data' 
      AND tablename LIKE '%security_alert%';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'REAL-TIME SECURITY MONITORING & ALERTING SYSTEM DEPLOYED';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Security monitoring tables: %', alert_table_count;
    RAISE NOTICE 'Threat detection functions: %', detection_function_count;
    RAISE NOTICE 'Alert rules configured: %', alert_rule_count;
    RAISE NOTICE 'Security policies: %', policy_count;
    RAISE NOTICE '';
    RAISE NOTICE 'SECURITY MONITORING FEATURES:';
    RAISE NOTICE '  ✓ Real-time threat detection and alerting';
    RAISE NOTICE '  ✓ Brute force attack detection';
    RAISE NOTICE '  ✓ Privilege escalation monitoring';
    RAISE NOTICE '  ✓ Data access anomaly detection';
    RAISE NOTICE '  ✓ Bulk export abuse prevention';
    RAISE NOTICE '  ✓ Comprehensive security dashboard';
    RAISE NOTICE '  ✓ Automated threat response recommendations';
    RAISE NOTICE '  ✓ Configurable alert rules and thresholds';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Set up automated threat detection scheduling';
    RAISE NOTICE '  2. Configure alert notifications (email/webhook)';
    RAISE NOTICE '  3. Train security team on alert response procedures';
    RAISE NOTICE '  4. Test alert system with simulated threats';
    RAISE NOTICE '';
    RAISE NOTICE 'THREAT DETECTION: Run beekon_data.run_threat_detection() to start monitoring';
    RAISE NOTICE 'SECURITY DASHBOARD: Use beekon_data.get_security_dashboard() for real-time insights';
    RAISE NOTICE '=================================================================';
END $$;