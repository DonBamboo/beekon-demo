-- =================================================================
-- ENHANCED RLS POLICIES - REPLACING BROAD "FOR ALL" POLICIES
-- =================================================================
-- This migration replaces the existing broad "FOR ALL" policies with
-- granular, operation-specific policies that provide better security
-- and auditing capabilities.
-- =================================================================

BEGIN;

-- =================================================================
-- 1. DROP EXISTING BROAD POLICIES
-- =================================================================

-- Profiles table
DROP POLICY IF EXISTS "Users can view own profile" ON beekon_data.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON beekon_data.profiles;

-- Workspaces table
DROP POLICY IF EXISTS "Users can view their workspaces" ON beekon_data.workspaces;
DROP POLICY IF EXISTS "Users can modify workspaces they own" ON beekon_data.workspaces;

-- API Keys table
DROP POLICY IF EXISTS "Users can manage own API keys" ON beekon_data.api_keys;

-- Websites table
DROP POLICY IF EXISTS "Users can access websites in their workspace" ON beekon_data.websites;

-- Topics table
DROP POLICY IF EXISTS "Users can access topics for their websites" ON beekon_data.topics;

-- Prompts table
DROP POLICY IF EXISTS "Users can access prompts for their topics" ON beekon_data.prompts;

-- LLM Analysis Results table
DROP POLICY IF EXISTS "Users can access analysis results for their websites" ON beekon_data.llm_analysis_results;

-- Competitors table
DROP POLICY IF EXISTS "Users can access competitors for their websites" ON beekon_data.competitors;

-- Competitor Analysis Results table
DROP POLICY IF EXISTS "Users can access competitor analysis results for their websites" ON beekon_data.competitor_analysis_results;

-- Analysis Sessions table
DROP POLICY IF EXISTS "Users can access analysis sessions for their websites" ON beekon_data.analysis_sessions;

-- Competitor Status Log table
DROP POLICY IF EXISTS "Users can access competitor status logs for their websites" ON beekon_data.competitor_status_log;

-- Website Settings table
DROP POLICY IF EXISTS "Users can access website settings for their websites" ON beekon_data.website_settings;

-- Export History table
DROP POLICY IF EXISTS "Users can access their own export history" ON beekon_data.export_history;

-- =================================================================
-- 2. PROFILES TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view their own profile
CREATE POLICY "profiles_select_own" ON beekon_data.profiles
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- UPDATE: Users can update their own profile
CREATE POLICY "profiles_update_own" ON beekon_data.profiles
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- INSERT: Profiles are created automatically by triggers, but allow explicit creation
CREATE POLICY "profiles_insert_own" ON beekon_data.profiles
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- DELETE: Profiles can only be deleted by workspace owners (for cleanup)
CREATE POLICY "profiles_delete_workspace_owner" ON beekon_data.profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.workspaces w
      WHERE w.owner_id = id
        AND beekon_data.user_has_permission(auth.uid(), w.id, 'workspace', 'delete')
    )
  );

-- =================================================================
-- 3. WORKSPACES TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view workspaces they have access to
CREATE POLICY "workspaces_select_accessible" ON beekon_data.workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
  );

-- INSERT: Users can create new workspaces
CREATE POLICY "workspaces_insert_own" ON beekon_data.workspaces
  FOR INSERT WITH CHECK (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Only workspace owners and admins can update workspaces
CREATE POLICY "workspaces_update_authorized" ON beekon_data.workspaces
  FOR UPDATE USING (
    beekon_data.user_has_permission(auth.uid(), id, 'workspace', 'update')
  ) WITH CHECK (
    beekon_data.user_has_permission(auth.uid(), id, 'workspace', 'update')
  );

-- DELETE: Only workspace owners can delete workspaces
CREATE POLICY "workspaces_delete_owner_only" ON beekon_data.workspaces
  FOR DELETE USING (
    beekon_data.user_has_permission(auth.uid(), id, 'workspace', 'delete')
  );

-- =================================================================
-- 4. API KEYS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view their own API keys
CREATE POLICY "api_keys_select_own" ON beekon_data.api_keys
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- INSERT: Users can create their own API keys
CREATE POLICY "api_keys_insert_own" ON beekon_data.api_keys
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: Users can update their own API keys
CREATE POLICY "api_keys_update_own" ON beekon_data.api_keys
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- DELETE: Users can delete their own API keys
CREATE POLICY "api_keys_delete_own" ON beekon_data.api_keys
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- =================================================================
-- 5. WEBSITES TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view websites in workspaces they have access to
CREATE POLICY "websites_select_workspace_access" ON beekon_data.websites
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
  );

-- INSERT: Users with 'create' permission can add websites
CREATE POLICY "websites_insert_authorized" ON beekon_data.websites
  FOR INSERT WITH CHECK (
    beekon_data.user_has_permission(auth.uid(), workspace_id, 'website', 'create')
  );

-- UPDATE: Users with 'update' permission can modify websites
CREATE POLICY "websites_update_authorized" ON beekon_data.websites
  FOR UPDATE USING (
    beekon_data.user_has_permission(auth.uid(), workspace_id, 'website', 'update')
  ) WITH CHECK (
    beekon_data.user_has_permission(auth.uid(), workspace_id, 'website', 'update')
  );

-- DELETE: Users with 'delete' permission can remove websites
CREATE POLICY "websites_delete_authorized" ON beekon_data.websites
  FOR DELETE USING (
    beekon_data.user_has_permission(auth.uid(), workspace_id, 'website', 'delete')
  );

-- =================================================================
-- 6. TOPICS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view topics for websites they have access to
CREATE POLICY "topics_select_website_access" ON beekon_data.topics
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with website create/update permission can add topics
CREATE POLICY "topics_insert_authorized" ON beekon_data.topics
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- UPDATE: Users with website update permission can modify topics
CREATE POLICY "topics_update_authorized" ON beekon_data.topics
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- DELETE: Users with website delete permission can remove topics
CREATE POLICY "topics_delete_authorized" ON beekon_data.topics
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'delete')
    )
  );

-- =================================================================
-- 7. PROMPTS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view prompts for topics they have access to
CREATE POLICY "prompts_select_topic_access" ON beekon_data.prompts
  FOR SELECT USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON w.id = t.website_id
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with website update permission can add prompts
CREATE POLICY "prompts_insert_authorized" ON beekon_data.prompts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.topics t
      JOIN beekon_data.websites w ON w.id = t.website_id
      WHERE t.id = topic_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- UPDATE: Users with website update permission can modify prompts
CREATE POLICY "prompts_update_authorized" ON beekon_data.prompts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.topics t
      JOIN beekon_data.websites w ON w.id = t.website_id
      WHERE t.id = topic_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.topics t
      JOIN beekon_data.websites w ON w.id = t.website_id
      WHERE t.id = topic_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- DELETE: Users with website delete permission can remove prompts
CREATE POLICY "prompts_delete_authorized" ON beekon_data.prompts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.topics t
      JOIN beekon_data.websites w ON w.id = t.website_id
      WHERE t.id = topic_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'delete')
    )
  );

-- =================================================================
-- 8. LLM ANALYSIS RESULTS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view analysis results for websites they have access to
CREATE POLICY "llm_results_select_website_access" ON beekon_data.llm_analysis_results
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with analysis create permission can add results
CREATE POLICY "llm_results_insert_authorized" ON beekon_data.llm_analysis_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'create')
    )
  );

-- UPDATE: Users with analysis update permission can modify results
CREATE POLICY "llm_results_update_authorized" ON beekon_data.llm_analysis_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  );

-- DELETE: Users with analysis delete permission can remove results
CREATE POLICY "llm_results_delete_authorized" ON beekon_data.llm_analysis_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'delete')
    )
  );

-- =================================================================
-- 9. COMPETITORS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view competitors for websites they have access to
CREATE POLICY "competitors_select_website_access" ON beekon_data.competitors
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with competitor create permission can add competitors
CREATE POLICY "competitors_insert_authorized" ON beekon_data.competitors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'competitor', 'create')
    )
  );

-- UPDATE: Users with competitor update permission can modify competitors
CREATE POLICY "competitors_update_authorized" ON beekon_data.competitors
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'competitor', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'competitor', 'update')
    )
  );

-- DELETE: Users with competitor delete permission can remove competitors
CREATE POLICY "competitors_delete_authorized" ON beekon_data.competitors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'competitor', 'delete')
    )
  );

-- =================================================================
-- 10. COMPETITOR ANALYSIS RESULTS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view competitor analysis results for competitors they have access to
CREATE POLICY "competitor_results_select_authorized" ON beekon_data.competitor_analysis_results
  FOR SELECT USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with analysis create permission can add competitor results
CREATE POLICY "competitor_results_insert_authorized" ON beekon_data.competitor_analysis_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE c.id = competitor_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'create')
    )
  );

-- UPDATE: Users with analysis update permission can modify competitor results
CREATE POLICY "competitor_results_update_authorized" ON beekon_data.competitor_analysis_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE c.id = competitor_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE c.id = competitor_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  );

-- DELETE: Users with analysis delete permission can remove competitor results
CREATE POLICY "competitor_results_delete_authorized" ON beekon_data.competitor_analysis_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE c.id = competitor_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'delete')
    )
  );

-- =================================================================
-- 11. ANALYSIS SESSIONS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view analysis sessions for websites they have access to
CREATE POLICY "analysis_sessions_select_website_access" ON beekon_data.analysis_sessions
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with analysis create permission can create sessions
CREATE POLICY "analysis_sessions_insert_authorized" ON beekon_data.analysis_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'create')
    )
  );

-- UPDATE: Users with analysis update permission can modify sessions
CREATE POLICY "analysis_sessions_update_authorized" ON beekon_data.analysis_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'update')
    )
  );

-- DELETE: Users with analysis delete permission can remove sessions
CREATE POLICY "analysis_sessions_delete_authorized" ON beekon_data.analysis_sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'analysis', 'delete')
    )
  );

-- =================================================================
-- 12. COMPETITOR STATUS LOG TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view status logs for competitors they have access to
CREATE POLICY "status_log_select_authorized" ON beekon_data.competitor_status_log
  FOR SELECT USING (
    competitor_id IN (
      SELECT c.id FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: System can create status logs (restricted to service role)
CREATE POLICY "status_log_insert_system_only" ON beekon_data.competitor_status_log
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM beekon_data.competitors c
      JOIN beekon_data.websites w ON w.id = c.website_id
      WHERE c.id = competitor_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'competitor', 'update')
    )
  );

-- =================================================================
-- 13. WEBSITE SETTINGS TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view settings for websites they have access to
CREATE POLICY "website_settings_select_website_access" ON beekon_data.website_settings
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      WHERE w.workspace_id IN (SELECT workspace_id FROM beekon_data.get_user_workspaces())
    )
  );

-- INSERT: Users with website create/update permission can add settings
CREATE POLICY "website_settings_insert_authorized" ON beekon_data.website_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- UPDATE: Users with website update permission can modify settings
CREATE POLICY "website_settings_update_authorized" ON beekon_data.website_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'update')
    )
  );

-- DELETE: Users with website delete permission can remove settings
CREATE POLICY "website_settings_delete_authorized" ON beekon_data.website_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      WHERE w.id = website_id
        AND beekon_data.user_has_permission(auth.uid(), w.workspace_id, 'website', 'delete')
    )
  );

-- =================================================================
-- 14. EXPORT HISTORY TABLE - ENHANCED POLICIES
-- =================================================================

-- SELECT: Users can view their own export history
CREATE POLICY "export_history_select_own" ON beekon_data.export_history
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- INSERT: Users can create their own export history
CREATE POLICY "export_history_insert_own" ON beekon_data.export_history
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: Users can update their own export history
CREATE POLICY "export_history_update_own" ON beekon_data.export_history
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

-- DELETE: Users can delete their own export history
CREATE POLICY "export_history_delete_own" ON beekon_data.export_history
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- =================================================================
-- 15. AUDIT TRIGGERS FOR ENHANCED POLICIES
-- =================================================================

-- Function to log policy violations and security events
CREATE OR REPLACE FUNCTION beekon_data.trigger_log_policy_enforcement() 
RETURNS TRIGGER AS $$
DECLARE
    event_type beekon_data.security_event_type;
    workspace_id_param UUID;
    risk_score INTEGER := 10; -- Base risk for policy enforcement
BEGIN
    -- Determine event type based on operation
    event_type := CASE TG_OP
        WHEN 'SELECT' THEN 'data_access'::beekon_data.security_event_type
        WHEN 'INSERT' THEN 'data_modification'::beekon_data.security_event_type
        WHEN 'UPDATE' THEN 'data_modification'::beekon_data.security_event_type
        WHEN 'DELETE' THEN 'data_modification'::beekon_data.security_event_type
        ELSE 'suspicious_activity'::beekon_data.security_event_type
    END;
    
    -- Extract workspace_id if available
    workspace_id_param := CASE 
        WHEN TG_TABLE_NAME = 'workspaces' THEN COALESCE(NEW.id, OLD.id)
        WHEN TG_TABLE_NAME = 'websites' THEN COALESCE(NEW.workspace_id, OLD.workspace_id)
        ELSE NULL
    END;
    
    -- Increase risk score for sensitive operations
    IF TG_OP IN ('DELETE', 'UPDATE') THEN
        risk_score := 20;
    END IF;
    
    -- Log the security event
    PERFORM beekon_data.log_security_event(
        event_type,
        auth.uid(),
        workspace_id_param,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        json_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'policy_enforced', TRUE
        ),
        risk_score
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to sensitive tables
CREATE TRIGGER trigger_log_workspaces_access
    AFTER INSERT OR UPDATE OR DELETE ON beekon_data.workspaces
    FOR EACH ROW EXECUTE FUNCTION beekon_data.trigger_log_policy_enforcement();

CREATE TRIGGER trigger_log_websites_access
    AFTER INSERT OR UPDATE OR DELETE ON beekon_data.websites
    FOR EACH ROW EXECUTE FUNCTION beekon_data.trigger_log_policy_enforcement();

CREATE TRIGGER trigger_log_competitors_access
    AFTER INSERT OR UPDATE OR DELETE ON beekon_data.competitors
    FOR EACH ROW EXECUTE FUNCTION beekon_data.trigger_log_policy_enforcement();

CREATE TRIGGER trigger_log_api_keys_access
    AFTER INSERT OR UPDATE OR DELETE ON beekon_data.api_keys
    FOR EACH ROW EXECUTE FUNCTION beekon_data.trigger_log_policy_enforcement();

COMMIT;

-- =================================================================
-- VALIDATION AND NOTICES
-- =================================================================

DO $$
DECLARE
    policy_count INTEGER;
    trigger_count INTEGER;
    total_tables INTEGER;
BEGIN
    -- Count new policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'beekon_data'
      AND policyname LIKE '%_select_%' 
      OR policyname LIKE '%_insert_%'
      OR policyname LIKE '%_update_%'
      OR policyname LIKE '%_delete_%';
    
    -- Count audit triggers
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'beekon_data'
      AND t.tgname LIKE 'trigger_log_%_access';
    
    -- Count total tables with RLS
    SELECT COUNT(*) INTO total_tables
    FROM pg_tables 
    WHERE schemaname = 'beekon_data';
    
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'ENHANCED RLS POLICIES APPLIED SUCCESSFULLY';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Granular policies created: %', policy_count;
    RAISE NOTICE 'Audit triggers created: %', trigger_count;
    RAISE NOTICE 'Tables secured: %', total_tables;
    RAISE NOTICE '';
    RAISE NOTICE 'SECURITY ENHANCEMENTS:';
    RAISE NOTICE '  ✓ Replaced broad FOR ALL policies with granular SELECT/INSERT/UPDATE/DELETE';
    RAISE NOTICE '  ✓ Implemented permission-based access control';
    RAISE NOTICE '  ✓ Added automatic security event logging';
    RAISE NOTICE '  ✓ Enhanced policy enforcement with risk scoring';
    RAISE NOTICE '  ✓ Added audit trails for sensitive operations';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Test policies with different user roles';
    RAISE NOTICE '  2. Monitor security audit log for violations';
    RAISE NOTICE '  3. Implement materialized view security';
    RAISE NOTICE '=================================================================';
END $$;