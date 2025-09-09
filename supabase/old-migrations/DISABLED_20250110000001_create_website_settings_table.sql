-- Create website_settings table for storing website-specific configuration
CREATE TABLE IF NOT EXISTS beekon_data.website_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID REFERENCES beekon_data.websites(id) ON DELETE CASCADE NOT NULL,
  settings JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(website_id)
);

-- Enable RLS on website_settings
ALTER TABLE beekon_data.website_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for website_settings
-- Users can only access settings for websites in their workspaces
CREATE POLICY "Users can view website settings in their workspaces" ON beekon_data.website_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      WHERE w.id = website_settings.website_id
      AND ws.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert website settings in their workspaces" ON beekon_data.website_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      WHERE w.id = website_settings.website_id
      AND ws.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update website settings in their workspaces" ON beekon_data.website_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      WHERE w.id = website_settings.website_id
      AND ws.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete website settings in their workspaces" ON beekon_data.website_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM beekon_data.websites w
      JOIN beekon_data.workspaces ws ON w.workspace_id = ws.id
      WHERE w.id = website_settings.website_id
      AND ws.owner_id = auth.uid()
    )
  );

-- Create trigger for updating website_settings timestamps
CREATE TRIGGER update_website_settings_updated_at
  BEFORE UPDATE ON beekon_data.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_website_settings_website_id ON beekon_data.website_settings(website_id);