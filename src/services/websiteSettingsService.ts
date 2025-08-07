import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { WebsiteSettings } from "@/types/website";

type WebsiteSettingsRow =
  Database["beekon_data"]["Tables"]["website_settings"]["Row"];
type WebsiteSettingsInsert =
  Database["beekon_data"]["Tables"]["website_settings"]["Insert"];
type WebsiteSettingsUpdate =
  Database["beekon_data"]["Tables"]["website_settings"]["Update"];

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
      return {
        id: settingsData.id,
        website_id: settingsData.website_id,
        analysis_frequency:
          settingsData.settings?.analysis_frequency || "weekly",
        auto_analysis: settingsData.settings?.auto_analysis ?? true,
        notifications: settingsData.settings?.notifications ?? true,
        competitor_tracking:
          settingsData.settings?.competitor_tracking ?? false,
        weekly_reports: settingsData.settings?.weekly_reports ?? true,
        show_in_dashboard: settingsData.settings?.show_in_dashboard ?? true,
        priority_level: settingsData.settings?.priority_level || "medium",
        custom_labels: settingsData.settings?.custom_labels || "",
        api_access: settingsData.settings?.api_access ?? false,
        data_retention: settingsData.settings?.data_retention || "90",
        export_enabled: settingsData.settings?.export_enabled ?? true,
        created_at: settingsData.created_at,
        updated_at: settingsData.updated_at,
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

    return {
      id: data.id,
      website_id: data.website_id,
      analysis_frequency: data.settings?.analysis_frequency || "weekly",
      auto_analysis: data.settings?.auto_analysis ?? true,
      notifications: data.settings?.notifications ?? true,
      competitor_tracking: data.settings?.competitor_tracking ?? false,
      weekly_reports: data.settings?.weekly_reports ?? true,
      show_in_dashboard: data.settings?.show_in_dashboard ?? true,
      priority_level: data.settings?.priority_level || "medium",
      custom_labels: data.settings?.custom_labels || "",
      api_access: data.settings?.api_access ?? false,
      data_retention: data.settings?.data_retention || "90",
      export_enabled: data.settings?.export_enabled ?? true,
      created_at: data.created_at,
      updated_at: data.updated_at,
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
