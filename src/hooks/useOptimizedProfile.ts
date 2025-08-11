import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';
import { profileService, UserProfile } from '@/services/profileService';

export function useOptimizedProfile() {
  const { user } = useAuth();
  const { getFromCache, setCache } = useAppState();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache keys for profile data
  const profileCacheKey = `profile_${user?.id}`;
  const apiKeysCacheKey = `api_keys_${user?.id}`;

  // Check if we have cached profile data
  const cachedProfile = getFromCache<UserProfile>(profileCacheKey);

  const loadProfile = useCallback(async (forceRefresh = false) => {
    if (!user?.id) {
      setProfile(null);
      setError(null);
      return;
    }

    // Use cached data for instant rendering
    if (!forceRefresh && cachedProfile) {
      setProfile(cachedProfile);
      setIsLoading(false);
      return;
    }

    // Show loading only if no cached data
    if (!cachedProfile) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const profileData = await profileService.getProfile(user.id);
      setProfile(profileData);
      
      // Cache profile data for 15 minutes
      setCache(profileCacheKey, profileData, 15 * 60 * 1000);
    } catch (error) {
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, cachedProfile, getFromCache, setCache, profileCacheKey]);

  // Load profile when user changes
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      const updatedProfile = await profileService.updateProfile(user.id, updates);
      setProfile(updatedProfile);
      
      // Update cache with new profile data
      setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);
      
      return updatedProfile;
    } catch (error) {
      setError('Failed to update profile');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, setCache, profileCacheKey]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      const avatarUrl = await profileService.uploadAvatar(user.id, file);
      const updatedProfile = { ...profile, avatar_url: avatarUrl } as UserProfile;
      setProfile(updatedProfile);
      
      // Update cache with new avatar
      setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);
      
      return avatarUrl;
    } catch (error) {
      setError('Failed to upload avatar');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, profile, setCache, profileCacheKey]);

  const deleteAvatar = useCallback(async () => {
    if (!user?.id || !profile?.avatar_url) return;

    setIsLoading(true);
    setError(null);
    try {
      await profileService.deleteAvatar(user.id, profile.avatar_url);
      const updatedProfile = { ...profile, avatar_url: null };
      setProfile(updatedProfile);
      
      // Update cache without avatar
      setCache(profileCacheKey, updatedProfile, 15 * 60 * 1000);
    } catch (error) {
      setError('Failed to delete avatar');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, profile, setCache, profileCacheKey]);

  const getInitials = useCallback(() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase();
    }
    return user?.email?.slice(0, 2).toUpperCase() || 'U';
  }, [profile?.first_name, profile?.last_name, user?.email]);

  const getDisplayName = useCallback(() => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return user?.email || 'Account';
  }, [profile?.first_name, profile?.last_name, user?.email]);

  return {
    profile,
    isLoading: isLoading && !cachedProfile, // Only show loading if no cache
    error,
    loadProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    getInitials,
    getDisplayName,
    hasCachedData: !!cachedProfile,
    refresh: () => loadProfile(true),
  };
}