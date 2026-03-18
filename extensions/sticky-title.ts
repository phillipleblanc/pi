/**
 * Sticky Title Extension
 *
 * Displays a sticky header widget showing an LLM-generated title for the
 * current session, derived from the full conversation context.
 *
 * Automatically generates a title after the first user message, then
 * regenerates after the AI's first complete response. /title-generate
 * can be called at any time to regenerate from the entire conversation.
 *
 * Uses GitHub Copilot provider with Claude Opus 4.6 for title generation.
 */

import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

const WIDGET_ID = "sticky-title";
const ENTRY_TYPE = "sticky-title-state";

function setTitleWidget(ctx: ExtensionContext, title: string) {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
    render(width: number): string[] {
      const safeWidth = Math.max(0, width);
      const bar = theme.fg("dim", "─".repeat(safeWidth));
      const label = truncateToWidth(theme.fg("accent", theme.bold(` 📌 ${title} `)), safeWidth);
      return [bar, label, bar];
    },
    invalidate() {},
  }));
}

function clearTitleWidget(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  ctx.ui.setWidget(WIDGET_ID, undefined);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts = content
    .filter((p): p is { type?: string; text?: string } => !!p && typeof p === "object")
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!.trim())
    .filter(Boolean);

  return parts.join("\n").trim();
}

function getConversationText(ctx: ExtensionContext): string {
  const parts: string[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (
      entry.type === "message" &&
      (entry.message.role === "user" || entry.message.role === "assistant")
    ) {
      const text = extractTextFromContent(entry.message.content);
      if (text) {
        const role = entry.message.role === "user" ? "User" : "Assistant";
        parts.push(`${role}: ${text}`);
      }
    }
  }
  return parts.join("\n\n").trim();
}

function findCopilotOpus46Model(ctx: ExtensionContext) {
  // Copilot currently names this model with dots: claude-opus-4.6.
  const exactDot = ctx.modelRegistry.find("github-copilot", "claude-opus-4.6");
  if (exactDot) return exactDot;

  // Be resilient to potential alias differences.
  const exactDash = ctx.modelRegistry.find("github-copilot", "claude-opus-4-6");
  if (exactDash) return exactDash;

  return ctx
    .modelRegistry
    .getAll()
    .find(
      (m) =>
        m.provider === "github-copilot" &&
        (m.id.includes("claude-opus-4.6") || m.id.includes("claude-opus-4-6")),
    );
}

function sanitizeTitle(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[.!?]+$/, "");

  const words = stripped.split(/\s+/).filter(Boolean).slice(0, 30);
  return words.join(" ");
}

async function generateTitleFromConversation(
  conversationText: string,
  ctx: ExtensionContext,
): Promise<string> {
  const model = findCopilotOpus46Model(ctx);
  if (!model) {
    throw new Error(
      "Model github-copilot/claude-opus-4.6 is not available in your configured model list",
    );
  }

  const apiKey = await ctx.modelRegistry.getApiKey(model);
  if (!apiKey) {
    throw new Error("No GitHub Copilot credentials found. Run /login and select GitHub Copilot");
  }

  const response = await complete(
    model,
    {
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: [
                "Create a session title from this conversation.",
                "Requirements:",
                "- Maximum 30 words",
                "- Keep important context/details",
                "- Return title text only",
                "- No quotes",
                "- No ending punctuation",
                "",
                "<conversation>",
                conversationText.slice(0, 8000),
                "</conversation>",
              ].join("\n"),
            },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    { apiKey, maxTokens: 160 },
  );

  const text = response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  const title = sanitizeTitle(text);
  if (!title) throw new Error("Title model returned empty output");
  return title;
}

export default function (pi: ExtensionAPI) {
  let currentTitle: string | null = null;
  /** Controls automatic two-phase generation on the first exchange. */
  let generationPhase: "pending" | "after-user" | "done" = "pending";
  /** Monotonic counter so stale async generations never overwrite newer ones. */
  let generationSeq = 0;
  let reportedInitFailure = false;

  function persistAndShowTitle(title: string, ctx: ExtensionContext) {
    currentTitle = title;
    pi.appendEntry(ENTRY_TYPE, { title });
    pi.setSessionName(title);
    setTitleWidget(ctx, title);
  }

  function restoreTitle(ctx: ExtensionContext) {
    currentTitle = null;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
        currentTitle = (entry as { data?: { title?: string } }).data?.title ?? null;
      }
    }

    if (currentTitle) {
      generationPhase = "done";
      pi.setSessionName(currentTitle);
      setTitleWidget(ctx, currentTitle);
    } else {
      generationPhase = "pending";
      clearTitleWidget(ctx);
    }
  }

  async function autoGenerateTitle(ctx: ExtensionContext) {
    const conversationText = getConversationText(ctx);
    if (!conversationText) return;

    const seq = ++generationSeq;
    try {
      const title = await generateTitleFromConversation(conversationText, ctx);
      if (seq === generationSeq) {
        persistAndShowTitle(title, ctx);
        reportedInitFailure = false;
      }
    } catch (error) {
      if (ctx.hasUI && !reportedInitFailure && seq === generationSeq) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`sticky-title: ${message}`, "warning");
        reportedInitFailure = true;
      }
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    restoreTitle(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    restoreTitle(ctx);
  });

  // Phase 1: Generate title from the first user message (fire-and-forget so
  // the agent is not blocked waiting for the title model).
  pi.on("before_agent_start", async (_event, ctx) => {
    if (generationPhase === "pending") {
      generationPhase = "after-user";
      autoGenerateTitle(ctx).catch(() => {});
    }
  });

  // Phase 2: Regenerate after the AI's first complete response so the title
  // can incorporate the assistant's answer.
  pi.on("agent_end", async (_event, ctx) => {
    if (generationPhase === "after-user") {
      generationPhase = "done";
      await autoGenerateTitle(ctx);
    }
  });

  pi.registerCommand("title", {
    description: "Set or view sticky title (usage: /title [new title])",
    handler: async (args, ctx) => {
      const manual = args.trim();
      if (manual) {
        generationPhase = "done";
        persistAndShowTitle(manual, ctx);
        ctx.ui.notify(`Title set: ${manual}`, "info");
        return;
      }

      if (currentTitle) {
        ctx.ui.notify(`Current title: ${currentTitle}`, "info");
        return;
      }

      ctx.ui.notify("No title set yet. Use /title-generate to force generation.", "info");
    },
  });

  pi.registerCommand("title-generate", {
    description: "Generate sticky title from conversation using Opus 4.6",
    handler: async (_args, ctx) => {
      const conversationText = getConversationText(ctx);
      if (!conversationText) {
        ctx.ui.notify("No messages found in this session yet", "warning");
        return;
      }

      // Stop any further auto-generation.
      generationPhase = "done";

      try {
        const seq = ++generationSeq;
        const title = await generateTitleFromConversation(conversationText, ctx);
        if (seq === generationSeq) {
          persistAndShowTitle(title, ctx);
          ctx.ui.notify(`Generated title: ${title}`, "info");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`sticky-title: ${message}`, "error");
      }
    },
  });
}
