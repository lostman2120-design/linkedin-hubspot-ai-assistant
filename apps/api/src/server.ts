import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const app = createApp();

app.listen(port, () => {
  console.log(`LinkedIn to HubSpot AI Assistant API is running on port ${port}`);
});

