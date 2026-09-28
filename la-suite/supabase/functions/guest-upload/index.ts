import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "video/mp4","video/quicktime","video/webm",
  "audio/webm","audio/mpeg","audio/wav","audio/x-wav","audio/mp4","audio/ogg",
  "image/jpeg","image/png","image/webp","image/heic","image/heif",
]);
const TYPE_GROUPS: Record<string,"video"|"audio"|"image"> = {
  "video/mp4":"video","video/quicktime":"video","video/webm":"video",
  "audio/webm":"audio","audio/mpeg":"audio","audio/wav":"audio","audio/x-wav":"audio","audio/mp4":"audio","audio/ogg":"audio",
  "image/jpeg":"image","image/png":"image","image/webp":"image","image/heic":"image","image/heif":"image",
};
const EXTENSIONS: Record<string,string> = {
  "video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm",
  "audio/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg",
  "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif",
};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
function parseDelivery(v:unknown){if(!v)return new Date().toISOString();const d=new Date(String(v));if(Number.isNaN(d.getTime()))throw new Error("Invalid delivery date");return d.toISOString()}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const body=await req.json(),action=String(body?.action||""),guestToken=String(body?.guest_token||"");
    if(!guestToken||guestToken.length<20)return json({error:"Invalid capsule token"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:capsule,error:capsuleError}=await db.from("capsules").select("id,intro_path,status").eq("guest_token",guestToken).maybeSingle();
    if(capsuleError||!capsule||capsule.status!=="active")return json({error:"Capsule not found"},404);

    if(action==="get_intro"){
      if(!capsule.intro_path)return json({ok:true,signed_url:null});
      const{data,error}=await db.storage.from("capsule-media").createSignedUrl(capsule.intro_path,3600);
      if(error)throw error;return json({ok:true,signed_url:data?.signedUrl||null,media_type:/\.(jpg|jpeg|png|webp)$/i.test(capsule.intro_path)?"image":"video"});
    }

    if(action==="submit_text"){
      const guestName=String(body?.guest_name||"").trim().slice(0,80),messageText=String(body?.message_text||"").trim().slice(0,4000),deliveryAt=parseDelivery(body?.delivery_at);
      if(!guestName||!messageText)return json({error:"Name and message are required"},400);
      const{error}=await db.from("messages").insert({capsule_id:capsule.id,guest_name:guestName,message_text:messageText,media_type:"text",delivery_at:deliveryAt});
      if(error)throw error;return json({ok:true});
    }

    if(action==="init_media"){
      const guestName=String(body?.guest_name||"").trim().slice(0,80),messageText=String(body?.message_text||"").trim().slice(0,4000);
      const fileType=String(body?.file_type||""),fileSize=Number(body?.file_size||0),deliveryAt=parseDelivery(body?.delivery_at);
      if(!guestName)return json({error:"Name is required"},400);
      if(!ALLOWED_TYPES.has(fileType))return json({error:"Unsupported media type"},400);
      if(!Number.isFinite(fileSize)||fileSize<=0||fileSize>MAX_BYTES)return json({error:"Media too large"},400);
      const messageId=crypto.randomUUID(),mediaType=TYPE_GROUPS[fileType],path=`${capsule.id}/${messageId}/media.${EXTENSIONS[fileType]||"bin"}`;
      const{error:insertError}=await db.from("messages").insert({id:messageId,capsule_id:capsule.id,guest_name:guestName,message_text:messageText||null,media_type:mediaType,media_path:null,delivery_at:deliveryAt});
      if(insertError)throw insertError;
      const{data:signed,error:signedError}=await db.storage.from("capsule-media").createSignedUploadUrl(path);
      if(signedError||!signed){await db.from("messages").delete().eq("id",messageId);throw signedError||new Error("Unable to create upload URL")}
      return json({ok:true,message_id:messageId,media_type:mediaType,path,token:signed.token});
    }

    if(action==="finalize_media"){
      const messageId=String(body?.message_id||""),path=String(body?.path||"");
      if(!messageId||!path.startsWith(capsule.id+"/"))return json({error:"Invalid upload"},400);
      const{data:message}=await db.from("messages").select("id,capsule_id").eq("id",messageId).eq("capsule_id",capsule.id).maybeSingle();
      if(!message)return json({error:"Message not found"},404);
      const{data:objects,error:listError}=await db.storage.from("capsule-media").list(`${capsule.id}/${messageId}`);
      if(listError||!objects?.some(o=>path.endsWith("/"+o.name)))return json({error:"Uploaded file not found"},409);
      const{error}=await db.from("messages").update({media_path:path}).eq("id",messageId);
      if(error)throw error;return json({ok:true});
    }
    return json({error:"Unknown action"},400);
  }catch(error){console.error(error);return json({error:error instanceof Error?error.message:"Internal error"},500)}
});