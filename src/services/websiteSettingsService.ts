import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { WebsiteSettings } from "@/types/website";

export interface WebsiteSettingsUpdateData {
  analysis_frequency?: "daily" | "weekly" | "bi-weekly" | "monthly";
  auto_analysis?: boolean;
  notifications?: boolean;
  competitor_tracking?: boolean;
  weekly_reports?: boolean;
  show_in_dashboard?: boolean;
  priority_level?: "high" | "medium" | "low";
  custom_labels?: string;
  api_access?: boolean;
  data_retention?: "30" | "90" | "180" | "365";
  export_enabled?: boolean;
  description?: string;
  country_code?: string; // ISO 3166-1 alpha-3 country code
  country_name?: string; // Full country name
}

// Type guard for settings JSON
function isValidSettingsJson(json: Json): json is {
  analysis_frequency?: string;
  auto_analysis?: boolean;
  notifications?: boolean;
  competitor_tracking?: boolean;
  weekly_reports?: boolean;
  show_in_dashboard?: boolean;
  priority_level?: string;
  custom_labels?: string;
  api_access?: boolean;
  data_retention?: string;
  export_enabled?: boolean;
  country_code?: string;
  country_name?: string;
} {
  return json !== null && typeof json === "object" && !Array.isArray(json);
}

export class WebsiteSettingsService {
  private static instance: WebsiteSettingsService;

  public static getInstance(): WebsiteSettingsService {
    if (!WebsiteSettingsService.instance) {
      WebsiteSettingsService.instance = new WebsiteSettingsService();
    }
    return WebsiteSettingsService.instance;
  }

  /**
   * Get website settings by website ID
   */
  async getWebsiteSettings(websiteId: string): Promise<WebsiteSettings | null> {
    // First check if settings exist in a separate table
    const { data: settingsData, error: settingsError } = await supabase
      .schema("beekon_data")
      .from("website_settings")
      .select("*")
      .eq("website_id", websiteId)
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      // If it's not a "not found" error, throw it
      throw settingsError;
    }

    if (settingsData) {
      const settings = isValidSettingsJson(settingsData.settings)
        ? settingsData.settings
        : {};

      return {
        id: settingsData.id,
        website_id: settingsData.website_id,
        analysis_frequency:
          (settings.analysis_frequency as WebsiteSettingsUpdateData["analysis_frequency"]) ||
          "weekly",
        auto_analysis: settings.auto_analysis ?? true,
        notifications: settings.notifications ?? true,
        competitor_tracking: settings.competitor_tracking ?? false,
        weekly_reports: settings.weekly_reports ?? true,
        show_in_dashboard: settings.show_in_dashboard ?? true,
        priority_level:
          (settings.priority_level as WebsiteSettingsUpdateData["priority_level"]) ||
          "medium",
        custom_labels: settings.custom_labels || "",
        api_access: settings.api_access ?? false,
        data_retention:
          (settings.data_retention as WebsiteSettingsUpdateData["data_retention"]) ||
          "90",
        export_enabled: settings.export_enabled ?? true,
        country_code: settings.country_code || undefined,
        country_name: settings.country_name || undefined,
        created_at: settingsData.created_at || undefined,
        updated_at: settingsData.updated_at || undefined,
      };
    }

    // If no settings found, return default settings
    return {
      id: "", // Will be generated on first save
      website_id: websiteId,
      analysis_frequency: "weekly",
      auto_analysis: true,
      notifications: true,
      competitor_tracking: false,
      weekly_reports: true,
      show_in_dashboard: true,
      priority_level: "medium",
      custom_labels: "",
      api_access: false,
      data_retention: "90",
      export_enabled: true,
      country_code: undefined,
      country_name: undefined,
    };
  }

  async updateWebsite(
    websiteId: string,
    updates: { displayName: string; isActive: boolean }
  ) {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("websites")
      .update({
        display_name: updates.displayName,
        is_active: updates.isActive,
      })
      .eq("id", websiteId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update website settings
   */
  async updateWebsiteSettings(
    websiteId: string,
    updates: WebsiteSettingsUpdateData
  ): Promise<WebsiteSettings> {
    // Only proceed if country is selected
    // if (!updates.country_code || !updates.country_name) {
    //   throw new Error("Website settings can only be saved when a country is selected");
    // }

    // First, check if settings record exists
    const { data: existingSettings } = await supabase
      .schema("beekon_data")
      .from("website_settings")
      .select("*")
      .eq("website_id", websiteId)
      .single();

    const settingsPayload = {
      analysis_frequency: updates.analysis_frequency,
      auto_analysis: updates.auto_analysis,
      notifications: updates.notifications,
      competitor_tracking: updates.competitor_tracking,
      weekly_reports: updates.weekly_reports,
      show_in_dashboard: updates.show_in_dashboard,
      priority_level: updates.priority_level,
      custom_labels: updates.custom_labels,
      api_access: updates.api_access,
      data_retention: updates.data_retention,
      export_enabled: updates.export_enabled,
      country_code: updates.country_code || null,
      country_name: updates.country_name || null,
    };

    let data;
    if (existingSettings) {
      // Update existing settings
      const { data: updatedData, error } = await supabase
        .schema("beekon_data")
        .from("website_settings")
        .update({ settings: settingsPayload })
        .eq("website_id", websiteId)
        .select()
        .single();

      if (error) throw error;
      data = updatedData;
    } else {
      // Create new settings record
      const { data: newData, error } = await supabase
        .schema("beekon_data")
        .from("website_settings")
        .insert({
          website_id: websiteId,
          settings: settingsPayload,
        })
        .select()
        .single();

      if (error) throw error;
      data = newData;
    }

    const settings = isValidSettingsJson(data.settings) ? data.settings : {};

    return {
      id: data.id,
      website_id: data.website_id,
      analysis_frequency:
        (settings.analysis_frequency as WebsiteSettingsUpdateData["analysis_frequency"]) ||
        "weekly",
      auto_analysis: settings.auto_analysis ?? true,
      notifications: settings.notifications ?? true,
      competitor_tracking: settings.competitor_tracking ?? false,
      weekly_reports: settings.weekly_reports ?? true,
      show_in_dashboard: settings.show_in_dashboard ?? true,
      priority_level:
        (settings.priority_level as WebsiteSettingsUpdateData["priority_level"]) ||
        "medium",
      custom_labels: settings.custom_labels || "",
      api_access: settings.api_access ?? false,
      data_retention:
        (settings.data_retention as WebsiteSettingsUpdateData["data_retention"]) ||
        "90",
      export_enabled: settings.export_enabled ?? true,
      country_code: settings.country_code || undefined,
      country_name: settings.country_name || undefined,
      created_at: data.created_at || undefined,
      updated_at: data.updated_at || undefined,
    };
  }

  /**
   * Delete website settings
   */
  async deleteWebsiteSettings(websiteId: string): Promise<void> {
    const { error } = await supabase
      .schema("beekon_data")
      .from("website_settings")
      .delete()
      .eq("website_id", websiteId);

    if (error) throw error;
  }
}

export const websiteSettingsService = WebsiteSettingsService.getInstance();
