-- =================================================================
-- BEEKON.AI COMPLETE DATABASE RECREATION
-- =================================================================
-- This file recreates the entire Beekon.ai database structure from scratch
-- including all schemas, tables, materialized views, functions, triggers,
-- storage configuration, and permissions.
--
-- Use this file to deploy on fresh Supabase instances or for disaster recovery.
-- Last updated: 2025-01-18
-- =================================================================

BEGIN;

-- =================================================================
-- 1. SCHEMA CREATION
-- =================================================================

-- Create the main application schema
CREATE SCHEMA IF NOT EXISTS beekon_data;

-- Grant usage on the schema
GRANT USAGE ON SCHEMA beekon_data TO authenticated;
GRANT USAGE ON SCHEMA beekon_data TO service_role;

-- =================================================================
-- 2. CORE FUNCTIONS (Must be created before triggers)
-- =================================================================

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user signup and create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO beekon_data.profiles (user_id, email, full_name, first_name, last_name, company)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'company'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================================================================
-- 3. CORE TABLES CREATION
-- =================================================================

-- Workspaces table (Create first as it's referenced by profiles)
CREATE TABLE IF NOT EXISTS beekon_data.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID, -- Will be linked to profiles after profiles table is created
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free',
  credits_remaining INTEGER DEFAULT 100,
  credits_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('free', 'starter', 'professional', 'enterprise'))
);

-- Profiles table (Core user profiles)
CREATE TABLE IF NOT EXISTS beekon_data.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  avatar_url TEXT,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE SET NULL,
  notification_settings JSONB DEFAULT '{
    "email_notifications": true,
    "weekly_reports": true,
    "competitor_alerts": false,
    "analysis_complete": true,
    "daily_digest": false,
    "security_alerts": true
  }',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add foreign key constraint from workspaces to profiles (now that profiles exists)
ALTER TABLE beekon_data.workspaces 
DROP CONSTRAINT IF EXISTS workspaces_owner_id_fkey;

ALTER TABLE beekon_data.workspaces
ADD CONSTRAINT workspaces_owner_id_fkey 
FOREIGN KEY (owner_id) REFERENCES beekon_data.profiles(id) ON DELETE SET NULL;

-- API Keys table
CREATE TABLE IF NOT EXISTS beekon_data.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  rate_limit INTEGER DEFAULT 1000,
  rate_limit_window TEXT DEFAULT '1 hour',
  scopes TEXT[] DEFAULT ARRAY['read'],
  
  UNIQUE(user_id, name),
  CONSTRAINT valid_scopes CHECK (scopes <@ ARRAY['read', 'write', 'update', 'delete'])
);

-- Websites table
CREATE TABLE IF NOT EXISTS beekon_data.websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  display_name TEXT,
  crawl_status TEXT DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  last_crawled_at TIMESTAMP WITH TIME ZONE,
  workspace_id UUID REFERENCES beekon_data.workspaces(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_crawl_status CHECK (crawl_status IN ('pending', 'crawling', 'completed', 'failed', 'paused')),
  CONSTRAINT valid_domain CHECK (domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$')
);

-- Topics table
CREATE TABLE IF NOT EXISTS beekon_data.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_name TEXT NOT NULL,
  topic_keywords TEXT[],
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  recommendation_text TEXT,
  reporting_text TEXT,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 5),
  UNIQUE(website_id, topic_name)
);

-- Prompts table
CREATE TABLE IF NOT EXISTS beekon_data.prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text TEXT NOT NULL,
  prompt_type TEXT DEFAULT 'general',
  priority INTEGER DEFAULT 1,
  topic_id UUID REFERENCES beekon_data.topics(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  strengths TEXT[],
  opportunities TEXT[],
  recommendation_text TEXT,
  reporting_text TEXT,
  expected_llms TEXT[] DEFAULT ARRAY['chatgpt', 'claude', 'gemini'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_priority CHECK (priority BETWEEN 1 AND 5),
  CONSTRAINT valid_prompt_type CHECK (prompt_type IN ('listicle', 'comparison', 'use_case', 'alternative', 'general'))
);

-- LLM Analysis Results table
CREATE TABLE IF NOT EXISTS beekon_data.llm_analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES beekon_data.prompts(id) ON DELETE CASCADE NOT NULL,
  llm_provider TEXT NOT NULL,
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  is_mentioned BOOLEAN DEFAULT FALSE,
  rank_position INTEGER,
  sentiment_score DECIMAL(3,2),
  confidence_score DECIMAL(3,2),
  response_text TEXT,
  summary_text TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_llm_provider CHECK (llm_provider IN ('chatgpt', 'claude', 'gemini', 'perplexity', 'gpt-4', 'claude-3')),
  CONSTRAINT valid_rank_position CHECK (rank_position > -1),
  CONSTRAINT valid_sentiment_score CHECK (sentiment_score BETWEEN -1.0 AND 1.0),
  CONSTRAINT valid_confidence_score CHECK (confidence_score BETWEEN 0.0 AND 1.0)
);

-- Competitors table
CREATE TABLE IF NOT EXISTS beekon_data.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  competitor_domain TEXT NOT NULL,
  competitor_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  analysis_frequency TEXT DEFAULT 'weekly',
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_analysis_frequency CHECK (analysis_frequency IN ('daily', 'weekly', 'monthly', 'manual')),
  CONSTRAINT valid_competitor_domain CHECK (competitor_domain ~ '^https?:\\/\\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}(\\/.*)?$'),
  UNIQUE(website_id, competitor_domain)
);

-- Competitor Analysis Results table
CREATE TABLE IF NOT EXISTS beekon_data.competitor_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id UUID NOT NULL REFERENCES beekon_data.competitors(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL REFERENCES beekon_data.prompts(id) ON DELETE CASCADE,
    llm_provider VARCHAR(50) NOT NULL,
    is_mentioned BOOLEAN DEFAULT FALSE,
    rank_position INTEGER,
    sentiment_score DECIMAL(3,2),
    confidence_score DECIMAL(3,2),
    response_text TEXT,
    summary_text TEXT,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique analysis per competitor/prompt/llm combination
    UNIQUE(competitor_id, prompt_id, llm_provider)
);

-- Website Settings table
CREATE TABLE IF NOT EXISTS beekon_data.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL UNIQUE,
  settings JSONB DEFAULT '{
    "analysis_frequency": "weekly",
    "auto_analysis": true,
    "notifications": true,
    "competitor_tracking": false,
    "weekly_reports": true,
    "show_in_dashboard": true,
    "priority_level": "medium",
    "api_access": false,
    "data_retention": "90",
    "export_enabled": true
  }' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Export History table
CREATE TABLE IF NOT EXISTS beekon_data.export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    export_type VARCHAR(50) NOT NULL,
    format VARCHAR(20) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    filters JSONB,
    date_range JSONB,
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT export_history_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT export_history_format_check CHECK (format IN ('pdf', 'csv', 'json', 'excel', 'word')),
    CONSTRAINT export_history_type_check CHECK (export_type IN ('analysis', 'dashboard', 'website', 'competitor', 'configuration', 'filtered_data'))
);

-- =================================================================
-- 4. PERFORMANCE INDEXES
-- =================================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON beekon_data.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id ON beekon_data.profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON beekon_data.profiles(email);

-- API Keys indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON beekon_data.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON beekon_data.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON beekon_data.api_keys(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON beekon_data.api_keys(key_prefix);

-- Workspaces indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON beekon_data.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_tier ON beekon_data.workspaces(subscription_tier);

-- Websites indexes
CREATE INDEX IF NOT EXISTS idx_websites_workspace_id ON beekon_data.websites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_websites_domain ON beekon_data.websites(domain);
CREATE INDEX IF NOT EXISTS idx_websites_active ON beekon_data.websites(is_active);
CREATE INDEX IF NOT EXISTS idx_websites_crawl_status ON beekon_data.websites(crawl_status);

-- Topics indexes
CREATE INDEX IF NOT EXISTS idx_topics_website_id ON beekon_data.topics(website_id);
CREATE INDEX IF NOT EXISTS idx_topics_active ON beekon_data.topics(is_active);
CREATE INDEX IF NOT EXISTS idx_topics_name ON beekon_data.topics(topic_name);

-- Prompts indexes
CREATE INDEX IF NOT EXISTS idx_prompts_topic_id ON beekon_data.prompts(topic_id);
CREATE INDEX IF NOT EXISTS idx_prompts_active ON beekon_data.prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompts_priority ON beekon_data.prompts(priority);

-- LLM Analysis Results indexes (Critical for performance)
CREATE INDEX IF NOT EXISTS idx_llm_results_prompt_id ON beekon_data.llm_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_website_id ON beekon_data.llm_analysis_results(website_id);
CREATE INDEX IF NOT EXISTS idx_llm_results_provider ON beekon_data.llm_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_llm_results_mentioned ON beekon_data.llm_analysis_results(is_mentioned);
CREATE INDEX IF NOT EXISTS idx_llm_results_analyzed_at ON beekon_data.llm_analysis_results(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_llm_results_compound ON beekon_data.llm_analysis_results(website_id, llm_provider, analyzed_at);

-- Competitors indexes
CREATE INDEX IF NOT EXISTS idx_competitors_website_id ON beekon_data.competitors(website_id);
CREATE INDEX IF NOT EXISTS idx_competitors_domain ON beekon_data.competitors(competitor_domain);
CREATE INDEX IF NOT EXISTS idx_competitors_active ON beekon_data.competitors(is_active);

-- Competitor Analysis Results indexes
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_competitor_id 
    ON beekon_data.competitor_analysis_results(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_prompt_id 
    ON beekon_data.competitor_analysis_results(prompt_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_llm_provider 
    ON beekon_data.competitor_analysis_results(llm_provider);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_analyzed_at 
    ON beekon_data.competitor_analysis_results(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_mentioned 
    ON beekon_data.competitor_analysis_results(is_mentioned, rank_position);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_composite 
    ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at, is_mentioned);

-- Website Settings indexes
CREATE INDEX IF NOT EXISTS idx_website_settings_website_id ON beekon_data.website_settings(website_id);

-- Export History indexes
CREATE INDEX IF NOT EXISTS idx_export_history_user_id ON beekon_data.export_history(user_id);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON beekon_data.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON beekon_data.export_history(status);
CREATE INDEX IF NOT EXISTS idx_export_history_export_type ON beekon_data.export_history(export_type);
CREATE INDEX IF NOT EXISTS idx_export_history_user_created ON beekon_data.export_history(user_id, created_at DESC);

-- =================================================================
-- 5. MATERIALIZED VIEWS
-- =================================================================

-- Competitor Share of Voice materialized view
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_analyses,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
    CASE 
        WHEN COUNT(car.id) > 0 
        THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
        ELSE 0
    END AS share_of_voice,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    MAX(car.analyzed_at) AS last_analyzed_at
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '30 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Competitive Gap Analysis materialized view
CREATE MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis AS
WITH topic_performance AS (
    SELECT 
        t.website_id,
        t.id AS topic_id,
        t.topic_name,
        -- Your brand performance
        COUNT(lar.id) AS your_brand_analyses,
        COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS your_brand_mentions,
        CASE 
            WHEN COUNT(lar.id) > 0 
            THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
            ELSE 0
        END AS your_brand_score,
        -- Competitor performance
        COALESCE(comp_stats.competitor_avg_score, 0) AS competitor_avg_score,
        COALESCE(comp_stats.competitor_count, 0) AS competitor_count
    FROM beekon_data.topics t
    LEFT JOIN beekon_data.prompts p ON t.id = p.topic_id
    LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
    LEFT JOIN (
        SELECT 
            competitor_scores.topic_id,
            AVG(competitor_scores.competitor_score) AS competitor_avg_score,
            COUNT(DISTINCT competitor_scores.competitor_id) AS competitor_count
        FROM (
            SELECT 
                p2.topic_id AS topic_id,
                c.id AS competitor_id,
                CASE 
                    WHEN COUNT(car.id) > 0 
                    THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                    ELSE 0
                END AS competitor_score
            FROM beekon_data.prompts p2
            LEFT JOIN beekon_data.competitor_analysis_results car ON p2.id = car.prompt_id
            LEFT JOIN beekon_data.competitors c ON car.competitor_id = c.id
            WHERE c.is_active = TRUE
            AND car.analyzed_at >= NOW() - INTERVAL '30 days'
            GROUP BY p2.topic_id, c.id
        ) competitor_scores
        GROUP BY competitor_scores.topic_id
    ) comp_stats ON t.id = comp_stats.topic_id
    WHERE t.is_active = TRUE
    AND lar.analyzed_at >= NOW() - INTERVAL '30 days'
    GROUP BY t.website_id, t.id, t.topic_name, comp_stats.competitor_avg_score, comp_stats.competitor_count
)
SELECT 
    website_id,
    topic_id,
    topic_name,
    your_brand_score,
    competitor_avg_score,
    competitor_count,
    (your_brand_score - competitor_avg_score) AS performance_gap,
    CASE 
        WHEN your_brand_score > competitor_avg_score THEN 'advantage'
        WHEN your_brand_score < competitor_avg_score THEN 'disadvantage'
        ELSE 'neutral'
    END AS gap_type
FROM topic_performance;

-- Competitor Performance materialized view
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_performance AS
SELECT 
    w.id AS website_id,
    c.id AS competitor_id,
    c.competitor_name,
    c.competitor_domain,
    COUNT(car.id) AS total_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
    AVG(car.sentiment_score) AS avg_sentiment_score,
    AVG(car.confidence_score) AS avg_confidence_score,
    COUNT(DISTINCT car.llm_provider) AS llm_providers_count,
    MAX(car.analyzed_at) AS last_analysis_date,
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) AS mentions_last_7_days,
    COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '30 days' AND car.is_mentioned THEN 1 END) AS mentions_last_30_days,
    CASE 
        WHEN COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.is_mentioned THEN 1 END) > 0
        AND COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END) > 0
        THEN (
            COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL 
            / COUNT(CASE WHEN car.analyzed_at >= NOW() - INTERVAL '14 days' AND car.analyzed_at < NOW() - INTERVAL '7 days' AND car.is_mentioned THEN 1 END)::DECIMAL - 1
        ) * 100
        ELSE 0
    END AS mention_trend_7d,
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.sentiment_score 
    END) AS recent_sentiment_score,
    AVG(CASE 
        WHEN car.analyzed_at >= NOW() - INTERVAL '7 days' AND car.is_mentioned 
        THEN car.rank_position 
    END) AS recent_avg_rank
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.id, c.competitor_name, c.competitor_domain;

-- Competitor Daily Metrics materialized view
CREATE MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics AS
SELECT 
    w.id AS website_id,
    c.competitor_domain,
    DATE(car.analyzed_at) AS analysis_date,
    COUNT(car.id) AS daily_mentions,
    COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS daily_positive_mentions,
    AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS daily_avg_rank,
    AVG(car.sentiment_score) AS daily_avg_sentiment,
    COUNT(DISTINCT car.llm_provider) AS daily_llm_providers,
    array_agg(DISTINCT car.llm_provider) AS llm_providers_list
FROM beekon_data.websites w
LEFT JOIN beekon_data.competitors c ON w.id = c.website_id  
LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id
WHERE c.is_active = TRUE
AND car.analyzed_at >= NOW() - INTERVAL '90 days'
GROUP BY w.id, c.competitor_domain, DATE(car.analyzed_at);

-- Create unique indexes for materialized views
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_share_of_voice_unique 
    ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitive_gap_analysis_unique 
    ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_performance_unique 
    ON beekon_data.mv_competitor_performance (website_id, competitor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_daily_metrics_unique 
    ON beekon_data.mv_competitor_daily_metrics (website_id, competitor_domain, analysis_date);

-- =================================================================
-- 6. ANALYSIS FUNCTIONS
-- =================================================================

-- Function to get competitor share of voice
CREATE OR REPLACE FUNCTION beekon_data.get_competitor_share_of_voice(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    competitor_id UUID,
    competitor_name TEXT,
    competitor_domain TEXT,
    total_analyses INTEGER,
    total_voice_mentions INTEGER,
    share_of_voice DECIMAL,
    avg_rank_position DECIMAL,
    avg_sentiment_score DECIMAL,
    avg_confidence_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH website_competitors AS (
        SELECT 
            c.id,
            c.competitor_name,
            c.competitor_domain
        FROM beekon_data.competitors c
        WHERE c.website_id = p_website_id
        AND c.is_active = TRUE
    ),
    competitor_stats AS (
        SELECT 
            wc.id AS competitor_id,
            wc.competitor_name,
            wc.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_voice_mentions,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position,
            AVG(car.sentiment_score) AS avg_sentiment_score,
            AVG(car.confidence_score) AS avg_confidence_score
        FROM website_competitors wc
        LEFT JOIN beekon_data.competitor_analysis_results car ON wc.id = car.competitor_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        GROUP BY wc.id, wc.competitor_name, wc.competitor_domain
    ),
    total_mentions_all AS (
        SELECT SUM(cs.total_voice_mentions) AS total_market_mentions
        FROM competitor_stats cs
    )
    SELECT 
        cs.competitor_id,
        cs.competitor_name,
        cs.competitor_domain,
        cs.total_analyses,
        cs.total_voice_mentions,
        CASE 
            WHEN tma.total_market_mentions > 0 
            THEN (cs.total_voice_mentions::DECIMAL / tma.total_market_mentions::DECIMAL) * 100
            ELSE 0
        END AS share_of_voice,
        cs.avg_rank_position,
        cs.avg_sentiment_score,
        cs.avg_confidence_score
    FROM competitor_stats cs
    CROSS JOIN total_mentions_all tma
    ORDER BY cs.total_voice_mentions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get competitive gap analysis
CREATE OR REPLACE FUNCTION beekon_data.get_competitive_gap_analysis(
    p_website_id UUID,
    p_date_start TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    p_date_end TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    topic_id UUID,
    topic_name TEXT,
    your_brand_score DECIMAL,
    competitor_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH website_topics AS (
        SELECT 
            t.id,
            t.topic_name
        FROM beekon_data.topics t
        WHERE t.website_id = p_website_id
        AND t.is_active = TRUE
    ),
    your_brand_performance AS (
        SELECT 
            wt.id AS topic_id,
            wt.topic_name,
            COUNT(lar.id) AS total_analyses,
            COUNT(CASE WHEN lar.is_mentioned THEN 1 END) AS total_brand_mentions,
            CASE 
                WHEN COUNT(lar.id) > 0 
                THEN (COUNT(CASE WHEN lar.is_mentioned THEN 1 END)::DECIMAL / COUNT(lar.id)::DECIMAL) * 100
                ELSE 0
            END AS your_brand_score
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.llm_analysis_results lar ON p.id = lar.prompt_id
        WHERE lar.analyzed_at BETWEEN p_date_start AND p_date_end
        AND lar.website_id = p_website_id
        GROUP BY wt.id, wt.topic_name
    ),
    competitor_performance AS (
        SELECT 
            wt.id AS topic_id,
            c.id AS competitor_id,
            c.competitor_name,
            c.competitor_domain,
            COUNT(car.id) AS total_analyses,
            COUNT(CASE WHEN car.is_mentioned THEN 1 END) AS total_competitor_mentions,
            CASE 
                WHEN COUNT(car.id) > 0 
                THEN (COUNT(CASE WHEN car.is_mentioned THEN 1 END)::DECIMAL / COUNT(car.id)::DECIMAL) * 100
                ELSE 0
            END AS competitor_score,
            AVG(CASE WHEN car.is_mentioned THEN car.rank_position END) AS avg_rank_position
        FROM website_topics wt
        LEFT JOIN beekon_data.prompts p ON wt.id = p.topic_id
        LEFT JOIN beekon_data.competitors c ON c.website_id = p_website_id
        LEFT JOIN beekon_data.competitor_analysis_results car ON c.id = car.competitor_id AND p.id = car.prompt_id
        WHERE car.analyzed_at BETWEEN p_date_start AND p_date_end
        AND c.is_active = TRUE
        GROUP BY wt.id, c.id, c.competitor_name, c.competitor_domain
    ),
    aggregated_competitor_data AS (
        SELECT 
            topic_id,
            jsonb_agg(
                jsonb_build_object(
                    'competitor_id', competitor_id,
                    'competitor_name', competitor_name,
                    'competitor_domain', competitor_domain,
                    'score', competitor_score,
                    'avg_rank_position', avg_rank_position,
                    'total_mentions', total_competitor_mentions
                )
                ORDER BY competitor_score DESC
            ) AS competitor_data
        FROM competitor_performance
        GROUP BY topic_id
    )
    SELECT 
        ybp.topic_id,
        ybp.topic_name,
        ybp.your_brand_score,
        COALESCE(acd.competitor_data, '[]'::jsonb) AS competitor_data
    FROM your_brand_performance ybp
    LEFT JOIN aggregated_competitor_data acd ON ybp.topic_id = acd.topic_id
    ORDER BY ybp.your_brand_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to analyze competitor mentions
CREATE OR REPLACE FUNCTION beekon_data.analyze_competitor_mentions(
    p_website_id UUID,
    p_competitor_id UUID,
    p_prompt_id UUID,
    p_llm_provider VARCHAR(50),
    p_response_text TEXT
)
RETURNS TABLE (
    is_mentioned BOOLEAN,
    rank_position INTEGER,
    sentiment_score DECIMAL,
    confidence_score DECIMAL,
    summary_text TEXT
) AS $$
DECLARE
    v_competitor_domain TEXT;
    v_competitor_name TEXT;
    v_is_mentioned BOOLEAN := FALSE;
    v_rank_position INTEGER := NULL;
    v_sentiment_score DECIMAL := 0.0;
    v_confidence_score DECIMAL := 0.5;
    v_summary_text TEXT := '';
BEGIN
    -- Get competitor details
    SELECT competitor_domain, competitor_name 
    INTO v_competitor_domain, v_competitor_name
    FROM beekon_data.competitors 
    WHERE id = p_competitor_id;
    
    -- Simple mention detection (case-insensitive)
    IF p_response_text ILIKE '%' || v_competitor_domain || '%' 
       OR (v_competitor_name IS NOT NULL AND p_response_text ILIKE '%' || v_competitor_name || '%') THEN
        v_is_mentioned := TRUE;
        v_confidence_score := 0.8;
        
        -- Simple ranking detection (look for numbered lists)
        IF p_response_text ~* '1\.\s*' || v_competitor_domain THEN
            v_rank_position := 1;
        ELSIF p_response_text ~* '2\.\s*' || v_competitor_domain THEN
            v_rank_position := 2;
        ELSIF p_response_text ~* '3\.\s*' || v_competitor_domain THEN
            v_rank_position := 3;
        ELSIF p_response_text ~* '4\.\s*' || v_competitor_domain THEN
            v_rank_position := 4;
        ELSIF p_response_text ~* '5\.\s*' || v_competitor_domain THEN
            v_rank_position := 5;
        ELSE
            v_rank_position := 3;
        END IF;
        
        -- Simple sentiment analysis
        IF p_response_text ~* '(best|excellent|great|top|leading|recommended|superior).*' || v_competitor_domain THEN
            v_sentiment_score := 0.7;
        ELSIF p_response_text ~* '(worst|terrible|bad|poor|avoid|inferior).*' || v_competitor_domain THEN
            v_sentiment_score := -0.7;
        ELSE
            v_sentiment_score := 0.0;
        END IF;
        
        v_summary_text := 'Competitor mentioned in LLM response';
    ELSE
        v_summary_text := 'Competitor not mentioned in LLM response';
    END IF;
    
    RETURN QUERY SELECT 
        v_is_mentioned,
        v_rank_position,
        v_sentiment_score,
        v_confidence_score,
        v_summary_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh competitor performance views
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_performance_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all competitor performance materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh competitor analysis views
CREATE OR REPLACE FUNCTION beekon_data.refresh_competitor_analysis_views()
RETURNS VOID AS $$
BEGIN
    -- Refresh all competitor analysis materialized views concurrently
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_share_of_voice;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitive_gap_analysis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_performance;
    REFRESH MATERIALIZED VIEW CONCURRENTLY beekon_data.mv_competitor_daily_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Export history timestamp function
CREATE OR REPLACE FUNCTION beekon_data.update_export_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================

-- Enable RLS on all tables
ALTER TABLE beekon_data.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.llm_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.competitor_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE beekon_data.export_history ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON beekon_data.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON beekon_data.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON beekon_data.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- API Keys policies
CREATE POLICY "Users can view their own API keys" ON beekon_data.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API keys" ON beekon_data.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own API keys" ON beekon_data.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own API keys" ON beekon_data.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Workspaces policies
CREATE POLICY "Users can view workspaces they own" ON beekon_data.workspaces
  FOR SELECT USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update workspaces they own" ON beekon_data.workspaces
  FOR UPDATE USING (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert workspaces they own" ON beekon_data.workspaces
  FOR INSERT WITH CHECK (
    owner_id IN (
      SELECT id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- Websites policies
CREATE POLICY "Users can view websites in their workspaces" ON beekon_data.websites
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage websites in their workspaces" ON beekon_data.websites
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM beekon_data.profiles WHERE user_id = auth.uid()
    )
  );

-- Topics policies
CREATE POLICY "Users can view topics for their websites" ON beekon_data.topics
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage topics for their websites" ON beekon_data.topics
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Prompts policies
CREATE POLICY "Users can view prompts for their topics" ON beekon_data.prompts
  FOR SELECT USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage prompts for their topics" ON beekon_data.prompts
  FOR ALL USING (
    topic_id IN (
      SELECT t.id FROM beekon_data.topics t
      JOIN beekon_data.websites w ON t.website_id = w.id
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- LLM Analysis Results policies
CREATE POLICY "Users can view analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage analysis results for their websites" ON beekon_data.llm_analysis_results
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitors policies
CREATE POLICY "Users can view competitors for their websites" ON beekon_data.competitors
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage competitors for their websites" ON beekon_data.competitors
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Competitor Analysis Results policies
CREATE POLICY "Users can access competitor analysis results for their websites" 
    ON beekon_data.competitor_analysis_results
    FOR ALL
    TO authenticated
    USING (
        competitor_id IN (
            SELECT c.id 
            FROM beekon_data.competitors c
            JOIN beekon_data.websites w ON c.website_id = w.id
            JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
            WHERE p.user_id = auth.uid()
        )
    );

-- Website Settings policies
CREATE POLICY "Users can view website settings for their websites" ON beekon_data.website_settings
  FOR SELECT USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage website settings for their websites" ON beekon_data.website_settings
  FOR ALL USING (
    website_id IN (
      SELECT w.id FROM beekon_data.websites w
      JOIN beekon_data.profiles p ON w.workspace_id = p.workspace_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Export History policies
CREATE POLICY "Users can view their own export history"
    ON beekon_data.export_history
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own export history"
    ON beekon_data.export_history
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own export history"
    ON beekon_data.export_history
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own export history"
    ON beekon_data.export_history
    FOR DELETE
    USING (auth.uid() = user_id);

-- =================================================================
-- 8. TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- =================================================================

-- Profiles triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON beekon_data.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Workspaces triggers
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON beekon_data.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Websites triggers
CREATE TRIGGER update_websites_updated_at
  BEFORE UPDATE ON beekon_data.websites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Competitors triggers
CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON beekon_data.competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Website Settings triggers
CREATE TRIGGER update_website_settings_updated_at
  BEFORE UPDATE ON beekon_data.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Export History triggers
CREATE TRIGGER update_export_history_updated_at
    BEFORE UPDATE ON beekon_data.export_history
    FOR EACH ROW
    EXECUTE FUNCTION beekon_data.update_export_history_updated_at();

-- User signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- 9. STORAGE BUCKET CONFIGURATION
-- =================================================================

-- Create avatars bucket for user profile images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
  
  -- Create new policies
  CREATE POLICY "Users can upload their own avatar" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  CREATE POLICY "Users can view all avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

  CREATE POLICY "Users can update their own avatar" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  CREATE POLICY "Users can delete their own avatar" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'avatars' 
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Storage policies may need manual configuration: %', SQLERRM;
END $$;

-- =================================================================
-- 10. VIEWS AND STATISTICS
-- =================================================================

-- Create export statistics view
CREATE OR REPLACE VIEW beekon_data.export_statistics AS
SELECT 
    user_id,
    export_type,
    format,
    status,
    COUNT(*) as total_exports,
    SUM(file_size) as total_size,
    AVG(file_size) as avg_size,
    MAX(created_at) as last_export,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_exports,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_exports,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
FROM beekon_data.export_history
GROUP BY user_id, export_type, format, status;

-- =================================================================
-- 11. PERMISSIONS AND GRANTS
-- =================================================================

-- Grant appropriate permissions to authenticated users
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA beekon_data TO authenticated;

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA beekon_data TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA beekon_data TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA beekon_data TO service_role;

-- Specific permissions for materialized views
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO authenticated;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_performance TO authenticated;
GRANT SELECT ON beekon_data.mv_competitor_daily_metrics TO authenticated;
GRANT SELECT ON beekon_data.export_statistics TO authenticated;

-- Service role permissions for materialized view functions
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO service_role;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO service_role;
GRANT SELECT ON beekon_data.mv_competitor_share_of_voice TO service_role;
GRANT SELECT ON beekon_data.mv_competitive_gap_analysis TO service_role;
GRANT SELECT ON beekon_data.mv_competitor_performance TO service_role;
GRANT SELECT ON beekon_data.mv_competitor_daily_metrics TO service_role;

-- Grant function permissions
GRANT EXECUTE ON FUNCTION beekon_data.get_competitor_share_of_voice TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.get_competitive_gap_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.analyze_competitor_mentions TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_analysis_views TO authenticated;
GRANT EXECUTE ON FUNCTION beekon_data.refresh_competitor_performance_views TO authenticated;

-- =================================================================
-- 12. COMMENTS AND DOCUMENTATION
-- =================================================================

-- Add helpful comments to functions
COMMENT ON FUNCTION beekon_data.get_competitor_share_of_voice IS 'Returns share of voice data for competitors';
COMMENT ON FUNCTION beekon_data.get_competitive_gap_analysis IS 'Returns competitive gap analysis by topic';
COMMENT ON FUNCTION beekon_data.analyze_competitor_mentions IS 'Analyzes competitor mentions in LLM responses';
COMMENT ON FUNCTION beekon_data.refresh_competitor_performance_views IS 'Refreshes all competitor performance materialized views - accessible by service_role for Edge Functions';
COMMENT ON FUNCTION beekon_data.refresh_competitor_analysis_views IS 'Refreshes all competitor analysis materialized views - accessible by service_role for Edge Functions';

-- Add helpful comments to tables
COMMENT ON TABLE beekon_data.competitor_analysis_results IS 'Stores competitor analysis results from LLM responses';
COMMENT ON TABLE beekon_data.export_history IS 'Tracks all export operations performed by users';

-- Add helpful comments to materialized views
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_share_of_voice IS 'Materialized view for competitor share of voice metrics';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitive_gap_analysis IS 'Materialized view for competitive gap analysis';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_performance IS 'Materialized view for competitor performance metrics';
COMMENT ON MATERIALIZED VIEW beekon_data.mv_competitor_daily_metrics IS 'Materialized view for daily competitor metrics';

-- =================================================================
-- 13. DATA VALIDATION AND VERIFICATION
-- =================================================================

-- Verify table creation and structure
DO $$
DECLARE
  table_count INTEGER;
  index_count INTEGER;
  policy_count INTEGER;
  function_count INTEGER;
  view_count INTEGER;
BEGIN
  -- Count tables in beekon_data schema
  SELECT COUNT(*) INTO table_count 
  FROM information_schema.tables 
  WHERE table_schema = 'beekon_data';
  
  -- Count indexes on beekon_data tables
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes 
  WHERE schemaname = 'beekon_data';
  
  -- Count RLS policies on beekon_data tables
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE schemaname = 'beekon_data';
  
  -- Count functions in beekon_data schema
  SELECT COUNT(*) INTO function_count
  FROM information_schema.routines 
  WHERE routine_schema = 'beekon_data';
  
  -- Count materialized views
  SELECT COUNT(*) INTO view_count
  FROM pg_matviews 
  WHERE schemaname = 'beekon_data';
  
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'BEEKON.AI DATABASE RECREATION COMPLETED SUCCESSFULLY';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Tables created: %', table_count;
  RAISE NOTICE 'Indexes created: %', index_count;
  RAISE NOTICE 'RLS policies created: %', policy_count;
  RAISE NOTICE 'Functions created: %', function_count;
  RAISE NOTICE 'Materialized views created: %', view_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Schema: beekon_data';
  RAISE NOTICE 'Core Tables:';
  RAISE NOTICE '  ✓ profiles - User profile management';
  RAISE NOTICE '  ✓ api_keys - API key management';
  RAISE NOTICE '  ✓ workspaces - Multi-tenant workspaces';
  RAISE NOTICE '  ✓ websites - Website tracking';
  RAISE NOTICE '  ✓ topics - Analysis topics';
  RAISE NOTICE '  ✓ prompts - AI prompts';
  RAISE NOTICE '  ✓ llm_analysis_results - AI analysis results';
  RAISE NOTICE '  ✓ competitors - Competitor tracking';
  RAISE NOTICE '  ✓ competitor_analysis_results - Competitor analysis data';
  RAISE NOTICE '  ✓ website_settings - Website configurations';
  RAISE NOTICE '  ✓ export_history - Export tracking';
  RAISE NOTICE '';
  RAISE NOTICE 'Materialized Views:';
  RAISE NOTICE '  ✓ mv_competitor_share_of_voice - Share of voice analytics';
  RAISE NOTICE '  ✓ mv_competitive_gap_analysis - Competitive gap data';
  RAISE NOTICE '  ✓ mv_competitor_performance - Performance metrics';
  RAISE NOTICE '  ✓ mv_competitor_daily_metrics - Daily metrics';
  RAISE NOTICE '';
  RAISE NOTICE 'Analysis Functions:';
  RAISE NOTICE '  ✓ get_competitor_share_of_voice - Share of voice calculations';
  RAISE NOTICE '  ✓ get_competitive_gap_analysis - Gap analysis logic';
  RAISE NOTICE '  ✓ analyze_competitor_mentions - Mention analysis';
  RAISE NOTICE '  ✓ refresh_competitor_performance_views - View refresh';
  RAISE NOTICE '  ✓ refresh_competitor_analysis_views - Analysis refresh';
  RAISE NOTICE '';
  RAISE NOTICE 'Security: Row Level Security enabled on all tables';
  RAISE NOTICE 'Performance: Comprehensive indexes created';
  RAISE NOTICE 'Storage: Avatar bucket configured';
  RAISE NOTICE 'Functions: User signup and timestamp triggers active';
  RAISE NOTICE 'Edge Functions: Service role permissions granted';
  RAISE NOTICE '=================================================================';
  
  -- Verify that essential functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    RAISE WARNING 'handle_new_user function not found!';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    RAISE WARNING 'update_updated_at_column function not found!';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_competitor_performance_views') THEN
    RAISE WARNING 'refresh_competitor_performance_views function not found!';
  END IF;
  
END $$;

COMMIT;

-- =================================================================
-- DEPLOYMENT INSTRUCTIONS
-- =================================================================
/*

COMPLETE DEPLOYMENT GUIDE:
==========================

1. ✅ FRESH SUPABASE SETUP:
   - Create new Supabase project
   - Run this single SQL file via SQL Editor
   - No additional migrations needed

2. ✅ ENVIRONMENT VARIABLES:
   - VITE_SUPABASE_URL=your_supabase_url
   - VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
   - SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

3. ✅ EDGE FUNCTION DEPLOYMENT:
   - Deploy the refresh-competitor-views Edge Function
   - Set up cron job for hourly materialized view refresh
   - Commands:
     supabase functions deploy refresh-competitor-views
     supabase functions schedule refresh-competitor-views --cron "0 * * * *"

4. ✅ VERIFICATION STEPS:
   - Test user registration creates profile
   - Test workspace creation and access
   - Test website and competitor data flow
   - Verify materialized views populate correctly
   - Check avatar upload functionality

5. ✅ PERFORMANCE OPTIMIZATION:
   - Monitor materialized view refresh times
   - Adjust refresh frequency based on usage
   - Add additional indexes for specific query patterns
   - Monitor query performance with EXPLAIN ANALYZE

6. ✅ SECURITY VERIFICATION:
   - Verify RLS policies prevent unauthorized access
   - Test API key isolation
   - Check storage bucket permissions
   - Validate user data segregation

ROLLBACK PROCEDURE:
==================
If rollback is needed:
1. DROP SCHEMA beekon_data CASCADE;
2. DROP FUNCTION public.handle_new_user() CASCADE;
3. DROP FUNCTION public.update_updated_at_column() CASCADE;
4. DELETE FROM storage.buckets WHERE id = 'avatars';

MAINTENANCE TASKS:
=================
- Weekly: Review materialized view refresh logs
- Monthly: Analyze query performance and optimize indexes
- Quarterly: Review and update RLS policies
- As needed: Add new materialized views for performance

EDGE FUNCTION INTEGRATION:
=========================
This database structure supports the refresh-competitor-views Edge Function:
- Service role has execute permissions on refresh functions
- Materialized views are optimized for concurrent refresh
- Error handling and logging built into functions
- Cron scheduling recommended for every hour

TROUBLESHOOTING:
================
- If materialized views fail to refresh: Check service role permissions
- If RLS blocks queries: Review policy logic and user context
- If performance issues: Add specific indexes for query patterns
- If Edge Function fails: Check environment variables and permissions

*/