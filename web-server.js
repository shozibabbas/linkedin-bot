const path = require("node:path");
const dotenv = require("dotenv");
const express = require("express");

const { createPost, deletePost, getPostById, listPosts, updatePost } = require("./db");

dotenv.config();

function createApp() {
  const app = express();
  const distPath = path.join(__dirname, "dist");

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/posts", (_req, res) => {
    res.json({ posts: listPosts() });
  });

  app.get("/api/posts/:id", (req, res) => {
    const post = getPostById(Number(req.params.id));
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }

    res.json({ post });
  });

  app.post("/api/posts", (req, res) => {
    try {
      const post = createPost(req.body || {});
      res.status(201).json({ post });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/posts/:id", (req, res) => {
    try {
      const post = updatePost(Number(req.params.id), req.body || {});
      if (!post) {
        res.status(404).json({ error: "Post not found." });
        return;
      }

      res.json({ post });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/posts/:id", (req, res) => {
    const result = deletePost(Number(req.params.id));
    if (!result.changes) {
      res.status(404).json({ error: "Post not found." });
      return;
    }

    res.status(204).end();
  });

  app.use(express.static(distPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  return app;
}

function startWebServer() {
  const app = createApp();
  const preferredHost = process.env.WEB_HOSTNAME || "linkedin-bot.local";
  const requestedPort = Number(process.env.WEB_PORT || 60396);
  const host = process.env.WEB_BIND_HOST || "127.0.0.1";

  const server = app.listen(requestedPort, host, () => {
    const { port } = server.address();
    console.log(`[web] UI available at http://localhost:${port}`);
    console.log(`[web] If hosts entry exists, also try http://${preferredHost}:${port}`);
  });

  return server;
}

if (require.main === module) {
  startWebServer();
}

module.exports = {
  createApp,
  startWebServer,
};
