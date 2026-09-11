import { buildApp } from './buildApp';
import { env } from './config/env';

const app = buildApp();

app.listen({ host: '0.0.0.0', port: env.PORT }, (err, address) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`Server listening on ${address}`);
});

export { app };
