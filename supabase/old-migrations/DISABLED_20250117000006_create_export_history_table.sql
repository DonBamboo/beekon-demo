-- Create export_history table for tracking all export operations
CREATE TABLE IF NOT EXISTS beekon_data.export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    export_type VARCHAR(50) NOT NULL, -- 'analysis', 'dashboard', 'website', 'competitor', 'configuration'
    format VARCHAR(20) NOT NULL, -- 'pdf', 'csv', 'json', 'excel', 'word'
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT, -- Size in bytes
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    filters JSONB, -- Applied filters and options
    date_range JSONB, -- Date range for the export
    metadata JSONB, -- Additional metadata (table names, record counts, etc.)
    error_message TEXT, -- Error details if status is 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT export_history_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT export_history_format_check CHECK (format IN ('pdf', 'csv', 'json', 'excel', 'word')),
    CONSTRAINT export_history_type_check CHECK (export_type IN ('analysis', 'dashboard', 'website', 'competitor', 'configuration', 'filtered_data'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_export_history_user_id ON beekon_data.export_history(user_id);
CREATE INDEX IF NOT EXISTS idx_export_history_created_at ON beekon_data.export_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_status ON beekon_data.export_history(status);
CREATE INDEX IF NOT EXISTS idx_export_history_export_type ON beekon_data.export_history(export_type);
CREATE INDEX IF NOT EXISTS idx_export_history_user_created ON beekon_data.export_history(user_id, created_at DESC);

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION beekon_data.update_export_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_export_history_updated_at
    BEFORE UPDATE ON beekon_data.export_history
    FOR EACH ROW
    EXECUTE FUNCTION beekon_data.update_export_history_updated_at();

-- Enable RLS (Row Level Security)
ALTER TABLE beekon_data.export_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
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

-- Create a view for export statistics
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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON beekon_data.export_history TO authenticated;
GRANT SELECT ON beekon_data.export_statistics TO authenticated;
GRANT USAGE ON SCHEMA beekon_data TO authenticated;