// Creates the private Storage bucket that document uploads go to. Run once per Supabase project:
//   pnpm -s script scripts/create-bucket.ts
import { BUCKET } from "../src/features/documents/server";
import { supabase } from "../src/server/supabase";

async function main() {
  const storage = supabase().storage;
  if ((await storage.getBucket(BUCKET)).data) return console.log(`Bucket "${BUCKET}" already exists.`);
  const { error } = await storage.createBucket(BUCKET, { public: false });
  if (error) throw error;
  console.log(`Created private bucket "${BUCKET}".`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
