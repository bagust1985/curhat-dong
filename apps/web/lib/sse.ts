/**
 * Server-sent events over `fetch` — E15-T12. TECH-SPEC §3.3.
 *
 * `EventSource` cannot be used here for two reasons: the stream is opened with
 * POST (the message is the body), and it needs an `Authorization` header, which
 * `EventSource` has no way to set.
 *
 * So the frames are parsed by hand. The format is small and fixed:
 *
 *     event: message.delta
 *     data: {"text":"halo"}
 *     <blank line>
 *
 * Lines starting with `:` are comments — the API sends `: ping` every 15
 * seconds so a proxy does not treat a thinking model as a dead socket. They are
 * skipped rather than parsed.
 */

export interface SseEvent {
  type: string;
  data: unknown;
}

/** Splits a buffer into complete frames, returning the unconsumed remainder. */
export function parseFrames(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const parts = buffer.split('\n\n');
  // The last part may be an incomplete frame; it goes back into the buffer.
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    let type = 'message';
    const dataLines: string[] = [];

    for (const line of part.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }

    if (dataLines.length === 0) continue;

    try {
      events.push({ type, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      // A frame we cannot parse is dropped rather than thrown: one malformed
      // delta must not kill a reply that is otherwise arriving fine.
    }
  }

  return { events, rest };
}

export interface StreamOptions {
  url: string;
  body: unknown;
  accessToken: string | null;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
}

/** Opens the stream and calls `onEvent` for each frame until the server ends it. */
export async function streamSse({
  url,
  body,
  accessToken,
  signal,
  onEvent,
}: StreamOptions): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'x-client-platform': 'web',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    // Quota and ownership are checked before the first byte (E09-T08), so a
    // non-200 here is a real refusal with a JSON envelope, not a broken stream.
    let code = 'INTERNAL_ERROR';
    let message = 'Ada yang nggak beres. Coba lagi ya.';
    try {
      const payload = (await response.json()) as { error?: { code: string; message: string } };
      if (payload.error) {
        code = payload.error.code;
        message = payload.error.message;
      }
    } catch {
      /* not JSON; keep the defaults */
    }
    onEvent({ type: 'error', data: { code, message } });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseFrames(buffer);
    buffer = rest;
    for (const event of events) onEvent(event);
  }
}
