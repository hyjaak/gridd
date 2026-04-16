"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebaseStorage } from "@/lib/firebase";

export async function uploadJobStepPhoto(
  jobId: string,
  stepKey: string,
  file: File,
): Promise<string> {
  const path = `jobs/${jobId}/steps/${stepKey}_${Date.now()}.jpg`;
  const r = ref(firebaseStorage, path);
  await uploadBytes(r, file);
  return getDownloadURL(r);
}
