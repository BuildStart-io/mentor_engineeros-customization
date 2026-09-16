import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, UserPlus, Users, Eye, EyeOff, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StaffMember {
  id: string;
  staff_email: string;
  staff_name: string | null;
  whatsapp_number: string | null;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

const AVAILABLE_PERMISSIONS = [
  { key: "conversations", label: "Chats", description: "View and manage WhatsApp conversations" },
  { key: "products", label: "Products", description: "View and edit product catalog" },
  { key: "faqs", label: "FAQs", description: "View and manage FAQ entries" },
  { key: "orders", label: "Orders", description: "View and manage customer orders" },
  { key: "leads", label: "Leads", description: "View and manage assigned leads" },
];

export default function StaffManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { planTier, limits } = usePlanLimits();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEnterprise = planTier === "enterprise";
  const maxStaff = (limits?.max_staff || 2);
  const canAddStaff = isEnterprise && staff.length < maxStaff;

  // Form fields
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const fetchStaff = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff-mentor-engineeros`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${(await (await import("@/integrations/supabase/client")).supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "list_staff" }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStaff(data.staff || []);
    } catch (err: any) {
      toast({ title: "Error loading staff", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const getAuthToken = async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  };

  const handleCreate = async () => {
    if (!email || !password) {
      toast({ title: "Email and password are required", variant: "destructive" });
      return;
    }
    if (selectedPermissions.length === 0) {
      toast({ title: "Select at least one permission", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff-mentor-engineeros`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_staff",
            email,
            password,
            name: name || null,
            whatsapp_number: whatsappNumber || null,
            permissions: selectedPermissions,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Staff account created!" });
      setEmail("");
      setName("");
      setPassword("");
      setWhatsappNumber("");
      setSelectedPermissions([]);
      setShowForm(false);
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error creating staff", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (staffMember: StaffMember) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff-mentor-engineeros`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_staff",
            staffId: staffMember.id,
            is_active: !staffMember.is_active,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: staffMember.is_active ? "Staff deactivated" : "Staff activated" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error updating staff", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdatePermissions = async (staffMember: StaffMember, newPermissions: string[]) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff-mentor-engineeros`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update_staff",
            staffId: staffMember.id,
            permissions: newPermissions,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Permissions updated" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error updating permissions", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (staffMember: StaffMember) => {
    if (!confirm(`Delete staff account for ${staffMember.staff_email}? This cannot be undone.`)) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff-mentor-engineeros`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "delete_staff",
            staffId: staffMember.id,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Staff account deleted" });
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error deleting staff", description: err.message, variant: "destructive" });
    }
  };

  const togglePermission = (perm: string) => {
    setSelectedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staff Accounts
            </CardTitle>
            <CardDescription>
              Create staff accounts with limited access to your dashboard
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)} disabled={!canAddStaff}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Staff
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isEnterprise && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Staff accounts are only available on the Growth plan. Please upgrade to create staff accounts.
            </AlertDescription>
          </Alert>
        )}
        {isEnterprise && (
          <p className="text-xs text-muted-foreground">
            Staff accounts: {staff.length} / {maxStaff} used
          </p>
        )}
        {/* Create Staff Form */}
        {showForm && isEnterprise && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
            <h4 className="font-medium text-sm">New Staff Account</h4>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Staff name" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@example.com" />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                <Input
                  value={whatsappNumber}
                  onChange={e => setWhatsappNumber(e.target.value)}
                  placeholder="94771234567"
                />
                <p className="text-xs text-muted-foreground">
                  Used to notify this staff member when a customer is assigned to them.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Password *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Temporary password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Permissions *</Label>
              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {AVAILABLE_PERMISSIONS.map(perm => (
                  <label key={perm.key} className="flex items-start gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={selectedPermissions.includes(perm.key)}
                      onCheckedChange={() => togglePermission(perm.key)}
                    />
                    <div>
                      <span className="text-sm font-medium">{perm.label}</span>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create Staff
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Staff List */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No staff accounts yet. Click "Add Staff" to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {staff.map(member => (
              <div key={member.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{member.staff_name || member.staff_email}</span>
                      <Badge variant={member.is_active ? "default" : "secondary"}>
                        {member.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{member.staff_email}</p>
                    {member.whatsapp_number && (
                      <p className="text-xs text-muted-foreground">WhatsApp: {member.whatsapp_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={member.is_active}
                      onCheckedChange={() => handleToggleActive(member)}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(member)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_PERMISSIONS.map(perm => {
                    const hasIt = member.permissions.includes(perm.key);
                    return (
                      <label key={perm.key} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={hasIt}
                          onCheckedChange={() => {
                            const newPerms = hasIt
                              ? member.permissions.filter(p => p !== perm.key)
                              : [...member.permissions, perm.key];
                            handleUpdatePermissions(member, newPerms);
                          }}
                        />
                        <span className="text-xs">{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
