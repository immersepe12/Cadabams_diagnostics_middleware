import { handle } from "hono/vercel";
import app from "../src/app";

export const runtime = "edge";
export default handle(app);
