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
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
    };
    message: {
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

async function getWorkerKeyboard(workerId: string) {
  const { data: activeSession } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("worker_id", workerId)
    .is("end_time", null)
    .maybeSingle();

  if (activeSession) {
    return [[{ text: "🛑 Закончить работу" }]];
  } else {
    return [[{ text: "▶️ Начать работу" }]];
  }
}

async function getDailyTasks(objectId: string) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
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

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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


// Helper to get recipients (Worker Creator > Object Creator > Fallback)
async function getNotificationRecipients(objectId?: string, workerId?: string) {
  console.log(`[getNotificationRecipients] Called with objectId: ${objectId}, workerId: ${workerId}`);
  const recipients = new Set<string>();

  // 1. Worker's Creator (Personal Guardian) - Always gets notified
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
        console.log(`[getNotificationRecipients] Added worker creator: ${admin.telegram_chat_id}`);
      }
    }
  }

  // 2. Object Owners (Guardians) - Fetch via secure RPC
  if (objectId) {
    console.log(`[getNotificationRecipients] Fetching object owners via RPC for objectId: ${objectId}`);
    const { data: owners, error } = await supabase.rpc('get_object_owners_with_chat_ids', {
      target_object_id: objectId
    });

    console.log(`[getNotificationRecipients] RPC result - owners:`, owners, 'error:', error);

    if (owners && owners.length > 0) {
      owners.forEach((o: any) => {
        console.log(`[getNotificationRecipients] Adding object owner: ${o.telegram_chat_id}`);
        recipients.add(o.telegram_chat_id);
      });
    } else if (error) {
      console.error(`[getNotificationRecipients] ERROR fetching object owners:`, error);
    }
  }

  // 3. Fallback: If absolutely no one found, notify ALL Admins
  if (recipients.size === 0) {
    console.log(`[getNotificationRecipients] No recipients found, falling back to ALL admins`);
    const { data: allAdmins } = await supabase
      .from("admin_users")
      .select("telegram_chat_id")
      .not("telegram_chat_id", "is", null);

    console.log(`[getNotificationRecipients] All admins:`, allAdmins);

    if (allAdmins) {
      allAdmins.forEach(a => {
        if (a.telegram_chat_id) {
          recipients.add(a.telegram_chat_id);
          console.log(`[getNotificationRecipients] Added admin (fallback): ${a.telegram_chat_id}`);
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
    console.error(`[sendLocationToManagers] WARNING: No recipients found! This should not happen.`);
    await logToSystem(
      'error',
      'notification',
      `No recipients found for ${action} notification`,
      { workerName, objectName, objectId, workerId },
      workerId,
      objectId
    );
    return;
  }

  for (const chatId of recipients) {
    console.log(`[sendLocationToManagers] Sending to chatId: ${chatId}`);
    let message = `👤 <b>${workerName}</b>\n`;
    message += action === "start"
      ? `▶️ Начал работу${objectName ? ` на объекте <b>${objectName}</b>` : ""}`
      : `🛑 Закончил работу${objectName ? ` на объекте <b>${objectName}</b>` : ""}`;

    if (duration) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      message += `\n⏱ Длительность: ${hours}ч ${minutes}м`;
    }

    try {
      await sendTelegramMessage(botToken, parseInt(chatId), message);
      await logToSystem(
        'info',
        'notification',
        `Sent ${action} notification to admin`,
        { chat_id: chatId, workerName, objectName },
        workerId,
        objectId
      );
    } catch (error) {
      console.error(`[sendLocationToManagers] Error sending to ${chatId}:`, error);
      await logToSystem(
        'error',
        'notification',
        `Failed to send ${action} notification`,
        { chat_id: chatId, error: String(error) },
        workerId,
        objectId
      );
    }

    // Send location
    if (location?.latitude && location?.longitude) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendLocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: parseInt(chatId),
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      });
    }
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

      const caption = `📸 <b>Новое фото-отчет</b>\n\n👤 Работник: ${workerName}\n📍 Объект: ${objectName}`;

      for (const chatId of recipients) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: fileId,
            caption: caption,
            parse_mode: "HTML"
          }),
        });
      }
    }

    return true;
  } catch (error) {
    console.error('Error handling photo:', error);
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
    const update: TelegramUpdate = await req.json();

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
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: id }),
      });

      if (data.startsWith("select_object_")) {
        const objectId = data.replace("select_object_", "");

        // Update worker's selected object
        await supabase
          .from("workers")
          .update({ selected_object_id: objectId })
          .eq("telegram_user_id", userId.toString());

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
      } else if (data === "end_work") {
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
        // Handle explicit finish after photos
        const { data: worker } = await supabase
          .from("workers")
          .select("id, first_name, last_name")
          .eq("telegram_user_id", userId.toString())
          .single();

        if (worker) {
          const { data: activeSession } = await supabase
            .from("work_sessions")
            .select("*, cleaning_objects(name)")
            .eq("worker_id", worker.id)
            .is("end_time", null)
            .maybeSingle();

          if (activeSession) {
            const startTime = new Date(activeSession.start_time);
            const endTime = new Date();
            const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

            await supabase
              .from("work_sessions")
              .update({
                end_time: endTime.toISOString(),
                duration_minutes: durationMinutes,
              })
              .eq("id", activeSession.id);

            const keyboard = await getWorkerKeyboard(worker.id);
            await sendTelegramMessage(
              botToken,
              chatId,
              `✅ Смена завершена!\n⏱ Длительность: ${Math.floor(durationMinutes / 60)}ч ${durationMinutes % 60}м`,
              {
                keyboard: keyboard,
                resize_keyboard: true,
              }
            );

            // Notify admins
            await sendLocationToManagers(
              botToken,
              `${worker.first_name} ${worker.last_name}`,
              "end",
              activeSession.end_location, // Use stored location
              activeSession.cleaning_objects?.name,
              durationMinutes,
              activeSession.object_id,
              worker.id
            );
          } else {
            await sendTelegramMessage(botToken, chatId, "⚠️ Смена уже завершена.");
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle regular messages
    if (update.message) {
      const { from, chat, text, location } = update.message;
      const chatId = chat.id;
      const userId = from.id;

      // Handle /start command
      if (text?.startsWith("/start")) {
        const parts = text.split(" ");

        if (parts.length > 1) {
          // Activation with token
          const token = parts[1];

          const { data: worker, error } = await supabase
            .from("workers")
            .select("*")
            .eq("invitation_token", token)
            .maybeSingle();

          if (worker) {
            // Activate worker
            await supabase
              .from("workers")
              .update({
                telegram_user_id: userId.toString(),
                telegram_chat_id: chatId,
                telegram_username: from.username || "",
                is_active: true,
              })
              .eq("id", worker.id);

            const keyboard = await getWorkerKeyboard(worker.id);
            await sendTelegramMessage(
              botToken,
              chatId,
              `✅ Отлично, ${worker.first_name}! Вы успешно активировали свой аккаунт.\n\nТеперь вы можете начать работу.`,
              {
                keyboard: keyboard,
                resize_keyboard: true,
              }
            );
          } else {
            // Try to find Admin with this token
            const { data: admin, error: adminError } = await supabase
              .from("admin_users")
              .select("*")
              .eq("invitation_token", token)
              .maybeSingle();

            if (admin) {
              // Activate Admin
              await supabase
                .from("admin_users")
                .update({
                  telegram_chat_id: chatId.toString(), // Store as string to match schema
                  telegram_username: from.username || "",
                  is_active: true
                })
                .eq("id", admin.id);

              await sendTelegramMessage(
                botToken,
                chatId,
                `✅ Здравствуйте, ${admin.name || "Администратор"}! Вы успешно активировали уведомления.\n\nТеперь вы будете получать отчеты с назначенных объектов.`
              );
            } else {
              await sendTelegramMessage(botToken, chatId, "❌ Неверный код активации. Обратитесь к администратору.");
            }
          }
        } else {
          // Check if user is already a worker
          const { data: existingWorker } = await supabase
            .from("workers")
            .select("id, first_name")
            .eq("telegram_user_id", userId.toString())
            .maybeSingle();

          if (existingWorker) {
            const keyboard = await getWorkerKeyboard(existingWorker.id);
            await sendTelegramMessage(
              botToken,
              chatId,
              `👋 С возвращением, ${existingWorker.first_name}!`,
              {
                keyboard: keyboard,
                resize_keyboard: true,
              }
            );
          } else {
            // Check if user is admin
            const { data: existingAdmin } = await supabase
              .from("admin_users")
              .select("name")
              .eq("telegram_chat_id", chatId.toString()) // Check by chat_id for admins usually, or user_id?
              // The schema stores telegram_chat_id. Usually chat_id === user_id in private chats.
              // Let's check both or just chat_id since we store that.
              .maybeSingle();

            if (existingAdmin) {
              await sendTelegramMessage(
                botToken,
                chatId,
                `👋 Здравствуйте, ${existingAdmin.name || "Администратор"}! Вы уже активированы и будете получать отчеты.`
              );
            } else {
              // Check legacy bot_admins
              const { data: legacyAdmin } = await supabase
                .from("bot_admins")
                .select("name")
                .eq("telegram_chat_id", chatId.toString())
                .eq("is_active", true)
                .maybeSingle();

              if (legacyAdmin) {
                await sendTelegramMessage(
                  botToken,
                  chatId,
                  `👋 Здравствуйте, ${legacyAdmin.name || "Администратор"}! Вы (Legacy) уже активированы.`
                );
              } else {
                // Truly unknown
                await sendTelegramMessage(
                  botToken,
                  chatId,
                  "👋 Добро пожаловать! Это бот для отслеживания рабочего времени.\n\nДля активации используйте ссылку, полученную от администратора."
                );
              }
            }
          }
        }
      }
      // Handle "Start Work" button
      else if (text === "▶️ Начать работу") {
        const { data: worker } = await supabase
          .from("workers")
          .select("*, worker_objects(object_id, cleaning_objects(id, name))")
          .eq("telegram_user_id", userId.toString())
          .maybeSingle();

        if (!worker) {
          await sendTelegramMessage(botToken, chatId, "❌ Ваш аккаунт не найден. Обратитесь к администратору.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Check if there's an active session
        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("*")
          .eq("worker_id", worker.id)
          .is("end_time", null)
          .maybeSingle();

        if (activeSession) {
          const keyboard = await getWorkerKeyboard(worker.id);
          await sendTelegramMessage(botToken, chatId, "⚠️ У вас уже есть активная рабочая смена. Сначала завершите её.", {
            keyboard: keyboard,
            resize_keyboard: true
          });
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const objects = worker.worker_objects || [];

        if (objects.length === 0) {
          await sendTelegramMessage(botToken, chatId, "❌ У вас нет назначенных объектов. Обратитесь к администратору.");
        } else if (objects.length === 1) {
          // Auto-select the only object
          await supabase
            .from("workers")
            .update({ selected_object_id: objects[0].cleaning_objects.id })
            .eq("id", worker.id);

          await sendTelegramMessage(
            botToken,
            chatId,
            `📍 Объект: <b>${objects[0].cleaning_objects.name}</b>\n\nОтправьте мне ваше местоположение, нажав на кнопку ниже.`,
            {
              keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            }
          );
        } else {
          // Show object selection
          const buttons = objects.map((obj: any) => [{
            text: obj.cleaning_objects.name,
            callback_data: `select_object_${obj.cleaning_objects.id}`,
          }]);

          await sendTelegramMessage(
            botToken,
            chatId,
            "📋 Выберите объект работы:",
            { inline_keyboard: buttons }
          );
        }
      }
      // Handle "End Work" button
      else if (text === "🛑 Закончить работу") {
        const { data: worker } = await supabase
          .from("workers")
          .select("*")
          .eq("telegram_user_id", userId.toString())
          .maybeSingle();

        if (!worker) {
          await sendTelegramMessage(botToken, chatId, "❌ Ваш аккаунт не найден.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("*")
          .eq("worker_id", worker.id)
          .is("end_time", null)
          .maybeSingle();

        if (!activeSession) {
          const keyboard = await getWorkerKeyboard(worker.id);
          await sendTelegramMessage(botToken, chatId, "⚠️ У вас нет активной рабочей смены.", {
            keyboard: keyboard,
            resize_keyboard: true
          });
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        await sendTelegramMessage(
          botToken,
          chatId,
          "📍 Отправьте ваше местоположение для завершения работы.",
          {
            keyboard: [[{ text: "📍 Отправить местоположение", request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          }
        );
      }
      // Handle location
      else if (location) {
        const { data: worker } = await supabase
          .from("workers")
          .select("*")
          .eq("telegram_user_id", userId.toString())
          .maybeSingle();

        if (!worker) {
          await sendTelegramMessage(botToken, chatId, "❌ Ваш аккаунт не найден.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        // Log that we received location
        await logToSystem(
          'info',
          'shift',
          `Received location from worker ${worker.first_name} ${worker.last_name}`,
          { latitude: location.latitude, longitude: location.longitude },
          worker.id
        );

        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("*, cleaning_objects(name)")
          .eq("worker_id", worker.id)
          .is("end_time", null)
          .maybeSingle();

        if (activeSession) {
          // End work session
          const startTime = new Date(activeSession.start_time);
          const endTime = new Date();
          const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

          // Get object data for geofence validation and requirements
          const { data: objectData } = await supabase
            .from("cleaning_objects")
            .select("latitude, longitude, geofence_radius, name, requires_photos")
            .eq("id", activeSession.object_id) // Explicitly use activeSession.object_id
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

          // Check if photos are required
          if (objectData?.requires_photos) {
            // Update location but keep session active (no end_time)
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

          // If no photos required, close the session completely
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

          // Notify admins
          await sendLocationToManagers(
            botToken,
            `${worker.first_name} ${worker.last_name}`,
            "end",
            { latitude: location.latitude, longitude: location.longitude },
            activeSession.cleaning_objects?.name,
            durationMinutes,
            activeSession.object_id,
            worker.id
          );

          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } else {
          // Start work session
          if (!worker.selected_object_id) {
            await sendTelegramMessage(botToken, chatId, "❌ Сначала выберите объект работы.");
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }

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
            );

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

      const { data: worker } = await supabase
        .from("workers")
        .select("id")
        .eq("telegram_user_id", userId.toString())
        .maybeSingle();

      if (worker) {
        const { data: activeSession } = await supabase
          .from("work_sessions")
          .select("id")
          .eq("worker_id", worker.id)
          .is("end_time", null)
          .maybeSingle();

        if (activeSession) {
          const success = await handlePhotoUpload(botToken, fileId, worker.id, activeSession.id);
          if (success) {
            // Optional: React to message
          } else {
            await sendTelegramMessage(botToken, chatId, "❌ Ошибка загрузки фото.");
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
