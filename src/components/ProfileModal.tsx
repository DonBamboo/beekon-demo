import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner, FormSkeleton } from "@/components/LoadingStates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, User } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { profileService } from "@/services/profileService";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: user?.email || "",
      company: "",
      jobTitle: "",
      phone: "",
    },
  });

  // Load profile data when modal opens
  const loadProfileData = useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingProfile(true);
    try {
      const profile = await profileService.getProfile(user.id);

      // Reset form with profile data
      form.reset({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: user.email || "",
        company: profile.company || "",
        jobTitle: profile.job_title || "",
        phone: profile.phone || "",
      });

      // Set avatar URL for display
      setCurrentAvatarUrl(profile.avatar_url);
      setAvatarPreview(null); // Clear any preview when loading real data
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load profile data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user?.id, user?.email, form, setCurrentAvatarUrl, toast]);

  useEffect(() => {
    if (isOpen && user?.id) {
      loadProfileData();
    }
  }, [isOpen, user?.id, loadProfileData]);

  const onSubmit = async (data: ProfileFormData) => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      // Update profile using real ProfileService
      await profileService.updateProfile(user.id, {
        first_name: data.firstName,
        last_name: data.lastName,
        company: data.company || null,
        job_title: data.jobTitle || null,
        phone: data.phone || null,
      });

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });

      onClose();
    } catch (error) {
      // Failed to update profile
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(false);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setAvatarPreview(result);
      }
    };
    reader.readAsDataURL(file);
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

      // Upload avatar using real ProfileService
      const avatarUrl = await profileService.uploadAvatar(user.id, file);

      // Complete progress
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Update current avatar URL
      setCurrentAvatarUrl(avatarUrl);
      setAvatarPreview(null);
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
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to upload avatar. Please try again.";
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
    if (!user?.id || !currentAvatarUrl) return;

    setIsAvatarUploading(true);
    try {
      // Delete avatar using real ProfileService
      await profileService.deleteAvatar(user.id, currentAvatarUrl);

      // Clear avatar state
      setCurrentAvatarUrl(null);
      setAvatarPreview(null);

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

  const getInitials = () => {
    const firstName = form.watch("firstName");
    const lastName = form.watch("lastName");
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-3">
            <User className="h-5 w-5" />
            <span>Profile Settings</span>
          </DialogTitle>
          <DialogDescription>
            Update your profile information and preferences
          </DialogDescription>
        </DialogHeader>

        {isLoadingProfile ? (
          <FormSkeleton fields={5} />
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Avatar Section */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <Avatar className="h-20 w-20">
                  {avatarPreview ? (
                    <AvatarImage src={avatarPreview} alt="Profile preview" />
                  ) : currentAvatarUrl ? (
                    <AvatarImage src={currentAvatarUrl} alt="Profile" />
                  ) : (
                    <AvatarFallback className="text-lg">
                      {getInitials()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1">
                  <Label className="text-base font-medium">
                    Profile Picture
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload a profile picture to personalize your account
                  </p>
                  {currentAvatarUrl && (
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
                acceptedTypes={["image/*"]}
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
                      setAvatarPreview(null);
                      setUploadError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  {...form.register("firstName")}
                  className="focus-ring"
                />
                {form.formState.errors.firstName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  {...form.register("lastName")}
                  className="focus-ring"
                />
                {form.formState.errors.lastName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                disabled
                className="bg-muted"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  {...form.register("company")}
                  className="focus-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  {...form.register("jobTitle")}
                  className="focus-ring"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                {...form.register("phone")}
                className="focus-ring"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                loading={isLoading}
                loadingText="Saving..."
              >
                Save Changes
              </LoadingButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
