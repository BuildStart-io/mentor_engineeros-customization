import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Mail, UserPlus, Loader2, Eye, Trash2 } from "lucide-react";

interface BusinessUser {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  business_name: string | null;
  plan_tier: string;
  is_active: boolean;
  created_at: string;
  product_count: number;
  faq_count: number;
  order_count: number;
  is_super_admin: boolean;
}

export default function AdminAccounts() {
  const navigate = useNavigate();
  const { isSuperAdmin, roleLoading } = useRole();
  const { toast } = useToast();
  const [users, setUsers] = useState<BusinessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newPlanTier, setNewPlanTier] = useState("free");
  const [createMode, setCreateMode] = useState<"create" | "invite">("create");

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) navigate("/dashboard");
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isSuperAdmin) fetchUsers();
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "list_users" },
    });
    if (res.data?.users) setUsers(res.data.users);
    setLoading(false);
  };

  const handleCreateUser = async () => {
    setActionLoading(true);
    const action = createMode === "invite" ? "invite_user" : "create_user";
    const body: Record<string, any> = {
      action, email: newEmail, businessName: newBusinessName, planTier: newPlanTier,
    };
    if (createMode === "create") {
      body.password = newPassword;
      body.fullName = newFullName;
    }
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", { body });
    if (res.data?.error) {
      toast({ title: "Error", description: res.data.error, variant: "destructive" });
    } else if (res.error) {
      toast({ title: "Error", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: createMode === "invite" ? "Invitation sent!" : "Account created!" });
      setCreateDialogOpen(false);
      resetForm();
      fetchUsers();
    }
    setActionLoading(false);
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "update_user", userId, isActive: !isActive },
    });
    if (!res.data?.error) {
      fetchUsers();
      toast({ title: isActive ? "Account deactivated" : "Account activated" });
    }
  };

  const handleUpdatePlan = async (userId: string, planTier: string) => {
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "update_user", userId, planTier },
    });
    if (!res.data?.error) {
      fetchUsers();
      toast({ title: "Plan updated" });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure? This will permanently delete this account and all their data.")) return;
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "delete_user", userId },
    });
    if (!res.data?.error) {
      fetchUsers();
      toast({ title: "Account deleted" });
    }
  };

  const resetForm = () => {
    setNewEmail(""); setNewPassword(""); setNewFullName(""); setNewBusinessName(""); setNewPlanTier("free");
  };

  if (roleLoading) return <DashboardLayout><p>Loading...</p></DashboardLayout>;
  if (!isSuperAdmin) return null;

  const allUsers = users;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              Business Accounts
            </h1>
            <p className="text-muted-foreground">Create and manage business accounts</p>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Business Account</DialogTitle>
                <DialogDescription>Create a new account or send an invitation</DialogDescription>
              </DialogHeader>
              <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as "create" | "invite")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="create"><UserPlus className="h-4 w-4 mr-1" />Create</TabsTrigger>
                  <TabsTrigger value="invite"><Mail className="h-4 w-4 mr-1" />Invite</TabsTrigger>
                </TabsList>
                <TabsContent value="create" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@business.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
                  </div>
                </TabsContent>
                <TabsContent value="invite" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@business.com" />
                  </div>
                </TabsContent>
              </Tabs>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input value={newBusinessName} onChange={(e) => setNewBusinessName(e.target.value)} placeholder="Acme Corp" />
                </div>
                <div className="space-y-2">
                  <Label>Plan Tier</Label>
                  <Select value={newPlanTier} onValueChange={setNewPlanTier}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free (5 products, 10 FAQs)</SelectItem>
                      <SelectItem value="pro">Starter (50 products, 100 FAQs)</SelectItem>
                      <SelectItem value="enterprise">Growth (Unlimited)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateUser} disabled={actionLoading || !newEmail}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {createMode === "invite" ? "Send Invitation" : "Create Account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No business accounts yet. Click "Add Account" to create one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Products</TableHead>
                    <TableHead className="text-center">Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((user) => (
                    <TableRow key={user.id} className="cursor-pointer" onClick={() => navigate(`/admin/accounts/${user.user_id}`)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {user.business_name || user.full_name || "—"}
                          {user.is_super_admin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.plan_tier}
                          onValueChange={(val) => { handleUpdatePlan(user.user_id, val); }}
                        >
                          <SelectTrigger className="w-28 h-8" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="pro">Starter</SelectItem>
                            <SelectItem value="enterprise">Growth</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">{user.product_count}</TableCell>
                      <TableCell className="text-center">{user.order_count}</TableCell>
                      <TableCell>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={user.is_active}
                            onCheckedChange={() => handleToggleActive(user.user_id, user.is_active)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/accounts/${user.user_id}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteUser(user.user_id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
