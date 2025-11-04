const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// قراءة المتغيرات من Render Environment
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;

if (!BOT_TOKEN || !API_URL) {
  console.error("❌ BOT_TOKEN or API_URL is missing!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// أمر /start
bot.start((ctx) => {
  ctx.reply("مرحبًا! أرسل لي رابط Reel من Instagram لتحميله كفيديو أو صوت.");
});

// استقبال أي رسالة تحتوي على رابط Instagram
bot.on("text", async (ctx) => {
  const url = ctx.message.text.trim();
  if (!url.includes("instagram.com")) {
    return ctx.reply("⚠️ الرابط غير صالح. أرسل رابط Reel صالح من Instagram.");
  }

  try {
    // إرسال رسالة اختيار الفيديو أو الصوت
    ctx.reply("هل تريد تنزيله كـ فيديو أو صوت؟", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎥 فيديو", callback_data: `video|${url}` },
            { text: "🎵 صوت", callback_data: `audio|${url}` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(err);
    ctx.reply("❌ حدث خطأ، حاول مرة أخرى.");
  }
});

// التعامل مع الأزرار
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [type, url] = data.split("|");

  await ctx.answerCbQuery(); // لإغلاق مؤشر التحميل عند الضغط على الزر

  if (type === "video") {
    try {
      const response = await axios.get(
        `${API_URL}/api/reel?url=${encodeURIComponent(url)}`
      );
      const videoUrl = response.data.videoUrl;
      await ctx.replyWithVideo({ url: videoUrl });
    } catch (err) {
      console.error(err);
      ctx.reply("❌ فشل في جلب الفيديو. تحقق من الرابط.");
    }
  } else if (type === "audio") {
    try {
      const response = await axios({
        url: `${API_URL}/api/reel?url=${encodeURIComponent(url)}&type=audio`,
        method: "GET",
        responseType: "stream",
      });

      const tempPath = path.join(__dirname, "temp_audio.mp3");
      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);

      writer.on("finish", async () => {
        await ctx.replyWithAudio({ source: tempPath });
        fs.unlinkSync(tempPath);
      });

      writer.on("error", (err) => {
        console.error(err);
        ctx.reply("❌ حدث خطأ أثناء تحميل الصوت.");
      });
    } catch (err) {
      console.error(err);
      ctx.reply("❌ حدث خطأ أثناء تحويل الصوت.");
    }
  }
});

// تشغيل البوت
bot.launch().then(() => console.log("✅ Telegram bot running!"));

// لإيقاف البوت بشكل آمن
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
