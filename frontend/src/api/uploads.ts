import { api } from "./client";

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post<{ success: boolean; data: { url: string } }>("/uploads/image", form);
  return res.data.data.url;
}
