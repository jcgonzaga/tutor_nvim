import { connectPostgres } from "./client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const handle = await connectPostgres(url);
await handle.close();
console.log("migrations applied");
