const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");
const igdl = require("@sasmeee/igdl");

const app = express();
app.use(cors());

// ---------- Instagram Reel Endpoint ----------
app.get("/api/reel", async (req, res) => {
  let { url, type } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    // إزالة أي query params من الرابط
    url = url.split("?")[0];

    // جلب روابط التحميل من إنستغرام
    const result = await igdl(url);

    if (!result || !result[0] || !result[0].url) {
      return res.status(404).json({ error: "Video not found" });
    }

    const videoUrl = result[0].url;

    if (type === "audio") {
      // تحميل الفيديو وتحويله إلى صوت MP3 أثناء الـ stream
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
            res.status(500).json({ error: "Audio conversion failed" });
        })
        .pipe(res, { end: true });
    } else {
      // إرسال الفيديو مباشرة مع دعم range headers للتحميل الجزئي
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
    console.error("Error in /api/reel:", err.message);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Instagram API running on port ${PORT}`);
});
