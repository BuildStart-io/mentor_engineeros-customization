import { useEffect, useState, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, MessageSquare, CreditCard, Copy, Check, Smartphone, RefreshCw, Wifi, WifiOff, Plus, Trash2, ArrowUp, ArrowDown, GripVertical, Clock, Lock } from "lucide-react";
import WelcomeMediaUpload from "@/components/settings/WelcomeMediaUpload";
import StaffManager from "@/components/settings/StaffManager";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { useEffectivePlan } from "@/hooks/useEffectivePlan";

interface PaymentAccount {
  account_type: string;
  account_label: string;
  account_number: string;
  account_name: string;
}

interface SettingsData {
  welcome_message: { text: string; media_url?: string; bypass_triggers?: string[] };
  payment_info: { accounts: PaymentAccount[] };
  auto_responses: { enabled: boolean };
}

interface WsenderSession {
  id: string;
  name: string;
  status: string;
  phone?: string;
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false); // kept for potential future use
  const { toast } = useToast();
  const { user } = useAuth();
  const { isGrowth } = useEffectivePlan();

  // Welcome Message
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [welcomeMediaUrl, setWelcomeMediaUrl] = useState("");
  const [welcomeMediaUrls, setWelcomeMediaUrls] = useState<string[]>([]);
  const [bypassTriggers, setBypassTriggers] = useState<string[]>([]);
  const [newBypassTrigger, setNewBypassTrigger] = useState("");
  // Welcome sequence: ordered list of items to send
  type WelcomeSequenceItem = { type: "text" } | { type: "media"; url: string };
  const [welcomeSequence, setWelcomeSequence] = useState<WelcomeSequenceItem[]>([]);

  // Use refs to always have latest values for save
  const welcomeMessageRef = useRef(welcomeMessage);
  const welcomeMediaUrlRef = useRef(welcomeMediaUrl);
  const welcomeMediaUrlsRef = useRef(welcomeMediaUrls);
  const bypassTriggersRef = useRef(bypassTriggers);
  const welcomeSequenceRef = useRef(welcomeSequence);
  welcomeMessageRef.current = welcomeMessage;
  welcomeMediaUrlRef.current = welcomeMediaUrl;
  welcomeMediaUrlsRef.current = welcomeMediaUrls;
  bypassTriggersRef.current = bypassTriggers;
  welcomeSequenceRef.current = welcomeSequence;

  // Payment Info - Multiple Bank Accounts
  const [bankAccounts, setBankAccounts] = useState<PaymentAccount[]>([
    { account_type: "bank", account_label: "", account_number: "", account_name: "" }
  ]);

  // Auto Responses
  const [autoResponsesEnabled, setAutoResponsesEnabled] = useState(true);

  // Delivery Settings
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number>(0);

  // Order Notifications
  const [notificationPhone, setNotificationPhone] = useState("");

  // Order Follow-up Message
  const [orderFollowupMessage, setOrderFollowupMessage] = useState("");
  const [orderFollowupEnabled, setOrderFollowupEnabled] = useState(false);

  // Inactivity Follow-up (Growth plan only)
  const [inactivityFollowupEnabled, setInactivityFollowupEnabled] = useState(false);
  const [inactivityFollowupMessage, setInactivityFollowupMessage] = useState("");
  const [inactivityFollowupHours, setInactivityFollowupHours] = useState<string>("24");

  // WhatsApp Connection
  const [sessions, setSessions] = useState<WsenderSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionPhone, setNewSessionPhone] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [_settingWebhook, setSettingWebhook] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-wsender-mentor-engineeros`;

  const getFunctionAuthHeaders = useCallback(async (includeJson = false) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Please log in again to manage WhatsApp sessions.");
    }

    return {
      "Authorization": `Bearer ${session.access_token}`,
      ...(includeJson ? { "Content-Type": "application/json" } : {}),
    };
  }, []);

  const fetchSettings = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .eq("user_id", user.id);

      if (error) throw error;

      data?.forEach((setting) => {
        switch (setting.key) {
          case "welcome_message": {
            const wVal = setting.value as any;
            setWelcomeMessage(wVal?.text || "");
            setWelcomeMediaUrl(wVal?.media_url || "");
            const urls: string[] = wVal?.media_urls || [];
            setWelcomeMediaUrls(urls);
            setBypassTriggers(wVal?.bypass_triggers || []);
            // Load sequence or build default
            if (wVal?.welcome_sequence && Array.isArray(wVal.welcome_sequence)) {
              setWelcomeSequence(wVal.welcome_sequence);
            } else {
              // Build default sequence: text first, then media
              const defaultSeq: WelcomeSequenceItem[] = [];
              if (wVal?.text?.trim()) defaultSeq.push({ type: "text" });
              urls.forEach((u: string) => defaultSeq.push({ type: "media", url: u }));
              setWelcomeSequence(defaultSeq);
            }
            break;
          }
          case "payment_info": {
            const val = setting.value as any;
            const defaultAccount: PaymentAccount = { account_type: "bank", account_label: "", account_number: "", account_name: "" };
            if (val?.accounts && Array.isArray(val.accounts)) {
              // Migrate old accounts that have bank_name to new format
              const migrated = val.accounts.map((a: any) => ({
                account_type: a.account_type || "bank",
                account_label: a.account_label || a.bank_name || "",
                account_number: a.account_number || "",
                account_name: a.account_name || "",
              }));
              setBankAccounts(migrated.length > 0 ? migrated : [defaultAccount]);
            } else if (val?.bank_name || val?.account_number || val?.account_name) {
              setBankAccounts([{ account_type: "bank", account_label: val.bank_name || "", account_number: val.account_number || "", account_name: val.account_name || "" }]);
            }
            break;
          }
          case "auto_responses":
            setAutoResponsesEnabled((setting.value as any)?.enabled ?? true);
            break;
          case "order_notifications":
            setNotificationPhone((setting.value as any)?.phone || "");
            break;
          case "delivery_settings":
            setFreeDeliveryThreshold((setting.value as any)?.free_delivery_threshold || 0);
            break;
          case "order_followup_message": {
            const fVal = setting.value as any;
            setOrderFollowupMessage(fVal?.text || "");
            setOrderFollowupEnabled(fVal?.enabled ?? false);
            break;
          }
          case "inactivity_followup": {
            const iVal = setting.value as any;
            setInactivityFollowupMessage(iVal?.text || "");
            setInactivityFollowupEnabled(iVal?.enabled ?? false);
            setInactivityFollowupHours(String(iVal?.hours ?? 24));
            break;
          }
        }
      });
    } catch (error: any) {
      toast({
        title: "Error fetching settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    setSessionsLoading(true);
    try {
      // First get the user's mapped session IDs
      const { data: userSessions, error: dbError } = await supabase
        .from("user_wsender_sessions")
        .select("session_id, session_name")
        .eq("user_id", user.id);

      if (dbError) throw dbError;

      if (!userSessions || userSessions.length === 0) {
        setSessions([]);
        setSessionsLoading(false);
        return;
      }

      const userSessionIds = new Set(userSessions.map(s => String(s.session_id)));

      // Fetch all sessions from Wasender API then filter to only user's
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros?action=list-sessions`,
        {
          headers: await getFunctionAuthHeaders(),
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch sessions");
      }

      const result = await response.json();
      const allSessions = result.data || result || [];
      const filtered = Array.isArray(allSessions)
        ? allSessions.filter((s: any) => userSessionIds.has(String(s.id)))
        : [];
      setSessions(filtered);
    } catch (error: any) {
      console.error("Error fetching sessions:", error);
      toast({
        title: "Error fetching WhatsApp sessions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSessionsLoading(false);
    }
  }, [toast, user, getFunctionAuthHeaders]);

  const initializeAndFetchQr = useCallback(async (sessionId: string, sessionStatus: string) => {
    setQrLoading(true);
    setQrCode(null);
    setQrImage(null);
    setSelectedSessionId(sessionId);
    const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros`;

    try {
      const authHeaders = await getFunctionAuthHeaders();
      if (sessionStatus !== "connected") {
        toast({ title: "Preparing QR code...", description: "Starting the WhatsApp session if needed." });
      }

      // The backend now starts stopped sessions and returns the QR in one request.
      const response = await fetch(`${baseUrl}?action=get-qr&sessionId=${sessionId}`, {
        headers: authHeaders,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch QR code");
      }

      const result = await response.json();
      const image = result.data?.qrImage || result.qrImage || null;
      const qr = result.data?.qrCode || result.qrCode || result.data?.qr || null;
      const returnedStatus = result.data?.status || result.status;
      setQrImage(image);
      setQrCode(qr);

      let finalImage = image;
      let finalQr = qr;
      let finalStatus = returnedStatus;

      // If QR code is not ready yet because WAHA is starting, poll a few times
      if (!finalImage && !finalQr && returnedStatus !== "connected") {
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((r) => setTimeout(r, 2500));
          try {
            const pollRes = await fetch(`${baseUrl}?action=get-qr&sessionId=${sessionId}`, {
              headers: authHeaders,
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              finalImage = pollData.data?.qrImage || pollData.qrImage || null;
              finalQr = pollData.data?.qrCode || pollData.qrCode || pollData.data?.qr || null;
              finalStatus = pollData.data?.status || pollData.status;
              if (finalImage || finalQr || finalStatus === "connected") {
                setQrImage(finalImage);
                setQrCode(finalQr);
                break;
              }
            }
          } catch {}
        }
      }

      if (finalStatus === "connected") {
        setQrImage(null);
        setQrCode(null);
        toast({ title: "WhatsApp connected", description: "This session is already linked." });
        await fetchSessions();
      } else if (!finalImage && !finalQr) {
        toast({
          title: "QR code is still loading",
          description: "WAHA browser engine is starting up. Click 'Get QR Code' again in a few moments.",
        });
      }
    } catch (error: any) {
      console.error("Error fetching QR code:", error);
      toast({
        title: "Error fetching QR code",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setQrLoading(false);
    }
  }, [toast, getFunctionAuthHeaders, fetchSessions]);

  // Auto-detect when WhatsApp is linked via QR code
  useEffect(() => {
    if (!qrImage && !qrCode) return;
    if (!selectedSessionId) return;

    const interval = setInterval(async () => {
      try {
        const authHeaders = await getFunctionAuthHeaders();
        const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros`;
        const res = await fetch(`${baseUrl}?action=get-qr&sessionId=${selectedSessionId}`, {
          headers: authHeaders,
        });
        if (res.ok) {
          const result = await res.json();
          const returnedStatus = result.data?.status || result.status;
          if (returnedStatus === "connected") {
            setQrImage(null);
            setQrCode(null);
            toast({
              title: "WhatsApp Connected!",
              description: "Your WhatsApp account has been linked successfully.",
            });
            fetchSessions();
          }
        }
      } catch {}
    }, 3500);

    return () => clearInterval(interval);
  }, [qrImage, qrCode, selectedSessionId, getFunctionAuthHeaders, fetchSessions, toast]);

  const createSession = useCallback(async () => {
    if (!newSessionName.trim()) {
      toast({ title: "Please enter a session name", variant: "destructive" });
      return;
    }
    setCreatingSession(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros?action=create-session`,
        {
          method: "POST",
          headers: await getFunctionAuthHeaders(true),
          body: JSON.stringify({
            name: newSessionName.trim(),
            phone_number: newSessionPhone.trim(),
            account_protection: false,
          }),
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to create session");
      }
      const result = await response.json();
      const newSession = result.data || result;
      toast({ title: "Session created!", description: `Session "${newSessionName}" created successfully.` });
      setNewSessionName("");
      setNewSessionPhone("");
      setShowCreateForm(false);

      // Save mapping for this user (including api_key for webhook matching)
      if (user && newSession?.id) {
        // Fetch session details to get the api_key
        let sessionApiKey: string | null = null;
        try {
          const detailsRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros?action=session-details&sessionId=${newSession.id}`,
            { headers: await getFunctionAuthHeaders() }
          );
          if (detailsRes.ok) {
            const detailsData = await detailsRes.json();
            sessionApiKey = detailsData.data?.api_key || detailsData.api_key || null;
          }
        } catch (e) {
          console.warn("Could not fetch session api_key:", e);
        }

        await supabase.from("user_wsender_sessions").upsert({
          user_id: user.id,
          session_id: String(newSession.id),
          session_name: newSessionName.trim(),
          session_api_key: sessionApiKey,
        } as any, { onConflict: "user_id,session_id" });
      }

      // Auto-setup webhook on the new session
      if (newSession?.id) {
        await setupWebhook(newSession.id);
      }

      await fetchSessions();
    } catch (error: any) {
      console.error("Error creating session:", error);
      toast({ title: "Error creating session", description: error.message, variant: "destructive" });
    } finally {
      setCreatingSession(false);
    }
  }, [newSessionName, newSessionPhone, toast, user, fetchSessions, getFunctionAuthHeaders]);

  const setupWebhook = useCallback(async (sessionId: string) => {
    setSettingWebhook(sessionId);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros?action=set-webhook&sessionId=${sessionId}`,
        {
          method: "POST",
          headers: await getFunctionAuthHeaders(true),
          body: JSON.stringify({ webhook_url: webhookUrl }),
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to set webhook");
      }
      toast({ title: "Webhook configured!", description: "Webhook URL has been set on this session." });
    } catch (error: any) {
      console.error("Error setting webhook:", error);
      toast({ title: "Error setting webhook", description: error.message, variant: "destructive" });
    } finally {
      setSettingWebhook(null);
    }
  }, [webhookUrl, toast, getFunctionAuthHeaders]);

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const deleteSession = useCallback(async (sessionId: string, sessionName: string) => {
    if (!confirm(`Are you sure you want to delete "${sessionName}"? This cannot be undone.`)) return;
    setDeletingSessionId(sessionId);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wsender-sessions-mentor-engineeros?action=delete-session&sessionId=${sessionId}`,
        {
          method: "DELETE",
          headers: await getFunctionAuthHeaders(),
        }
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to delete session");
      }
      // Remove from local DB mapping
      if (user) {
        await supabase
          .from("user_wsender_sessions")
          .delete()
          .eq("user_id", user.id)
          .eq("session_id", String(sessionId));
      }
      toast({ title: "Session deleted", description: `"${sessionName}" has been removed.` });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (selectedSessionId === sessionId) {
        setQrCode(null);
        setQrImage(null);
        setSelectedSessionId(null);
      }
    } catch (error: any) {
      console.error("Error deleting session:", error);
      toast({ title: "Error deleting session", description: error.message, variant: "destructive" });
    } finally {
      setDeletingSessionId(null);
    }
  }, [user, toast, selectedSessionId, getFunctionAuthHeaders]);

  useEffect(() => {
    fetchSettings();
  }, [user]);

  const saveSettings = async (key: string, value: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ key, value, user_id: user!.id }, { onConflict: "user_id,key" });

      if (error) throw error;
      toast({ title: "Settings saved successfully" });
    } catch (error: any) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWelcome = () => {
    saveSettings("welcome_message", { 
      text: welcomeMessageRef.current, 
      media_url: welcomeMediaUrlRef.current || null,
      media_urls: welcomeMediaUrlsRef.current,
      bypass_triggers: bypassTriggersRef.current,
      welcome_sequence: welcomeSequenceRef.current,
    });
  };

  // Sync sequence when media urls change
  const handleMediaUrlsChange = (newUrls: string[]) => {
    setWelcomeMediaUrls(newUrls);
    setWelcomeSequence(prev => {
      // Remove sequence items for removed media
      const filtered = prev.filter(item => 
        item.type === "text" || (item.type === "media" && newUrls.includes(item.url))
      );
      // Add new media items not yet in sequence
      const existingUrls = new Set(filtered.filter(i => i.type === "media").map(i => (i as any).url));
      const newItems = newUrls.filter(u => !existingUrls.has(u)).map(u => ({ type: "media" as const, url: u }));
      const newSequence = [...filtered, ...newItems];

      // Auto-save when media changes
      setTimeout(() => {
        saveSettings("welcome_message", { 
          text: welcomeMessageRef.current, 
          media_url: welcomeMediaUrlRef.current || null,
          media_urls: newUrls,
          bypass_triggers: bypassTriggersRef.current,
          welcome_sequence: newSequence,
        });
      }, 100);

      return newSequence;
    });
  };

  const moveSequenceItem = (index: number, direction: "up" | "down") => {
    setWelcomeSequence(prev => {
      const arr = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return arr;
      
      const temp = arr[index];
      arr[index] = arr[targetIndex];
      arr[targetIndex] = temp;
      
      // Auto-save when order changes
      setTimeout(() => {
        saveSettings("welcome_message", { 
          text: welcomeMessageRef.current, 
          media_url: welcomeMediaUrlRef.current || null,
          media_urls: welcomeMediaUrlsRef.current,
          bypass_triggers: bypassTriggersRef.current,
          welcome_sequence: arr,
        });
      }, 100);
      
      return arr;
    });
  };

  const addBypassTrigger = () => {
    const trimmed = newBypassTrigger.trim();
    if (!trimmed) return;
    if (bypassTriggers.includes(trimmed.toLowerCase())) {
      toast({ title: "Trigger already exists", variant: "destructive" });
      return;
    }
    setBypassTriggers(prev => [...prev, trimmed.toLowerCase()]);
    setNewBypassTrigger("");
  };

  const removeBypassTrigger = (trigger: string) => {
    setBypassTriggers(prev => prev.filter(t => t !== trigger));
  };

  const handleSavePayment = () => {
    const validAccounts = bankAccounts.filter(a => a.account_label || a.account_number || a.account_name);
    saveSettings("payment_info", {
      accounts: validAccounts.length > 0 ? validAccounts : bankAccounts,
      // Legacy compat
      bank_name: bankAccounts[0]?.account_label || "",
      account_number: bankAccounts[0]?.account_number || "",
      account_name: bankAccounts[0]?.account_name || "",
    });
  };

  const handleSaveAutoResponses = () => {
    saveSettings("auto_responses", { enabled: autoResponsesEnabled });
  };

  const handleSaveDelivery = () => {
    saveSettings("delivery_settings", { free_delivery_threshold: freeDeliveryThreshold });
  };

  const handleSaveNotifications = () => {
    saveSettings("order_notifications", { phone: notificationPhone });
  };

  const handleSaveOrderFollowup = () => {
    saveSettings("order_followup_message", { text: orderFollowupMessage, enabled: orderFollowupEnabled });
  };

  const handleSaveInactivityFollowup = () => {
    const hours = Number(inactivityFollowupHours);
    if (inactivityFollowupEnabled && (!Number.isFinite(hours) || hours <= 0)) {
      toast({ title: "Enter a valid time gap in hours", variant: "destructive" });
      return;
    }
    saveSettings("inactivity_followup", {
      text: inactivityFollowupMessage,
      enabled: inactivityFollowupEnabled,
      hours,
    });
  };

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "Webhook URL copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "connected":
        return "bg-green-100 text-green-800";
      case "disconnected":
      case "offline":
        return "bg-red-100 text-red-800";
      case "connecting":
      case "initializing":
        return "bg-yellow-100 text-yellow-800";
      case "need_qr":
      case "needs-qr":
      case "scan_qr_code":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Configure your WhatsApp chatbot behavior
          </p>
        </div>

        <Tabs defaultValue="whatsapp" className="space-y-6">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="whatsapp" className="flex-1 sm:flex-initial">WhatsApp</TabsTrigger>
            <TabsTrigger value="chatbot" className="flex-1 sm:flex-initial">Chatbot</TabsTrigger>
            <TabsTrigger value="payment" className="flex-1 sm:flex-initial">Payment</TabsTrigger>
            <TabsTrigger value="delivery" className="flex-1 sm:flex-initial">Delivery</TabsTrigger>
            <TabsTrigger value="staff" className="flex-1 sm:flex-initial">Staff</TabsTrigger>
          </TabsList>

          {/* WhatsApp Connection Tab */}
          <TabsContent value="whatsapp" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                   <div>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      WhatsApp Connection
                    </CardTitle>
                    <CardDescription>
                      Connect your WhatsApp account by scanning the QR code
                    </CardDescription>
                   </div>
                   <div className="flex gap-2">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => setShowCreateForm(!showCreateForm)}
                     >
                       <Plus className="mr-2 h-4 w-4" />
                       <span className="hidden sm:inline">New Session</span>
                       <span className="sm:hidden">New</span>
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={fetchSessions}
                       disabled={sessionsLoading}
                     >
                       {sessionsLoading ? (
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       ) : (
                         <RefreshCw className="mr-2 h-4 w-4" />
                       )}
                       <span className="hidden sm:inline">Load Sessions</span>
                       <span className="sm:hidden">Load</span>
                     </Button>
                   </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Create Session Form */}
                {showCreateForm && (
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                    <h4 className="font-medium text-sm">Create New WhatsApp Session</h4>
                    <div className="space-y-2">
                      <Label htmlFor="session-name">Session Name</Label>
                      <Input
                        id="session-name"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        placeholder="e.g., My Business WhatsApp"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A WhatsApp session will be created. After it starts, scan the QR with your phone to link it.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={createSession} disabled={creatingSession}>
                        {creatingSession ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Create Session
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowCreateForm(false); setNewSessionName(""); setNewSessionPhone(""); }}>
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This will create a new session and automatically connect it for receiving messages.
                    </p>
                  </div>
                )}

                {sessionsLoading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      No WhatsApp session yet. Click "New Session" to create one and link your WhatsApp.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm">Available Sessions</h4>
                    <div className="grid gap-3">
                      {sessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {session.status?.toLowerCase() === "connected" ? (
                              <Wifi className="h-5 w-5 text-green-600" />
                            ) : (
                              <WifiOff className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium">{session.name || `Session #${session.id}`}</p>
                              {session.phone && (
                                <p className="text-sm text-muted-foreground">{session.phone}</p>
                              )}
                            </div>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                              {session.status || "Unknown"}
                            </span>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            {session.status?.toLowerCase() !== "connected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 sm:flex-initial"
                                onClick={() => initializeAndFetchQr(session.id, session.status)}
                                disabled={qrLoading && selectedSessionId === session.id}
                              >
                                {qrLoading && selectedSessionId === session.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                <span className="hidden sm:inline">
                                  {session.status?.toLowerCase() === "disconnected" || session.status?.toLowerCase() === "stopped" || session.status?.toLowerCase() === "failed"
                                    ? "Reconnect"
                                    : "Get QR Code"}
                                </span>
                                <span className="sm:hidden">
                                  {session.status?.toLowerCase() === "disconnected" ? "Reconnect" : "QR"}
                                </span>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => deleteSession(session.id, session.name || `Session #${session.id}`)}
                              disabled={deletingSessionId === session.id}
                            >
                              {deletingSessionId === session.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* QR Code Display */}
                {(qrImage || qrCode) && (
                  <div className="border rounded-lg p-6 text-center space-y-4">
                    <h4 className="font-medium">Scan this QR Code with WhatsApp</h4>
                    <div className="flex justify-center bg-white p-4 rounded-lg inline-block mx-auto">
                      {qrImage ? (
                        <img
                          src={qrImage}
                          alt="WhatsApp linked device QR code"
                          className="h-64 w-64 object-contain"
                          onError={() => {
                            setQrImage(null);
                            toast({
                              title: "QR image was invalid",
                              description: "Refresh to request a new QR code.",
                              variant: "destructive",
                            });
                          }}
                        />
                      ) : qrCode ? (
                        <QRCodeSVG value={qrCode} size={256} level="M" />
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedSessionId && initializeAndFetchQr(selectedSessionId, "needs-qr")}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh QR Code
                    </Button>
                  </div>
                )}

                {qrLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">Generating QR code...</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chatbot" className="space-y-6">
            {/* Welcome Message */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Welcome Message
                </CardTitle>
                <CardDescription>
                  This message is sent when a customer first contacts your chatbot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="welcome">Message</Label>
                  <Textarea
                    id="welcome"
                    value={welcomeMessage}
                    onChange={(e) => {
                      setWelcomeMessage(e.target.value);
                      // Ensure text item exists in sequence
                      if (e.target.value.trim() && !welcomeSequence.some(i => i.type === "text")) {
                        setWelcomeSequence(prev => [{ type: "text" }, ...prev]);
                      }
                    }}
                    placeholder="Welcome! How can I help you today?"
                    rows={4}
                  />
                </div>
                <WelcomeMediaUpload
                  mediaUrls={welcomeMediaUrls}
                  onChange={handleMediaUrlsChange}
                  maxFiles={5}
                />

                {/* Sending Order */}
                {welcomeSequence.length > 1 && (
                  <div className="space-y-2 border-t pt-4">
                    <Label className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4" />
                      Sending Order
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Arrange the order in which welcome content is sent to the customer
                    </p>
                    <div className="space-y-2">
                      {welcomeSequence.map((item, index) => {
                        const isText = item.type === "text";
                        const mediaUrl = !isText ? (item as { type: "media"; url: string }).url : "";
                        const isAudio = /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(mediaUrl);
                        const isVideo = /\.(mp4|mov|avi|webm)$/i.test(mediaUrl);
                        const isDoc = /\.pdf$/i.test(mediaUrl);
                        const fileName = mediaUrl ? mediaUrl.split("/").pop()?.split("?")[0] || "media" : "";
                        
                        return (
                          <div
                            key={isText ? "text" : mediaUrl}
                            className="flex items-center gap-2 p-2 rounded-md border bg-card"
                          >
                            <span className="text-xs font-mono text-muted-foreground w-5 text-center">{index + 1}</span>
                            <div className="flex-1 min-w-0">
                              {isText ? (
                                <span className="text-sm font-medium flex items-center gap-1.5">
                                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                  Welcome Text
                                </span>
                              ) : (
                                <span className="text-sm flex items-center gap-1.5 truncate">
                                  {isAudio ? "🎵" : isVideo ? "🎬" : isDoc ? "📄" : "🖼️"}
                                  <span className="truncate">{fileName}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === 0}
                                onClick={() => moveSequenceItem(index, "up")}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === welcomeSequence.length - 1}
                                onClick={() => moveSequenceItem(index, "down")}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Bypass Triggers */}
                <div className="space-y-2 border-t pt-4">
                  <Label>Bypass Triggers</Label>
                  <p className="text-xs text-muted-foreground">
                    If a customer's first message contains any of these keywords, the welcome message and media will be skipped.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={newBypassTrigger}
                      onChange={(e) => setNewBypassTrigger(e.target.value)}
                      placeholder="e.g. reorder, urgent, support"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBypassTrigger())}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addBypassTrigger}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {bypassTriggers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {bypassTriggers.map((trigger) => (
                        <span
                          key={trigger}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium"
                        >
                          {trigger}
                          <button
                            type="button"
                            onClick={() => removeBypassTrigger(trigger)}
                            className="ml-1 text-muted-foreground hover:text-destructive"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Button onClick={handleSaveWelcome} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Message
                </Button>
              </CardContent>
            </Card>

            {/* Order Follow-up Message */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Order Follow-up Message
                    </CardTitle>
                    <CardDescription>
                      This message is automatically sent to the customer after their order is confirmed
                    </CardDescription>
                  </div>
                  <Switch
                    checked={orderFollowupEnabled}
                    onCheckedChange={setOrderFollowupEnabled}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="order-followup">Message</Label>
                  <Textarea
                    id="order-followup"
                    value={orderFollowupMessage}
                    onChange={(e) => setOrderFollowupMessage(e.target.value)}
                    placeholder="e.g. Thank you for your order! Visit our website: https://example.com"
                    rows={4}
                    disabled={!orderFollowupEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    This message will be sent as a separate message after the order confirmation reply.
                  </p>
                </div>
                <Button onClick={handleSaveOrderFollowup} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Follow-up
                </Button>
              </CardContent>
            </Card>

            {/* Inactivity Follow-up Message (Growth only) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Follow-up Notification
                      {!isGrowth && <Lock className="h-4 w-4 text-muted-foreground" />}
                    </CardTitle>
                    <CardDescription>
                      Automatically message customers who went quiet and never placed an order
                    </CardDescription>
                  </div>
                  {isGrowth && (
                    <Switch
                      checked={inactivityFollowupEnabled}
                      onCheckedChange={setInactivityFollowupEnabled}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isGrowth ? (
                  <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
                    <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
                    <p className="font-medium">Available on the Growth plan</p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to Growth to send automated follow-up notifications to customers who
                      haven't ordered yet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="inactivity-followup">Message</Label>
                      <Textarea
                        id="inactivity-followup"
                        value={inactivityFollowupMessage}
                        onChange={(e) => setInactivityFollowupMessage(e.target.value)}
                        placeholder="e.g. Still thinking about it? Let us know if you have any questions!"
                        rows={4}
                        disabled={!inactivityFollowupEnabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inactivity-hours">Send after (hours since customer's last message)</Label>
                      <Input
                        id="inactivity-hours"
                        type="number"
                        min={1}
                        value={inactivityFollowupHours}
                        onChange={(e) => setInactivityFollowupHours(e.target.value)}
                        className="max-w-[160px]"
                        disabled={!inactivityFollowupEnabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        Sent only once per customer until they reply again. Customers who placed an
                        order never receive it.
                      </p>
                    </div>
                    <Button onClick={handleSaveInactivityFollowup} disabled={saving}>
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Follow-up Notification
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Auto Responses */}
            <Card>
              <CardHeader>
                <CardTitle>Auto Responses</CardTitle>
                <CardDescription>
                  Enable or disable automatic AI-powered responses
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-responses">Enable Auto Responses</Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, the AI will automatically respond to customer messages
                    </p>
                  </div>
                  <Switch
                    id="auto-responses"
                    checked={autoResponsesEnabled}
                    onCheckedChange={setAutoResponsesEnabled}
                  />
                </div>
                <Button onClick={handleSaveAutoResponses} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Settings
                </Button>
              </CardContent>
            </Card>

            {/* Order Notifications */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Order Notifications
                </CardTitle>
                <CardDescription>
                  Receive WhatsApp notifications when a new order is placed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="notification-phone">Your WhatsApp Number</Label>
                  <Input
                    id="notification-phone"
                    value={notificationPhone}
                    onChange={(e) => setNotificationPhone(e.target.value)}
                    placeholder="e.g., 94771234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your phone number with country code (no + or spaces). You'll receive order details here when a customer places an order.
                  </p>
                </div>
                <Button onClick={handleSaveNotifications} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Notifications
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment Accounts
                    </CardTitle>
                    <CardDescription>
                      Add bank accounts, crypto wallets, or digital payment methods
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBankAccounts(prev => [...prev, { account_type: "bank", account_label: "", account_number: "", account_name: "" }])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Account
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {bankAccounts.map((account, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Account {index + 1}</h4>
                      {bankAccounts.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setBankAccounts(prev => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Account Type</Label>
                        <select
                          value={account.account_type}
                          onChange={(e) => {
                            const updated = [...bankAccounts];
                            updated[index] = { ...updated[index], account_type: e.target.value };
                            setBankAccounts(updated);
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="bank">Bank</option>
                          <option value="crypto">Crypto / Binance</option>
                          <option value="digital">Digital Wallet</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>{account.account_type === "crypto" ? "Platform / Network" : account.account_type === "digital" ? "Service Name" : "Bank Name"}</Label>
                        <Input
                          value={account.account_label}
                          onChange={(e) => {
                            const updated = [...bankAccounts];
                            updated[index] = { ...updated[index], account_label: e.target.value };
                            setBankAccounts(updated);
                          }}
                          placeholder={account.account_type === "crypto" ? "e.g., Binance, USDT TRC20" : account.account_type === "digital" ? "e.g., PayPal, Skrill" : "e.g., Commercial Bank"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{account.account_type === "crypto" ? "Wallet Address / ID" : "Account Number"}</Label>
                        <Input
                          value={account.account_number}
                          onChange={(e) => {
                            const updated = [...bankAccounts];
                            updated[index] = { ...updated[index], account_number: e.target.value };
                            setBankAccounts(updated);
                          }}
                          placeholder={account.account_type === "crypto" ? "e.g., TRC20 address" : "e.g., 1234567890"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Account Holder Name</Label>
                        <Input
                          value={account.account_name}
                          onChange={(e) => {
                            const updated = [...bankAccounts];
                            updated[index] = { ...updated[index], account_name: e.target.value };
                            setBankAccounts(updated);
                          }}
                          placeholder="e.g., Your Name"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button onClick={handleSavePayment} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Payment Info
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delivery Tab */}
          <TabsContent value="delivery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Free Delivery Threshold
                </CardTitle>
                <CardDescription>
                  Orders above this amount will get free delivery for physical products. Set to 0 to disable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Minimum Order Amount (LKR)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={freeDeliveryThreshold}
                    onChange={(e) => setFreeDeliveryThreshold(parseInt(e.target.value) || 0)}
                    placeholder="e.g. 5000"
                  />
                  <p className="text-xs text-muted-foreground">
                    {freeDeliveryThreshold > 0
                      ? `Orders of LKR ${freeDeliveryThreshold.toLocaleString()} or more will have free delivery.`
                      : "Free delivery threshold is disabled. Delivery fees will always apply."}
                  </p>
                </div>
                <Button onClick={handleSaveDelivery} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Delivery Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="staff" className="space-y-6">
            <StaffManager />
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}
