const path = require("node:path");
const dotenv = require("dotenv");
const express = require("express");

const { createPost, deletePost, getPostById, listPosts, updatePost, getSetting, setSetting } = require("./db");
const { getPipelineDefinition, listPipelineDefinitions, toPipelineMetadata } = require("./pipelines");

dotenv.config();

function listPipelinesWithSettings() {
  return listPipelineDefinitions().map((pipeline) => {
    const enabled = getSetting(pipeline.settingKey, pipeline.defaultEnabled ? "true" : "false") !== "false";
    return toPipelineMetadata(pipeline, enabled);
  });
}

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

  app.get("/api/settings", (_req, res) => {
    const postingMode = getSetting("posting_mode", "confirm_email");
    res.json({ settings: { posting_mode: postingMode } });
  });

  app.get("/api/pipelines", (_req, res) => {
    res.json({ pipelines: listPipelinesWithSettings() });
  });

  app.put("/api/settings", (req, res) => {
    const { posting_mode } = req.body || {};
    const valid = ["confirm_email", "confirm_push", "auto"];
    if (!valid.includes(posting_mode)) {
      res.status(400).json({ error: "Invalid posting_mode. Expected confirm_email, confirm_push, or auto." });
      return;
    }
    setSetting("posting_mode", posting_mode);
    res.json({ settings: { posting_mode } });
  });

  app.put("/api/pipelines/:key", (req, res) => {
    const pipeline = getPipelineDefinition(req.params.key);
    if (!pipeline) {
      res.status(404).json({ error: "Pipeline not found." });
      return;
    }

    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean." });
      return;
    }

    setSetting(pipeline.settingKey, enabled ? "true" : "false");
    res.json({ pipeline: toPipelineMetadata(pipeline, enabled) });
  });

  app.post("/api/posts/generate", async (req, res) => {
    try {
      const pipelineKey = String(req.body?.pipeline || "work_context");
      const pipeline = getPipelineDefinition(pipelineKey);
      if (!pipeline) {
        res.status(404).json({ error: "Pipeline not found." });
        return;
      }

      const post = await pipeline.generatePendingPost();
      if (!post) {
        res.status(200).json({ post: null, message: "No new content was generated for this pipeline." });
        return;
      }

      res.status(201).json({ post });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to generate post." });
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
