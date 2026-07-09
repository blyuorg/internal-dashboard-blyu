import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { ChatChannelType, ChatMessagesRow } from "@/lib/chat.types";

export function ChatPanel({ channelType, channelId }: { channelType: ChatChannelType; channelId: string }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<ChatMessagesRow[]>([]);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_type", channelType)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data);
      });

    const sub = supabase
      .channel(`chat:${channelType}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as ChatMessagesRow;
          if (row.channel_type === channelType) {
            setMessages((prev) => [...prev, row]);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(sub);
    };
  }, [channelType, channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!body.trim() || !session?.user) return;
    const { error } = await supabase.from("chat_messages").insert({
      channel_type: channelType,
      channel_id: channelId,
      sender_id: session.user.id,
      body: body.trim(),
    });
    if (!error) setBody("");
  }

  return (
    <div className="flex h-80 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex-1 overflow-y-auto p-3">
        {messages.map((m) => (
          <div key={m.id} className="mb-2 text-sm">
            <span className="text-xs text-[var(--color-text-muted)]">
              {new Date(m.created_at).toLocaleTimeString()}
            </span>{" "}
            {m.body}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">No messages yet.</p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-[var(--color-border)] p-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message…"
          className="input flex-1"
        />
        <button
          onClick={send}
          className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent-fg)]"
        >
          Send
        </button>
      </div>
    </div>
  );
}
