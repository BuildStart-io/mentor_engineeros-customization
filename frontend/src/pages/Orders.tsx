import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DetailingCalendar from "@/components/DetailingCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Eye, 
  ShoppingCart, 
  Loader2, 
  Phone, 
  MapPin, 
  CreditCard, 
  Package, 
  MessageSquare, 
  Trash2, 
  Download, 
  Car, 
  Calendar as CalendarIcon, 
  List, 
  Wrench, 
  CheckCircle2, 
  Clock, 
  Droplet, 
  Sparkles, 
  Send,
  AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import LimitWarningBanner from "@/components/LimitWarningBanner";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  whatsapp_phone: string | null;
  district: string | null;
  customer_address: string | null;
  order_items: unknown;
  special_instructions: string | null;
  payment_method: string;
  status: string;
  total_amount: number;
  created_at: string;
  custom_fields?: {
    service_category?: string;
    vehicle_number?: string;
    vehicle_model?: string;
    vehicle_category?: string;
    service_package?: string;
    engine_oil?: string;
    add_ons?: string[];
    booking_date?: string;
    booking_time?: string;
    problem_description?: string;
    completion_message_sent?: boolean;
    [key: string]: any;
  } | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  received: "bg-indigo-100 text-indigo-800 border-indigo-300",
  in_progress: "bg-orange-100 text-orange-800 border-orange-300",
  finished: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  processing: "bg-blue-100 text-blue-800 border-blue-300",
  shipped: "bg-purple-100 text-purple-800 border-purple-300",
};

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "received", label: "Vehicle Received" },
  { value: "in_progress", label: "Work In Progress" },
  { value: "finished", label: "Finished / Ready" },
  { value: "delivered", label: "Delivered / Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const categoryOptions = [
  { value: "all", label: "All Services" },
  { value: "oil_change", label: "Oil Change / Full Service" },
  { value: "mechanical", label: "Mechanical & Diagnostic" },
  { value: "detailing", label: "Detailing & Polish" },
  { value: "wash", label: "Vehicle Wash" },
];

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "calendar" | "detailing_calendar">("table");
  
  // Finished notification modal state
  const [finishedPromptOrder, setFinishedPromptOrder] = useState<Order | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchOrders = async () => {
    try {
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching bookings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  // Filter orders by category
  const filteredOrders = orders.filter((order) => {
    if (categoryFilter === "all") return true;
    const cat = (order.custom_fields?.service_category || "").toLowerCase();
    const pkg = (order.custom_fields?.service_package || "").toLowerCase();
    const itemsText = Array.isArray(order.order_items)
      ? order.order_items.map((i: any) => i.name || "").join(" ").toLowerCase()
      : "";
    const fullText = `${cat} ${pkg} ${itemsText}`;

    if (categoryFilter === "oil_change") {
      return fullText.includes("oil") || fullText.includes("full service") || fullText.includes("general service") || cat === "oil_change";
    }
    if (categoryFilter === "detailing") {
      return fullText.includes("detail") || fullText.includes("polish") || cat === "detailing";
    }
    if (categoryFilter === "mechanical") {
      return fullText.includes("mechanic") || fullText.includes("inspect") || fullText.includes("diagnostic") || fullText.includes("scan") || fullText.includes("repair") || fullText.includes("brake") || fullText.includes("suspension") || fullText.includes("clutch") || cat === "mechanical";
    }
    if (categoryFilter === "wash") {
      return fullText.includes("wash") || fullText.includes("vacuum") || cat === "wash";
    }
    return true;
  });

  const handleStatusChangeAttempt = (order: Order, newStatus: string) => {
    if (newStatus === "finished") {
      setFinishedPromptOrder(order);
    } else {
      updateOrderStatus(order.id, newStatus);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, completionSent: boolean = false) => {
    try {
      const updatePayload: any = { status: newStatus };
      if (completionSent) {
        const orderToUpdate = orders.find((o) => o.id === orderId);
        const existingCf = orderToUpdate?.custom_fields || {};
        updatePayload.custom_fields = { ...existingCf, completion_message_sent: true };
      }

      const { error } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);

      if (error) throw error;
      toast({ title: `Status updated to ${newStatus}` });
      fetchOrders();

      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendFinishedNotification = async (order: Order) => {
    setSendingAlert(true);
    const phone = order.whatsapp_phone || order.customer_phone;
    const vehicle = order.custom_fields?.vehicle_number 
      ? `(${order.custom_fields.vehicle_number} - ${order.custom_fields.vehicle_model || ""})`
      : "";
    
    const message = `Ayubowan ${order.customer_name}! 🚗\n\nYour vehicle ${vehicle} service has been completed and is ready for collection at Mentor Engineers! ✅\n\n💰 Total Amount: LKR ${order.total_amount.toFixed(2)}\n⏰ Workshop Hours: Mon - Sat 08:30 AM to 05:30 PM\n📞 Contact: 0761309690\n\nThank you for choosing Mentor Engineers!`;

    try {
      // Find active WhatsApp session for the user
      const { data: { user } } = await supabase.auth.getUser();
      let sessionApiKey: string | undefined = undefined;
      if (user?.id) {
        const { data: sessionData } = await supabase
          .from("user_wsender_sessions")
          .select("session_api_key, session_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        sessionApiKey = (sessionData as any)?.session_api_key || (sessionData as any)?.session_id || `u_${user.id.replace(/-/g, "").substring(0, 20)}`;
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp-mentor-engineeros", {
        body: {
          to: phone,
          message: message,
          sessionApiKey: sessionApiKey,
        },
      });

      if (error) throw error;

      toast({
        title: "Vehicle Ready Alert Sent! 📲",
        description: `Notification dispatched to ${phone}`,
      });

      await updateOrderStatus(order.id, "finished", true);
    } catch (err: any) {
      console.error("Error sending WhatsApp completion alert:", err);
      toast({
        title: "Marked Finished (WhatsApp message failed)",
        description: err.message,
        variant: "destructive",
      });
      await updateOrderStatus(order.id, "finished", false);
    } finally {
      setSendingAlert(false);
      setFinishedPromptOrder(null);
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) throw error;
      toast({ title: "Booking deleted" });
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({ title: "Error deleting booking", description: error.message, variant: "destructive" });
    }
  };

  const exportOrders = (type: "csv" | "excel") => {
    if (filteredOrders.length === 0) {
      toast({ title: "No bookings to export", variant: "destructive" });
      return;
    }

    const headers = ["Booking ID", "Customer Name", "Phone", "Vehicle Reg", "Vehicle Model", "Category", "Service Package", "Engine Oil", "Date/Slot", "Status", "Total (LKR)"];
    const rows = filteredOrders.map((o) => {
      const cf = o.custom_fields || {};
      return [
        o.id.slice(0, 8),
        o.customer_name,
        o.customer_phone,
        cf.vehicle_number || "",
        cf.vehicle_model || "",
        cf.vehicle_category || "",
        cf.service_package || "",
        cf.engine_oil || "",
        `${cf.booking_date || ""} ${cf.booking_time || ""}`.trim() || format(new Date(o.created_at), "yyyy-MM-dd"),
        o.status,
        o.total_amount.toFixed(2),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], {
      type: type === "excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${format(new Date(), "yyyy-MM-dd")}.${type === "excel" ? "xls" : "csv"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `Bookings exported as ${type === "excel" ? "Excel" : "CSV"}` });
  };

  // Group bookings by date for Calendar View
  const bookingsByDate: Record<string, Order[]> = {};
  filteredOrders.forEach((o) => {
    const d = o.custom_fields?.booking_date || format(new Date(o.created_at), "yyyy-MM-dd");
    if (!bookingsByDate[d]) bookingsByDate[d] = [];
    bookingsByDate[d].push(o);
  });

  const sortedDates = Object.keys(bookingsByDate).sort();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <LimitWarningBanner type="orders" />

        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Wrench className="h-7 w-7 text-primary" /> Bookings & Workshop Jobs
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Mentor Engineers vehicle appointments, service jobs & WhatsApp follow-ups
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center border rounded-md p-0.5 bg-muted/40">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode("table")}
              >
                <List className="h-3.5 w-3.5" /> Table
              </Button>
              <Button
                variant={viewMode === "calendar" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode("calendar")}
              >
                <CalendarIcon className="h-3.5 w-3.5" /> Calendar
              </Button>
              <Button
                variant={viewMode === "detailing_calendar" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode("detailing_calendar")}
              >
                <Sparkles className="h-3.5 w-3.5" /> Detailing
              </Button>
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value} className="text-xs">
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Export Buttons */}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportOrders("csv")} disabled={filteredOrders.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportOrders("excel")} disabled={filteredOrders.length === 0}>
              <Download className="mr-1 h-3.5 w-3.5" /> Excel
            </Button>
          </div>
        </div>

        {/* Main Content Area: Table View vs Calendar View */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "detailing_calendar" ? (
          <DetailingCalendar orders={filteredOrders} />
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-base font-medium">No bookings found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter === "all" && categoryFilter === "all"
                  ? "Bookings will automatically appear here when customers schedule service via WhatsApp."
                  : "No bookings match the selected filters."}
              </p>
            </CardContent>
          </Card>
        ) : viewMode === "calendar" ? (
          /* Calendar Style Booking View */
          <div className="space-y-6">
            {sortedDates.map((dateKey) => {
              const dayBookings = bookingsByDate[dateKey] || [];
              const bookingCount = dayBookings.length;
              let densityBadge = (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Available Slots
                </Badge>
              );
              if (bookingCount >= 4) {
                densityBadge = (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    Fully Booked
                  </Badge>
                );
              } else if (bookingCount >= 2) {
                densityBadge = (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    Busy Schedule
                  </Badge>
                );
              }

              return (
                <Card key={dateKey} className="overflow-hidden border shadow-sm">
                  <CardHeader className="bg-muted/30 py-3 px-4 border-b flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm sm:text-base">
                        {(() => {
                          try {
                            return format(new Date(dateKey), "EEEE, MMMM d, yyyy");
                          } catch {
                            return dateKey;
                          }
                        })()}
                      </span>
                      <span className="text-xs text-muted-foreground">({bookingCount} appointment{bookingCount !== 1 ? "s" : ""})</span>
                    </div>
                    {densityBadge}
                  </CardHeader>
                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {dayBookings.map((order) => {
                      const cf = order.custom_fields || {};
                      const timeSlot = cf.booking_time || "Slot not specified";
                      const vehicle = cf.vehicle_number || "No plate";
                      const model = cf.vehicle_model || "";
                      const service = cf.service_package || (Array.isArray(order.order_items) && (order.order_items[0] as any)?.name) || "General Service";

                      return (
                        <div
                          key={order.id}
                          className="border rounded-lg p-3.5 space-y-2.5 hover:shadow-md transition-shadow bg-card"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <Clock className="h-3.5 w-3.5" />
                              {timeSlot}
                            </div>
                            <Badge className={statusColors[order.status] || "bg-muted text-foreground"}>
                              {order.status}
                            </Badge>
                          </div>

                          <div>
                            <p className="font-medium text-sm flex items-center gap-1.5">
                              <Car className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-semibold">{vehicle}</span> {model && `(${model})`}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{order.customer_name} • {order.customer_phone}</p>
                          </div>

                          <div className="text-xs bg-muted/40 p-2 rounded flex flex-col gap-1">
                            <span className="font-medium text-foreground">{service}</span>
                            {cf.engine_oil && (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Droplet className="h-3 w-3 text-amber-500" /> {cf.engine_oil}
                              </span>
                            )}
                            {Array.isArray(order.order_items) && order.order_items.length > 1 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {order.order_items
                                  .filter((item: any) => item.name !== service)
                                  .map((item: any, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                    +{item.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t text-xs">
                            <span className="font-bold">LKR {order.total_amount.toFixed(2)}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setSelectedOrder(order)}
                              >
                                Details
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  const chatPhone = order.whatsapp_phone || order.customer_phone;
                                  navigate(`/dashboard/conversations?phone=${encodeURIComponent(chatPhone)}`);
                                }}
                              >
                                Chat
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Appointments & Bookings</CardTitle>
              <CardDescription>
                Showing {filteredOrders.length} booking{filteredOrders.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Mobile View */}
              <div className="space-y-3 md:hidden">
                {filteredOrders.map((order) => {
                  const cf = order.custom_fields || {};
                  return (
                    <div key={order.id} className="border rounded-lg p-4 space-y-3 bg-card shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-base">{order.customer_name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" /> {order.customer_phone}
                          </p>
                        </div>
                        <Badge className={statusColors[order.status]}>{order.status}</Badge>
                      </div>

                      {/* Vehicle & Service summary */}
                      <div className="bg-muted/40 p-2.5 rounded-md text-xs space-y-1">
                        <div className="flex items-center justify-between font-medium">
                          <span>🚗 {cf.vehicle_number || "No Plate"} {cf.vehicle_model ? `(${cf.vehicle_model})` : ""}</span>
                          <span className="text-muted-foreground">{cf.vehicle_category || ""}</span>
                        </div>
                        <div className="text-primary font-medium">
                          🛠️ {cf.service_package || (Array.isArray(order.order_items) && (order.order_items[0] as any)?.name) || "Service"}
                        </div>
                        {cf.engine_oil && (
                          <div className="text-muted-foreground">
                            🛢️ {cf.engine_oil}
                          </div>
                        )}
                        {(cf.booking_date || cf.booking_time) && (
                          <div className="text-amber-700 dark:text-amber-400 font-medium">
                            📅 {cf.booking_date} @ {cf.booking_time}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="font-bold">LKR {order.total_amount.toFixed(2)}</span>
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleStatusChangeAttempt(order, val)}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((s) => (
                              <SelectItem key={s.value} value={s.value} className="text-xs">
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t">
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setSelectedOrder(order)}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" /> Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            const chatPhone = order.whatsapp_phone || order.customer_phone;
                            navigate(`/dashboard/conversations?phone=${encodeURIComponent(chatPhone)}`);
                          }}
                        >
                          <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Vehicle & Model</TableHead>
                      <TableHead>Service & Oil</TableHead>
                      <TableHead>Booking Slot</TableHead>
                      <TableHead>Total (LKR)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const cf = order.custom_fields || {};
                      const vNumber = cf.vehicle_number || "—";
                      const vModel = cf.vehicle_model ? `(${cf.vehicle_model})` : "";
                      const sPackage = cf.service_package || (Array.isArray(order.order_items) && (order.order_items[0] as any)?.name) || "Service";
                      const eOil = cf.engine_oil;
                      const dateStr = cf.booking_date ? `${cf.booking_date} ${cf.booking_time || ""}` : format(new Date(order.created_at), "MMM d, yyyy");

                      return (
                        <TableRow key={order.id}>
                          {/* Customer */}
                          <TableCell>
                            <div>
                              <p className="font-semibold text-sm">{order.customer_name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {order.customer_phone}
                              </p>
                            </div>
                          </TableCell>

                          {/* Vehicle */}
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1">
                                <Car className="h-3.5 w-3.5 text-primary" /> {vNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">{vModel} {cf.vehicle_category ? `• ${cf.vehicle_category}` : ""}</p>
                            </div>
                          </TableCell>

                          {/* Service & Oil */}
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium text-sm text-foreground">{sPackage}</p>
                              {eOil && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Droplet className="h-3 w-3 text-amber-500" /> {eOil}
                                </p>
                              )}
                              {Array.isArray(order.order_items) && order.order_items.length > 1 && (
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {order.order_items
                                    .filter((item: any) => item.name !== sPackage)
                                    .map((item: any, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
                                      +{item.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          {/* Booking Slot */}
                          <TableCell>
                            <div className="text-xs">
                              <p className="font-medium text-foreground flex items-center gap-1">
                                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> {dateStr}
                              </p>
                            </div>
                          </TableCell>

                          {/* Total */}
                          <TableCell className="font-bold text-sm">
                            LKR {order.total_amount.toFixed(2)}
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Select
                              value={order.status}
                              onValueChange={(val) => handleStatusChangeAttempt(order, val)}
                            >
                              <SelectTrigger className="w-[145px] h-8 text-xs">
                                <Badge className={`${statusColors[order.status]} text-xs`}>
                                  {order.status}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((s) => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View Details"
                                onClick={() => setSelectedOrder(order)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-primary"
                                title="Open WhatsApp Chat"
                                onClick={() => {
                                  const chatPhone = order.whatsapp_phone || order.customer_phone;
                                  navigate(`/dashboard/conversations?phone=${encodeURIComponent(chatPhone)}`);
                                }}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Booking</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this booking record.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteOrder(order.id)} className="bg-destructive text-destructive-foreground">
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Finished Confirmation & WhatsApp Alert Dialog */}
        <Dialog open={!!finishedPromptOrder} onOpenChange={() => setFinishedPromptOrder(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" /> Mark Job Finished & Alert Customer
              </DialogTitle>
              <DialogDescription>
                Would you like to send an automated WhatsApp notification to the customer informing them their vehicle is ready for collection?
              </DialogDescription>
            </DialogHeader>

            {finishedPromptOrder && (
              <div className="space-y-3 bg-muted/40 p-3.5 rounded-lg border text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold">{finishedPromptOrder.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WhatsApp Phone:</span>
                  <span className="font-mono">{finishedPromptOrder.whatsapp_phone || finishedPromptOrder.customer_phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vehicle:</span>
                  <span className="font-semibold">{finishedPromptOrder.custom_fields?.vehicle_number || "—"} ({finishedPromptOrder.custom_fields?.vehicle_model || ""})</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Total Bill:</span>
                  <span className="font-bold text-primary">LKR {finishedPromptOrder.total_amount.toFixed(2)}</span>
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (finishedPromptOrder) updateOrderStatus(finishedPromptOrder.id, "finished", false);
                  setFinishedPromptOrder(null);
                }}
              >
                Mark Finished Only
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                disabled={sendingAlert}
                onClick={() => finishedPromptOrder && sendFinishedNotification(finishedPromptOrder)}
              >
                {sendingAlert ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send WhatsApp Alert & Finish
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detailed Booking Modal */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" /> Booking Details #{selectedOrder?.id.slice(0, 8)}
              </DialogTitle>
              <DialogDescription>
                Created on {selectedOrder && format(new Date(selectedOrder.created_at), "PPPp")}
              </DialogDescription>
            </DialogHeader>

            {selectedOrder && (
              <div className="space-y-6 text-sm">
                {/* Vehicle & Customer Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border p-4 rounded-lg bg-card">
                  <div className="space-y-1.5">
                    <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Customer</h4>
                    <p className="font-medium text-base">{selectedOrder.customer_name}</p>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {selectedOrder.customer_phone}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Vehicle Details</h4>
                    <p className="font-bold text-base text-primary">
                      {selectedOrder.custom_fields?.vehicle_number || "No Plate Recorded"}
                    </p>
                    <p className="text-muted-foreground">
                      {selectedOrder.custom_fields?.vehicle_model || ""} {selectedOrder.custom_fields?.vehicle_category ? `(${selectedOrder.custom_fields.vehicle_category})` : ""}
                    </p>
                  </div>
                </div>

                {/* Service Details */}
                <div className="border p-4 rounded-lg space-y-3 bg-muted/20">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Service Scope</h4>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{selectedOrder.custom_fields?.service_package || "General Service"}</span>
                    <Badge variant="outline" className="capitalize">
                      {selectedOrder.custom_fields?.service_category || "Service"}
                    </Badge>
                  </div>

                  {selectedOrder.custom_fields?.engine_oil && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Droplet className="h-3.5 w-3.5 text-amber-500" /> Selected Engine Oil:
                      </span>
                      <span className="font-medium">{selectedOrder.custom_fields.engine_oil}</span>
                    </div>
                  )}

                  {selectedOrder.custom_fields?.add_ons && selectedOrder.custom_fields.add_ons.length > 0 && (
                    <div className="text-xs space-y-1 pt-1 border-t">
                      <span className="text-muted-foreground">Selected Add-ons:</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {selectedOrder.custom_fields.add_ons.map((addon: string, i: number) => (
                          <Badge key={i} variant="secondary">
                            {addon}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedOrder.custom_fields?.problem_description && (
                    <div className="text-xs space-y-1 pt-1 border-t bg-amber-50/50 p-2 rounded">
                      <span className="font-semibold text-amber-800 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Customer Reported Issue:
                      </span>
                      <p className="text-amber-900">{selectedOrder.custom_fields.problem_description}</p>
                    </div>
                  )}
                </div>

                {/* Scheduled Time & Financials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border p-3.5 rounded-lg space-y-1">
                    <span className="text-xs text-muted-foreground">Scheduled Booking Slot</span>
                    <p className="font-semibold">
                      {selectedOrder.custom_fields?.booking_date || format(new Date(selectedOrder.created_at), "yyyy-MM-dd")}
                    </p>
                    <p className="text-xs text-primary font-medium">
                      {selectedOrder.custom_fields?.booking_time || "Morning (09:30 AM)"}
                    </p>
                  </div>

                  <div className="border p-3.5 rounded-lg space-y-1 text-right">
                    <span className="text-xs text-muted-foreground">Estimated Total</span>
                    <p className="text-2xl font-bold text-primary">
                      LKR {selectedOrder.total_amount.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Actions & WhatsApp Chat */}
                <div className="flex items-center justify-between pt-4 border-t gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Change Status:</span>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(val) => handleStatusChangeAttempt(selectedOrder, val)}
                    >
                      <SelectTrigger className="w-[150px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => (
                          <SelectItem key={s.value} value={s.value} className="text-xs">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      const chatPhone = selectedOrder.whatsapp_phone || selectedOrder.customer_phone;
                      setSelectedOrder(null);
                      navigate(`/dashboard/conversations?phone=${encodeURIComponent(chatPhone)}`);
                    }}
                  >
                    <MessageSquare className="h-4 w-4" /> Open WhatsApp Chat
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
