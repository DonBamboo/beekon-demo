-- Create competitor analysis results table (missing from previous migration)
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

-- Create indexes for performance
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

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_results_composite 
    ON beekon_data.competitor_analysis_results(competitor_id, analyzed_at, is_mentioned);

-- Add Row Level Security (RLS)
ALTER TABLE beekon_data.competitor_analysis_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Users can access competitor analysis results for their websites" ON beekon_data.competitor_analysis_results;

-- Create RLS policy for competitor analysis results
CREATE POLICY "Users can access competitor analysis results for their websites" 
    ON beekon_data.competitor_analysis_results
    FOR ALL
    TO authenticated
    USING (
        competitor_id IN (
            SELECT c.id 
            FROM beekon_data.competitors c
            JOIN beekon_data.websites w ON c.website_id = w.id
            WHERE w.workspace_id IN (
                SELECT workspace_id 
                FROM beekon_data.profiles 
                WHERE user_id = auth.uid()
            )
        )
    );

-- Grant necessary permissions
GRANT SELECT ON beekon_data.competitor_analysis_results TO authenticated;
GRANT INSERT ON beekon_data.competitor_analysis_results TO authenticated;
GRANT UPDATE ON beekon_data.competitor_analysis_results TO authenticated;
GRANT DELETE ON beekon_data.competitor_analysis_results TO authenticated;

-- Add helpful comments
COMMENT ON TABLE beekon_data.competitor_analysis_results IS 'Stores competitor analysis results from LLM responses';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.competitor_id IS 'Foreign key to competitors table';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.prompt_id IS 'Foreign key to prompts table';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.llm_provider IS 'LLM provider name (e.g., openai, anthropic)';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.is_mentioned IS 'Whether the competitor was mentioned in the response';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.rank_position IS 'Position of competitor in ranked results';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.sentiment_score IS 'Sentiment score for the mention (-1 to 1)';
COMMENT ON COLUMN beekon_data.competitor_analysis_results.confidence_score IS 'Confidence score for the analysis (0 to 1)';