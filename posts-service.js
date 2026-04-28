const { ipcMain } = require("electron");
const axios = require("axios");
const cheerio = require("cheerio");
const { createPostV2, getPostV2ById, listPostsV2, updatePostV2, deletePostV2, listScheduledPostsV2, markPostV2AsScheduled, markPostV2AsPosted, markPostV2AsFailed } = require("./db");
const { getSetting } = require("./db");
const { runPostingFlow } = require("./post");

function splitBodyAndHashtags(text) {
  const lines = String(text || "").split(/\r?\n/);
  const hashtagStart = lines.findIndex((line) => /^\s*#/.test(String(line || "").trim()));

  if (hashtagStart === -1) {
    return {
      body: String(text || "").trim(),
      hashtags: "",
    };
  }

  return {
    body: lines.slice(0, hashtagStart).join("\n").trim(),
    hashtags: lines.slice(hashtagStart).join("\n").trim(),
  };
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function clampBodyToWordLimit(text, maxWords) {
  const { body, hashtags } = splitBodyAndHashtags(text);
  const words = String(body || "").trim().split(/\s+/).filter(Boolean);
  const trimmedBody = words.length > maxWords ? words.slice(0, maxWords).join(" ") : body.trim();

  return [trimmedBody, hashtags].filter(Boolean).join("\n\n").trim();
}

function getGenerationInstructions() {
  const stored = String(getSetting("generation_instructions", "") || "").trim();
  if (stored) {
    return stored;
  }
  // Default: human-sounding, no hyphens, compelling chat opener
  return `Write like a real human being, not a robot. Avoid hyphens in the middle of sentences. Use natural, flowing language that sounds like how a thoughtful person actually speaks. Keep sentences varied in length. The post should end with a line that naturally invites the reader to share their perspective or start a conversation — something like a genuine question or a low-friction opening for them to reply. Do not use bullet points or em-dashes as structural devices.`;
}

function getGenerationProfileContext() {
  const designation = String(getSetting("generation_profile_designation", "") || "").trim();
  const company = String(getSetting("generation_profile_company", "") || "").trim();
  const includeDesignation = String(getSetting("generation_profile_include_designation", "false")) === "true";
  const includeCompany = String(getSetting("generation_profile_include_company", "false")) === "true";

  const lines = [];
  if (includeDesignation && designation) {
    lines.push(`Designation: ${designation}`);
  }
  if (includeCompany && company) {
    lines.push(`Company: ${company}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `\nAuthor profile context:\n${lines.join("\n")}`;
}

// Web scraping utility
async function scrapeUrlContent(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $("script").remove();
    $("style").remove();

    // Get main content
    const text = $("body").text();
    const cleanedText = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 100) // First 100 lines
      .join("\n");

    return cleanedText;
  } catch (error) {
    throw new Error(`Failed to scrape URL: ${error.message}`);
  }
}

// Variety pools to combat repetitive openings and tones
const POST_STRUCTURES = [
  "Start with a bold, counter-intuitive claim or question that challenges conventional thinking.",
  "Open with a short personal anecdote (1–2 sentences) then pivot to the broader insight.",
  "Lead with a hard-hitting statistic or fact, then unpack its real-world implication.",
  "Start mid-story — drop the reader directly into a moment or situation without preamble.",
  "Open with a sharp, single-sentence thesis. Then build the case in short punchy paragraphs.",
  "Begin with a direct question addressed to your reader, then answer it with your insight.",
  "Open with a failure, mistake, or misconception — then reveal what you learned.",
  "Start with a numbered insight list (e.g., '3 things I've noticed about X') as the hook.",
  "Use a contrast: 'Most people do X. Here's why I do Y instead.'",
  "Open with a short dialogue or quote from a conversation that sparked the insight.",
];

const POST_TONES = [
  "Write in a direct, confident first-person voice — no hedging.",
  "Write in a thoughtful, introspective tone — like sharing a personal realisation.",
  "Write in a practical, action-oriented tone — clear takeaways the reader can use today.",
  "Write with intellectual curiosity — explore the idea like you're thinking it through in public.",
  "Write in a frank, slightly contrarian tone — challenge the accepted wisdom.",
  "Write with warmth and relatability — like you're talking to a peer, not presenting to an audience.",
  "Write in a crisp, journalism-inspired style — short sentences, strong verbs, no fluff.",
];

const FORBIDDEN_OPENINGS = [
  "In today's fast-paced world",
  "I recently came across",
  "As a professional",
  "In the ever-evolving",
  "In today's digital age",
  "I'm excited to share",
  "I'm thrilled to announce",
  "Let's talk about",
  "Have you ever wondered",
  "It's no secret that",
  "The truth is",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate post using OpenAI
async function generatePostContent(contextText, promptHint = "") {
  const openaiKey = getSetting("openai_api_key");
  if (!openaiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const maxPostWords = Math.max(50, Math.min(500, Number(getSetting("generation_max_post_words", "150")) || 150));
  const profileContext = getGenerationProfileContext();

  const chosenStructure = pickRandom(POST_STRUCTURES);
  const chosenTone = pickRandom(POST_TONES);
  const forbiddenList = FORBIDDEN_OPENINGS.map((phrase) => `- "${phrase}"`).join("\n");
  const userInstructions = getGenerationInstructions();

  const prompt = `You are a senior LinkedIn ghostwriter known for making every post feel distinctly different from the last.

Write a LinkedIn post based on the context below. Every post you write must feel fresh — varied in structure, opening, and voice.

Context:
${contextText}
${profileContext}

${promptHint ? `Hint: ${promptHint}` : ""}

Structure direction for THIS post:
${chosenStructure}

Tone direction for THIS post:
${chosenTone}

Author instructions (always follow these):
${userInstructions}

Hard rules:
- Maximum ${maxPostWords} words in the body, excluding hashtags
- Include 3–5 relevant hashtags at the end
- No emojis anywhere in the post
- Suitable for a professional LinkedIn audience
- Use short paragraphs with visible line breaks between ideas
- Never return the full post as one single dense paragraph
- When using a list, put each list item on its own line
- Leave a blank line before the final hashtag block
- Do NOT open with any of these overused phrases:
${forbiddenList}
- Do NOT use generic filler phrases like "game-changer", "dive deep", "unpack", "leverage", "synergies", "paradigm shift", or "in today's landscape"
- Do NOT start the post with the author's name or "I" as the very first word

Write only the post content — no preamble, no explanation.`;

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: openaiModel,
        messages: [
          {
            role: "system",
            content: "You are an expert LinkedIn content creator specializing in professional, engaging content.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 1.0,
        max_tokens: 600,
      },
      {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      const generated = response.data.choices[0].message.content.trim();
      return clampBodyToWordLimit(generated, maxPostWords);
    } else {
      throw new Error("Unexpected OpenAI response format");
    }
  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      throw new Error(`OpenAI Error: ${error.response.data.error.message}`);
    }
    throw new Error(`Failed to generate post: ${error.message}`);
  }
}

// Generate attribution post (for free tier daily)
async function generateAttributionPostContent() {
  const templates = [
    "Big thanks to @shozib abbas for helping me boost my LinkedIn engagement and visibility! Using cutting-edge AI tools, he's transformed my content strategy. If you want expert guidance on leveraging AI for professional growth, reach out to him. DM for details!",
    "My engagement has skyrocketed thanks to @shozib abbas! His expertise in AI-driven LinkedIn strategies is unmatched. Looking to maximize your professional impact? Hit him up – you won't regret it!",
    "@shozib abbas has been instrumental in my LinkedIn success. His knowledge of AI marketing and personal branding is exceptional. If you're serious about growing your influence, connect with him today!",
    "Shoutout to @shozib abbas for being a game-changer in my LinkedIn journey! His strategic use of AI tools has made a huge difference. Interested in taking your content to the next level? Reach out to him!",
    "Thanks @shozib abbas for guiding me through AI-powered LinkedIn growth! My visibility and engagement have never been better. Ready to level up? He's the expert you need. DM him!",
  ];

  const maxPostWords = Math.max(50, Math.min(500, Number(getSetting("generation_max_post_words", "150")) || 150));
  return clampBodyToWordLimit(templates[Math.floor(Math.random() * templates.length)], maxPostWords);
}

// Class to manage posts service
class PostsService {
  constructor() {
    this.licenseManager = null; // Set by caller
  }

  setLicenseManager(licenseManager) {
    this.licenseManager = licenseManager;
  }

  // Create manual post
  async createManualPost(content) {
    return createPostV2({
      content,
      type: "manual",
      status: "pending",
    });
  }

  // Generate post from URL
  async generatePostFromUrl(url, promptHint = "") {
    const content = await scrapeUrlContent(url);
    const generatedContent = await generatePostContent(content, promptHint);

    return createPostV2({
      content: generatedContent,
      type: "generated",
      status: "pending",
      source_url: url,
    });
  }

  // Generate post from text
  async generatePostFromText(text, promptHint = "") {
    const generatedContent = await generatePostContent(text, promptHint);

    return createPostV2({
      content: generatedContent,
      type: "generated",
      status: "pending",
    });
  }

  // Get post
  getPost(id) {
    return getPostV2ById(id);
  }

  // List all posts
  listPosts() {
    return listPostsV2();
  }

  // List scheduled posts (pending + scheduled)
  listScheduledPosts() {
    return listScheduledPostsV2();
  }

  // Update post
  updatePost(id, updates) {
    return updatePostV2(id, updates);
  }

  // Delete post
  deletePost(id) {
    deletePostV2(id);
  }

  // Schedule post for later
  scheduleForLater(postId, scheduledAt) {
    if (!scheduledAt || scheduledAt <= new Date()) {
      throw new Error("Scheduled time must be in the future");
    }

    return markPostV2AsScheduled(postId, scheduledAt.toISOString());
  }

  // Post now (15 min ahead to avoid LinkedIn timing issues)
  async postNow(postId) {
    const post = this.getPost(postId);
    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }

    const scheduleAt = new Date();
    scheduleAt.setMinutes(scheduleAt.getMinutes() + 15);

    try {
      const result = await runPostingFlow(
        {
          id: post.id,
          content: post.content,
        },
        {
          skipApproval: true,
          sendResultEmail: false,
          scheduleAt,
          fastMode: true,
        }
      );

      if (!result?.ok) {
        const reason = result?.reason || "Playwright posting flow failed";
        markPostV2AsFailed(post.id, reason);
        throw new Error(reason);
      }

      return markPostV2AsPosted(post.id);
    } catch (error) {
      markPostV2AsFailed(post.id, error.message || "Playwright posting flow failed");
      throw error;
    }
  }

  // Create attribution post (for free tier)
  async createAttributionPost() {
    const content = await generateAttributionPostContent();
    return createPostV2({
      content,
      type: "attribution",
      status: "pending",
    });
  }
}

const postsService = new PostsService();

// IPC Handlers
ipcMain.handle("create-post", async (event, content) => {
  try {
    return await postsService.createManualPost(content);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("get-post", async (event, id) => {
  try {
    return postsService.getPost(id);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("list-posts", async (event, filters) => {
  try {
    // TODO: Implement filtering (by status, type, date range)
    return postsService.listPosts();
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("update-post", async (event, id, updates) => {
  try {
    return postsService.updatePost(id, updates);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("delete-post", async (event, id) => {
  try {
    postsService.deletePost(id);
    return { success: true };
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("generate-post-from-url", async (event, url, promptHint) => {
  try {
    return await postsService.generatePostFromUrl(url, promptHint);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("generate-post-from-text", async (event, text, promptHint) => {
  try {
    return await postsService.generatePostFromText(text, promptHint);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("post-now", async (event, postId) => {
  try {
    return await postsService.postNow(postId);
  } catch (error) {
    throw new Error(error.message);
  }
});

ipcMain.handle("schedule-for-later", async (event, postId, scheduledAtString) => {
  try {
    const scheduledAt = new Date(scheduledAtString);
    return postsService.scheduleForLater(postId, scheduledAt);
  } catch (error) {
    throw new Error(error.message);
  }
});

module.exports = {
  postsService,
  generatePostContent,
  scrapeUrlContent,
  generateAttributionPostContent,
};
