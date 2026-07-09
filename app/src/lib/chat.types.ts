export type ChatChannelType = "project" | "task" | "dm";

export type ChatMessagesRow = {
  id: string;
  channel_type: ChatChannelType;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
