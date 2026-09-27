import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const guestToken = String(body?.guest_token || "");

    if (!guestToken || guestToken.length < 20) return json({ error: "Invalid capsule token" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: capsule, error: capsuleError } = await db
      .from("capsules")
      .select("id")
      .eq("guest_token", guestToken)
      .maybeSingle();

    if (capsuleError || !capsule) return json({ error: "Capsule not found" }, 404);

    if (action === "submit_text") {
      const guestName = String(body?.guest_name || "").trim().slice(0, 80);
      const messageText = String(body?.message_text || "").trim().slice(0, 4000);
      if (!guestName || !messageText) return json({ error: "Name and message are required" }, 400);

      const { error } = await db.from("messages").insert({
        capsule_id: capsule.id,
        guest_name: guestName,
        message_text: messageText,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "init_video") {
      const guestName = String(body?.guest_name || "").trim().slice(0, 80);
      const messageText = String(body?.message_text || "").trim().slice(0, 4000);
      const fileType = String(body?.file_type || "");
      const fileSize = Number(body?.file_size || 0);

      if (!guestName) return json({ error: "Name is required" }, 400);
      if (!ALLOWED_TYPES.has(fileType)) return json({ error: "Unsupported video type" }, 400);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
        return json({ error: "Video too large" }, 400);
      }

      const messageId = crypto.randomUUID();
      const extension = fileType === "video/quicktime" ? "mov" : fileType === "video/webm" ? "webm" : "mp4";
      const path = `${capsule.id}/${messageId}/video.${extension}`;

      const { error: insertError } = await db.from("messages").insert({
        id: messageId,
        capsule_id: capsule.id,
        guest_name: guestName,
        message_text: messageText || null,
        video_path: null,
      });
      if (insertError) throw insertError;

      const { data: signed, error: signedError } = await db.storage
        .from("capsule-media")
        .createSignedUploadUrl(path);

      if (signedError || !signed) {
        await db.from("messages").delete().eq("id", messageId);
        throw signedError || new Error("Unable to create upload URL");
      }

      return json({
        ok: true,
        message_id: messageId,
        path,
        token: signed.token,
      });
    }

    if (action === "finalize_video") {
      const messageId = String(body?.message_id || "");
      const path = String(body?.path || "");
      if (!messageId || !path.startsWith(capsule.id + "/")) return json({ error: "Invalid upload" }, 400);

      const { data: message } = await db
        .from("messages")
        .select("id,capsule_id")
        .eq("id", messageId)
        .eq("capsule_id", capsule.id)
        .maybeSingle();

      if (!message) return json({ error: "Message not found" }, 404);

      const { data: objects, error: listError } = await db.storage
        .from("capsule-media")
        .list(`${capsule.id}/${messageId}`);

      if (listError || !objects?.some((o) => path.endsWith("/" + o.name))) {
        return json({ error: "Uploaded file not found" }, 409);
      }

      const { error } = await db.from("messages").update({ video_path: path }).eq("id", messageId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Internal error" }, 500);
  }
});
