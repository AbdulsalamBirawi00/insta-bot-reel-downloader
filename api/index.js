// index.js
const express = require("express");
const { instagramGetUrl } = require("instagram-url-direct");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");

const app = express();
app.use(cors());

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
      // تحويل الفيديو لصوت mp3 أثناء الـstream
      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Disposition", `attachment; filename="audio.mp3"`);
      res.setHeader("Content-Type", "audio/mpeg");

      ffmpeg(response.data)
        .format("mp3")
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          if (!res.headersSent)
            res.status(500).json({ error: "Conversion failed" });
        })
        .pipe(res, { end: true });
    } else {
      // دعم resume للملفات الكبيرة باستخدام range headers
      const headers = {};
      if (req.headers.range) {
        headers.Range = req.headers.range;
      }

      const videoResponse = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        headers,
      });

      if (videoResponse.headers["content-length"]) {
        res.setHeader(
          "Content-Length",
          videoResponse.headers["content-length"]
        );
      }
      if (videoResponse.headers["content-range"]) {
        res.status(206); // partial content
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Instagram API running on port ${PORT}`);
});
