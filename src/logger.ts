import pino from "pino";
import { config } from "./config.js";

const pretty = process.env.NODE_ENV !== "production";

export const log = pino({
  level: config.LOG_LEVEL,
  ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } } : {}),
});
