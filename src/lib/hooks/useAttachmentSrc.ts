'use client';

import { useEffect, useState } from 'react';
import type { Attachment } from '@/lib/types';
import { getAttachmentUrl } from '@/lib/storage/attachments';

// Cache en memoria de signed URLs por storagePath. Viven lo que vive la pestaña.
const urlCache = new Map<string, { url: string; expiresAt: number }>();
// Margen para renovar antes de que expire (10 min TTL, renovamos a los 9 min).
const REFRESH_MARGIN_MS = 60_000;

async function resolveUrl(storagePath: string): Promise<string> {
  const cached = urlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return cached.url;
  }
  const url = await getAttachmentUrl(storagePath);
  // La duración de la signed URL es 10 min (SIGNED_URL_TTL_SECONDS en attachments.ts).
  // No la expone el cliente, así que asumimos 10 min.
  urlCache.set(storagePath, { url, expiresAt: Date.now() + 10 * 60 * 1000 });
  return url;
}

/**
 * Hook que devuelve el src listo para un <img> / <audio> / <video>.
 * - Si el attachment tiene storagePath, pide una signed URL (con cache).
 * - Si no, usa dataUrl directamente.
 */
export function useAttachmentSrc(att: Attachment): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    att.storagePath ? null : att.dataUrl || null
  );

  useEffect(() => {
    let cancelled = false;
    if (!att.storagePath) {
      setSrc(att.dataUrl || null);
      return () => {
        cancelled = true;
      };
    }
    resolveUrl(att.storagePath)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err) => {
        console.warn('useAttachmentSrc:', err);
        if (!cancelled) setSrc(att.dataUrl || null);
      });
    return () => {
      cancelled = true;
    };
  }, [att.storagePath, att.dataUrl]);

  return src;
}
