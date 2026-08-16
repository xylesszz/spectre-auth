// lib/webhook.ts
import { db } from './db';

export async function triggerWebhook(event: string, payload: any) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return; // Webhook não configurado

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...payload
      }),
    });
  } catch (error) {
    console.error('Webhook dispatch failed:', error);
    // Não falhar a requisição principal se o webhook falhar
  }
}