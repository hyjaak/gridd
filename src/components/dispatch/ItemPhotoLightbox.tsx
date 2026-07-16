"use client";

import React, { useState } from "react";

interface ItemPhotoLightboxProps {
  url?: string;
}

export function ItemPhotoLightbox({ url }: ItemPhotoLightboxProps) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  return (
    <>
      <div className="mb-2">
        <img
          src={url}
          alt="Item"
          className="w-14 h-14 object-cover rounded-lg border border-black/10 cursor-pointer hover:opacity-80"
          onClick={() => setOpen(true)}
        />
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6 cursor-pointer"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt="Item full" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}