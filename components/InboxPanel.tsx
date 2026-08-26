"use client";

import { useRef, useState, type RefObject } from "react";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { PhotoViewer } from "@/components/PhotoViewer";
import { useInbox } from "@/components/InboxProvider";

export function InboxPanel({ compact = false }: { compact?: boolean }) {
  const inbox = useInbox();
  const confirmRemove = useConfirmRemove();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const active = inbox.threads.find((thread) => thread.id === inbox.activeId) ?? null;

  async function removeMessage(threadId: string, messageId: string, label: string) {
    if (await confirmRemove(label, { title: "Remove this message?", confirmLabel: "Remove" })) {
      inbox.deleteMessage(threadId, messageId);
    }
  }

  async function clearThread(threadId: string, name: string) {
    if (
      await confirmRemove(`${name}. Tickets stay.`, {
        title: "Clear conversation?",
        confirmLabel: "Clear",
      })
    ) {
      inbox.clearConversation(threadId);
    }
  }

  async function removeSelected() {
    if (
      await confirmRemove(`${inbox.selectedIds.length} conversations on this desk only.`, {
        title: `Delete ${inbox.selectedIds.length}?`,
        confirmLabel: "Delete",
      })
    ) {
      inbox.deleteSelected();
    }
  }

  async function emptyAll() {
    if (await confirmRemove("Tickets stay. Testers stay on their own threads.", { title: "Empty inbox?", confirmLabel: "Empty" })) {
      inbox.emptyInbox();
    }
  }

  function send() {
    inbox.sendMessage(draft, photo);
    setDraft("");
    setPhoto(null);
  }

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ""}>
      <div className={compact ? "shrink-0" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`font-semibold text-[#163038] ${compact ? "text-2xl" : "font-display text-3xl"}`}>Inbox</h2>
            <p className="mt-1 text-sm text-[#5b6f73]">Testers do not see each other.</p>
          </div>
          <button type="button" onClick={inbox.startDraft} className="inbox-new">
            + New
          </button>
        </div>

        {inbox.selectedIds.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={removeSelected} className="rounded-lg bg-[#b74120] px-3 py-1.5 text-white">
              Delete {inbox.selectedIds.length}
            </button>
            <button type="button" onClick={inbox.clearSelect} className="text-[#5b6f73]">
              Clear selection
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={inbox.selectAll} className="text-steel">
              Select all
            </button>
            <button type="button" onClick={emptyAll} className="text-[#5b6f73]">
              Empty inbox
            </button>
          </div>
        )}
        <p className="mt-1 text-xs text-[#5b6f73]">Select all is this desk only — testers stay on their own threads.</p>

        {inbox.composing ? (
          <div className="mt-4 rounded-xl bg-[#f4f1e8] px-3 py-3">
            <p className="text-sm text-[#163038]">
              {inbox.ownerChrome ? "Pick a person. Testers never share a thread." : "Write the owner. Teammates only if they share your company."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {inbox.contacts.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => inbox.startThread(person)}
                  className="rounded-full border border-steel px-3 py-1 text-sm text-steel"
                >
                  {person.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={inbox.cancelDraft} className="mt-2 text-sm text-[#5b6f73]">
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      {active ? (
        <Conversation
          compact={compact}
          thread={active}
          draft={draft}
          photo={photo}
          fileRef={fileRef}
          onDraft={setDraft}
          onPhoto={setPhoto}
          onSend={send}
          onBack={inbox.closeThread}
          onClear={() => void clearThread(active.id, active.name)}
          onRemoveMessage={(id, label) => void removeMessage(active.id, id, label)}
        />
      ) : (
        <div className={compact ? "mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain" : "mt-5 space-y-4"}>
          {inbox.threads.length === 0 ? (
            <p className="text-sm text-[#5b6f73]">No threads yet. Tickets do not land here.</p>
          ) : (
            inbox.threads.map((thread) => (
              <article key={thread.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={inbox.selectedIds.includes(thread.id)}
                  onChange={() => inbox.toggleSelect(thread.id)}
                  aria-label={`Select ${thread.name}`}
                />
                <button type="button" onClick={() => inbox.openThread(thread.id)} className="min-w-0 flex-1 text-left">
                  <p className="font-semibold text-[#163038]">
                    {thread.name}
                    {thread.unread > 0 ? <span className="ml-2 text-xs font-normal text-[#b74120]">{thread.unread} new</span> : null}
                  </p>
                  <p className="truncate text-sm text-[#5b6f73]">{inbox.previewOf(thread)}</p>
                </button>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Conversation({
  compact = false,
  thread,
  draft,
  photo,
  fileRef,
  onDraft,
  onPhoto,
  onSend,
  onBack,
  onClear,
  onRemoveMessage,
}: {
  compact?: boolean;
  thread: { id: string; name: string; messages: import("@/lib/inbox").InboxMessage[] };
  draft: string;
  photo: string | null;
  fileRef: RefObject<HTMLInputElement | null>;
  onDraft: (value: string) => void;
  onPhoto: (value: string | null) => void;
  onSend: () => void;
  onBack: () => void;
  onClear: () => void;
  onRemoveMessage: (id: string, label: string) => void;
}) {
  const [view, setView] = useState<string | null>(null);

  return (
    <div className={compact ? "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden" : "mt-4"}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="text-sm text-steel">
          ← {thread.name}
        </button>
        <button type="button" onClick={onClear} className="text-sm text-[#5b6f73]">
          Clear conversation
        </button>
      </div>
      <div
        className={
          compact
            ? "mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain"
            : "mt-3 max-h-[22rem] space-y-3 overflow-y-auto"
        }
      >
        {thread.messages.length === 0 ? <p className="text-sm text-[#5b6f73]">No messages yet.</p> : null}
        {thread.messages.map((message) => (
          <div key={message.id} className={`rounded-xl px-3 py-2 ${message.from === "self" ? "bg-[#e7eeec]" : "bg-[#f4f1e8]"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-[#5b6f73]">{message.author}</p>
              <button
                type="button"
                onClick={() => onRemoveMessage(message.id, message.text || "Photo")}
                className="trash-btn !min-h-8 !min-w-8 !text-sm"
                aria-label="Remove this message"
              >
                ⌫
              </button>
            </div>
            {message.text ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#163038]">{message.text}</p> : null}
            {message.photo ? (
              <button type="button" onClick={() => setView(message.photo)} className="mt-2 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={message.photo} alt="Attached photo" className="max-h-28 rounded border border-[#d5e0de]" />
              </button>
            ) : null}
            {message.from === "self" ? (
              <p
                className="mt-1 text-right text-xs text-[#5b6f73]"
                title={message.readAt ? `Read ${message.readAt}` : `Sent ${message.sentAt}`}
              >
                {message.readAt ? "✓✓" : "✓"}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className={compact ? "shrink-0" : ""}>
      {photo ? (
        <p className="mt-2 text-xs text-[#5b6f73]">
          Photo attached.{" "}
          <button type="button" onClick={() => onPhoto(null)} className="text-steel">
            Remove
          </button>
        </p>
      ) : null}
      <textarea
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={compact ? 3 : 5}
        className="paper-field mt-3"
        placeholder="Message · Enter sends · Shift+Enter newline"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-steel px-3 py-2 text-sm text-steel">
          Attach photo
        </button>
        <button type="button" onClick={onSend} className="rounded-lg bg-steel px-3 py-2 text-sm text-white">
          Send
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onPhoto(typeof reader.result === "string" ? reader.result : null);
          reader.readAsDataURL(file);
        }}
      />
      {view ? <PhotoViewer src={view} onClose={() => setView(null)} /> : null}
      </div>
    </div>
  );
}
