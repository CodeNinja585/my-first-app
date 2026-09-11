import { z } from 'zod';

const envSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_JWT_KEY: z.string().min(1, 'CLERK_JWT_KEY is required'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed:');
  parsed.error.errors.forEach((err) => {
    console.error(`  ${err.path[0]}: ${err.message}`);
  });
  process.exit(1);
}

const env = parsed.data;

// Validate Clerk keys
if (env.CLERK_SECRET_KEY.startsWith('sk_live_') && env.NODE_ENV !== 'production') {
  console.error('Error: CLERK_SECRET_KEY is a live key but NODE_ENV is not production');
  process.exit(1);
}

if (env.CLERK_SECRET_KEY.startsWith('sk_test_') && env.NODE_ENV === 'production') {
  console.error('Error: CLERK_SECRET_KEY is a test key but NODE_ENV is production');
  process.exit(1);
}

export { env };
