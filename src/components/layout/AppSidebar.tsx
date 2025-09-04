import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTrueNavigation } from "@/hooks/useTrueNavigation";
import { BarChart3, Globe, Search, Settings, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useCallback } from "react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Websites", href: "/websites", icon: Globe },
  { name: "Analysis", href: "/analysis", icon: Search },
  { name: "Competitors", href: "/competitors", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { open } = useSidebar();
  const { navigateTo, currentPage } = useTrueNavigation();
  
  // Handle true instant navigation with no React Router involvement
  const handleNavClick = useCallback((event: React.MouseEvent, path: string) => {
    event.preventDefault(); // Prevent any default behavior
    
    // Sidebar navigation - console removed for security
    
    navigateTo(path);
  }, [navigateTo, currentPage]);
  
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center space-x-2 max-h-12">
          <img src="/beekon-favicon.png" alt="Beekon" className="h-12 w-auto" />
          {open && (
            <span className="font-semibold text-5xl text-primary">Beekon</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.href}
                      onClick={(event) => handleNavClick(event, item.href)}
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? "bg-primary text-primary shadow-sm"
                            : "text-sidebar hover:bg-accent hover:text-accent-foreground hover:scale-[0.98]"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className="ml-3">{item.name}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
