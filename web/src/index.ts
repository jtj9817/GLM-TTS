import { serve } from "bun";
import index from "./index.html";

import { db, DB_PATH } from "./server/db";
import { getOrCreateSession, sessionSetCookieHeader } from "./server/session";
import { audioPathForId, defaultFilename, extForMime } from "./server/storage";

const PY_API_BASE = process.env.GLMTTS_API_BASE ?? "http://localhost:8049";

type GenerationRow = {
  id: string;
  session_id: string;
  input_text: string;
  reference_text: string | null;
  seed: number | null;
  audio_path: string;
  audio_mime: string;
  output_filename: string;
  settings_json: string;
  created_at: number;
};

type GenerationSettings = Record<string, unknown>;

function safeParseJsonObject(input: string): GenerationSettings {
  try {
    const v = JSON.parse(input) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as GenerationSettings;
  } catch {
    // ignore
  }
  return {};
}

function parseBool(v: FormDataEntryValue | null, defaultValue: boolean): boolean {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return defaultValue;
}

function parseNumber(v: FormDataEntryValue | null, defaultValue: number): number {
  if (v == null) return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function withSession(
  req: Request,
  handler: (sessionId: string) => Response | Promise<Response>,
): Response | Promise<Response> {
  const session = getOrCreateSession(req);
  const maybePromise = handler(session.id);

  const wrap = (res: Response): Response => {
    if (!session.isNew) return res;
    const headers = new Headers(res.headers);
    headers.append("Set-Cookie", sessionSetCookieHeader(session.id));
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };

  return maybePromise instanceof Promise ? maybePromise.then(wrap) : wrap(maybePromise);
}

function jsonError(message: string, status = 400): Response {
  return Response.json({ detail: message }, { status });
}

const server = serve({
  routes: {
    "/api/health": req =>
      withSession(req, async () => {
        try {
          const upstream = await fetch(`${PY_API_BASE}/health`);
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "application/json",
            },
          });
        } catch {
          return jsonError(
            `Cannot connect to TTS server at ${PY_API_BASE}. Set GLMTTS_API_BASE or start the server.`,
            503,
          );
        }
      }),

    "/api/clear_cache": req =>
      withSession(req, async () => {
        try {
          const upstream = await fetch(`${PY_API_BASE}/clear_cache`);
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") ?? "application/json",
            },
          });
        } catch {
          return jsonError("Failed to reach TTS server.", 503);
        }
      }),

    "/api/generations": req =>
      withSession(req, sessionId => {
        const rows = db
          .query<GenerationRow, { sessionId: string }>(
            "SELECT * FROM generations WHERE session_id = $sessionId ORDER BY created_at DESC",
          )
          .all({ sessionId });

        const generations = rows.map(r => ({
          id: r.id,
          input_text: r.input_text,
          reference_text: r.reference_text,
          seed: r.seed,
          created_at: r.created_at,
          audio_mime: r.audio_mime,
          output_filename: r.output_filename,
          settings: safeParseJsonObject(r.settings_json),
          audio_url: `/api/generations/${r.id}/audio`,
        }));

        return Response.json({ generations });
      }),

    "/api/generations/:id/audio": req =>
      withSession(req, async sessionId => {
        const id = req.params.id;
        const row = db
          .query<Pick<GenerationRow, "audio_path" | "audio_mime" | "output_filename">, { id: string; sessionId: string }>(
            "SELECT audio_path, audio_mime, output_filename FROM generations WHERE id = $id AND session_id = $sessionId",
          )
          .get({ id, sessionId });

        if (!row) return jsonError("Audio not found", 404);

        const file = Bun.file(row.audio_path);
        const exists = await file.exists();
        if (!exists) return jsonError("Audio file missing on disk", 404);
        return new Response(file, {
          headers: {
            "Content-Type": row.audio_mime,
            "Content-Disposition": `inline; filename=\"${row.output_filename}\"`,
            "Cache-Control": "no-store",
          },
        });
      }),

    "/api/generations/:id": {
      DELETE: req =>
        withSession(req, async sessionId => {
          const id = req.params.id;

          // Fetch generation to get audio path
          const row = db
            .query<Pick<GenerationRow, "audio_path">, { id: string; sessionId: string }>(
              "SELECT audio_path FROM generations WHERE id = $id AND session_id = $sessionId",
            )
            .get({ id, sessionId });

          if (!row) return jsonError("Generation not found", 404);

          // Delete audio file from disk
          try {
            const file = Bun.file(row.audio_path);
            if (await file.exists()) {
              await Bun.write(row.audio_path, ""); // Clear the file first
              const fs = await import("node:fs/promises");
              await fs.unlink(row.audio_path);
            }
          } catch (err) {
            console.error(`Failed to delete audio file ${row.audio_path}:`, err);
          }

          // Delete from database
          db.query("DELETE FROM generations WHERE id = $id AND session_id = $sessionId").run({
            id,
            sessionId,
          });

          return Response.json({ success: true });
        }),
    },

    "/api/synthesize": {
      POST: req =>
        withSession(req, async sessionId => {
          let formData: FormData;
          try {
            formData = await req.formData();
          } catch {
            return jsonError("Invalid form data", 400);
          }

          const inputText = String(formData.get("text") ?? "");
          if (!inputText.trim()) return jsonError("Missing 'text'", 400);

          const seedRaw = formData.get("seed");
          const seed = seedRaw == null ? null : Number(seedRaw);

          const settings = {
            preset: String(formData.get("preset") ?? "balanced"),
            sample_method: String(formData.get("sample_method") ?? "ras"),
            top_k: parseNumber(formData.get("top_k"), 25),
            top_p: parseNumber(formData.get("top_p"), 0.8),
            temperature: parseNumber(formData.get("temperature"), 1.0),
            min_token_text_ratio: parseNumber(formData.get("min_token_text_ratio"), 2.0),
            max_token_text_ratio: parseNumber(formData.get("max_token_text_ratio"), 20.0),
            use_cache: parseBool(formData.get("use_cache"), true),
            use_phoneme: parseBool(formData.get("use_phoneme"), false),
          };

          const settingsJson = JSON.stringify(settings);

          let upstream: Response;
          try {
            upstream = await fetch(`${PY_API_BASE}/synthesize`, {
              method: "POST",
              body: formData,
            });
          } catch {
            return jsonError("Failed to reach TTS server.", 503);
          }

          if (!upstream.ok) {
            const contentType = upstream.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
              const payload = await upstream.json().catch(() => ({}));
              return Response.json(payload, { status: upstream.status });
            }
            const text = await upstream.text().catch(() => "TTS server error");
            return jsonError(text, upstream.status);
          }

          let mime = (upstream.headers.get("content-type") ?? "audio/wav").split(";")[0]!.trim();
          if (!mime.startsWith("audio/")) mime = "audio/wav";

          const ext = extForMime(mime);
          const id = crypto.randomUUID();
          const outputFilename = defaultFilename(id, ext);
          const audioPath = audioPathForId(id, ext);

          const audioBytes = new Uint8Array(await upstream.arrayBuffer());
          if (audioBytes.byteLength === 0) return jsonError("TTS server returned empty audio", 502);

          await Bun.write(audioPath, audioBytes);

          const referenceText = formData.get("speaker_text");
          const createdAt = Date.now();

          db.query(
            `INSERT INTO generations (
              id, session_id, input_text, reference_text, seed, audio_path, audio_mime, output_filename, settings_json, created_at
            ) VALUES (
              $id, $session_id, $input_text, $reference_text, $seed, $audio_path, $audio_mime, $output_filename, $settings_json, $created_at
            )`,
          ).run({
            id,
            session_id: sessionId,
            input_text: inputText,
            reference_text: referenceText == null ? null : String(referenceText),
            seed: Number.isFinite(seed) ? seed : null,
            audio_path: audioPath,
            audio_mime: mime,
            output_filename: outputFilename,
            settings_json: settingsJson,
            created_at: createdAt,
          });

          return Response.json({
            generation: {
              id,
              input_text: inputText,
              reference_text: referenceText == null ? null : String(referenceText),
              seed: Number.isFinite(seed) ? seed : null,
              created_at: createdAt,
              audio_mime: mime,
              output_filename: outputFilename,
              settings,
              audio_url: `/api/generations/${id}/audio`,
            },
          });
        }),
    },

    "/api/storage/info": req =>
      withSession(req, async sessionId => {
        const rows = db
          .query<Pick<GenerationRow, "audio_path">, { sessionId: string }>(
            "SELECT audio_path FROM generations WHERE session_id = $sessionId",
          )
          .all({ sessionId });

        let totalBytes = 0;
        let fileCount = 0;

        for (const row of rows) {
          try {
            const file = Bun.file(row.audio_path);
            if (await file.exists()) {
              totalBytes += file.size;
              fileCount++;
            }
          } catch {
            // ignore file errors
          }
        }

        // Get database size
        let dbBytes = 0;
        try {
          const dbFile = Bun.file(DB_PATH);
          if (await dbFile.exists()) {
            dbBytes = dbFile.size;
          }
        } catch {
          // ignore
        }

        return Response.json({ totalBytes, fileCount, dbBytes });
      }),

    "/api/storage/cleanup": {
      POST: req =>
        withSession(req, async sessionId => {
          let olderThanDays: number;
          try {
            const body = await req.json();
            olderThanDays = Number(body.olderThanDays);
            if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
              olderThanDays = 0;
            }
          } catch {
            return jsonError("Invalid request body", 400);
          }

          const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

          const rows = db
            .query<Pick<GenerationRow, "id" | "audio_path">, { sessionId: string; cutoff: number }>(
              "SELECT id, audio_path FROM generations WHERE session_id = $sessionId AND created_at < $cutoff",
            )
            .all({ sessionId, cutoff: cutoffTime });

          let deleted = 0;
          let bytesFreed = 0;

          for (const row of rows) {
            try {
              const file = Bun.file(row.audio_path);
              if (await file.exists()) {
                bytesFreed += file.size;
                // Delete the audio file
                const fs = await import("node:fs/promises");
                await fs.unlink(row.audio_path);
              }

              // Delete from database
              db.query("DELETE FROM generations WHERE id = $id").run({ id: row.id });
              deleted++;
            } catch (err) {
              console.error(`Failed to delete generation ${row.id}:`, err);
            }
          }

          return Response.json({ deleted, bytesFreed });
        }),
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
