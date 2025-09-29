-- =========================================================================
-- PHASE 1: CREATE MISSING UNIQUE INDEXES FOR CONCURRENT REFRESH SUPPORT
-- =========================================================================

-- These indexes are required for REFRESH MATERIALIZED VIEW CONCURRENTLY to work
-- They can be created online without blocking operations

-- 1. mv_competitor_daily_metrics unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_daily_metrics_unique
ON beekon_data.mv_competitor_daily_metrics (website_id, competitor_id, analysis_date);

-- 2. mv_competitor_share_of_voice unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_share_of_voice_unique
ON beekon_data.mv_competitor_share_of_voice (website_id, competitor_id);

-- 3. mv_competitive_gap_analysis unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitive_gap_analysis_unique
ON beekon_data.mv_competitive_gap_analysis (website_id, topic_id);

-- 4. mv_competitor_performance unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_competitor_performance_unique
ON beekon_data.mv_competitor_performance (website_id, competitor_id);

-- Add comments explaining the indexes
COMMENT ON INDEX beekon_data.idx_mv_competitor_daily_metrics_unique IS 'Unique index required for concurrent refresh of mv_competitor_daily_metrics';
COMMENT ON INDEX beekon_data.idx_mv_competitor_share_of_voice_unique IS 'Unique index required for concurrent refresh of mv_competitor_share_of_voice';
COMMENT ON INDEX beekon_data.idx_mv_competitive_gap_analysis_unique IS 'Unique index required for concurrent refresh of mv_competitive_gap_analysis';
COMMENT ON INDEX beekon_data.idx_mv_competitor_performance_unique IS 'Unique index required for concurrent refresh of mv_competitor_performance';