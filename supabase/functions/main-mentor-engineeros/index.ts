import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  let functionName = pathParts[0];
  if (pathParts[0] === 'functions' && pathParts[1] === 'v1') {
    functionName = pathParts[2];
  }
  
  if (!functionName || functionName === 'main') {
    return new Response("BuildStart.io edge-runtime router OK", { status: 200 });
  }

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${functionName}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(Deno.env.toObject())
    });
    
    return await worker.fetch(req);
  } catch (e) {
    console.error(`Error loading function ${functionName}:`, e);
    return new Response(JSON.stringify({ error: `Function ${functionName} not found or failed to start: ${e.message}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
