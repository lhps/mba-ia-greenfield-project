import { handlers as authHandlers } from "./auth";
import { handlers as channelHandlers } from "./channels";
import { handlers as seedHandlers } from "./_seed";
import { handlers as videoHandlers } from "./videos";

export const handlers = [...authHandlers, ...channelHandlers, ...videoHandlers, ...seedHandlers];
