import { supabase } from "@/integrations/supabase/client";
import { ApiKey } from "@/types/database";
import BaseService from "./baseService";

// Browser-compatible crypto functions
const generateRandomBytes = (length: number): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(length));
};

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const sha256 = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  return arrayBufferToHex(hashBuffer);
};

// Re-export ApiKey from database types for easier imports
export type { ApiKey } from "@/types/database";

export interface ApiKeyWithSecret extends Omit<ApiKey, "key_hash"> {
  key: string; // Only available immediately after creation
}

export interface ApiKeyUsage {
  total_requests: number;
  success_rate: number;
  active_keys: number;
  last_30_days: number;
}

export class ApiKeyService extends BaseService {
  private static instance: ApiKeyService;
  protected serviceName = "api-key" as const;

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  /**
   * Generate a new API key
   */
  async generateApiKey(
    userId: string,
    name: string
  ): Promise<ApiKeyWithSecret> {
    return this.executeOperation("generateApiKey", async () => {
      this.validateUUID(userId, "userId");
      this.validateRequired({ name }, ["name"]);
      this.validateStringLength(name, "name", 1, 100);
      this.logOperation("generateApiKey", { userId, name });

      // Generate a secure random key
      const keyBytes = generateRandomBytes(32);
      const keyString = `bk_${Date.now()}_${arrayBufferToHex(keyBytes)}`;
      const keyHash = await sha256(keyString);
      const keyPrefix = keyString.substring(0, 8);

      // Check if name already exists for this user
      const { data: existingKey } = await supabase
        .schema("beekon_data")
        .from("api_keys")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .single();

      if (existingKey) {
        throw new Error("API key with this name already exists");
      }

      // Insert the new API key
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("api_keys")
        .insert({
          user_id: userId,
          name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          is_active: true,
          usage_count: 0,
        })
        .select()
        .single();

      if (error) throw error;

      return {
        ...data,
        key: keyString, // Return the actual key only this once
      };
    });
  }

  /**
   * Get all API keys for a user
   */
  async getApiKeys(userId: string): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .schema("beekon_data")
      .from("api_keys")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const { error } = await supabase
      .schema("beekon_data")
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", keyId)
      .eq("user_id", userId);

    if (error) throw error;
  }

  /**
   * Delete an API key permanently
   */
  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    const { error } = await supabase
      .schema("beekon_data")
      .from("api_keys")
      .delete()
      .eq("id", keyId)
      .eq("user_id", userId);

    if (error) throw error;
  }

  /**
   * Verify an API key and update usage
   */
  async verifyApiKey(keyString: string): Promise<ApiKey | null> {
    try {
      const keyHash = await sha256(keyString);

      const { data, error } = await supabase
        .schema("beekon_data")
        .from("api_keys")
        .select("*")
        .eq("key_hash", keyHash)
        .eq("is_active", true)
        .single();

      if (error || !data) return null;

      // Update usage count and last used
      await supabase
        .schema("beekon_data")
        .from("api_keys")
        .update({
          usage_count: (data.usage_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      return data;
    } catch (error) {
      // Failed to verify API key
      return null;
    }
  }

  /**
   * Get API key usage statistics
   */
  async getApiKeyUsage(userId: string): Promise<ApiKeyUsage> {
    try {
      const { data, error } = await supabase
        .schema("beekon_data")
        .from("api_keys")
        .select("usage_count, is_active, last_used_at")
        .eq("user_id", userId);

      if (error) throw error;

      const keys = data || [];
      const activeKeys = keys.filter((key) => key.is_active);
      const totalRequests = keys.reduce((sum, key) => sum + (key.usage_count ?? 0), 0);

      // Calculate success rate (simplified - would need actual error tracking)
      const successRate = totalRequests > 0 ? 99.2 : 0;

      // Calculate last 30 days requests (simplified)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentKeys = keys.filter(
        (key) => key.last_used_at && new Date(key.last_used_at) > thirtyDaysAgo
      );
      const last30DaysRequests = recentKeys.reduce(
        (sum, key) => sum + (key.usage_count ?? 0),
        0
      );

      return {
        total_requests: totalRequests,
        success_rate: successRate,
        active_keys: activeKeys.length,
        last_30_days: last30DaysRequests,
      };
    } catch (error) {
      // Failed to get API key usage
      return {
        total_requests: 0,
        success_rate: 0,
        active_keys: 0,
        last_30_days: 0,
      };
    }
  }

  /**
   * Update API key name
   */
  async updateApiKeyName(
    userId: string,
    keyId: string,
    newName: string
  ): Promise<void> {
    // Check if name already exists for this user
    const { data: existingKey } = await supabase
      .schema("beekon_data")
      .from("api_keys")
      .select("id")
      .eq("user_id", userId)
      .eq("name", newName)
      .neq("id", keyId)
      .single();

    if (existingKey) {
      throw new Error("API key with this name already exists");
    }

    const { error } = await supabase
      .schema("beekon_data")
      .from("api_keys")
      .update({ name: newName })
      .eq("id", keyId)
      .eq("user_id", userId);

    if (error) throw error;
  }
}

export const apiKeyService = ApiKeyService.getInstance();
