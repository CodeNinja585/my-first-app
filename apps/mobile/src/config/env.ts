import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required'),
  EXPO_PUBLIC_API_URL: z.string().url('EXPO_PUBLIC_API_URL must be a valid URL').optional(),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});

if (!parsed.success) {
  console.error('Environment validation failed:');
  parsed.error.errors.forEach((err) => {
    console.error(`  ${err.path[0]}: ${err.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
