import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const assetlinks = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "io.buildstart.dashapp",
      sha256_cert_fingerprints: [
        "D1:14:E3:AA:B8:8B:CB:C9:F0:DD:CD:6A:75:B5:99:D6:5F:50:DD:B9:37:CA:A7:EF:39:95:99:87:66:C2:B2:2D",
        "52:41:1A:71:B5:30:43:69:D6:43:01:26:AF:49:BC:A4:A5:76:03:9E:D3:85:C1:C6:8F:5A:1B:0B:42:65:4B:B5"
      ]
    }
  }
];

serve(async () => {
  return new Response(JSON.stringify(assetlinks), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
});
