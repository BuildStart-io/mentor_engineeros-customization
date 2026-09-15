import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { planLabel } from "@/lib/planLabels";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, ShoppingCart, Shield, TrendingUp } from "lucide-react";

interface AdminStats {
  totalUsers: number;
  totalProducts: number;
  totalOrders: number;
  planBreakdown: { free: number; pro: number; enterprise: number };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isSuperAdmin, roleLoading } = useRole();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0, totalProducts: 0, totalOrders: 0,
    planBreakdown: { free: 0, pro: 0, enterprise: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) {
      navigate("/dashboard");
    }
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchStats = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
        body: { action: "list_users" },
      });

      if (res.data?.users) {
        const users = res.data.users;
        const planBreakdown = { free: 0, pro: 0, enterprise: 0 };
        let totalProducts = 0;
        let totalOrders = 0;

        users.forEach((u: any) => {
          if (!u.is_super_admin) {
            const tier = u.plan_tier as keyof typeof planBreakdown;
            if (tier in planBreakdown) planBreakdown[tier]++;
          }
          totalProducts += u.product_count || 0;
          totalOrders += u.order_count || 0;
        });

        setStats({
          totalUsers: users.filter((u: any) => !u.is_super_admin).length,
          totalProducts,
          totalOrders,
          planBreakdown,
        });
      }
      setLoading(false);
    };
    fetchStats();
  }, [isSuperAdmin]);

  if (roleLoading) return <DashboardLayout><p>Loading...</p></DashboardLayout>;
  if (!isSuperAdmin) return null;

  const statCards = [
    { title: "Business Accounts", value: stats.totalUsers, icon: Users, color: "text-blue-500" },
    { title: "Total Products", value: stats.totalProducts, icon: Package, color: "text-green-500" },
    { title: "Total Orders", value: stats.totalOrders, icon: ShoppingCart, color: "text-purple-500" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Super Admin Dashboard
          </h1>
          <p className="text-muted-foreground">Manage all business accounts and platform overview</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? "..." : stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Plan Distribution
            </CardTitle>
            <CardDescription>Breakdown of business accounts by plan tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {(["free", "pro", "enterprise"] as const).map((tier) => (
                <div key={tier} className="text-center p-4 rounded-lg border">
                  <p className="text-2xl font-bold">{loading ? "..." : stats.planBreakdown[tier]}</p>
                  <p className="text-sm text-muted-foreground">{planLabel(tier)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
