import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { planLabel } from "@/lib/planLabels";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Package, HelpCircle, ShoppingCart, Pencil, Trash2, Plus, MessageSquare, CreditCard, KeyRound, Users, Copy } from "lucide-react";
import VariationEditor, { type Variation } from "@/components/products/VariationEditor";
import AdminBillingManager from "@/components/admin/AdminBillingManager";
import AdminUsageStats from "@/components/admin/AdminUsageStats";

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, roleLoading } = useRole();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [detailData, setDetailData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Product dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("");
  const [prodType, setProdType] = useState("physical");
  const [prodVariations, setProdVariations] = useState<Variation[]>([]);
  const [prodActive, setProdActive] = useState(true);

  // FAQ dialog
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqProductId, setFaqProductId] = useState("");
  const [faqActive, setFaqActive] = useState(true);

  // Password change dialog
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setPasswordSaving(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "change_password", userId, newPassword },
    });
    setPasswordSaving(false);
    if (res.data?.error) {
      toast({ title: "Error", description: res.data.error, variant: "destructive" });
    } else if (res.error) {
      toast({ title: "Error", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: "Password changed successfully" });
      setPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  useEffect(() => {
    if (!roleLoading && !isSuperAdmin) navigate("/dashboard");
  }, [isSuperAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isSuperAdmin && userId) fetchDetails();
  }, [isSuperAdmin, userId]);

  const fetchDetails = async () => {
    setLoading(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "get_user_details", userId },
    });
    if (res.data) setDetailData(res.data);
    setLoading(false);
  };

  // Product CRUD
  const resetProductForm = () => {
    setProdName(""); setProdDesc(""); setProdPrice(""); setProdType("physical");
    setProdVariations([]); setProdActive(true); setEditingProduct(null);
  };

  const openEditProduct = (p: any) => {
    setEditingProduct(p);
    setProdName(p.name);
    setProdDesc(p.description || "");
    setProdPrice(p.price.toString());
    setProdType(p.product_type);
    setProdVariations(Array.isArray(p.variations) ? p.variations : []);
    setProdActive(p.is_active);
    setProductDialogOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: {
        action: editingProduct ? "update_product" : "create_product",
        userId,
        productId: editingProduct?.id,
        productData: {
          name: prodName,
          description: prodDesc || null,
          price: parseFloat(prodPrice),
          product_type: prodType,
          variations: prodVariations,
          is_active: prodActive,
        },
      },
    });
    setSaving(false);
    if (res.data?.error) {
      toast({ title: "Error", description: res.data.error, variant: "destructive" });
    } else {
      toast({ title: editingProduct ? "Product updated" : "Product created" });
      setProductDialogOpen(false);
      resetProductForm();
      fetchDetails();
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Delete this product?")) return;
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "delete_product", userId, productId },
    });
    if (!res.data?.error) {
      toast({ title: "Product deleted" });
      fetchDetails();
    }
  };

  // FAQ CRUD
  const resetFaqForm = () => {
    setFaqQuestion(""); setFaqAnswer(""); setFaqProductId(""); setFaqActive(true); setEditingFaq(null);
  };

  const openEditFaq = (f: any) => {
    setEditingFaq(f);
    setFaqQuestion(f.question);
    setFaqAnswer(f.answer);
    setFaqProductId(f.product_id || "");
    setFaqActive(f.is_active);
    setFaqDialogOpen(true);
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: {
        action: editingFaq ? "update_faq" : "create_faq",
        userId,
        faqId: editingFaq?.id,
        faqData: {
          question: faqQuestion,
          answer: faqAnswer,
          product_id: faqProductId || null,
          is_active: faqActive,
        },
      },
    });
    setSaving(false);
    if (res.data?.error) {
      toast({ title: "Error", description: res.data.error, variant: "destructive" });
    } else {
      toast({ title: editingFaq ? "FAQ updated" : "FAQ created" });
      setFaqDialogOpen(false);
      resetFaqForm();
      fetchDetails();
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!confirm("Delete this FAQ?")) return;
    const res = await supabase.functions.invoke("admin-manage-users-mentor-engineeros", {
      body: { action: "delete_faq", userId, faqId },
    });
    if (!res.data?.error) {
      toast({ title: "FAQ deleted" });
      fetchDetails();
    }
  };

  if (roleLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isSuperAdmin || !detailData) return null;

  const profile = detailData.profile;
  const products = detailData.products || [];
  const faqs = detailData.faqs || [];
  const orders = detailData.orders || [];
  const staff = detailData.staff || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/accounts")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {profile?.business_name || profile?.full_name || "Account"}
            </h1>
            <p className="text-muted-foreground mb-2">{profile?.email}</p>
            {profile?.user_id && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-2 py-1.5 rounded-md w-fit border">
                <span className="font-semibold text-foreground text-xs">CRM Key:</span>
                <code className="text-xs select-all">{profile.user_id}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                  navigator.clipboard.writeText(profile.user_id);
                  toast({ title: "CRM Integration Key copied!" });
                }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => { setNewPassword(""); setConfirmPassword(""); setPasswordDialogOpen(true); }}>
              <KeyRound className="h-4 w-4 mr-1" /> Change Password
            </Button>
            <Badge variant={profile?.is_active ? "default" : "destructive"}>
              {profile?.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">{planLabel(profile?.plan_tier)}</Badge>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="billing" className="space-y-4">
          <TabsList>
            <TabsTrigger value="billing" className="gap-2">
              <CreditCard className="h-4 w-4" /> Billing
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" /> Products ({products.length})
            </TabsTrigger>
            <TabsTrigger value="faqs" className="gap-2">
              <HelpCircle className="h-4 w-4" /> FAQs ({faqs.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Orders ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-2">
              <Users className="h-4 w-4" /> Staff ({staff.length})
            </TabsTrigger>
          </TabsList>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-4">
            <AdminUsageStats userId={userId!} profile={profile} />
            <AdminBillingManager userId={userId!} profile={profile} onUpdate={fetchDetails} />
          </TabsContent>


          {/* Products Tab */}
          <TabsContent value="products">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Products</CardTitle>
                  <CardDescription>Manage products for this business</CardDescription>
                </div>
                <Button size="sm" onClick={() => { resetProductForm(); setProductDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add Product
                </Button>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No products configured</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="capitalize">{p.product_type}</TableCell>
                          <TableCell>LKR {p.price}</TableCell>
                          <TableCell>
                            <Badge variant={p.is_active ? "default" : "outline"}>
                              {p.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEditProduct(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteProduct(p.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FAQs Tab */}
          <TabsContent value="faqs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>FAQs</CardTitle>
                  <CardDescription>Manage FAQs for this business</CardDescription>
                </div>
                <Button size="sm" onClick={() => { resetFaqForm(); setFaqDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Add FAQ
                </Button>
              </CardHeader>
              <CardContent>
                {faqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No FAQs configured</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Question</TableHead>
                        <TableHead>Linked Product</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faqs.map((f: any) => (
                        <TableRow key={f.id}>
                          <TableCell>
                            <p className="font-medium line-clamp-1">{f.question}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">{f.answer}</p>
                          </TableCell>
                          <TableCell className="text-sm">
                            {f.products?.name || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={f.is_active ? "default" : "outline"}>
                              {f.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEditFaq(f)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteFaq(f.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Orders</CardTitle>
                <CardDescription>View orders for this business</CardDescription>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No orders yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o: any) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.customer_name}</TableCell>
                          <TableCell>{o.customer_phone}</TableCell>
                          <TableCell>LKR {o.total_amount}</TableCell>
                          <TableCell className="capitalize">{o.payment_method}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{o.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(o.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Staff Tab */}
          <TabsContent value="staff">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Staff Accounts</CardTitle>
                <CardDescription>Sub-accounts belonging to this business</CardDescription>
              </CardHeader>
              <CardContent>
                {staff.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No staff accounts</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.staff_name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{s.staff_email}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(s.permissions || []).map((p: string) => (
                                <Badge key={p} variant="secondary" className="text-xs capitalize">{p}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.is_active ? "default" : "destructive"}>
                              {s.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(s.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Product Dialog */}
        <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (!open) resetProductForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
              <DialogDescription>For {profile?.business_name || profile?.email}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Product Name *</Label>
                  <Input value={prodName} onChange={(e) => setProdName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Price *</Label>
                  <Input type="number" step="0.01" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={prodType} onValueChange={setProdType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Switch checked={prodActive} onCheckedChange={setProdActive} />
                  <Label>Active</Label>
                </div>
              </div>
              <VariationEditor variations={prodVariations} onChange={setProdVariations} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingProduct ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* FAQ Dialog */}
        <Dialog open={faqDialogOpen} onOpenChange={(open) => { setFaqDialogOpen(open); if (!open) resetFaqForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingFaq ? "Edit FAQ" : "Add FAQ"}</DialogTitle>
              <DialogDescription>For {profile?.business_name || profile?.email}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveFaq} className="space-y-4">
              <div className="space-y-2">
                <Label>Question *</Label>
                <Input value={faqQuestion} onChange={(e) => setFaqQuestion(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Answer *</Label>
                <Textarea value={faqAnswer} onChange={(e) => setFaqAnswer(e.target.value)} rows={4} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Link to Product</Label>
                  <Select value={faqProductId || "none"} onValueChange={(v) => setFaqProductId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No product link</SelectItem>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Switch checked={faqActive} onCheckedChange={setFaqActive} />
                  <Label>Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFaqDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {editingFaq ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Password Change Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>Set a new password for {profile?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleChangePassword} disabled={passwordSaving || !newPassword || !confirmPassword}>
                {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
