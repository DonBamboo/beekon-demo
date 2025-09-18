-- Import llm_analysis_results data using COPY command with proper error handling
-- This bypasses CSV parsing issues by using PostgreSQL's robust COPY command

-- First, let's clear any existing data to avoid conflicts
TRUNCATE TABLE beekon_data.llm_analysis_results CASCADE;

-- Import the fixed CSV data
-- Note: Using COPY command with proper CSV format handling
\copy beekon_data.llm_analysis_results(id,prompt_id,llm_provider,website_id,is_mentioned,rank_position,sentiment_score,confidence_score,response_text,summary_text,analyzed_at,created_at,analysis_session_id) FROM 'supabase/backup/llm_analysis_results_rows_fixed.csv' WITH (FORMAT CSV, HEADER true, DELIMITER ',', QUOTE '"', ESCAPE '"');

-- Check how many records were imported
SELECT COUNT(*) as imported_records FROM beekon_data.llm_analysis_results;

-- Show a sample of the imported data
SELECT id, prompt_id, llm_provider, website_id, is_mentioned, analyzed_at
FROM beekon_data.llm_analysis_results
LIMIT 5;