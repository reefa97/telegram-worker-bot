import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to log system events
async function logToSystem(
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string,
  metadata?: any,
  workerId?: string,
  objectId?: string,
  adminId?: string
) {
  try {
    await supabase.from('system_logs').insert({
      level,
      category,
      message,
      metadata: metadata ? metadata : null,
      worker_id: workerId || null,
      object_id: objectId || null,
      admin_id: adminId || null
    });
  } catch (err) {
    console.error('[logToSystem] Failed to write log:', err);
  }
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name: string;
    };
    chat: {
      id: number;
    };
    text?: string;
    reply_to_message?: {
      message_id: number;
      text?: string;
    };
    location?: {
      latitude: number;
      longitude: number;
    };
    photo?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }[];
    caption?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
    };
    message: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

async function getWorkerKeyboard(workerId: string) {
  const { data: worker } = await supabase
    .from("workers")
    .select("bot_state")
    .eq("id", workerId)
    .maybeSingle();

  const { data: activeSession } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("worker_id", workerId)
    .is("end_time", null)
    .maybeSingle();

  const isProcurement = worker?.bot_state && worker.bot_state.startsWith('procurement_');
  const keyboard = [];

  if (activeSession) {
    keyboard.push([{ text: "🛑 Закончить работу" }]);
  } else {
    keyboard.push([{ text: "▶️ Начать работу" }]);
  }

  if (isProcurement) {
    if (worker.bot_state === 'procurement_upload_photo') {
      keyboard.push([{ text: "🚀 Отправить заказ" }]);
    }
    keyboard.push([{ text: "❌ Отменить заказ" }]);
  } else {
    keyboard.push([{ text: "🛍 Заказать закупку" }]);
  }

  // Common button for all states
  keyboard.push([{ text: "💰 Мои финансы" }]);

  return keyboard;
}

async function getDailyTasks(objectId: string) {
  const today = new Date();
  const jsDay = today.getDay(); // 0 (Sun) to 6 (Sat)
  const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert to 1-7 (Mon=1, Sun=7)
  const dateString = today.toISOString().split('T')[0];

  console.log(`[getDailyTasks] Fetching tasks via RPC for object: ${objectId}`);

  // Use RPC to bypass RLS issues
  const { data: tasks, error } = await supabase.rpc('get_object_tasks_secure', {
    target_object_id: objectId
  });

  if (error) {
    console.error(`[getDailyTasks] RPC ERROR:`, error);
    // Fallback to direct select if RPC not exists (though likely RLS will fail)
    const { data: fallbackTasks } = await supabase
      .from("object_tasks")
      .select("title, is_special_task, scheduled_days, scheduled_dates, is_recurring")
      .eq("object_id", objectId)
      .eq("is_active", true);

    if (fallbackTasks) return filterTasks(fallbackTasks, dayOfWeek, dateString);
    return [];
  }

  console.log(`[getDailyTasks] RPC retrieved ${tasks?.length || 0} tasks`);

  if (!tasks) return [];
  return filterTasks(tasks, dayOfWeek, dateString);
}

function filterTasks(tasks: any[], dayOfWeek: number, dateString: string) {
  return tasks.filter(task => {
    // If task has no schedule, always show it
    if (!task.scheduled_days && !task.scheduled_dates) {
      return true;
    }

    if (task.is_recurring) {
      return task.scheduled_days && task.scheduled_days.includes(dayOfWeek);
    } else {
      return task.scheduled_dates && task.scheduled_dates.includes(dateString);
    }
  });
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string, keyboard?: any) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };

  if (keyboard) {
    body.reply_markup = keyboard;
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(id);
    return res;
  } catch (error) {
    clearTimeout(id);
    console.error(`[sendTelegramMessage] Failed to send to ${chatId}:`, error);
    // Don't throw, just log. Or throw if critical? 
    // For this bot, if sending fails, we usually just want to know but continue.
    throw error;
  }
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}


// Helper to get recipients (Prioritizes Object Owners)
async function getNotificationRecipients(objectId?: string, workerId?: string) {
  console.log(`[getNotificationRecipients] Called with objectId: ${objectId}, workerId: ${workerId}`);
  const recipients = new Set<string>();

  // 1. Priority: Object Owners (Guardians) - Fetch via secure RPC
  if (objectId) {
    console.log(`[getNotificationRecipients] Fetching object owners via RPC for objectId: ${objectId}`);
    const { data: owners, error } = await supabase.rpc('get_object_owners_with_chat_ids', {
      target_object_id: objectId
    });

    if (owners && owners.length > 0) {
      owners.forEach((o: any) => {
        if (o.telegram_chat_id) {
          recipients.add(o.telegram_chat_id);
          console.log(`[getNotificationRecipients] Added object owner: ${o.telegram_chat_id}`);
        }
      });
      // IF we found owners, we STOP here. strict "only guardian of this object" rule.
      const finalRecipients = Array.from(recipients);
      console.log(`[getNotificationRecipients] Found object owners, returning specific list:`, finalRecipients);
      return finalRecipients;
    }
  }

  // 2. Fallback: Worker's Creator (Personal Guardian)
  // Only executed if NO object owners were found above.
  if (workerId) {
    const { data: worker } = await supabase
      .from("workers")
      .select("created_by")
      .eq("id", workerId)
      .single();

    if (worker && worker.created_by) {
      const { data: admin } = await supabase
        .from("admin_users")
        .select("telegram_chat_id")
        .eq("id", worker.created_by)
        .single();

      if (admin && admin.telegram_chat_id) {
        recipients.add(admin.telegram_chat_id);
        console.log(`[getNotificationRecipients] Added worker creator (Fallback): ${admin.telegram_chat_id}`);
      }
    }
  }

  // 3. Last Resort: Notify ALL Admins
  if (recipients.size === 0) {
    console.log(`[getNotificationRecipients] No recipients found, falling back to ALL admins`);
    const { data: allAdmins } = await supabase
      .from("admin_users")
      .select("telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    if (allAdmins) {
      allAdmins.forEach(a => {
        if (a.telegram_chat_id) {
          recipients.add(a.telegram_chat_id);
        }
      });
    }
  }

  const finalRecipients = Array.from(recipients);
  console.log(`[getNotificationRecipients] Final recipients (${finalRecipients.length}):`, finalRecipients);
  return finalRecipients;
}

async function notifyGeofenceViolation(
  botToken: string,
  workerName: string,
  objectName: string,
  distance: number,
  radius: number,
  action: 'start' | 'end',
  objectId?: string,
  workerId?: string
) {
  const recipients = await getNotificationRecipients(objectId, workerId);

  if (recipients.length === 0) return;

  for (const chatId of recipients) {
    const message = `⚠️ <b>НАРУШЕНИЕ ГЕОЗОНЫ</b>\n\n` +
      `👤 Работник: <b>${workerName}</b>\n` +
      `📍 Объект: <b>${objectName}</b>\n` +
      `${action === 'start' ? '▶️ Начал' : '🛑 Закончил'} работу на расстоянии <b>${Math.round(distance)}м</b> от объекта\n` +
      `🎯 Допустимый радиус: ${radius}м\n` +
      `⚠️ Превышение: ${Math.round(distance - radius)}м`;

    await sendTelegramMessage(botToken, parseInt(chatId), message);
  }

  // Log notification
  await supabase
    .from("notifications_log")
    .insert({
      notification_type: "geofence_violation",
      message: `Geofence Violation: ${workerName} at ${objectName}`,
      metadata: { distance, radius, action, workerName, objectName }
    });
}

async function sendLocationToManagers(
  botToken: string,
  workerName: string,
  action: string,
  location: any,
  objectName?: string,
  duration?: number,
  objectId?: string,
  workerId?: string
) {
  console.log(`[sendLocationToManagers] Called for action: ${action}, objectId: ${objectId}, workerId: ${workerId}`);

  try {
    const recipients = await getNotificationRecipients(objectId, workerId);
    console.log(`[sendLocationToManagers] Recipients count: ${recipients.length}, list:`, recipients);

    await logToSystem(
      'info',
      'notification',
      `Attempting to send ${action} notification for ${workerName}`,
      { recipients_count: recipients.length, recipients, objectName, action },
      workerId,
      objectId
    );

    if (recipients.length === 0) {
      console.warn(`[sendLocationToManagers] No recipients found.`);
      return;
    }

    // Message construction
    let message = `👤 <b>${workerName}</b>\n`;
    message += action === "start"
      ? `▶️ Начал работу${objectName ? ` на объекте <b>${objectName}</b>` : ""}`
      : `🛑 Закончил работу${objectName ? ` на объекте <b>${objectName}</b>` : ""}`;

    if (duration) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      message += `\n⏱ Длительность: ${hours}ч ${minutes}м`;
    }

    // Send in parallel
    const promises = recipients.map(async (chatId) => {
      try {
        console.log(`[sendLocationToManagers] Sending to chatId: ${chatId}`);
        // Send Text
        await sendTelegramMessage(botToken, parseInt(chatId), message);

        // Send Location
        if (location?.latitude && location?.longitude) {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 10000);
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendLocation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: parseInt(chatId),
                latitude: location.latitude,
                longitude: location.longitude,
              }),
              signal: controller.signal
            });
            clearTimeout(id);
          } catch (err) {
            clearTimeout(id);
            console.error(`[sendLocationToManagers] Location send failed for ${chatId}:`, err);
          }
        }

        // Log success (optional, reduced to debug to avoid DB spam)
      } catch (error) {
        console.error(`[sendLocationToManagers] Failed to send to ${chatId}:`, error);
        await logToSystem(
          'error',
          'notification',
          `Failed to send ${action} notification`,
          { chat_id: chatId, error: String(error) },
          workerId,
          objectId
        );
      }
    });

    // Wait for all, but don't fail if some fail
    await Promise.allSettled(promises);
    console.log(`[sendLocationToManagers] Finished processing recipients.`);

  } catch (error) {
    console.error(`[sendLocationToManagers] Critical error:`, error);
    await logToSystem('error', 'notification', 'Critical failure in sendLocationToManagers', { error: String(error) });
  }
}

async function handlePhotoUpload(botToken: string, fileId: string, workerId: string, sessionId: string) {
  try {
    // 1. Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) throw new Error('Failed to get file path');

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

    // 2. Download file
    const imageRes = await fetch(fileUrl);
    const imageBlob = await imageRes.blob();

    // 3. Upload to Supabase Storage
    const fileName = `${sessionId}/${Date.now()}.jpg`;
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('shift-photos')
      .upload(fileName, imageBlob, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 4. Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from('shift-photos')
      .getPublicUrl(fileName);

    // 5. Save reference to DB
    await supabase
      .from('shift_photos')
      .insert({
        session_id: sessionId,
        photo_type: 'end', // Defaulting to end for now
        photo_url: publicUrl
      });

    // 6. Forward to Managers
    const { data: sessionData } = await supabase
      .from("work_sessions")
      .select(`
            worker_id,
            object:cleaning_objects(id, name),
            worker:workers(id, first_name, last_name)
        `)
      .eq("id", sessionId)
      .single();

    if (sessionData && sessionData.object) {
      const recipients = await getNotificationRecipients(sessionData.object.id, sessionData.worker_id);
      const workerName = sessionData.worker
        ? `${sessionData.worker.first_name} ${sessionData.worker.last_name}`
        : "Unknown Worker";
      const objectName = sessionData.object.name;

      console.log(`[handlePhotoUpload] Forwarding photo to ${recipients.length} recipients:`, recipients);

      await logToSystem(
        'info',
        'photo_notification',
        `Forwarding photo from ${workerName} at ${objectName} to ${recipients.length} recipients`,
        { recipients, workerName, objectName, sessionId },
        workerId,
        sessionData.object.id
      );

      const caption = `📸 <b>Новое фото-отчет</b>\n\n👤 Работник: ${workerName}\n📍 Объект: ${objectName}`;

      for (const chatId of recipients) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: parseInt(chatId),
              photo: fileId,
              caption: caption,
              parse_mode: "HTML"
            }),
          });

          const resData = await res.json();
          if (!resData.ok) {
            console.error(`[handlePhotoUpload] sendPhoto FAILED for chatId ${chatId}:`, resData);
            await logToSystem(
              'error',
              'photo_notification',
              `Failed to send photo to chatId ${chatId}: ${resData.description || 'Unknown error'}`,
              { chatId, error: resData, workerName, objectName },
              workerId,
              sessionData.object.id
            );
          } else {
            console.log(`[handlePhotoUpload] Photo sent successfully to chatId ${chatId}`);
          }
        } catch (sendErr) {
          console.error(`[handlePhotoUpload] sendPhoto ERROR for chatId ${chatId}:`, sendErr);
          await logToSystem(
            'error',
            'photo_notification',
            `Exception sending photo to chatId ${chatId}: ${String(sendErr)}`,
            { chatId, error: String(sendErr) },
            workerId,
            sessionData.object.id
          );
        }
      }
    } else {
      console.warn(`[handlePhotoUpload] No session data or object found for session ${sessionId}`);
      await logToSystem(
        'warn',
        'photo_notification',
        `No session data or object found for session ${sessionId}`,
        { sessionId, sessionData },
        workerId
      );
    }

    return true;
  } catch (error) {
    console.error('Error handling photo:', error);
    await logToSystem(
      'error',
      'photo_notification',
      `Critical error in handlePhotoUpload: ${String(error)}`,
      { error: String(error), workerId, sessionId }
    );
    return false;
  }
}


serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = await req.json();

    // --- INTERNAL: EMAIL NOTIFICATION ---
    if (body.type === 'email_notification') {
      const { email, account_id } = body;

      // 1. Get Bot Token
      const { data: botSettings } = await supabase
        .from("bot_settings")
        .select("telegram_bot_token")
        .single();

      if (!botSettings?.telegram_bot_token) {
        return new Response(JSON.stringify({ error: "Bot not configured" }), { status: 500 });
      }

      const botToken = botSettings.telegram_bot_token;

      // 2. Find recipient (Account Owner -> Admin User -> Chat ID)
      // We need to join email_accounts with admin_users.
      // Since we can't do deep joins easily across schemas if auth is involved differently,
      // let's do it in steps or use a view. 
      // email_accounts.created_by IS the auth.users.id
      // admin_users.id IS ALSO auth.users.id

      const { data: account } = await supabase
        .from("email_accounts")
        .select("created_by")
        .eq("id", account_id)
        .single();

      if (!account || !account.created_by) {
        return new Response(JSON.stringify({ error: "Account owner not found" }), { status: 404 });
      }

      const { data: admin } = await supabase
        .from("admin_users")
        .select("telegram_chat_id")
        .eq("id", account.created_by)
        .single();

      if (admin && admin.telegram_chat_id) {
        const message = `📧 <b>Новое письмо</b>\n\n` +
          `От: ${email.from}\n` +
          `Тема: <b>${email.subject}</b>\n\n` +
          `<i>Нажмите "Ответить", чтобы написать ответ прямо отсюда.</i>`;

        await sendTelegramMessage(botToken, admin.telegram_chat_id, message, {
          inline_keyboard: [
            [
              { text: "↩️ Ответить", callback_data: `reply_email_${account_id}_${email.id}` }
            ]
          ]
        });
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ error: "Admin has no connected Telegram" }), { status: 400 });
      }
    }

    const update: TelegramUpdate = body;

    // --- DEBUG LOGGING ---
    await logToSystem('info', 'update_received', `Received update type: ${update.message ? 'message' : update.callback_query ? 'callback' : 'other'} from ${update.message?.from?.id || update.callback_query?.from?.id}`, { update_id: update.update_id }).catch(() => { });

    // --- IDEMPOTENCY CHECK ---
    try {
      if (update.update_id) {
        const { data: processed, error: dbError } = await supabase
          .from('processed_updates')
          .select('update_id')
          .eq('update_id', update.update_id)
          .maybeSingle();

        if (dbError) {
          console.error('[idempotency] DB Error:', dbError);
        } else if (processed) {
          console.log(`[idempotency] Skipping duplicate update_id: ${update.update_id}`);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } else {
          // Mark as processed immediately
          const { error: insertErr } = await supabase.from('processed_updates').insert({ update_id: update.update_id });
          if (insertErr) {
            console.warn(`[idempotency] Failed to insert update_id (non-critical):`, insertErr);
          }
        }
      }
    } catch (idemError) {
      // Fallback: If idempotency fails, we verify it log it but continue processing
      console.error('[idempotency] Check failed, proceeding anyway:', idemError);
      // We do NOT return/throw here, allowing the bot to work even if this feature breaks
    }
    // -------------------------

    // Get bot token
    const { data: botSettings } = await supabase
      .from("bot_settings")
      .select("telegram_bot_token, is_active")
      .single();

    if (!botSettings?.is_active || !botSettings?.telegram_bot_token) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const botToken = botSettings.telegram_bot_token;

    // Handle callback query (button clicks)
    if (update.callback_query) {
      const { from, message, data, id } = update.callback_query;
      const chatId = message.chat.id;
      const userId = from.id;

      // Answer callback query
      // Answer callback query with timeout
      const acController = new AbortController();
      const acId = setTimeout(() => acController.abort(), 5000); // 5s timeout
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: id }),
          signal: acController.signal
        });
        clearTimeout(acId);
      } catch (e) {
        clearTimeout(acId);
        console.error("Error answering callback:", e);
      }

      // --- Courtesy call callbacks ---
      if (data.startsWith("courtesy_done_") || data.startsWith("courtesy_skip_")) {
        const isDone = data.startsWith("courtesy_done_");
        const clientId = data.replace(isDone ? "courtesy_done_" : "courtesy_skip_", "");

        // Find admin by chat id
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("id, role")
          .eq("telegram_chat_id", chatId.toString())
          .maybeSingle();

        if (adminUser) {
          if (isDone) {
            const nextDue = new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString();

            // Record the call
            await supabase.from('client_courtesy_calls').insert({
              client_id: clientId,
              called_by: adminUser.id,
              called_at: new Date().toISOString(),
              next_call_due: nextDue
            });

            // Update client's next call due
            await supabase
              .from('admin_users')
              .update({ next_courtesy_call_due: nextDue })
              .eq('id', clientId);

            // Edit message to show confirmation
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: message.message_id,
                  text: `✅ Звонок отмечен! Следующий через 6 недель.`,
                  parse_mode: "HTML"
                })
              });
            } catch (_) {}
          } else {
            // Skip — just remove the message
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: message.message_id,
                  text: `⏭ Пропущен. Нажмите кнопку "Звонки клиентам" чтобы продолжить.`,
                  parse_mode: "HTML"
                })
              });
            } catch (_) {}
          }

          // Show updated keyboard with new count
          await sendTelegramMessage(botToken, chatId, isDone ? "📞 Продолжайте прозвон!" : "📞 Можете продолжить:", {
            keyboard: await getAdminKeyboard(adminUser.id, adminUser.role, chatId),
            resize_keyboard: true
          });
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (data.startsWith("select_object_")) {
        const objectId = data.replace("select_object_", "");

        // Find which worker record (profile) has this object assigned
        const { data: workers } = await supabase
          .from("workers")
          .select("id, worker_objects(object_id)")
          .eq("telegram_user_id", userId.toString());

        let targetWorkerId = null;
        if (workers) {
          // Iterate all workers to ensure exclusivity:
          // 1. Set selected_object_id for the worker who owns this object.
          // 2. Clear selected_object_id for all other workers.
          for (const w of workers) {
            const hasObject = w.worker_objects && w.worker_objects.some((wo: any) => wo.object_id === objectId);

            if (hasObject) {
              targetWorkerId = w.id;
              await supabase
                .from("workers")
                .update({ selected_object_id: objectId })
                .eq("id", w.id);
            } else {
              // Clear selection for other profiles to prevent ambiguity
              await supabase
                .from("workers")
                .update({ selected_object_id: null })
                .eq("id", w.id);
            }
          }
        }

        if (targetWorkerId) {
          await sendTelegramMessage(
            botToken,
            chatId,
            "📍 Отлично! Теперь отправьте мне ваше местоположение, нажав на кнопку ниже.",
            {
              keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            }
          );
        } else {
          await sendTelegramMessage(botToken, chatId, "❌ Ошибка: У вас нет доступа к этому объекту.");
        }
      } else if (data.startsWith("procurement_object_")) {
        const objectId = data.replace("procurement_object_", "");

        // Find the specific worker profile that owns this object
        const { data: procWorkers } = await supabase
          .from("workers")
          .select("id, worker_objects(object_id)")
          .eq("telegram_user_id", userId.toString());

        let targetWorker = procWorkers?.find((w: any) =>
          w.worker_objects?.some((wo: any) => wo.object_id === objectId)
        ) || procWorkers?.[0];

        if (targetWorker) {
          await supabase
            .from("workers")
            .update({
              bot_state: 'procurement_enter_name',
              temp_procurement_data: { object_id: objectId }
            })
            .eq("id", targetWorker.id);

          const keyboard = await getWorkerKeyboard(targetWorker.id);
          await sendTelegramMessage(botToken, chatId, "✍️ Напишите название товара, который нужно закупить (или список товаров).\n\n💡 <b>Пожалуйста, укажите количество для каждого товара!</b>", {
            keyboard: keyboard,
            resize_keyboard: true,
            inline_keyboard: [[{ text: "❌ Отменить заказ", callback_data: "procurement_cancel" }]]
          });
        }
      } else if (data === "procurement_cancel") {
        // Clear procurement state on ALL profiles for this user
        const { data: cancelWorkers } = await supabase
          .from("workers")
          .select("id")
          .eq("telegram_user_id", userId.toString());

        if (cancelWorkers && cancelWorkers.length > 0) {
          for (const w of cancelWorkers) {
            await supabase.from("workers").update({ bot_state: null, temp_procurement_data: null }).eq("id", w.id);
          }
          const keyboard = await getWorkerKeyboard(cancelWorkers[0].id);
          await sendTelegramMessage(botToken, chatId, "❌ Закупка отменена.", {
            keyboard: keyboard,
            resize_keyboard: true
          });
        }
      }
      else if (data === "procurement_skip_photo") {
        // Find the profile with active procurement state
        const { data: skipWorkers } = await supabase
          .from("workers")
          .select("id, bot_state")
          .eq("telegram_user_id", userId.toString());

        const skipWorker = skipWorkers?.find((w: any) => w.bot_state?.includes('procurement')) || skipWorkers?.[0];
        if (skipWorker) {
          const keyboard = await getWorkerKeyboard(skipWorker.id);
          await sendTelegramMessage(botToken, chatId, "✅ Фото пропущено. Теперь нажмите кнопку «🚀 Отправить заказ» ниже для отправки заявки.", {
            keyboard,
            resize_keyboard: true
          });
        }
      }
      else if (data === "end_work") {
        await sendTelegramMessage(
          botToken,
          chatId,
          "📍 Пожалуйста, отправьте ваше местоположение для завершения работы.",
          {
            keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          }
        );
      } else if (data === "finish_work") {
        console.log(`[finish_work] START for user ${userId}`);
        // Handle explicit finish after photos
        try {
          // Handle potential multiple worker profiles
          const { data: workers } = await supabase
            .from("workers")
            .select("id, first_name, last_name")
            .eq("telegram_user_id", userId.toString());

          if (!workers || workers.length === 0) {
            console.error(`[finish_work] Worker not found for ${userId}`);
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка: Работник не найден.");
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
          }

          let worker = null;
          let activeSession = null;

          // Find which worker has the active session
          for (const w of workers) {
            const { data: session } = await supabase
              .from("work_sessions")
              .select("*, cleaning_objects(name)")
              .eq("worker_id", w.id)
              .is("end_time", null)
              .maybeSingle();

            if (session) {
              worker = w;
              activeSession = session;
              break;
            }
          }

          if (!worker) {
            // Fallback: If no active session, just use the first worker for logging/error
            worker = workers[0];
          }

          console.log(`[finish_work] Selected worker: ${worker.id}, Active Session: ${activeSession?.id}`);

          if (activeSession) {
            const startTime = new Date(activeSession.start_time);
            const endTime = new Date();
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            // Check for pending client request tasks first
            const { data: pendingCRTasks } = await supabase
              .from("client_requests")
              .select("id, message, admin_message")
              .eq("object_id", activeSession.object_id)
              .eq("assigned_worker_id", worker.id)
              .eq("worker_task_status", "pending");

            if (pendingCRTasks && pendingCRTasks.length > 0) {
              const taskDesc = pendingCRTasks.map((t: any, i: number) => `${i + 1}. ${t.admin_message || t.message}`).join('\n');
              await sendTelegramMessage(
                botToken,
                chatId,
                `📋 <b>Подтвердите выполнение задания от клиента:</b>\n\n${taskDesc}`,
                {
                  inline_keyboard: [
                    [
                      { text: "✅ Да, выполнено", callback_data: `cr_confirm_${activeSession.id}` },
                    ],
                    [
                      { text: "❌ Нет, не выполнено", callback_data: `cr_fail_${activeSession.id}` },
                    ]
                  ]
                }
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
            }

            // Check if regular daily tasks are required
            const { data: objectData } = await supabase
              .from("cleaning_objects")
              .select("requires_tasks")
              .eq("id", activeSession.object_id)
              .single();

            if (objectData?.requires_tasks) {
              await sendTelegramMessage(
                botToken,
                chatId,
                "📋 <b>Вы выполнили все поставленные задачи?</b>",
                {
                  inline_keyboard: [
                    [
                      { text: "✅ Да, все выполнено", callback_data: `tasks_confirmed_${activeSession.id}` },
                    ],
                    [
                      { text: "❌ Нет, не все выполнено", callback_data: `tasks_failed_${activeSession.id}` },
                    ]
                  ]
                }
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
            }

            await supabase
              .from("work_sessions")
              .update({
                end_time: endTime.toISOString(),
                duration_minutes: durationMinutes,
              })
              .eq("id", activeSession.id);

            const keyboard = await getWorkerKeyboard(worker.id);
            console.log(`[finish_work] Sending Shift Finished message...`);
            await sendTelegramMessage(
              botToken,
              chatId,
              `✅ Смена завершена!\n⏱ Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м`,
              {
                keyboard: keyboard,
                resize_keyboard: true,
              }
            );
            console.log(`[finish_work] Shift Finished message sent.`);

            // Notify admins
            try {
              sendLocationToManagers(
                botToken,
                `${worker.first_name} ${worker.last_name}`,
                "end",
                activeSession.end_location, // Use stored location
                activeSession.cleaning_objects?.name,
                durationMinutes,
                activeSession.object_id,
                worker.id
              ).catch(err => console.error("Background notification error:", err));
            } catch (err) {
              console.error("Failed to trigger manager notifications:", err);
            }
          } else {
            console.log(`[finish_work] No active session found or already finished.`);
            await sendTelegramMessage(botToken, chatId, "⚠️ Смена уже завершена.");
          }
        } catch (err) {
          console.error(`[finish_work] CRITICAL ERROR:`, err);
          await sendTelegramMessage(botToken, chatId, "❌ Произошла ошибка при завершении смены. Попробуйте еще раз.");
        }
      } else if (data.startsWith("cr_confirm_") || data.startsWith("cr_fail_")) {
        const isConfirmed = data.startsWith("cr_confirm_");
        const sessionId = data.replace(isConfirmed ? "cr_confirm_" : "cr_fail_", "");

        try {
          // Get the active session to find worker and object
          const { data: session } = await supabase
            .from("work_sessions")
            .select("*, workers(*), cleaning_objects(name)")
            .eq("id", sessionId)
            .single();

          if (!session) {
            await sendTelegramMessage(botToken, chatId, "⚠️ Сессия не найдена.");
          } else {
            // Update all pending client requests for this worker+object
            const { data: crTasks } = await supabase
              .from("client_requests")
              .select("id")
              .eq("object_id", session.object_id)
              .eq("assigned_worker_id", session.worker_id)
              .eq("worker_task_status", "pending");

            if (crTasks && crTasks.length > 0) {
              const ids = crTasks.map((t: any) => t.id);
              await supabase
                .from("client_requests")
                .update({ worker_task_status: isConfirmed ? "confirmed" : "failed" })
                .in("id", ids);

              if (!isConfirmed) {
                // Notify guardians that task was NOT completed
                try {
                  const workerName = `${session.workers?.first_name} ${session.workers?.last_name}`;
                  const objectName = session.cleaning_objects?.name;
                  const alertMsg = `⚠️ <b>Задание не выполнено!</b>\n\n👤 Работник <b>${workerName}</b> был на объекте <b>${objectName}</b> и не подтвердил выполнение задания клиента.\n\n🔴 Требуется вмешательство!`;
                  const recipients = await getNotificationRecipients(session.object_id, session.worker_id);
                  for (const recipientChatId of recipients) {
                    await sendTelegramMessage(botToken, parseInt(recipientChatId), alertMsg);
                  }
                } catch (err) {
                  console.error("Failed to notify guardians about unconfirmed CR task:", err);
                }
              }
            }

            // Now check if we still need to handle requires_tasks
            const { data: objectData } = await supabase
              .from("cleaning_objects")
              .select("requires_tasks")
              .eq("id", session.object_id)
              .single();

            if (objectData?.requires_tasks && session.end_time === null) {
              await sendTelegramMessage(
                botToken,
                chatId,
                "📋 <b>Вы выполнили все поставленные задачи?</b>",
                {
                  inline_keyboard: [
                    [{ text: "✅ Да, все выполнено", callback_data: `tasks_confirmed_${sessionId}` }],
                    [{ text: "❌ Нет, не все выполнено", callback_data: `tasks_failed_${sessionId}` }]
                  ]
                }
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
            }

            // End the session
            if (session.end_time === null) {
              const startTime = new Date(session.start_time);
              const endTime = new Date();
              const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

              await supabase
                .from("work_sessions")
                .update({
                  end_time: endTime.toISOString(),
                  duration_minutes: durationMinutes,
                  tasks_completed: isConfirmed
                })
                .eq("id", sessionId);

              const keyboard = await getWorkerKeyboard(session.worker_id);
              await sendTelegramMessage(
                botToken,
                chatId,
                `✅ Смена завершена!\n⏱ Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м\n📋 Задание клиента: ${isConfirmed ? "✅ Выполнено" : "❌ Не выполнено"}`,
                { keyboard, resize_keyboard: true }
              );

              try {
                sendLocationToManagers(
                  botToken,
                  `${session.workers?.first_name} ${session.workers?.last_name}`,
                  "end",
                  session.end_location,
                  session.cleaning_objects?.name,
                  durationMinutes,
                  session.object_id,
                  session.worker_id
                ).catch(err => console.error("Background notification error:", err));
              } catch (err) {
                console.error("Failed to trigger manager notifications:", err);
              }
            }
          }
        } catch (err) {
          console.error("Error handling cr_confirm/cr_fail:", err);
          await sendTelegramMessage(botToken, chatId, "❌ Ошибка при обработке подтверждения.");
        }
      } else if (data.startsWith("tasks_confirmed_") || data.startsWith("tasks_failed_")) {
        const isConfirmed = data.startsWith("tasks_confirmed_");
        const sessionId = data.replace(isConfirmed ? "tasks_confirmed_" : "tasks_failed_", "");

        try {
          const { data: session } = await supabase
            .from("work_sessions")
            .select("*, workers(*), cleaning_objects(name)")
            .eq("id", sessionId)
            .single();

          if (session && !session.end_time) {
            const startTime = new Date(session.start_time);
            const endTime = new Date();
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            await supabase
              .from("work_sessions")
              .update({
                end_time: endTime.toISOString(),
                duration_minutes: durationMinutes,
                tasks_completed: isConfirmed
              })
              .eq("id", sessionId);

            const keyboard = await getWorkerKeyboard(session.worker_id);

            let message = `✅ Смена завершена!\n⏱ Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м`;
            if (isConfirmed) {
              message += `\n📋 Задачи выполнены: ✅`;
            } else {
              message += `\n📋 Задачи выполнены: ❌ (Отмечено как невыполненное)`;
            }

            await sendTelegramMessage(botToken, chatId, message, {
              keyboard: keyboard,
              resize_keyboard: true,
            });

            // Notify admins
            try {
              let managerMessage = `👤 <b>${session.workers.first_name} ${session.workers.last_name}</b>\n`;
              managerMessage += `🛑 Закончил работу на объекте <b>${session.cleaning_objects?.name}</b>\n`;
              managerMessage += `⏱ Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м\n`;
              managerMessage += `📋 Задачи выполнены: ${isConfirmed ? "✅ Да" : "❌ НЕТ"}`;

              const recipients = await getNotificationRecipients(session.object_id, session.worker_id);
              for (const managerChatId of recipients) {
                await sendTelegramMessage(botToken, parseInt(managerChatId), managerMessage);
              }
            } catch (err) {
              console.error("Failed to trigger manager notifications for tasks:", err);
            }
          } else {
            await sendTelegramMessage(botToken, chatId, "⚠️ Смена уже завершена или не найдена.");
          }
        } catch (err) {
          console.error("Error confirming tasks:", err);
          await sendTelegramMessage(botToken, chatId, "❌ Ошибка при сохранении статуса задач.");
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Helper to get Admin Keyboard
    const COURTESY_CALLS_CHAT_ID = '5125127700';
    const getAdminKeyboard = async (_adminId: string, role: string, chatId?: string | number) => {
        if (role === 'sub_admin' || role === 'super_admin' || role === 'admin') {
          const keyboard: any[][] = [];
          if (String(chatId) === COURTESY_CALLS_CHAT_ID) {
            keyboard.push([{ text: `📞 Звонки клиентам` }]);
          }
          return keyboard;
        } else {
          return [];
        }
      };

    // Handle regular messages
    if (update.message) {
      const { from, chat, text, location } = update.message;
      const chatId = chat.id;
      const userId = from.id;

      // --- PROCUREMENT LOGIC ---
      // Fetch ALL worker profiles for this telegram user (handles multiple profiles)
      const { data: currentWorkerProfiles } = await supabase
        .from("workers")
        .select("id, bot_state, temp_procurement_data, worker_objects(object_id, cleaning_objects(id, name))")
        .eq("telegram_user_id", userId.toString());

      // Find the worker with active procurement state, or fall back to first profile
      const currentWorker = currentWorkerProfiles?.find(w => w.bot_state?.includes('procurement')) || currentWorkerProfiles?.[0] || null;

      // Aggregate all objects from all profiles
      const allProcurementObjects: any[] = [];
      if (currentWorkerProfiles) {
        for (const w of currentWorkerProfiles) {
          if (w.worker_objects) {
            for (const wo of w.worker_objects as any[]) {
              if (wo.cleaning_objects) {
                allProcurementObjects.push(wo);
              }
            }
          }
        }
      }

      if (text === "🛍 Заказать закупку") {
        if (allProcurementObjects.length > 0) {
          const buttons = allProcurementObjects.map((wo: any) => {
            return [{ text: wo.cleaning_objects.name, callback_data: `procurement_object_${wo.cleaning_objects.id}` }];
          });

          buttons.push([{ text: "❌ Отмена", callback_data: "procurement_cancel" }]);

          await sendTelegramMessage(botToken, chatId, "📍 Выберите объект, для которого нужна закупка:", {
            inline_keyboard: buttons
          });
        } else {
          await sendTelegramMessage(botToken, chatId, "❌ У вас нет привязанных объектов.");
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      if (currentWorker?.bot_state === 'procurement_enter_name' && text && !text.startsWith('/')) {
        const isCancel = text.toLowerCase() === 'отмена' || text === '❌ Отмена' || text === '❌ Отменить заказ';
        if (isCancel) {
          await supabase.from("workers").update({ bot_state: null, temp_procurement_data: null }).eq("id", currentWorker.id);
          const keyboard = await getWorkerKeyboard(currentWorker.id);
          await sendTelegramMessage(botToken, chatId, "❌ Закупка отменена.", { keyboard, resize_keyboard: true });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }

        // Save item name and ask for photo
        await supabase
          .from("workers")
          .update({
            bot_state: 'procurement_upload_photo',
            temp_procurement_data: { ...currentWorker.temp_procurement_data, item_name: text }
          })
          .eq("id", currentWorker.id);

        const keyboard = await getWorkerKeyboard(currentWorker.id);
        await sendTelegramMessage(botToken, chatId, "📸 Пришлите фото того, что нужно (или нажмите кнопку 'Отправить заказ'):", {
          keyboard: keyboard,
          resize_keyboard: true,
          inline_keyboard: [
            [{ text: "➡️ Пропустить фото (Отправить)", callback_data: "procurement_skip_photo" }],
            [{ text: "❌ Отменить заказ", callback_data: "procurement_cancel" }]
          ]
        });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      // Handle Final Procurement Submission (Text Button)
      if (text === "🚀 Завершить заказ" || text === "🚀 Отправить заказ") {
        if (currentWorker?.bot_state === 'procurement_upload_photo' && currentWorker.temp_procurement_data) {
          const { object_id, item_name, photo_url } = currentWorker.temp_procurement_data;

          const { data: req, error } = await supabase
            .from("procurement_requests")
            .insert({
              worker_id: currentWorker.id,
              object_id: object_id,
              item_name: item_name,
              photo_url: photo_url || null,
              status: 'pending'
            })
            .select(`*, object:cleaning_objects(name)`)
            .single();

          if (!error && req) {
            await supabase.from("workers").update({ bot_state: null, temp_procurement_data: null }).eq("id", currentWorker.id);
            const keyboard = await getWorkerKeyboard(currentWorker.id);
            await sendTelegramMessage(botToken, chatId, `✅ Заказ на "<b>${item_name}</b>" успешно отправлен!`, {
              keyboard,
              resize_keyboard: true
            });

            // Notify Guardian
            const recipients = await getNotificationRecipients(object_id, currentWorker.id);
            const workerName = `Работник`; // Fallback or fetch full info if needed
            const caption = `🛍 <b>Новая заявка на закупку!</b>\n\n📍 Объект: ${req.object?.name}\n📦 Товар: ${item_name}`;

            for (const adminChatId of recipients) {
              if (photo_url) {
                await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: adminChatId,
                    photo: photo_url,
                    caption: caption,
                    parse_mode: "HTML"
                  }),
                });
              } else {
                await sendTelegramMessage(botToken, parseInt(adminChatId), caption);
              }
            }
          } else {
            console.error("Error creating procurement request:", error);
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка при отправке заказа. Попробуйте снова.");
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
      }

      // Handle Cancel (Text Button)
      if (text === "❌ Отмена" || text === "❌ Отменить заказ") {
        if (currentWorker?.bot_state?.includes('procurement')) {
          await supabase.from("workers").update({ bot_state: null, temp_procurement_data: null }).eq("id", currentWorker.id);
          const keyboard = await getWorkerKeyboard(currentWorker.id);
          await sendTelegramMessage(botToken, chatId, "❌ Закупка отменена.", {
            keyboard,
            resize_keyboard: true
          });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }
      }
      // -------------------------

      // 1. Activation Check (/start <token>)
      if (text?.startsWith("/start") && text.split(" ").length > 1) {
        const token = text.split(" ")[1];
        console.log(`[activation] Checking token: ${token} from user ${userId} (chat ${chatId})`);
        await logToSystem('info', 'activation', `Activation attempt with token: ${token}`, { userId, chatId, username: from.username });

        // Try Worker Token
        const { data: worker, error: workerLookupError } = await supabase.from("workers").select("id, first_name, last_name").eq("invitation_token", token).maybeSingle();
        if (workerLookupError) {
          console.error(`[activation] Worker lookup error:`, workerLookupError);
          await logToSystem('error', 'activation', `Worker token lookup failed: ${workerLookupError.message}`, { token, userId });
        }
        if (worker) {
          const { error: updateError } = await supabase.from("workers").update({
            telegram_user_id: userId.toString(),
            telegram_chat_id: chatId,
            telegram_username: from.username || "",
            is_active: true,
            invitation_token: null, // Clear token after successful activation
          }).eq("id", worker.id);

          if (updateError) {
            console.error(`[activation] Worker update FAILED for ${worker.id}:`, updateError);
            await logToSystem('error', 'activation', `Worker activation update failed: ${updateError.message}`, { workerId: worker.id, token, userId });
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка при активации. Пожалуйста, попросите администратора сгенерировать новую ссылку.");
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
          }

          console.log(`[activation] Worker ${worker.id} (${worker.first_name} ${worker.last_name}) activated successfully`);
          await logToSystem('info', 'activation', `Worker activated: ${worker.first_name} ${worker.last_name}`, { workerId: worker.id, userId, chatId }, worker.id);
          const keyboard = await getWorkerKeyboard(worker.id);
          await sendTelegramMessage(botToken, chatId, `✅ Вы успешно активировали аккаунт работника!`, { keyboard, resize_keyboard: true });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }

        // Check if worker already activated with this telegram user (re-click of old link)
        const { data: existingWorkers } = await supabase.from("workers").select("id, first_name, last_name").eq("telegram_user_id", userId.toString()).limit(1);
        const existingWorker = existingWorkers?.[0];
        if (existingWorker) {
          console.log(`[activation] User ${userId} already activated as worker ${existingWorker.id}`);
          const keyboard = await getWorkerKeyboard(existingWorker.id);
          await sendTelegramMessage(botToken, chatId, `👋 Вы уже активированы как ${existingWorker.first_name} ${existingWorker.last_name}!`, { keyboard, resize_keyboard: true });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }

        // Try Admin Token
        const { data: tokenAdmin, error: adminLookupError } = await supabase.from("admin_users").select("id, role").eq("invitation_token", token).maybeSingle();
        if (adminLookupError) {
          console.error(`[activation] Admin lookup error:`, adminLookupError);
          await logToSystem('error', 'activation', `Admin token lookup failed: ${adminLookupError.message}`, { token, userId });
        }
        if (tokenAdmin) {
          const { error: adminUpdateError } = await supabase.from("admin_users").update({
            telegram_chat_id: chatId.toString(),
            telegram_username: from.username || "",
            is_active: true,
            invitation_token: null, // Clear token after successful activation
          }).eq("id", tokenAdmin.id);

          if (adminUpdateError) {
            console.error(`[activation] Admin update FAILED for ${tokenAdmin.id}:`, adminUpdateError);
            await logToSystem('error', 'activation', `Admin activation update failed: ${adminUpdateError.message}`, { adminId: tokenAdmin.id, token, userId });
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка при активации. Пожалуйста, попросите главного администратора сгенерировать новую ссылку.");
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
          }

          await logToSystem('info', 'activation', `Admin activated successfully`, { adminId: tokenAdmin.id, userId, chatId });
          await sendTelegramMessage(botToken, chatId, `✅ Вы успешно активировали аккаунт администратора!`, {
            keyboard: await getAdminKeyboard(tokenAdmin.id, tokenAdmin.role, chatId),
            resize_keyboard: true
          });
          return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
        }

        await logToSystem('warn', 'activation', `Invalid or expired activation token`, { token, userId, chatId });
        await sendTelegramMessage(botToken, chatId, "❌ Неверный или истекший код активации. Попросите администратора сгенерировать новую ссылку.");
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      // 2. Identification (Is Admin or Worker?)
      const { data: admin } = await supabase
        .from("admin_users")
        .select("*")
        .eq("telegram_chat_id", chatId.toString())
        .maybeSingle();

      if (admin) {
        if (text === "/start") {
          await sendTelegramMessage(botToken, chatId, `👋 Здравствуйте, ${admin.name || "Администратор"}!`, {
            keyboard: await getAdminKeyboard(admin.id, admin.role, chatId),
            resize_keyboard: true
          });
        } else if (text?.startsWith("📞 Звонки клиентам") && String(chatId) === COURTESY_CALLS_CHAT_ID) {
          // Get due clients for this admin
          let dueClients: any[] = [];

          if (admin.role === 'super_admin') {
            // Super admin sees all due clients
            const { data } = await supabase
              .from('admin_users')
              .select('id, name, email, phone, next_courtesy_call_due')
              .eq('role', 'client')
              .lte('next_courtesy_call_due', new Date().toISOString())
              .order('next_courtesy_call_due', { ascending: true });
            dueClients = data || [];
          } else {
            // Sub-admin sees only clients linked to their objects
            const { data: ownedObjs } = await supabase
              .from('object_owners')
              .select('object_id')
              .eq('admin_id', admin.id);

            if (ownedObjs && ownedObjs.length > 0) {
              const objectIds = ownedObjs.map((o: any) => o.object_id);
              const { data: clientLinks } = await supabase
                .from('client_objects')
                .select('client_id')
                .in('object_id', objectIds);

              if (clientLinks && clientLinks.length > 0) {
                const clientIds = [...new Set(clientLinks.map((cl: any) => cl.client_id))];
                const { data } = await supabase
                  .from('admin_users')
                  .select('id, name, email, phone, next_courtesy_call_due')
                  .in('id', clientIds)
                  .eq('role', 'client')
                  .lte('next_courtesy_call_due', new Date().toISOString())
                  .order('next_courtesy_call_due', { ascending: true });
                dueClients = data || [];
              }
            }
          }

          if (dueClients.length === 0) {
            await sendTelegramMessage(botToken, chatId, "✅ Все клиенты прозвонены! Следующие звонки появятся через некоторое время.", {
              keyboard: await getAdminKeyboard(admin.id, admin.role, chatId),
              resize_keyboard: true
            });
          } else {
            const client = dueClients[0];
            const remaining = dueClients.length - 1;
            const phone = client.phone || 'не указан';
            const lastCall = client.next_courtesy_call_due
              ? new Date(new Date(client.next_courtesy_call_due).getTime() - 42 * 24 * 60 * 60 * 1000).toLocaleDateString('ru-RU')
              : 'никогда';

            let msg = `📞 <b>Звонок клиенту</b>\n\n`;
            msg += `👤 <b>${client.name || client.email}</b>\n`;
            msg += `📱 Телефон: <b>${phone}</b>\n`;
            msg += `📧 Email: ${client.email}\n`;
            msg += `🕐 Прошлый звонок: ${lastCall}\n`;
            if (remaining > 0) msg += `\n📋 Осталось ещё: ${remaining}`;

            await sendTelegramMessage(botToken, chatId, msg, {
              inline_keyboard: [
                [{ text: "✅ Позвонил", callback_data: `courtesy_done_${client.id}` }],
                [{ text: "⏭ Пропустить", callback_data: `courtesy_skip_${client.id}` }]
              ]
            });
          }
        } else {
          await sendTelegramMessage(botToken, chatId, `🤖 Вы в панели администратора.`, {
            keyboard: await getAdminKeyboard(admin.id, admin.role, chatId),
            resize_keyboard: true
          });
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      // 3. Worker Interaction
      const { data: workers } = await supabase
        .from("workers")
        .select("*, worker_objects(object_id, cleaning_objects(id, name))")
        .eq("telegram_user_id", userId.toString());

      if (!workers || workers.length === 0) {
        await sendTelegramMessage(botToken, chatId, "❌ Вы не зарегистрированы. Введите код приглашения через /start <код>.");
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      const activeWorker = workers[0]; // Use first profile for generic commands

      // Worker Command Handlers
      if (text === "/start") {
        const keyboard = await getWorkerKeyboard(activeWorker.id);
        await sendTelegramMessage(botToken, chatId, `👋 С возвращением, ${activeWorker.first_name}!`, {
          keyboard,
          resize_keyboard: true
        });
      } else if (text === "💰 Мои финансы" || text === "💼 Мой кабинет") {
        // Fetch worker info
        const { data: worker } = await supabase
          .from("workers")
          .select("first_name, last_name, total_points")
          .eq("id", activeWorker.id)
          .single();

        const points = worker?.total_points || 0;
        const name = worker ? `${worker.first_name} ${worker.last_name}` : activeWorker.first_name;

        // Current month range in Warsaw time
        const now = new Date();
        const warsawParts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit'
        }).format(now).split('-');
        const wYear = parseInt(warsawParts[0]);
        const wMonth = parseInt(warsawParts[1]);
        const monthStart = `${warsawParts[0]}-${warsawParts[1]}-01T00:00:00`;
        const monthEnd = new Date(wYear, wMonth, 1).toISOString();

        // Fetch sessions and adjustments in parallel
        const [sessionsRes, adjustmentsRes] = await Promise.all([
          supabase
            .from("work_sessions")
            .select("duration_minutes, object_id")
            .eq("worker_id", activeWorker.id)
            .gte("start_time", monthStart)
            .lt("start_time", monthEnd)
            .not("end_time", "is", null),
          supabase
            .from("salary_adjustments")
            .select("type, amount, hours, hourly_rate, description")
            .eq("worker_id", activeWorker.id)
            .eq("year", wYear)
            .eq("month", wMonth)
        ]);

        const sessions = sessionsRes.data || [];
        const adjustments = adjustmentsRes.data || [];

        // Get unique object ids
        const objectIds = [...new Set(sessions.map((s: any) => s.object_id).filter(Boolean))];

        let salaryLines = "";
        let baseSalary = 0;

        if (objectIds.length > 0) {
          const { data: objects } = await supabase
            .from("cleaning_objects")
            .select("id, name, salary_type, hourly_rate, monthly_rate, expected_cleanings_per_month")
            .in("id", objectIds);

          for (const obj of (objects || [])) {
            const objSessions = sessions.filter((s: any) => s.object_id === obj.id);
            const totalMinutes = objSessions.reduce((sum: number, s: any) => sum + (s.duration_minutes || 0), 0);
            const sessionCount = objSessions.length;

            let objSalary = 0;
            let calcNote = "";

            if (obj.salary_type === 'hourly') {
              const hours = totalMinutes / 60;
              objSalary = hours * (obj.hourly_rate || 0);
              calcNote = `${hours.toFixed(1)}ч × ${obj.hourly_rate} zł`;
            } else {
              const expected = obj.expected_cleanings_per_month || 1;
              const perSession = (obj.monthly_rate || 0) / expected;
              objSalary = perSession * sessionCount;
              calcNote = `${sessionCount} из ${expected} уборок`;
            }

            baseSalary += objSalary;
            salaryLines += `\n📍 <b>${obj.name}</b>\n`;
            salaryLines += `   ${calcNote} = <b>${objSalary.toFixed(0)} zł</b>\n`;
          }
        }

        // Process adjustments
        const overtimes = adjustments.filter((a: any) => a.type === 'overtime');
        const advances = adjustments.filter((a: any) => a.type === 'advance');
        const overtimeTotal = overtimes.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const advanceTotal = advances.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
        const totalSalary = baseSalary + overtimeTotal - advanceTotal;

        let adjustmentLines = "";
        if (overtimes.length > 0) {
          adjustmentLines += "\n🕐 <b>Переработки:</b>\n";
          for (const ot of overtimes) {
            const desc = ot.hours && ot.hourly_rate
              ? `${ot.hours}ч × ${ot.hourly_rate} zł`
              : (ot.description || 'Переработка');
            adjustmentLines += `   ${desc} = <b>+${Number(ot.amount).toFixed(0)} zł</b>\n`;
          }
        }
        if (advances.length > 0) {
          adjustmentLines += "\n💳 <b>Авансы:</b>\n";
          for (const adv of advances) {
            adjustmentLines += `   ${adv.description || 'Аванс'} = <b>-${Number(adv.amount).toFixed(0)} zł</b>\n`;
          }
        }

        const monthName = new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Europe/Warsaw', month: 'long', year: 'numeric'
        }).format(now);

        let summaryLine = `💵 Итого: <b>${totalSalary.toFixed(0)} zł</b>`;
        if (overtimeTotal > 0 || advanceTotal > 0) {
          summaryLine = `💵 Базовая: <b>${baseSalary.toFixed(0)} zł</b>\n`;
          if (overtimeTotal > 0) summaryLine += `➕ Переработки: <b>${overtimeTotal.toFixed(0)} zł</b>\n`;
          if (advanceTotal > 0) summaryLine += `➖ Авансы: <b>${advanceTotal.toFixed(0)} zł</b>\n`;
          summaryLine += `\n💰 К выплате: <b>${totalSalary.toFixed(0)} zł</b>`;
        }

        const message =
          `💰 <b>Мои финансы</b>\n` +
          `👤 ${name}\n` +
          `📅 ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}\n` +
          `━━━━━━━━━━━━━━\n` +
          (salaryLines || "\nНет смен в этом месяце\n") +
          adjustmentLines +
          `━━━━━━━━━━━━━━\n` +
          summaryLine + `\n\n` +
          `⭐ Баллы качества: <b>${points}</b>`;

        const keyboard = await getWorkerKeyboard(activeWorker.id);
        await sendTelegramMessage(botToken, chatId, message, {
          keyboard,
          resize_keyboard: true
        });
      } else if (text === "▶️ Начать работу") {
        const workerIds = workers.map(w => w.id);
        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("id, worker_id")
          .in("worker_id", workerIds)
          .is("end_time", null)
          .maybeSingle();

        if (activeSession) {
          const keyboard = await getWorkerKeyboard(activeSession.worker_id);
          await sendTelegramMessage(botToken, chatId, "⚠️ У вас уже есть активная смена.", { keyboard, resize_keyboard: true });
        } else {
          let allObjects: any[] = [];
          workers.forEach(w => {
            if (w.worker_objects) {
              w.worker_objects.forEach((wo: any) => {
                if (wo.cleaning_objects) allObjects.push({ ...wo, worker_id: w.id });
              });
            }
          });

          if (allObjects.length === 0) {
            await sendTelegramMessage(botToken, chatId, "❌ У вас нет назначенных объектов.");
          } else if (allObjects.length === 1) {
            const obj = allObjects[0];
            await supabase.from("workers").update({ selected_object_id: obj.cleaning_objects.id }).eq("id", obj.worker_id);
            await sendTelegramMessage(botToken, chatId, `📍 Объект: <b>${obj.cleaning_objects.name}</b>\n\nОтправьте геолокацию для начала.`, {
              keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            });
          } else {
            const buttons = allObjects.map(obj => [{ text: obj.cleaning_objects.name, callback_data: `select_object_${obj.cleaning_objects.id}` }]);
            await sendTelegramMessage(botToken, chatId, "📋 Выберите объект:", { inline_keyboard: buttons });
          }
        }
      } else if (text === "🛑 Закончить работу") {
        const workerIds = workers.map(w => w.id);
        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("id")
          .in("worker_id", workerIds)
          .is("end_time", null)
          .maybeSingle();

        if (!activeSession) {
          const keyboard = await getWorkerKeyboard(activeWorker.id);
          await sendTelegramMessage(botToken, chatId, "⚠️ Нет активной смены.", { keyboard, resize_keyboard: true });
        } else {
          await sendTelegramMessage(botToken, chatId, "📍 Отправьте геолокацию для завершения.", {
            keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          });
        }
      } else if (text && !text.startsWith('/')) {
        const keyboard = await getWorkerKeyboard(activeWorker.id);
        await sendTelegramMessage(botToken, chatId, `👋 С возвращением, ${activeWorker.first_name}!`, {
          keyboard,
          resize_keyboard: true,
        });
      }
      // Handle location
      else if (location) {


        if (!workers || workers.length === 0) {
          await sendTelegramMessage(botToken, chatId, "❌ Ваш аккаунт не найден.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Use first worker for generic logging
        const logWorker = workers[0];
        await logToSystem(
          'info',
          'shift',
          `Received location from worker ${logWorker.first_name} ${logWorker.last_name} (Multi-check)`,
          { latitude: location.latitude, longitude: location.longitude },
          logWorker.id
        );

        // 1. Check for Active Session (Priority: End Shift)
        const workerIds = workers.map(w => w.id);
        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("*, cleaning_objects(name)")
          .in("worker_id", workerIds)
          .is("end_time", null)
          .maybeSingle();

        if (activeSession) {
          // END SHIFT LOGIC
          const worker = workers.find(w => w.id === activeSession.worker_id);

          const startTime = new Date(activeSession.start_time);
          const endTime = new Date();
          const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

          const { data: objectData } = await supabase
            .from("cleaning_objects")
            .select("latitude, longitude, geofence_radius, name, requires_photos")
            .eq("id", activeSession.object_id)
            .single();

          let isInGeofence = true;
          let distanceMeters = 0;

          if (objectData?.latitude && objectData?.longitude) {
            distanceMeters = calculateDistance(
              objectData.latitude,
              objectData.longitude,
              location.latitude,
              location.longitude
            );
            const radius = objectData.geofence_radius || 100;
            isInGeofence = distanceMeters <= radius;

            if (!isInGeofence) {
              await notifyGeofenceViolation(
                botToken,
                `${worker.first_name} ${worker.last_name}`,
                objectData.name,
                distanceMeters,
                radius,
                'end',
                activeSession.object_id,
                worker.id
              );
            }
          }

          if (objectData?.requires_photos) {
            await supabase
              .from("work_sessions")
              .update({
                end_location: { latitude: location.latitude, longitude: location.longitude },
                is_end_in_geofence: isInGeofence,
                end_distance_meters: distanceMeters,
              })
              .eq("id", activeSession.id);

            await sendTelegramMessage(
              botToken,
              chatId,
              "✅ Локация принята",
              { remove_keyboard: true }
            );

            await sendTelegramMessage(
              botToken,
              chatId,
              "📸 <b>Требуется фотоотчет</b>\n\nПожалуйста, отправьте фотографии выполненной работы. Когда закончите, нажмите кнопку «Завершить».",
              {
                inline_keyboard: [[{ text: "✅ Завершить", callback_data: "finish_work" }]]
              }
            );
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          // First check if tasks are required
          if (objectData?.requires_tasks) {
            await supabase
              .from("work_sessions")
              .update({
                end_location: { latitude: location.latitude, longitude: location.longitude },
                is_end_in_geofence: isInGeofence,
                end_distance_meters: distanceMeters,
              })
              .eq("id", activeSession.id);

            await sendTelegramMessage(
              botToken,
              chatId,
              "✅ Локация принята",
              { remove_keyboard: true }
            );

            await sendTelegramMessage(
              botToken,
              chatId,
              "📋 <b>Вы выполнили все поставленные задачи?</b>",
              {
                inline_keyboard: [
                  [
                    { text: "✅ Да, все выполнено", callback_data: `tasks_confirmed_${activeSession.id}` },
                  ],
                  [
                    { text: "❌ Нет, не все выполнено", callback_data: `tasks_failed_${activeSession.id}` },
                  ]
                ]
              }
            );
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          await supabase
            .from("work_sessions")
            .update({
              end_time: endTime.toISOString(),
              end_location: { latitude: location.latitude, longitude: location.longitude },
              duration_minutes: durationMinutes,
              is_end_in_geofence: isInGeofence,
              end_distance_meters: distanceMeters,
            })
            .eq("id", activeSession.id);

          const keyboard = await getWorkerKeyboard(worker.id);

          await sendTelegramMessage(
            botToken,
            chatId,
            `✅ <b>Смена завершена</b>\n\n🕒 Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м\n📍 В геозоне: ${isInGeofence ? "Да" : "Нет"}`,
            {
              keyboard: keyboard,
              resize_keyboard: true
            }
          );

          await sendLocationToManagers(
            botToken,
            `${worker.first_name} ${worker.last_name}`,
            "end",
            { latitude: location.latitude, longitude: location.longitude },
            activeSession.cleaning_objects?.name,
            durationMinutes,
            activeSession.object_id,
            worker.id
          ).catch(err => console.error("Background notification error:", err));

          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });

        } else {
          // 2. START SHIFT LOGIC (if no active session)
          // Find if any worker has a selected object
          const workerWithSelection = workers.find(w => w.selected_object_id);

          if (!workerWithSelection) {
            const kb = await getWorkerKeyboard(workers[0].id);
            await sendTelegramMessage(botToken, chatId, "❌ Сначала выберите объект работы (нажмите '▶️ Начать работу').", {
              keyboard: kb,
              resize_keyboard: true
            });
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          const worker = workerWithSelection;

          const { data: objectFull } = await supabase
            .from("cleaning_objects")
            .select("id, name, latitude, longitude, geofence_radius")
            .eq("id", worker.selected_object_id)
            .single();

          let isInGeofence = true;
          let distanceMeters = 0;

          if (objectFull?.latitude && objectFull?.longitude) {
            distanceMeters = calculateDistance(
              objectFull.latitude,
              objectFull.longitude,
              location.latitude,
              location.longitude
            );
            const radius = objectFull.geofence_radius || 100;
            isInGeofence = distanceMeters <= radius;

            if (!isInGeofence) {
              await notifyGeofenceViolation(
                botToken,
                `${worker.first_name} ${worker.last_name}`,
                objectFull.name,
                distanceMeters,
                radius,
                'start',
                objectFull.id,
                worker.id
              );
            }
          }

          const { error } = await supabase
            .from("work_sessions")
            .insert({
              worker_id: worker.id,
              object_id: worker.selected_object_id,
              start_time: new Date().toISOString(),
              start_location: { latitude: location.latitude, longitude: location.longitude },
              is_start_in_geofence: isInGeofence,
              start_distance_meters: distanceMeters,
            });

          if (error) {
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка при начале работы. Попробуйте снова.");
          } else {
            const keyboard = await getWorkerKeyboard(worker.id);
            const dailyTasks = await getDailyTasks(objectFull?.id);


            let message = `✅ Работа начата на объекте <b>${objectFull?.name}</b>!\n`;

            if (dailyTasks.length > 0) {
              message += `\n📋 <b>Задачи на сегодня:</b>\n`;
              dailyTasks.forEach((task: any, index: number) => {
                message += `${index + 1}. ${task.title} ${task.is_special_task ? '⭐️' : ''}\n`;
              });
            } else {
              message += `\nЗадач на сегодня нет.`;
            }

            // Check for pending client request tasks
            const { data: pendingClientTasks } = await supabase
              .from("client_requests")
              .select("id, message, admin_message")
              .eq("object_id", objectFull?.id)
              .eq("assigned_worker_id", worker.id)
              .eq("worker_task_status", "pending");

            if (pendingClientTasks && pendingClientTasks.length > 0) {
              message += `\n\n⚠️ <b>Задания от клиента (${pendingClientTasks.length}):</b>\n`;
              pendingClientTasks.forEach((task: any, index: number) => {
                message += `${index + 1}. ${task.admin_message || task.message}\n`;
              });
            }

            message += `\nНе забудьте завершить работу в конце смены.`;

            await sendTelegramMessage(
              botToken,
              chatId,
              message,
              {
                keyboard: keyboard,
                resize_keyboard: true,
              }
            );

            // Notify admins
            console.log(`[START SHIFT] About to call sendLocationToManagers`);
            console.log(`[START SHIFT] Worker: ${worker.first_name} ${worker.last_name}`);
            console.log(`[START SHIFT] Object: ${objectFull?.name} (${objectFull?.id})`);
            console.log(`[START SHIFT] Worker ID: ${worker.id}`);

            await sendLocationToManagers(
              botToken,
              `${worker.first_name} ${worker.last_name}`,
              "start",
              { latitude: location.latitude, longitude: location.longitude },
              objectFull?.name,
              undefined,
              objectFull?.id,
              worker.id
            ).catch(err => console.error("Background notification error:", err));

            console.log(`[START SHIFT] sendLocationToManagers completed`);
          }
        }
      }
    }


    // Handle Photos
    if (update.message?.photo) {
      const { from, chat, photo } = update.message;
      const userId = from.id;
      const chatId = chat.id;

      // Get largest photo
      const fileId = photo[photo.length - 1].file_id;

      const { data: allWorkers } = await supabase
        .from("workers")
        .select("id, bot_state, temp_procurement_data")
        .eq("telegram_user_id", userId.toString());

      if (allWorkers && allWorkers.length > 0) {
        // Check if ANY worker profile is in procurement state
        const procurementWorker = allWorkers.find((w: any) =>
          w.bot_state === 'procurement_upload_photo' || w.bot_state === 'procurement_enter_name'
        );

        if (procurementWorker) {
          // PROCUREMENT PHOTO HANDLER (use the procurement worker profile)
          const worker = procurementWorker;
          let itemName = worker.temp_procurement_data?.item_name;
          const photoCaption = update.message.caption;

          // SPECIAL CASE: User sent photo while in 'enter_name' state
          if (worker.bot_state === 'procurement_enter_name') {
            if (photoCaption) {
              itemName = photoCaption;
            } else {
              await sendTelegramMessage(botToken, chatId, "⚠️ Пожалуйста, сначала введите название товара (текстом) или добавьте подпись к фото.");
              return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
            }
          }

          if (worker.temp_procurement_data || itemName) {
            const object_id = worker.temp_procurement_data?.object_id;

            // 1. Get file path
            const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
            const fileData = await fileRes.json();
            if (fileData.ok) {
              const filePath = fileData.result.file_path;
              const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

              // 2. Download and Upload
              const imageRes = await fetch(fileUrl);
              const imageBlob = await imageRes.blob();
              const fileName = `procurement/${worker.id}/${Date.now()}.jpg`;

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('shift-photos')
                .upload(fileName, imageBlob, { contentType: 'image/jpeg' });

              if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('shift-photos').getPublicUrl(fileName);

                // Save photo URL but don't finish yet
                await supabase
                  .from("workers")
                  .update({
                    bot_state: 'procurement_upload_photo',
                    temp_procurement_data: {
                      ...worker.temp_procurement_data,
                      photo_url: publicUrl,
                      item_name: itemName
                    }
                  })
                  .eq("id", worker.id);

                const keyboard = await getWorkerKeyboard(worker.id);
                await sendTelegramMessage(botToken, chatId, "📸 Фото добавлено! Нажмите «🚀 Отправить заказ» для отправки.", {
                  keyboard,
                  resize_keyboard: true
                });
              }
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
          } else {
            // State is procurement, but data is missing. Do not fall through.
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка данных закупки. Попробуйте снова.");
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
          }
        }

        // SHIFT PHOTO HANDLER: Find the worker profile with an active session
        let activeWorker = null;
        let activeSession = null;

        for (const w of allWorkers) {
          const { data: session } = await supabase
            .from("work_sessions")
            .select("id")
            .eq("worker_id", w.id)
            .is("end_time", null)
            .maybeSingle();

          if (session) {
            activeWorker = w;
            activeSession = session;
            break;
          }
        }

        if (activeWorker && activeSession) {
          console.log(`[photo] Found active session ${activeSession.id} for worker ${activeWorker.id} (out of ${allWorkers.length} profiles)`);
          const success = await handlePhotoUpload(botToken, fileId, activeWorker.id, activeSession.id);
          if (success) {
            // Optional: React to message
          } else {
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка загрузки фото.");
          }
        } else {
          console.warn(`[photo] No active session found for any of ${allWorkers.length} worker profiles (telegram_user_id: ${userId})`);
        }
      }
    }

    // 4. Handle "Reply to Email" Callback
    if (update.callback_query) {
      const { data, message, from } = update.callback_query;
      const chatId = message.chat.id;
      const userId = from.id; // Telegram User ID

      if (data.startsWith('reply_email_')) {
        // Format: reply_email_{accountId}_{remoteId} (or just unique ID if we have it)
        // But we need the FROM address and SUBJECT. 
        // Since 64 bytes is tight, we should probably have stored the email details in the notification 
        // OR fetch them from DB using remoteId.

        const parts = data.split('_');
        // reply_email_{accountId}_{remoteId}
        // parts[0] = reply
        // parts[1] = email
        // parts[2] = accountId
        // parts[3] = remoteId

        if (parts.length >= 4) {
          const accountId = parts[2];
          const remoteId = parts.slice(3).join('_'); // in case remoteId has underscores

          // Fetch message details to know who to reply to
          const { data: emailMsg } = await supabase
            .from('email_messages')
            .select('from_address, subject, account_id')
            .eq('account_id', accountId)
            .eq('remote_id', remoteId)
            .single();

          if (emailMsg) {
            // Set worker state
            // We need to find the worker by telegram_user_id to set state
            await supabase
              .from("workers")
              .update({
                bot_state: 'replying_to_email',
                email_reply_data: {
                  account_id: emailMsg.account_id,
                  to: emailMsg.from_address,
                  subject: `Re: ${emailMsg.subject}`,
                  original_remote_id: remoteId
                }
              })
              .eq("telegram_user_id", userId.toString());

            await sendTelegramMessage(botToken, chatId, `✉️ <b>Ответ на:</b> ${emailMsg.subject}\nКому: ${emailMsg.from_address}\n\n✍️ Введите текст вашего ответа (или отправьте фото):`);
          } else {
            await sendTelegramMessage(botToken, chatId, "❌ Не удалось найти исходное сообщение (возможно, оно удалено).");
          }
        }

        // Answer callback
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: update.callback_query.id })
        });

        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // 5. Handle Text Messages (General)
    if (update.message?.text) {
      const { text, chat, from } = update.message;
      const userId = from.id;
      const chatId = chat.id;

      // Check if user is in 'replying_to_email' state (handles multiple profiles)
      const { data: emailWorkers } = await supabase
        .from("workers")
        .select("id, bot_state, email_reply_data")
        .eq("telegram_user_id", userId.toString());

      const worker = emailWorkers?.find((w: any) => w.bot_state === 'replying_to_email' && w.email_reply_data) || null;

      if (worker && worker.bot_state === 'replying_to_email' && worker.email_reply_data) {
        // Send the email
        const replyData = worker.email_reply_data;

        await sendTelegramMessage(botToken, chatId, "⏳ Отправка письма...");

        try {
          // Call send-email function
          const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              account_id: replyData.account_id,
              to: replyData.to,
              subject: replyData.subject,
              body: text
            })
          });

          if (response.ok) {
            await sendTelegramMessage(botToken, chatId, "✅ Письмо отправлено!");
            // Clear state
            await supabase.from("workers").update({ bot_state: null, email_reply_data: null }).eq("id", worker.id);
          } else {
            const err = await response.text();
            await sendTelegramMessage(botToken, chatId, `❌ Ошибка отправки: ${err}`);
          }
        } catch (e) {
          await sendTelegramMessage(botToken, chatId, `❌ Ошибка: ${e.message}`);
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    await logToSystem('error', 'bot_crash', `Bot crashed: ${error.message}`, { stack: error.stack });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
