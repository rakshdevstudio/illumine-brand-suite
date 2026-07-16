import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const encoder = new TextEncoder();

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SUPABASE_URL = () => getRequiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = () => getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const R2_ACCESS_KEY_ID = () => getRequiredEnv("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = () => getRequiredEnv("R2_SECRET_ACCESS_KEY");
const R2_BUCKET_NAME = () => getRequiredEnv("R2_BUCKET_NAME");
const R2_ENDPOINT = () => getRequiredEnv("R2_ENDPOINT").replace(/\/+$/, "");
const R2_PUBLIC_URL = () => getRequiredEnv("R2_PUBLIC_URL").replace(/\/+$/, "");

const normalizeStoragePath = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\/+/, "");
};

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const encodeObjectKey = (storagePath: string) =>
  normalizeStoragePath(storagePath)
    .split("/")
    .filter(Boolean)
    .map(encodeRfc3986)
    .join("/");

const buildPublicUrl = (storagePath: string) => `${R2_PUBLIC_URL()}/${normalizeStoragePath(storagePath)}`;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256 = async (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
};

const sha256Hex = async (value: Uint8Array | string) => toHex(await sha256(value));

const importHmacKey = async (key: Uint8Array) =>
  crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

const hmacSha256 = async (key: Uint8Array, value: string) => {
  const cryptoKey = await importHmacKey(key);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
  return new Uint8Array(signature);
};

const getSigningKey = async (secretAccessKey: string, shortDate: string) => {
  const kDate = await hmacSha256(encoder.encode(`AWS4${secretAccessKey}`), shortDate);
  const kRegion = await hmacSha256(kDate, "auto");
  const kService = await hmacSha256(kRegion, "s3");
  return hmacSha256(kService, "aws4_request");
};

const buildSupabaseAdmin = () =>
  createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY()}`,
      },
    },
  });

const assertBackofficeCaller = async (req: Request) => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const supabaseAdmin = buildSupabaseAdmin();
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: role, error: roleError } = await supabaseAdmin.rpc("get_user_role", {
    _user_id: user.id,
  });

  if (roleError) {
    throw new Response(JSON.stringify({ error: "Unable to verify role" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!role || !["super_admin", "admin", "illume_team", "staff", "branch_staff"].includes(role)) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

const sendR2Request = async ({
  method,
  storagePath,
  body,
  contentType,
}: {
  method: "PUT" | "DELETE";
  storagePath: string;
  body?: Uint8Array;
  contentType?: string;
}) => {
  const endpoint = new URL(R2_ENDPOINT());
  const bucket = R2_BUCKET_NAME();
  const objectKey = encodeObjectKey(storagePath);
  const canonicalUri = `/${bucket}/${objectKey}`;
  const requestUrl = `${endpoint.origin}${canonicalUri}`;

  const now = new Date();
  const isoString = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = `${isoString.slice(0, 8)}T${isoString.slice(9, 15)}Z`;
  const shortDate = amzDate.slice(0, 8);
  const payload = body ?? new Uint8Array();
  const payloadHash = await sha256Hex(payload);

  const canonicalHeadersEntries: Array<[string, string]> = [
    ["host", endpoint.host],
    ["x-amz-content-sha256", payloadHash],
    ["x-amz-date", amzDate],
  ];

  if (contentType) {
    canonicalHeadersEntries.push(["content-type", contentType]);
  }

  canonicalHeadersEntries.sort(([left], [right]) => left.localeCompare(right));

  const canonicalHeaders = canonicalHeadersEntries
    .map(([key, value]) => `${key}:${value.trim()}\n`)
    .join("");
  const signedHeaders = canonicalHeadersEntries.map(([key]) => key).join(";");

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${shortDate}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(R2_SECRET_ACCESS_KEY(), shortDate);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const headers = new Headers({
    Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID()}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    Host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const response = await fetch(requestUrl, {
    method,
    headers,
    body: method === "PUT" ? payload : undefined,
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`R2 ${method} failed (${response.status}): ${responseText || response.statusText}`);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    await assertBackofficeCaller(req);

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = String(formData.get("action") ?? "").trim();
      const storagePath = normalizeStoragePath(formData.get("storagePath"));
      const file = formData.get("file");

      if (action !== "upload") {
        return new Response(JSON.stringify({ error: "Unsupported action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!storagePath) {
        return new Response(JSON.stringify({ error: "storagePath is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "file is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fileBytes = new Uint8Array(await file.arrayBuffer());

      await sendR2Request({
        method: "PUT",
        storagePath,
        body: fileBytes,
        contentType: file.type || "application/octet-stream",
      });

      return new Response(
        JSON.stringify({
          storagePath,
          publicUrl: buildPublicUrl(storagePath),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = await req.json();
    const action = String(payload?.action ?? "").trim();
    const storagePath = normalizeStoragePath(payload?.storagePath);

    if (action !== "delete") {
      return new Response(JSON.stringify({ error: "Unsupported action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!storagePath) {
      return new Response(JSON.stringify({ error: "storagePath is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendR2Request({
      method: "DELETE",
      storagePath,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
