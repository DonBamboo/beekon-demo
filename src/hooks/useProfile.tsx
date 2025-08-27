import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { profileService } from '@/services/profileService';
import { UserProfile } from '@/types/database';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stabilize user ID to prevent unnecessary useCallback recreations
  const stableUserId = useMemo(() => user?.id, [user?.id]);
  
  // Ref to prevent concurrent profile loading
  const isLoadingRef = useRef(false);
  
  // Ref to store the latest loadProfile function to break dependency chain
  const loadProfileRef = useRef<(() => Promise<void>) | null>(null);

  const loadProfile = useCallback(async () => {
    if (!stableUserId) {
      setProfile(null);
      setError(null);
      return;
    }

    // Prevent concurrent profile loading
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const profileData = await profileService.getProfile(stableUserId);
      setProfile(profileData);
    } catch (error) {
      // Failed to load profile
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  }, [stableUserId]);

  // Store the latest loadProfile function in ref to break dependency chain
  useEffect(() => {
    loadProfileRef.current = loadProfile;
  }, [loadProfile]);

  // Load profile when user ID changes (using ref to avoid dependency chain)
  useEffect(() => {
    if (loadProfileRef.current) {
      loadProfileRef.current();
    }
  }, [stableUserId]); // Only depend on stableUserId, not loadProfile

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    if (!stableUserId) return;

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
      
      const updatedProfile = await profileService.updateProfile(stableUserId, profileUpdates as Record<string, unknown>);
      setProfile(updatedProfile);
      return updatedProfile;
    } catch (error) {
      // Failed to update profile
      setError('Failed to update profile');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [stableUserId]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!stableUserId) return;

    setIsLoading(true);
    setError(null);
    try {
      const avatarUrl = await profileService.uploadAvatar(stableUserId, file);
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : null);
      return avatarUrl;
    } catch (error) {
      // Failed to upload avatar
      setError('Failed to upload avatar');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [stableUserId]);

  const deleteAvatar = useCallback(async () => {
    if (!stableUserId || !profile?.avatar_url) return;

    setIsLoading(true);
    setError(null);
    try {
      await profileService.deleteAvatar(stableUserId, profile.avatar_url);
      setProfile(prev => prev ? { ...prev, avatar_url: null } : null);
    } catch (error) {
      // Failed to delete avatar
      setError('Failed to delete avatar');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [stableUserId, profile?.avatar_url]);

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
    isLoading,
    error,
    loadProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    getInitials,
    getDisplayName,
  };
}