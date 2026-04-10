import { QueueClient } from "@vercel/queue";

const queue = new QueueClient();

export const { send, handleNodeCallback } = queue;
