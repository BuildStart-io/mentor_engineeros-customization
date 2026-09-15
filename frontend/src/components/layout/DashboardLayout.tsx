import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Package, 
  HelpCircle, 
  ShoppingCart, 
  Settings, 
  LogOut,
  MessageSquare,
  Menu,
  X,
  Shield,
  Users,
  Settings as SettingsIcon,
  MoreHorizontal,
  Target,
  CalendarCheck,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import buildstartLogo from "@/assets/buildstart-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";

const allBusinessNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: null },
  { href: "/dashboard/conversations", label: "Chats", icon: MessageSquare, permission: "conversations" },
  { href: "/dashboard/leads", label: "Leads", icon: Target, permission: "leads" },
  { href: "/dashboard/products", label: "Products", icon: Package, permission: "products" },
  { href: "/dashboard/faqs", label: "FAQs", icon: HelpCircle, permission: "faqs" },
  { href: "/dashboard/orders", label: "Bookings & Jobs", icon: CalendarCheck, permission: "orders" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, permission: "settings" },
];

const adminNavItems = [
  { href: "/admin", label: "Admin", icon: Shield, permission: null },
  { href: "/admin/accounts", label: "Accounts", icon: Users, permission: null },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon, permission: null },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isSuperAdmin, roleLoading } = useRole();
  const { isStaff, hasPermission, loading: staffLoading } = useStaffAccess();
  const { isGrowth } = useEffectivePlan();
  const isMobile = useIsMobile();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const isAdminRoute = location.pathname.startsWith("/admin");

  // Filter nav items based on staff permissions
  const businessNavItems = allBusinessNavItems.filter(item => {
    if (!item.permission) return true; // Dashboard always visible
    if (!isStaff) return true; // Owners see everything
    // Staff only see settings if they have explicit permission, otherwise hide it
    return hasPermission(item.permission);
  });

  const navItems = isAdminRoute && isSuperAdmin ? adminNavItems : businessNavItems;

  // For mobile bottom nav, show max 5 items (4 main + more menu)
  const mobileNavItems = navItems.slice(0, 4);
  const mobileOverflowItems = navItems.slice(4);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="flex items-center justify-between p-3 border-b bg-card sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <img src={buildstartLogo} alt="BuildStart" className="h-6 w-6" />
            <span className="font-semibold text-sm">{isAdminRoute ? "Super Admin" : "BuildStart"}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex">
        {/* Desktop Sidebar - hidden on mobile */}
        {!isMobile && (
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r">
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 p-6 border-b">
                <img src={buildstartLogo} alt="BuildStart" className="h-7 w-7" />
                <span className="font-semibold text-lg">{isAdminRoute ? "Super Admin" : "BuildStart"}</span>
              </div>

              <nav className="flex-1 p-4 space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/dashboard/leads" && !isGrowth && (
                        <Lock className="h-3.5 w-3.5 opacity-70" />
                      )}
                    </Link>
                  );
                })}

                {!roleLoading && isSuperAdmin && (
                  <div className="pt-4 border-t mt-4">
                    <Link
                      to={isAdminRoute ? "/dashboard" : "/admin"}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {isAdminRoute ? (
                        <>
                          <LayoutDashboard className="h-5 w-5" />
                          Business Dashboard
                        </>
                      ) : (
                        <>
                          <Shield className="h-5 w-5" />
                          Super Admin
                        </>
                      )}
                    </Link>
                  </div>
                )}
              </nav>

              <div className="p-4 border-t space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={handleLogout}
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  Logout
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Powered by <a href="https://buildstart.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">BuildStart.io</a>
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className={cn(
          "flex-1 min-h-screen",
          isMobile ? "p-4 pb-20" : "p-8 lg:ml-64"
        )}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <>
          {/* More menu overlay */}
          {showMoreMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)}>
              <div className="absolute bottom-16 left-0 right-0 bg-card border-t rounded-t-xl shadow-lg p-2 space-y-1"
                onClick={(e) => e.stopPropagation()}
              >
                {mobileOverflowItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setShowMoreMenu(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  );
                })}

                {/* Admin/Business toggle */}
                {!roleLoading && isSuperAdmin && (
                  <Link
                    to={isAdminRoute ? "/dashboard" : "/admin"}
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {isAdminRoute ? (
                      <>
                        <LayoutDashboard className="h-5 w-5" />
                        Business Dashboard
                      </>
                    ) : (
                      <>
                        <Shield className="h-5 w-5" />
                        Super Admin
                      </>
                    )}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Bottom bar */}
          <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t flex items-center justify-around py-1 safe-bottom">
            {mobileNavItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-[56px]",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  {item.label}
                </Link>
              );
            })}

            {/* More button (only if overflow items exist or admin toggle needed) */}
            {(mobileOverflowItems.length > 0 || (!roleLoading && isSuperAdmin)) && (
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors min-w-[56px]",
                  showMoreMenu ? "text-primary" : "text-muted-foreground"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                More
              </button>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
