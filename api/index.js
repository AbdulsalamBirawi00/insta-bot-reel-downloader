const express = require("express");
const { instagramGetUrl } = require("instagram-url-direct");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(cors());

app.get("/api/reel", async (req, res) => {
  let { url, type } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    // إزالة أي query params مثل utm_source
    url = url.split("?")[0];

    // استدعاء instagram-url-direct
    const result = await instagramGetUrl(url);
    if (!result?.url_list?.length)
      return res.status(404).json({ error: "Video not found" });

    const videoUrl = result.url_list[0];

    if (type === "audio") {
      const tempVideoPath = path.join(__dirname, "temp.mp4");
      const tempAudioPath = path.join(__dirname, "output.mp3");

      // تحميل الفيديو مؤقتًا
      const writer = fs.createWriteStream(tempVideoPath);
      const response = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
      });
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      // تحويل الفيديو إلى صوت mp3
      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .toFormat("mp3")
          .save(tempAudioPath)
          .on("end", resolve)
          .on("error", reject);
      });

      // حذف الفيديو المؤقت بعد التحويل
      fs.unlinkSync(tempVideoPath);

      // إرسال ملف الصوت للمستخدم
      res.download(tempAudioPath, "audio.mp3", (err) => {
        if (!err) fs.unlinkSync(tempAudioPath);
      });
    } else {
      // إرسال رابط الفيديو مباشرة
      res.json({ success: true, videoUrl });
    }
  } catch (err) {
    console.error("Error in /api/reel:", err.message);
    res.status(500).json({ error: "Failed to fetch video" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Instagram API running on port ${PORT}`);
});
