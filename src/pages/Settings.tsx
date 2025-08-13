import { ApiKeyModal } from "@/components/ApiKeyModal";
import { ExportHistoryModal } from "@/components/ExportHistoryModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useOptimizedProfile } from "@/hooks/useOptimizedProfile";
import { useOptimizedApiKeys } from "@/hooks/useOptimizedApiKeys";
import { useExportHistory } from "@/hooks/useExportHistory";
import { useSelectedWebsite } from "@/hooks/appStateHooks";
import { ApiKey, apiKeyService } from "@/services/apiKeyService";
import { profileService } from "@/services/profileService";
import { UserProfile } from "@/types/database";
import {
  AlertCircle,
  Bell,
  Camera,
  Key,
  Lock,
  Save,
  Settings as SettingsIcon,
  Shield,
  User,
  FileOutput,
  History,
} from "lucide-react";
import { Spinner } from "@/components/LoadingStates";
import { SettingsSkeleton } from "@/components/skeletons";
import { useEffect, useState } from "react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { profile, isLoading: isLoadingProfile, loadProfile, updateProfile, uploadAvatar, deleteAvatar, getInitials, hasCachedData, hasSyncCache: hasProfileSyncCache } = useOptimizedProfile();
  const { apiKeys, primaryApiKey, isLoading: isLoadingApiKeys, error: apiKeysError, refreshApiKeys, hasSyncCache: hasApiKeysSyncCache } = useOptimizedApiKeys();
  const { exportSummary, recentActivity } = useExportHistory();
  const { selectedWebsiteId, websites } = useSelectedWebsite();
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Form state for password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [weeklyReports, setWeeklyReports] = useState(true);
  const [competitorAlerts, setCompetitorAlerts] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(true);


  // Sync form state with profile data
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setCompany(profile.company || "");
      setEmailNotifications(
        profile.notification_settings.email_notifications
      );
      setWeeklyReports(profile.notification_settings.weekly_reports);
      setCompetitorAlerts(
        profile.notification_settings.competitor_alerts
      );
      setAnalysisComplete(
        profile.notification_settings.analysis_complete
      );
    }
  }, [profile]);

  // Handle loading errors from optimized hooks
  useEffect(() => {
    if (apiKeysError) {
      setLoadingError(apiKeysError);
      toast({
        title: "Error",
        description: apiKeysError,
        variant: "destructive",
      });
    }
  }, [apiKeysError, toast]);

  // Retry function for loading all data
  const retryLoadProfile = async () => {
    if (user?.id) {
      setLoadingError(null);
      try {
        // Use the optimized hooks' refresh methods
        await loadProfile(true);
        refreshApiKeys();
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load profile data.";
        setLoadingError(errorMessage);
      }
    }
  };

  const handleProfileSave = async () => {
    if (!user?.id) return;

    // Basic validation
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Validation Error",
        description: "First name and last name are required.",
        variant: "destructive",
      });
      return;
    }

    setIsProfileSaving(true);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        company: company.trim() || undefined,
      });

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    } catch (error) {
      // Failed to update profile
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update profile. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(false);
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user?.id) return;

    setIsAvatarUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 100);

      await uploadAvatar(file);
      
      // Complete progress
      clearInterval(progressInterval);
      setUploadProgress(100);
      setSelectedFile(null);
      setUploadSuccess(true);
      
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated.",
      });

      // Clear success state after delay
      setTimeout(() => {
        setUploadSuccess(false);
      }, 2000);
    } catch (error) {
      // Failed to upload avatar
      const errorMessage = error instanceof Error ? error.message : "Failed to upload avatar. Please try again.";
      setUploadError(errorMessage);
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAvatarUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAvatarDelete = async () => {
    if (!user?.id || !profile?.avatar_url) return;

    setIsAvatarUploading(true);
    try {
      await deleteAvatar();
      
      toast({
        title: "Avatar removed",
        description: "Your profile picture has been removed.",
      });
    } catch (error) {
      // Failed to delete avatar
      toast({
        title: "Error",
        description: "Failed to remove avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAvatarUploading(false);
    }
  };


  const handlePasswordUpdate = async () => {
    // Validation
    if (
      !currentPassword.trim() ||
      !newPassword.trim() ||
      !confirmPassword.trim()
    ) {
      toast({
        title: "Validation Error",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Validation Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "New password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword === currentPassword) {
      toast({
        title: "Validation Error",
        description: "New password must be different from current password.",
        variant: "destructive",
      });
      return;
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /\d/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      toast({
        title: "Weak Password",
        description:
          "Password should contain uppercase, lowercase, and numeric characters.",
        variant: "destructive",
      });
      return;
    }

    setIsPasswordUpdating(true);
    try {
      await profileService.changePassword(currentPassword, newPassword);

      toast({
        title: "Password updated",
        description: "Your password has been updated successfully.",
      });

      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      // Failed to update password
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to update password. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsPasswordUpdating(false);
    }
  };

  const handleNotificationChange = async (
    setting:
      | "email_notifications"
      | "weekly_reports"
      | "competitor_alerts"
      | "analysis_complete",
    value: boolean
  ) => {
    if (!user?.id || !profile) return;

    try {
      await profileService.updateNotificationSettings(
        user.id,
        {
          [setting]: value,
        }
      );

      // Update local state
      switch (setting) {
        case "email_notifications":
          setEmailNotifications(value);
          break;
        case "weekly_reports":
          setWeeklyReports(value);
          break;
        case "competitor_alerts":
          setCompetitorAlerts(value);
          break;
        case "analysis_complete":
          setAnalysisComplete(value);
          break;
      }
    } catch (error) {
      // Failed to update notification settings
      toast({
        title: "Error",
        description: "Failed to update notification settings.",
        variant: "destructive",
      });
    }
  };

  // Show skeleton immediately unless we have synchronous cache data for both profile and API keys
  // This eliminates empty state flash by showing skeleton first
  const shouldShowSkeleton = (isLoadingProfile && !hasProfileSyncCache()) || (isLoadingApiKeys && !hasApiKeysSyncCache());

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences
          </p>
          {selectedWebsiteId && websites.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground">
                Current website: <span className="font-medium text-foreground">
                  {websites.find(w => w.id === selectedWebsiteId)?.display_name || 
                   websites.find(w => w.id === selectedWebsiteId)?.domain || 
                   'Unknown'}
                </span>
              </p>
            </div>
          )}
        </div>

        {shouldShowSkeleton ? (
          <SettingsSkeleton />
        ) : loadingError ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="mt-2">
                {loadingError}
              </AlertDescription>
            </Alert>
            <Button
              onClick={retryLoadProfile}
              variant="outline"
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        ) : (
          <>
            {/* Profile Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <CardTitle>Profile</CardTitle>
                </div>
                <CardDescription>
                  Update your profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar Section */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <Avatar className="h-20 w-20">
                      {profile?.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} alt="Profile" />
                      ) : (
                        <AvatarFallback className="text-lg">
                          {getInitials()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <Label className="text-base font-medium">Profile Picture</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload a profile picture to personalize your account
                      </p>
                      {profile?.avatar_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAvatarDelete}
                          disabled={isAvatarUploading}
                          className="mt-2"
                        >
                          Remove Current Avatar
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <FileDropZone
                    onFileSelect={handleFileSelect}
                    acceptedTypes={['image/*']}
                    maxSize={2 * 1024 * 1024} // 2MB
                    variant="avatar"
                    isUploading={isAvatarUploading}
                    uploadProgress={uploadProgress}
                    error={uploadError}
                    success={uploadSuccess}
                    disabled={isAvatarUploading}
                    placeholder="Click to upload or drag and drop your profile picture"
                  />
                  
                  {selectedFile && !isAvatarUploading && !uploadSuccess && (
                    <div className="flex gap-2">
                      <LoadingButton
                        type="button"
                        onClick={() => handleAvatarUpload(selectedFile)}
                        disabled={isAvatarUploading}
                        className="flex-1"
                      >
                        Upload Avatar
                      </LoadingButton>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelectedFile(null);
                          setUploadError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile?.email || user?.email || ""}
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Your Company"
                  />
                </div>
                <LoadingButton
                  onClick={handleProfileSave}
                  loading={isProfileSaving}
                  loadingText="Saving..."
                  icon={<Save className="h-4 w-4" />}
                >
                  Save Changes
                </LoadingButton>
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Bell className="h-5 w-5" />
                  <CardTitle>Notifications</CardTitle>
                </div>
                <CardDescription>
                  Configure your notification preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email updates about your analysis results
                    </p>
                  </div>
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={(value) =>
                      handleNotificationChange("email_notifications", value)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Label>Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">
                      Get weekly summaries of your AI visibility performance
                    </p>
                  </div>
                  <Switch
                    checked={weeklyReports}
                    onCheckedChange={(value) =>
                      handleNotificationChange("weekly_reports", value)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Label>Competitor Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when competitors gain or lose visibility
                    </p>
                  </div>
                  <Switch
                    checked={competitorAlerts}
                    onCheckedChange={(value) =>
                      handleNotificationChange("competitor_alerts", value)
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Label>Analysis Complete</Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified when website analysis is complete
                    </p>
                  </div>
                  <Switch
                    checked={analysisComplete}
                    onCheckedChange={(value) =>
                      handleNotificationChange("analysis_complete", value)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Security Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle>Security</CardTitle>
                </div>
                <CardDescription>
                  Manage your account security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <LoadingButton
                  onClick={handlePasswordUpdate}
                  loading={isPasswordUpdating}
                  loadingText="Updating..."
                  icon={<Lock className="h-4 w-4" />}
                >
                  Update Password
                </LoadingButton>
              </CardContent>
            </Card>

            {/* API Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <SettingsIcon className="h-5 w-5" />
                  <CardTitle>API Access</CardTitle>
                </div>
                <CardDescription>
                  Manage your API keys and access tokens
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <div className="flex gap-3">
                    <Input
                      id="apiKey"
                      value={primaryApiKey || "No API key"}
                      disabled
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={() => setIsApiModalOpen(true)}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Manage Keys
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use API keys to integrate Beekon.ai with your applications.
                  Keep them secure and don't share them publicly.
                </p>
              </CardContent>
            </Card>

            {/* Export History */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <FileOutput className="h-5 w-5" />
                  <CardTitle>Export History</CardTitle>
                </div>
                <CardDescription>
                  View and manage your data export history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {exportSummary && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-900">Total Exports</p>
                          <p className="text-2xl font-bold text-blue-900">{exportSummary.total_exports}</p>
                        </div>
                        <FileOutput className="w-8 h-8 text-blue-500" />
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-green-900">Success Rate</p>
                          <p className="text-2xl font-bold text-green-900">
                            {exportSummary.total_exports > 0 
                              ? Math.round((exportSummary.successful_exports / exportSummary.total_exports) * 100)
                              : 0}%
                          </p>
                        </div>
                        <History className="w-8 h-8 text-green-500" />
                      </div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-purple-900">Favorite Format</p>
                          <p className="text-2xl font-bold text-purple-900 uppercase">
                            {exportSummary.favorite_format}
                          </p>
                        </div>
                        <FileOutput className="w-8 h-8 text-purple-500" />
                      </div>
                    </div>
                  </div>
                )}
                
                {recentActivity && recentActivity.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Recent Activity</Label>
                    <div className="mt-2 space-y-2">
                      {recentActivity.slice(0, 3).map((activity) => (
                        <div key={activity.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center space-x-2">
                            <FileOutput className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium">{activity.filename}</span>
                            <span className={`px-2 py-1 text-xs rounded ${
                              activity.status === 'completed' 
                                ? 'bg-green-100 text-green-800' 
                                : activity.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {activity.status}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(activity.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3">
                  <ExportHistoryModal>
                    <Button variant="outline">
                      <History className="h-4 w-4 mr-2" />
                      View Full History
                    </Button>
                  </ExportHistoryModal>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Track and manage all your data exports including analysis results, 
                  dashboard reports, and website data exports.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <ApiKeyModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        onApiKeyChange={refreshApiKeys}
      />
    </>
  );
}
