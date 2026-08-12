import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  parseWorkflowRunEvent,
  verifyWebhookSignature,
} from "@/lib/github/webhook";
import { syncFromWebhook } from "@/lib/grading/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Penerima webhook GitHub App.
 *
 * Hanya event `workflow_run` yang diproses. Setiap kiriman diverifikasi
 * dengan HMAC (X-Hub-Signature-256) sebelum disentuh, dan penyimpanannya
 * idempoten sehingga kiriman ulang dari GitHub tidak menggandakan submission.
 */
export async function POST(request: NextRequest) {
  // Body mentah dibaca sebagai teks: tanda tangan dihitung atas byte asli.
  const rawBody = await request.text();

  if (
    !verifyWebhookSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      env.githubWebhookSecret,
    )
  ) {
    return NextResponse.json(
      { error: "Tanda tangan tidak valid." },
      { status: 401 },
    );
  }

  const eventName = request.headers.get("x-github-event");

  // ping dikirim GitHub saat webhook pertama kali dipasang.
  if (eventName === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  if (eventName !== "workflow_run") {
    return NextResponse.json({ ok: true, ignored: eventName });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload bukan JSON." }, { status: 400 });
  }

  const event = parseWorkflowRunEvent(payload);
  if (!event) {
    return NextResponse.json(
      { error: "Payload workflow_run tidak dikenali." },
      { status: 400 },
    );
  }

  try {
    const outcome = await syncFromWebhook({
      repositoryFullName: event.repositoryFullName,
      run: {
        runId: event.runId,
        runAttempt: event.runAttempt,
        headSha: event.headSha,
        status: event.status,
        conclusion: event.conclusion,
        htmlUrl: event.htmlUrl,
        updatedAt: event.updatedAt,
      },
    });

    // Repository yang tidak dikenal bukan error: bisa jadi repo lain di
    // organisasi yang sama. Balas 200 supaya GitHub tidak mengirim ulang.
    if (!outcome) {
      return NextResponse.json({ ok: true, ignored: "repo_tidak_dikenal" });
    }

    return NextResponse.json({
      ok: true,
      created: outcome.created,
      updated: outcome.updated,
      submission_id: outcome.submission.id,
    });
  } catch (error) {
    console.error("[webhook] gagal memproses workflow_run:", error);
    // 500 supaya GitHub mencoba mengirim ulang; penyerapan idempoten.
    return NextResponse.json(
      { error: "Gagal memproses event." },
      { status: 500 },
    );
  }
}
