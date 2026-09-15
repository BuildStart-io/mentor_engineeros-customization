import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Package, HelpCircle, ShoppingCart, Users, Image, RotateCcw, PauseCircle, PlayCircle, Loader2, Save } from "lucide-react";

interface Props {
  userId: string;
  profile: any;
  onUpdate: () => void;
}

export default function AdminBillingManager({ userId, profile, onUpdate }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [billingStart, setBillingStart] = useState(
    profile?.billing_cycle_start ? new Date(profile.billing_cycle_start).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
  );
  const [isPaused, setIsPaused] = useState(profile?.is_paused || false);
  const [planTier, setPlanTier] = useState(profile?.plan_tier || "free");
  const [addons, setAddons] = useState({
    addon_products: profile?.addon_products || 0,
    addon_faqs: profile?.addon_faqs || 0,
    addon_orders: profile?.addon_orders || 0,
    addon_contacts: profile?.addon_contacts || 0,
    addon_images: profile?.addon_images || 0,
  });

  useEffect(() => {
    setBillingStart(
      profile?.billing_cycle_start ? new Date(profile.billing_cycle_start).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
    );
    setIsPaused(profile?.is_paused || false);
    setPlanTier(profile?.plan_tier || "free");
    setAddons({
      addon_products: profile?.addon_products || 0,
      addon_faqs: profile?.addon_faqs || 0,
      addon_orders: profile?.addon_orders || 0,
      addon_contacts: profile?.addon_contacts || 0,
      addon_images: profile?.addon_images || 0,
    });
  }, [profile]);

  const nextCycleDate = (() => {
    const start = new Date(billingStart);
    const now = new Date();
    const next = new Date(start);
    while (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  })();

  const handleSave = async () => {
    setSaving(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: {
        action: "update_user",
        userId,
        billingCycleStart: new Date(billingStart).toISOString(),
        isPaused: isPaused,
        planTier: planTier,
        ...addons,
      },
    });
    setSaving(false);
    if (res.data?.error) {
      toast({ title: "Error", description: res.data.error, variant: "destructive" });
    } else {
      toast({ title: "Billing settings saved" });
      onUpdate();
    }
  };

  const handleResetUsage = async () => {
    if (!confirm("This will set the billing cycle start to today, effectively resetting monthly usage counters. Continue?")) return;
    const today = new Date().toISOString().split("T")[0];
    setBillingStart(today);
    setSaving(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: {
        action: "update_user",
        userId,
        billingCycleStart: new Date(today).toISOString(),
      },
    });
    setSaving(false);
    if (!res.data?.error) {
      toast({ title: "Usage counters reset" });
      onUpdate();
    }
  };

  const addonFields = [
    { key: "addon_products" as const, label: "Extra Products", icon: Package },
    { key: "addon_faqs" as const, label: "Extra FAQs", icon: HelpCircle },
    { key: "addon_orders" as const, label: "Extra Orders/Month", icon: ShoppingCart },
    { key: "addon_contacts" as const, label: "Extra Contacts/Month", icon: Users },
    { key: "addon_images" as const, label: "Extra Images/Product", icon: Image },
  ];

  return (
    <div className="space-y-4">
      {/* Plan Tier */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" />
            Plan Tier
          </CardTitle>
          <CardDescription>Current subscription package for this account</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={planTier} onValueChange={setPlanTier}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Starter</SelectItem>
              <SelectItem value="enterprise">Growth</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Billing Cycle & Pause */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Billing Cycle
          </CardTitle>
          <CardDescription>Manage payment cycle and account status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cycle Start Date</Label>
              <Input
                type="date"
                value={billingStart}
                onChange={(e) => setBillingStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Next Payment Cycle</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                <span className="text-sm">{nextCycleDate.toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              {isPaused ? <PauseCircle className="h-4 w-4 text-destructive" /> : <PlayCircle className="h-4 w-4 text-green-600" />}
              <div>
                <p className="text-sm font-medium">{isPaused ? "Account Paused" : "Account Active"}</p>
                <p className="text-xs text-muted-foreground">
                  {isPaused ? "User has read-only access" : "User can create new content"}
                </p>
              </div>
            </div>
            <Switch checked={!isPaused} onCheckedChange={(v) => setIsPaused(!v)} />
          </div>

          <Button variant="outline" size="sm" onClick={handleResetUsage} className="gap-1">
            <RotateCcw className="h-3 w-3" />
            Reset Usage (New Cycle)
          </Button>
        </CardContent>
      </Card>

      {/* Add-ons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Plan Add-ons</CardTitle>
          <CardDescription>Extra quota blocks added on top of the plan limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {addonFields.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <Label className="text-sm w-40 shrink-0">{label}</Label>
              <Input
                type="number"
                min={0}
                value={addons[key]}
                onChange={(e) => setAddons((prev) => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
              {addons[key] > 0 && (
                <Badge variant="secondary" className="text-xs">+{addons[key]}</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save Billing & Add-ons
      </Button>
    </div>
  );
}
