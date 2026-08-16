import { NextRequest } from 'next/server';
import { db } from './db';
import bcrypt from 'bcryptjs';

export async function verifyAppCredentials(req: NextRequest) {
  const publicId = req.headers.get('x-app-public-id');
  const secret = req.headers.get('x-app-secret');

  if (!publicId || !secret) return null;

  const credential = await db.applicationCredential.findUnique({
    where: { publicId },
    include: { app: true }
  });

  if (!credential || credential.status !== 'ACTIVE') return null;

  const isValid = await bcrypt.compare(secret, credential.secretHash);
  if (!isValid) return null;

  if (credential.app.status !== 'ACTIVE') return null;

  await db.applicationCredential.update({
    where: { id: credential.id },
    data: { lastUsedAt: new Date() }
  });

  return { credential, app: credential.app };
}