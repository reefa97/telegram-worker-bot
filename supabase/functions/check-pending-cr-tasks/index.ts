import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

serve(async () => {
  try {
    // Find pending CR tasks where the assigned worker completed a session
    // at that object AFTER the task was assigned, but never confirmed/denied the task.
    // Grace period: only alert if the session ended more than 2 hours ago (worker had time to respond).
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: stuckTasks, error } = await supabase
      .from("client_requests")
      .select(`
        id,
        message,
        object_id,
        assigned_worker_id,
        worker_task_status,
        cleaning_objects:object_id(name),
        assigned_worker:workers!assigned_worker_id(
          id, first_name, last_name, telegram_chat_id
        )
      `)
      .eq("worker_task_status", "pending")
      .neq("status", "done");

    if (error) throw error;
    if (!stuckTasks || stuckTasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let alerted = 0;

    for (const task of stuckTasks) {
      if (!task.assigned_worker_id) continue;

      // Check if this worker had a session at this object that ended more than 2 hours ago
      const { data: endedSession } = await supabase
        .from("work_sessions")
        .select("id, end_time")
        .eq("object_id", task.object_id)
        .eq("worker_id", task.assigned_worker_id)
        .not("end_time", "is", null)
        .lt("end_time", twoHoursAgo)
        .order("end_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!endedSession) continue; // Worker hasn't had a completed shift yet — skip

      // Mark as failed (ignored)
      await supabase
        .from("client_requests")
        .update({ worker_task_status: "failed" })
        .eq("id", task.id);

      const worker = (task as any).assigned_worker;
      const objectName = (task as any).cleaning_objects?.name || "Obiekt";
      const workerName = worker ? `${worker.first_name} ${worker.last_name}` : "Неизвестный работник";

      // Notify guardians of the object
      const { data: owners } = await supabase
        .from("object_owners")
        .select("admin_users(telegram_chat_id)")
        .eq("object_id", task.object_id);

      const alertMsg =
        `⚠️ <b>Задание не подтверждено!</b>\n\n` +
        `📍 Объект: <b>${objectName}</b>\n` +
        `👤 Работник: <b>${workerName}</b>\n` +
        `💬 Задание: ${task.message}\n\n` +
        `Работник завершил смену и не ответил на вопрос о выполнении задания.\n` +
        `🔴 Требуется вмешательство!`;

      if (owners) {
        for (const owner of owners) {
          const chatId = (owner as any).admin_users?.telegram_chat_id;
          if (chatId) {
            await sendTelegramMessage(parseInt(chatId), alertMsg);
            alerted++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: stuckTasks.length, alerted }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-pending-cr-tasks error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
