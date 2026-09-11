import { z } from 'zod';

const envSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_JWT_KEY: z.string().min(1, 'CLERK_JWT_KEY is required'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// For testing, allow missing keys
const isTest = process.env.NODE_ENV === 'test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let parsed: any = { success: false };

if (isTest) {
  // In tests, provide defaults if not set
  parsed = envSchema.safeParse({
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'sk_test_test_key_for_testing',
    CLERK_JWT_KEY: process.env.CLERK_JWT_KEY || 'test_public_key_for_testing',
    PORT: process.env.PORT || '3000',
    NODE_ENV: process.env.NODE_ENV || 'test',
  });
} else {
  parsed = envSchema.safeParse(process.env);
}

if (!parsed.success) {
  console.error('Environment validation failed:');
  parsed.error.errors.forEach((err: z.ZodIssue) => {
    console.error(`  ${err.path[0]}: ${err.message}`);
  });
  if (!isTest) {
    process.exit(1);
  }
}

const env = parsed.success
  ? parsed.data
  : {
      CLERK_SECRET_KEY: 'sk_test_test_key_for_testing',
      CLERK_JWT_KEY: 'test_public_key_for_testing',
      PORT: 3000,
      NODE_ENV: 'test',
    };

// Validate Clerk keys
if (env.CLERK_SECRET_KEY.startsWith('sk_live_') && env.NODE_ENV !== 'production') {
  console.error('Error: CLERK_SECRET_KEY is a live key but NODE_ENV is not production');
  if (!isTest) {
    process.exit(1);
  }
}

if (env.CLERK_SECRET_KEY.startsWith('sk_test_') && env.NODE_ENV === 'production') {
  console.error('Error: CLERK_SECRET_KEY is a test key but NODE_ENV is production');
  if (!isTest) {
    process.exit(1);
  }
}

export { env };
