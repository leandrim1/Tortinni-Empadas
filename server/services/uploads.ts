import { put, del } from '@vercel/blob';
import { env } from '../lib/env';
import { badRequest, serviceUnavailable } from '../lib/errors';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../../shared/constants';

export interface UploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

/** Assinaturas de arquivo: o content-type declarado pelo cliente não basta. */
const MAGIC: { type: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    type: 'image/avif',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && b.subarray(8, 12).toString('ascii').startsWith('avif'),
  },
];

export function detectImageType(buffer: Buffer): string | undefined {
  if (buffer.length < 12) return undefined;
  return MAGIC.find((m) => m.test(buffer))?.type;
}

export function sanitizeFilename(filename: string): string {
  const base = filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-80);
  return base || 'imagem';
}

/**
 * Upload para o Vercel Blob. O token é lido apenas no servidor —
 * o navegador nunca o recebe.
 */
export async function uploadImage(
  buffer: Buffer,
  options: { filename: string; folder: string; declaredType?: string },
): Promise<UploadResult> {
  if (buffer.length === 0) throw badRequest('Arquivo vazio.');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw badRequest(`Imagem acima do limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  const detected = detectImageType(buffer);
  if (!detected || !ALLOWED_IMAGE_TYPES.includes(detected as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw badRequest('Formato não suportado. Envie JPG, PNG, WebP ou AVIF.');
  }
  if (options.declaredType && options.declaredType.split(';')[0]?.trim() !== detected) {
    throw badRequest('O conteúdo do arquivo não corresponde ao tipo informado.');
  }

  if (!env.blobConfigured) {
    throw serviceUnavailable(
      'Armazenamento de imagens não configurado. Defina BLOB_READ_WRITE_TOKEN para habilitar o upload.',
    );
  }

  const extension = detected.split('/')[1] ?? 'jpg';
  const safeName = sanitizeFilename(options.filename).replace(/\.[^.]+$/, '');
  const pathname = `tortinni/${options.folder}/${Date.now()}-${safeName}.${extension}`;

  const blob = await put(pathname, buffer, {
    access: 'public',
    contentType: detected,
    token: env.blobToken,
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  return { url: blob.url, pathname: blob.pathname, contentType: detected, size: buffer.length };
}

export async function deleteImage(url: string): Promise<void> {
  if (!env.blobConfigured) return;
  await del(url, { token: env.blobToken });
}
