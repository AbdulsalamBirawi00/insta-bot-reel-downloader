const express = require("express");
const cors = require("cors");
const { instagramGetUrl } = require("instagram-url-direct");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");
const { Telegraf } = require("telegraf");

const app = express();
app.use(cors());

// ---------- Instagram Reel Endpoint ----------
app.get("/api/reel", async (req, res) => {
  let { url, type } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    url = url.split("?")[0];
    const result = await instagramGetUrl(url);

    if (!result?.url_list?.length)
      return res.status(404).json({ error: "Video not found" });

    const videoUrl = result.url_list[0];

    if (type === "audio") {
      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Disposition", `attachment; filename="audio.mp3"`);
      res.setHeader("Content-Type", "audio/mpeg");

      ffmpeg(response.data)
        .setFfmpegPath(ffmpegPath)
        .format("mp3")
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          if (!res.headersSent)
            res.status(500).json({ error: "Conversion failed" });
        })
        .pipe(res, { end: true });
    } else {
      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;

      const videoResponse = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        headers,
      });

      if (videoResponse.headers["content-length"])
        res.setHeader(
          "Content-Length",
          videoResponse.headers["content-length"]
        );
      if (videoResponse.headers["content-range"]) {
        res.status(206);
        res.setHeader("Content-Range", videoResponse.headers["content-range"]);
      }

      res.setHeader("Content-Disposition", `attachment; filename="video.mp4"`);
      res.setHeader("Content-Type", "video/mp4");

      videoResponse.data.pipe(res);
    }
  } catch (err) {
    console.error("Error in /api/reel:", err);
    res.status(500).json({ error: "Failed to fetch video" });
  }
});

// ---------- Telegram Bot ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = process.env.API_URL;

if (!BOT_TOKEN || !API_URL) {
  console.error("❌ BOT_TOKEN أو API_URL مفقود!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const reels = {};

bot.start((ctx) => {
  ctx.reply("مرحبًا! أرسل لي رابط Reel من Instagram لتحميله كفيديو أو صوت.");
});

bot.on("text", async (ctx) => {
  const url = ctx.message.text.trim();
  if (!url.includes("instagram.com")) return ctx.reply("⚠️ الرابط غير صالح.");

  const key = Math.random().toString(36).substring(2, 10);
  reels[key] = { url, expires: Date.now() + 5 * 60 * 1000 };

  ctx.reply("هل تريد تنزيله كـ فيديو أو صوت؟", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎥 فيديو", callback_data: `video|${key}` }],
        [{ text: "🎵 صوت", callback_data: `audio|${key}` }],
      ],
    },
  });
});

bot.on("callback_query", async (ctx) => {
  const [type, key] = ctx.callbackQuery.data.split("|");
  const reel = reels[key];
  if (!reel || reel.expires < Date.now())
    return ctx.reply("⚠️ الرابط انتهت صلاحيته.");

  await ctx.answerCbQuery();

  const url = reel.url;

  try {
    if (type === "video") {
      const videoResponse = await axios({
        url: `${API_URL}/api/reel?url=${encodeURIComponent(url)}`,
        method: "GET",
        responseType: "stream",
      });
      await ctx.replyWithVideo({ source: videoResponse.data });
    } else if (type === "audio") {
      const audioResponse = await axios({
        url: `${API_URL}/api/reel?url=${encodeURIComponent(url)}&type=audio`,
        method: "GET",
        responseType: "stream",
      });
      await ctx.replyWithAudio({ source: audioResponse.data });
    }
  } catch (err) {
    console.error(err);
    ctx.reply("❌ حدث خطأ أثناء تحميل الفيديو أو الصوت.");
  }
});

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// ---------- Start Express Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
