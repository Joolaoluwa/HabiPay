import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from './env';

// Create the Postgres client
// max: 1 is recommended for Neon serverless (connection pooling handled by Neon)
const client = postgres(env.DATABASE_URL, { max: 1 });

// Initialise Drizzle with the client
export const db = drizzle(client);
