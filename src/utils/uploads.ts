import path from 'path';
import { mkdir } from 'fs/promises';

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildUserUploadPaths(userId: string, section: string, filename: string) {
  const safeUserId = sanitizePathSegment(userId);
  const safeSection = sanitizePathSegment(section);

  const relativeDir = path.posix.join('uploads', `user_${safeUserId}`, safeSection);
  const publicDir = path.resolve('public', relativeDir);
  const publicPath = `/${path.posix.join(relativeDir, filename)}`;
  const filePath = path.resolve(publicDir, filename);

  return { publicDir, publicPath, filePath };
}

export async function ensureUserUploadDir(userId: string, section: string) {
  const safeUserId = sanitizePathSegment(userId);
  const safeSection = sanitizePathSegment(section);
  const publicDir = path.resolve('public', 'uploads', `user_${safeUserId}`, safeSection);
  await mkdir(publicDir, { recursive: true });
  return publicDir;
}
