'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getAdminSession } from '@/lib/session';

// Função auxiliar para gerar IDs
function generatePublicId() {
  return `pub_${randomBytes(16).toString('hex')}`;
}

function generateSecret() {
  return `sk_live_${randomBytes(32).toString('hex')}`;
}

export async function createApplication(formData: FormData) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;

  if (!name || !slug) throw new Error('Name and Slug are required');

  try {
    // Cria a aplicação com os novos campos appId e appSecret
    const app = await db.application.create({
      data: {
        name,
        slug,
        appId: generatePublicId(),     // Campo novo
        appSecret: generateSecret(),   // Campo novo
        status: 'ACTIVE',
        hwidLock: true,
        minHwidLength: 16,
      },
    });

    revalidatePath('/applications');
    return { success: true, appId: app.appId, appSecret: app.appSecret };
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error('Slug already exists');
    }
    throw error;
  }
}

export async function deleteApplication(id: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  await db.application.delete({ where: { id } });
  revalidatePath('/applications');
}

export async function regenerateSecret(id: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  const newSecret = generateSecret();
  
  await db.application.update({
    where: { id },
    data: { appSecret: newSecret },
  });

  revalidatePath('/applications');
  return { success: true, newSecret };
}