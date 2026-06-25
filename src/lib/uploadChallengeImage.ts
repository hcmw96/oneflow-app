import { compressImageIfNeeded } from "@/lib/imageCompress";
import { getUser, supabase } from "@/lib/supabase";

const BUCKET = "email-assets";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

/** Upload a movement challenge hero image; returns a public HTTPS URL. */
export async function uploadChallengeImage(file: File): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("Sign in to upload images");

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }

  const blob = await compressImageIfNeeded(file, 1_200_000);
  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const ext = ALLOWED_EXT.has(rawExt) ? rawExt : "jpg";
  const path = `challenge/${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const contentType =
    blob.type || (ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg");

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    cacheControl: "31536000",
    upsert: false,
    contentType,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Could not resolve image URL");
  return data.publicUrl;
}
