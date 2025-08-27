import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAppState } from "@/hooks/appStateHooks";
import { profileService } from "@/services/profileService";
import { UserProfile } from "@/types/database";

export function useOptimizedProfile() {
  const { user } = useAuth();
  const { getFromCache, setCache } = useAppState();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache keys for profile data
  const profileCacheKey = `profile_${user?.id}`;

  // Check if we have cached profile data
  const cachedProfile = getFromCache<UserProfile>(profileCacheKey);

  // Synchronous cache detection for immediate skeleton bypass
  const hasSyncCache = useCallback(() => {
    if (!user?.id) return false;
    const cached = getFromCache<UserProfile>(profileCacheKey);
    return !!cached;
  }, [user?.id, profileCacheKey, getFromCache]);

  const loadProfile = useCallback(
    async (forceRefresh = false) => {
      if (!user?.id) {
        setProfile(null);
        setError(null);
        return;
      }

      // Get cached data dynamically to avoid dependency on changing cachedProfile
      const currentCachedProfile = getFromCache<UserProfile>(profileCacheKey);

      // Use cached data for instant rendering
      if (!forceRefresh && currentCachedProfile) {
        setProfile(currentCachedProfile);
        setIsLoading(false);
        return;
      }

      // Show loading only if no cached data
      if (!currentCachedProfile) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const profileData = await profileService.getProfile(user.id);
        setProfile(profileData);

        // Cache profile data for 15 minutes
        setCache(profileCacheKey, profileData, 15 * 60 * 1000);
      } catch (error) {
        setError("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, getFromCache, setCache, profileCacheKey]
  );

  // Load profile when user changes - FIXED: depend directly on user.id instead of loadProfile function
  useEffect(() => {
    if (user?.id) {
      loadProfile();
    }
  }, [user?.id]); // Only depend on user.id, not the loadProfile function

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user?.id) return;

      setIsLoading(true);
      setError(null);
      try {
        // Convert UserProfile partial to ProfileUpdateData by filtering out nulls
        const profileUpdates: Partial<UserProfile> & Record<string, unknown> = {};
        Object.entries(updates).forEach(([key, value]) => {
          if (value !== null) {
            profileUpdates[key] = value;
          }
        });
        
        const updatedProfile = await profileService.updateProfile(
          user.id,
          profileUpdates as Record<string, unknown>
        );
        setProfile(updatedProfile);

        // Update cache with new profile data
        setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);

        return updatedProfile;
      } catch (error) {
        setError("Failed to update profile");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, setCache, profileCacheKey]
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!user?.id) return;

      setIsLoading(true);
      setError(null);
      try {
        const avatarUrl = await profileService.uploadAvatar(user.id, file);
        
        // Get current profile state to avoid dependency on changing profile
        setProfile(currentProfile => {
          const updatedProfile = {
            ...currentProfile,
            avatar_url: avatarUrl,
          } as UserProfile;
          
          // Update cache with new avatar
          setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);
          
          return updatedProfile;
        });

        return avatarUrl;
      } catch (error) {
        setError("Failed to upload avatar");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, setCache, profileCacheKey]
  );

  const deleteAvatar = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      // Get current profile state to avoid dependency on changing profile
      setProfile(currentProfile => {
        if (!currentProfile?.avatar_url) {
          return currentProfile;
        }
        
        // Delete avatar using current profile data
        profileService.deleteAvatar(user.id!, currentProfile.avatar_url).catch(() => {
          // Handle error in the background - we've already removed it from state
        });
        
        const updatedProfile = { ...currentProfile, avatar_url: null };
        
        // Update cache without avatar
        setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);
        
        return updatedProfile;
      });
    } catch (error) {
      setError("Failed to delete avatar");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, setCache, profileCacheKey]);

  const getInitials = useCallback(() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name.charAt(0)}${profile.last_name.charAt(
        0
      )}`.toUpperCase();
    }
    return user?.email?.slice(0, 2).toUpperCase() || "U";
  }, [profile?.first_name, profile?.last_name, user?.email]);

  const getDisplayName = useCallback(() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return user?.email || "Account";
  }, [profile?.first_name, profile?.last_name, user?.email]);

  return {
    profile,
    isLoading: isLoading && !hasSyncCache(), // Only show loading if no cache
    error,
    loadProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    getInitials,
    getDisplayName,
    hasCachedData: !!cachedProfile,
    hasSyncCache,
    refresh: () => loadProfile(true),
  };
}
