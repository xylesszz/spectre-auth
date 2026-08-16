import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const licenseSchema = z.object({
  key: z.string().min(10),
  hwid: z.string().min(1),
  username: z.string().optional(),
});