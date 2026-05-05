"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildBookStoragePath } from "@/lib/books";
import { createClient } from "@/lib/supabase/server";

export type UploadBookActionState = {
  error: string | null;
};

function getTextField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function uploadBookAction(
  _prevState: UploadBookActionState,
  formData: FormData,
): Promise<UploadBookActionState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be signed in to upload a book." };
  }

  const title = getTextField(formData, "title");
  const authorValue = getTextField(formData, "author");
  const languageFrom = getTextField(formData, "language_from") || "en";
  const languageTo = getTextField(formData, "language_to") || "es";
  const file = formData.get("file");

  if (!title) {
    return { error: "Title is required." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please select an EPUB file." };
  }

  const lowerCaseName = file.name.toLowerCase();

  if (!lowerCaseName.endsWith(".epub")) {
    return { error: "Only .epub files are supported." };
  }

  const { data: bookRecord, error: insertError } = await supabase
    .from("books")
    .insert({
      user_id: user.id,
      title,
      author: authorValue || null,
      language_from: languageFrom,
      language_to: languageTo,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insertError || !bookRecord) {
    return { error: "Could not create the book record." };
  }

  const bookId = bookRecord.id as string;
  const filePath = buildBookStoragePath(user.id, bookId);

  const { error: uploadError } = await supabase.storage
    .from("books")
    .upload(filePath, await file.arrayBuffer(), {
      contentType: file.type || "application/epub+zip",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("books").delete().eq("id", bookId).eq("user_id", user.id);
    return { error: "Could not upload the EPUB file." };
  }

  const { error: updateError } = await supabase
    .from("books")
    .update({ file_path: filePath })
    .eq("id", bookId)
    .eq("user_id", user.id);

  if (updateError) {
    await supabase.storage.from("books").remove([filePath]);
    await supabase.from("books").delete().eq("id", bookId).eq("user_id", user.id);
    return { error: "Upload succeeded, but saving the book failed." };
  }

  revalidatePath("/library");
  redirect("/library");
}
