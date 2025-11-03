const { Telegraf } = require("telegraf");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL; // رابط API المستضاف على Render

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("أهلاً! أرسل رابط Reel وسأعطيك خيار تحميل الفيديو أو الصوت.")
);

bot.on("text", async (ctx) => {
  const message = ctx.message.text;

  if (!message.includes("instagram.com/reel")) {
    return ctx.reply("الرجاء إرسال رابط Reel صحيح.");
  }

  ctx.reply("هل تريد تنزيله كـ فيديو أو صوت؟", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎥 فيديو", callback_data: `video|${message}` },
          { text: "🎵 صوت", callback_data: `audio|${message}` },
        ],
      ],
    },
  });
});

bot.on("callback_query", async (ctx) => {
  const [type, url] = ctx.callbackQuery.data.split("|");
  await ctx.answerCbQuery();

  if (type === "video") {
    try {
      const apiResponse = await axios.get(`${API_URL}/api/reel`, {
        params: { url },
      });
      ctx.reply(`رابط الفيديو:\n${apiResponse.data.videoUrl}`);
    } catch {
      ctx.reply("حدث خطأ أثناء جلب الفيديو.");
    }
  } else {
    ctx.reply("جارٍ تجهيز الملف الصوتي...");
    try {
      const response = await axios.get(`${API_URL}/api/reel`, {
        params: { url, type: "audio" },
        responseType: "stream",
      });
      ctx.replyWithAudio({ source: response.data, filename: "audio.mp3" });
    } catch {
      ctx.reply("حدث خطأ أثناء تجهيز الملف الصوتي.");
    }
  }
});

bot.launch();
console.log("✅ Telegram Bot running...");
