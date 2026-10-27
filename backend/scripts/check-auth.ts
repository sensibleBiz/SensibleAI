import { withDatabaseContext } from "../src/db/context.ts";
import { v4 as uuidv4 } from "uuid";

const runCheck = async () => {
  const dummyContext = {
    tenantId: uuidv4(),
    userId: uuidv4(),
  };
  try {
    await withDatabaseContext(dummyContext, async ({ client }) => {
      const res = await client.query('SELECT 1 AS ok');
      console.log('✅ DB connection successful, result:', res.rows[0]);
    });
  } catch (err) {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  }
};

runCheck();
