const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const axios = require("axios");

const app = express();
app.use(cors());

app.get("/api/reel", async (req, res) => {
  let { url, type } = req.query;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  try {
    // إزالة أي query params
    url = url.split("?")[0];

    // Instagram JSON endpoint for the post
    const shortcode = url.split("/").filter(Boolean).pop(); // last path segment
    const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;

    const response = await axios.get(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
      },
    });

    const media = response.data?.graphql?.shortcode_media;
    if (!media) return res.status(404).json({ error: "Video not found" });

    const videoUrl =
      media.video_url ||
      media.edge_sidecar_to_children?.edges[0]?.node?.video_url;

    if (!videoUrl) return res.status(404).json({ error: "Video not found" });

    if (type === "audio") {
      const videoStream = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
      });

      res.setHeader("Content-Disposition", `attachment; filename="audio.mp3"`);
      res.setHeader("Content-Type", "audio/mpeg");

      ffmpeg(videoStream.data)
        .setFfmpegPath(ffmpegPath)
        .format("mp3")
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          if (!res.headersSent)
            res.status(500).json({ error: "Audio conversion failed" });
        })
        .pipe(res, { end: true });
    } else {
      const videoStream = await axios({
        url: videoUrl,
        method: "GET",
        responseType: "stream",
        headers: req.headers.range ? { Range: req.headers.range } : {},
      });

      if (videoStream.headers["content-length"])
        res.setHeader("Content-Length", videoStream.headers["content-length"]);
      if (videoStream.headers["content-range"]) {
        res.status(206);
        res.setHeader("Content-Range", videoStream.headers["content-range"]);
      }

      res.setHeader("Content-Disposition", `attachment; filename="video.mp4"`);
      res.setHeader("Content-Type", "video/mp4");

      videoStream.data.pipe(res);
    }
  } catch (err) {
    console.error("Error in /api/reel:", err.message);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Instagram API running on port ${PORT}`);
});
