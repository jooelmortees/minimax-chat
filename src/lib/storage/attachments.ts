/**
 * Helpers para subir y servir adjuntos (imágenes, audio, video, files) a
 * Supabase Storage. Bucket: 'chat-attachments' (privado).
 *
 * Convención de paths: 'user_id/<attachment_id>.<ext>'
 * - Permite RLS por prefijo en storage.objects.
 * - El attachment_id es un nanoid generado en cliente.
 *
 * Las descargas usan signed URLs de corta duración. No exponemos URLs públicas
 * porque el bucket es privado.
 */

import { nanoid } from 'nanoid';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import type { Attachment, AttachmentKind } from '@/lib/types';

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 min

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gfif': 'gif',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

function kindFor(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

function extensionFor(mime: string, name: string): string {
  const fromName = name.includes('.') ? name.split('.').pop() : undefined;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  return EXT_BY_MIME[mime] ?? 'bin';
}

function bytesToBase64(bytes: Uint8Array): string {
  // Más seguro en navegador que btoa(String.fromCharCode(...)) con payloads grandes.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as number[]
    );
  }
  return btoa(binary);
}

/**
 * Sube un archivo a Storage y devuelve el Attachment listo para guardar en
 * la tabla `attachments` (sin `message_id`, eso lo rellena quien lo asocie).
 */
export async function uploadAttachment(
  file: File | Blob,
  name: string,
  mimeType: string
): Promise<{
  attachment: Omit<Attachment, 'dataUrl'> & { storagePath: string };
}> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const id = `att_${nanoid(12)}`;
  const ext = extensionFor(mimeType, name);
  const storagePath = `${user.id}/${id}.${ext}`;
  const kind = kindFor(mimeType);
  const size = file.size;

  const { error: upErr } = await supabase.storage
    .from('chat-attachments')
    .upload(storagePath, file, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });
  if (upErr) throw new Error(`uploadAttachment: ${upErr.message}`);

  return {
    attachment: {
      id,
      kind,
      mimeType,
      name,
      size,
      storagePath,
    },
  };
}

/**
 * Inserta metadata en la tabla attachments.
 */
export async function recordAttachment(
  messageId: string | null,
  att: { id: string; kind: AttachmentKind; mimeType: string; name: string; size: number; storagePath: string }
): Promise<void> {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await supabase.from('attachments').insert({
    id: att.id,
    user_id: user.id,
    message_id: messageId,
    kind: att.kind,
    mime_type: att.mimeType,
    name: att.name,
    size: att.size,
    storage_path: att.storagePath,
  });
  if (error) throw new Error(`recordAttachment: ${error.message}`);
}

/**
 * Genera una signed URL de corta duración para servir el adjunto.
 */
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`getAttachmentUrl: ${error.message}`);
  return data.signedUrl;
}

/**
 * Descarga el binario y lo convierte a dataURL (útil para adjuntos pequeños
 * como imágenes en mensajes históricos o para re-render tras refresh).
 */
export async function downloadAttachmentAsDataUrl(
  storagePath: string
): Promise<string> {
  const supabase = createSupabaseBrowser();
  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .download(storagePath);
  if (error) throw new Error(`downloadAttachment: ${error.message}`);

  const blob = data as Blob;
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const base64 = bytesToBase64(bytes);
  return `data:${blob.type};base64,${base64}`;
}

export async function deleteAttachment(storagePath: string): Promise<void> {
  const supabase = createSupabaseBrowser();
  const { error } = await supabase.storage
    .from('chat-attachments')
    .remove([storagePath]);
  if (error) throw new Error(`deleteAttachment: ${error.message}`);
}
