import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ErrorStage =
  | "configuration"
  | "authentication"
  | "authorization"
  | "upload_to_r2"
  | "delete_from_r2"
  | "public_url"
  | "unexpected";

type JsonErrorBody = {
  success: false;
  stage: ErrorStage;
  message: string;
  details?: string;
  stack?: string;
};

const isDevelopment = () =>
  String(Deno.env.get("DENO_DEPLOYMENT_ID") ?? "").trim().length === 0;

const logStage = (stage: string, message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.log(`[${stage}] ${message}`, details);
    return;
  }
  console.log(`[${stage}] ${message}`);
};

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const sanitizeErrorDetails = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const createStructuredError = (
  status: number,
  stage: ErrorStage,
  message: string,
  details?: string,
  error?: unknown,
) => {
  const body: JsonErrorBody = {
    success: false,
    stage,
    message,
    ...(details ? { details } : {}),
    ...(isDevelopment() && error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };

  return createJsonResponse(body, status);
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const SUPABASE_URL = () => getRequiredEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = () => getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const R2_ACCOUNT_ID = () => getRequiredEnv("R2_ACCOUNT_ID");
const R2_ACCESS_KEY_ID = () => getRequiredEnv("R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = () => getRequiredEnv("R2_SECRET_ACCESS_KEY");
const R2_BUCKET_NAME = () => getRequiredEnv("R2_BUCKET_NAME");
const R2_ENDPOINT = () => getRequiredEnv("R2_ENDPOINT").replace(/\/+$/, "");
const R2_PUBLIC_URL = () => getRequiredEnv("R2_PUBLIC_URL").replace(/\/+$/, "");

const validateConfiguration = () => {
  logStage("REQUEST", "Request received");
  logStage("CONFIG", "Reading environment variables");

  const config = {
    supabaseUrl: SUPABASE_URL(),
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY(),
    r2AccountId: R2_ACCOUNT_ID(),
    r2AccessKeyId: R2_ACCESS_KEY_ID(),
    r2SecretAccessKey: R2_SECRET_ACCESS_KEY(),
    r2BucketName: R2_BUCKET_NAME(),
    r2Endpoint: R2_ENDPOINT(),
    r2PublicUrl: R2_PUBLIC_URL(),
  };

  let endpoint: URL;
  try {
    endpoint = new URL(config.r2Endpoint);
  } catch (error) {
    throw createStructuredError(
      500,
      "configuration",
      "R2 endpoint is not a valid URL",
      sanitizeErrorDetails(error),
      error,
    );
  }

  if (!endpoint.hostname.includes(config.r2AccountId)) {
    throw createStructuredError(
      500,
      "configuration",
      "R2 endpoint hostname does not contain the configured account ID",
      `endpoint=${endpoint.hostname}`,
    );
  }

  logStage("CONFIG", "Configuration validated", {
    R2_ACCOUNT_ID: "PRESENT",
    R2_ACCESS_KEY_ID: "PRESENT",
    R2_SECRET_ACCESS_KEY: "PRESENT",
    R2_BUCKET_NAME: config.r2BucketName,
    R2_ENDPOINT: config.r2Endpoint,
    R2_PUBLIC_URL: config.r2PublicUrl,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: "PRESENT",
  });

  return config;
};

const normalizeStoragePath = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\/+/, "");
};

const buildPublicUrl = (storagePath: string) => `${R2_PUBLIC_URL()}/${normalizeStoragePath(storagePath)}`;

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

const buildR2Client = () =>
  new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID(),
    secretAccessKey: R2_SECRET_ACCESS_KEY(),
    service: "s3",
    region: "auto",
  });

const assertBackofficeCaller = async (req: Request) => {
  logStage("AUTH", "Checking Supabase session");

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw createStructuredError(401, "authentication", "Missing Authorization header");
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");

  try {
    const supabaseAdmin = buildSupabaseAdmin();
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      throw createStructuredError(
        401,
        "authentication",
        "Unable to authenticate Supabase user",
        authError ? authError.message : "User not found",
      );
    }

    const { data: role, error: roleError } = await supabaseAdmin.rpc("get_user_role", {
      _user_id: user.id,
    });

    if (roleError) {
      throw createStructuredError(
        500,
        "authentication",
        "Unable to resolve user role",
        roleError.message,
      );
    }

    logStage("AUTH", "Authenticated user", {
      id: user.id,
      email: user.email ?? null,
      role: role ?? null,
    });

    if (!role || !["super_admin", "admin", "illume_team", "staff", "branch_staff"].includes(role)) {
      throw createStructuredError(403, "authorization", "User role is not permitted", `role=${role ?? "unknown"}`);
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    throw createStructuredError(
      500,
      "authentication",
      "Supabase authentication check failed",
      sanitizeErrorDetails(error),
      error,
    );
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
  const objectKey = normalizeStoragePath(storagePath);
  const endpoint = new URL(R2_ENDPOINT());
  const bucket = R2_BUCKET_NAME();
  const requestUrl = `${endpoint.origin}/${bucket}/${objectKey}`;

  logStage(method === "PUT" ? "UPLOAD_TO_R2" : "DELETE_FROM_R2", "Preparing R2 request", {
    bucket,
    endpoint: R2_ENDPOINT(),
    objectKey,
    contentType: contentType ?? null,
    bodyBytes: body?.byteLength ?? 0,
    region: "auto",
    signingMethod: "aws4fetch",
    forcePathStyle: true,
  });

  try {
    const awsClient = buildR2Client();
    const headers = new Headers();

    if (contentType) {
      headers.set("content-type", contentType);
    }

    logStage(method === "PUT" ? "UPLOAD_TO_R2" : "DELETE_FROM_R2", "Signing and sending R2 request", {
      requestUrl,
      accessKeyId: "PRESENT",
      secretAccessKey: "PRESENT",
    });

    const response = await awsClient.fetch(requestUrl, {
      method,
      headers,
      body: method === "PUT" ? body : undefined,
      aws: {
        signQuery: false,
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      logStage(method === "PUT" ? "UPLOAD_TO_R2" : "DELETE_FROM_R2", "R2 request failed", {
        status: response.status,
        responseText,
      });
      throw new Error(`R2 ${method} failed (${response.status}): ${responseText || response.statusText}`);
    }

    logStage(method === "PUT" ? "UPLOAD_TO_R2" : "DELETE_FROM_R2", "R2 request succeeded");
  } catch (error) {
    throw createStructuredError(
      500,
      method === "PUT" ? "upload_to_r2" : "delete_from_r2",
      method === "PUT" ? "Failed to upload object to R2" : "Failed to delete object from R2",
      sanitizeErrorDetails(error),
      error,
    );
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createJsonResponse({ success: false, message: "Method not allowed" }, 405);
  }

  try {
    validateConfiguration();
    await assertBackofficeCaller(req);

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = String(formData.get("action") ?? "").trim();
      const storagePath = normalizeStoragePath(formData.get("storagePath"));
      const file = formData.get("file");

      logStage("REQUEST", "Parsed multipart payload", {
        action,
        storagePath,
        hasFile: file instanceof File,
      });

      if (action !== "upload") {
        return createStructuredError(400, "upload_to_r2", "Unsupported multipart action", `action=${action}`);
      }

      if (!storagePath) {
        return createStructuredError(500, "configuration", "storagePath is required");
      }

      if (!(file instanceof File)) {
        return createStructuredError(500, "configuration", "file is required");
      }

      const fileBytes = new Uint8Array(await file.arrayBuffer());

      await sendR2Request({
        method: "PUT",
        storagePath,
        body: fileBytes,
        contentType: file.type || "application/octet-stream",
      });

      let publicUrl: string;
      try {
        publicUrl = buildPublicUrl(storagePath);
      } catch (error) {
        return createStructuredError(
          500,
          "public_url",
          "Failed to build public URL",
          sanitizeErrorDetails(error),
          error,
        );
      }

      logStage("PUBLIC_URL", "Generated public URL", {
        storagePath,
        publicUrl,
      });

      return createJsonResponse({
        success: true,
        storagePath,
        publicUrl,
      });
    }

    const payload = await req.json();
    const action = String(payload?.action ?? "").trim();
    const storagePath = normalizeStoragePath(payload?.storagePath);

    logStage("REQUEST", "Parsed JSON payload", {
      action,
      storagePath,
    });

    if (action !== "delete") {
      return createStructuredError(400, "delete_from_r2", "Unsupported JSON action", `action=${action}`);
    }

    if (!storagePath) {
      return createStructuredError(500, "configuration", "storagePath is required");
    }

    await sendR2Request({
      method: "DELETE",
      storagePath,
    });

    return createJsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return createStructuredError(
      500,
      "unexpected",
      "Unhandled edge function error",
      sanitizeErrorDetails(error),
      error,
    );
  }
});
