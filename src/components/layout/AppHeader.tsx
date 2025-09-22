import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useTrueNavigation } from "@/hooks/useTrueNavigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ProfileModal } from "@/components/ProfileModal";
import { WorkspaceDropdown } from "@/components/WorkspaceDropdown";
import { LogOut, User, Settings } from "lucide-react";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { profile, loadProfile, getInitials, getDisplayName } = useProfile();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { navigateTo } = useTrueNavigation();

  const handleSettingsClick = (event: React.MouseEvent) => {
    event.preventDefault();
    navigateTo("/settings");
  };

  return (
    <>
      <header className="h-16 border-b bg-background flex items-center justify-between px-5 sm:px-6">
        <div className="flex items-center">
          <SidebarTrigger className="mr-4" />
        </div>

        <div className="flex items-center space-x-3">
          <WorkspaceDropdown />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full p-0"
              >
                <Avatar className="h-9 w-9">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt="Profile" />
                  ) : null}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {getDisplayName()}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsProfileModalOpen(true)}>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSettingsClick}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          // Refresh profile data when modal closes in case user updated their profile
          loadProfile();
        }}
      />
    </>
  );
}
