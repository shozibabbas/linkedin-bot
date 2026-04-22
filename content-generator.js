const {
  addPost,
  getLatestPost,
  getWebContextBySourceAndDate,
  listRecentPostContents,
  upsertWebContext,
} = require("./db");
const dotenv = require("dotenv");

dotenv.config();

const DEFAULT_WORK_URL = process.env.WORK_CONTEXT_URL || "https://www.shozibabbas.com/work";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const WORK_CONTEXT_PIPELINE_KEY = "work_context";

const CONTENT_TYPE_DEFS = [
  {
    key: "system-design-breakdown",
    name: "System Design Breakdown",
    prompt: "Write a sharp post about a system design choice that looked fine early but broke at scale. Focus on tradeoffs and practical architecture decisions.",
  },
  {
    key: "mvp-tech-debt",
    name: "MVP Debt Reality",
    prompt: "Write about an MVP shortcut that seemed smart initially but caused costly rewrites later. Keep it practical and relatable for founders.",
  },
  {
    key: "debugging-lesson",
    name: "Real Debugging Lesson",
    prompt: "Write about a non-obvious production issue and the debugging path that exposed the real root cause. Make the lesson memorable.",
  },
  {
    key: "data-modeling-pitfall",
    name: "Data Modeling Pitfall",
    prompt: "Write about a data modeling mistake that created hidden complexity. Show why clean relationships and boundaries matter.",
  },
  {
    key: "scaling-tradeoff",
    name: "Scaling Tradeoff",
    prompt: "Write about a scaling decision where the obvious fix was wrong. Explain what actually worked in a real product context.",
  },
  {
    key: "product-architecture-thinking",
    name: "Product Architecture Thinking",
    prompt: "Write about architecture choices that help product teams ship fast without creating long-term chaos.",
  },
  {
    key: "backend-frontend-boundary",
    name: "Backend vs Frontend Boundary",
    prompt: "Write about a backend vs frontend responsibility split that made the product easier to evolve. Keep the tone practical.",
  },
  {
    key: "ai-product-pragmatism",
    name: "AI Product Pragmatism",
    prompt: "Write about practical AI integration choices that improved product outcomes instead of adding noise.",
  },
];

const BASE_PROMPT = `You are an expert LinkedIn content writer who specializes in writing high-performing posts for software engineers and product builders.

Your task is to generate a LinkedIn post that attracts founders, startups, and businesses who need scalable systems built.

---

# GOAL

The post should:
- Build authority
- Feel human and conversational
- Attract inbound messages (not look salesy)
- Make readers feel: "this person understands real systems"

---

# TARGET AUDIENCE

- Startup founders
- Business owners
- Developers building products
- People working on SaaS, dashboards, or internal tools

---

# AUTHOR PROFILE

The author:
- Builds SaaS platforms, dashboards, and real-world systems
- Has worked on AI platforms, ad-tech marketplaces, and health-tech apps
- Focuses on system design, scalability, and real-world usage
- Thinks in systems, not just features

---

# WRITING STYLE

- Simple, natural, human tone
- No corporate language
- No buzzwords
- No emojis
- No hyphens or ellipsis
- Slightly casual with light humor where appropriate
- Short to medium sentences

---

# STRUCTURE (STRICT)

1. HOOK (first line)
- Must be curiosity-driven
- Must address a specific audience
- Vary the opening word and structure. Use different approaches each time.
- Example styles (vary, do not default to one pattern):
  - "Most teams get this wrong the first time."
  - "Here is something nobody tells you about scaling."
  - "The part of the system that breaks first is never the obvious one."
  - "Some decisions look small but shape the whole product."
  - "A founder asked me last week why their app slows down after 10k users."
- DO NOT start the post with the word "If"
- DO NOT start with the same first word as any of the recent posts listed below

2. CONTEXT
- Introduce a real problem or observation

3. INSIGHT
- Explain the deeper issue (technical or product-related)

4. EXPERIENCE
- Briefly mention real-world exposure (AI, SaaS, dashboards, etc.)

5. TAKEAWAY
- A simple conclusion or lesson

6. SOFT CTA
- Invite reader to message casually
- Example: "If you are working on something and want to bounce ideas around, feel free to send me a message."

7. HASHTAGS
- Add 10 to 14 relevant hashtags
- Focus on: startups, software engineering, SaaS, system design, tech

---

# STRICT RULES

- DO NOT be generic
- DO NOT sound like a motivational post
- DO NOT oversell
- DO NOT mention services directly
- DO NOT include links
- DO NOT use emojis
- DO NOT use "..." or "-"
- DO NOT use dash punctuation of any kind inside the generated post text: -, –, —
- DO NOT create hyphenated words
- Before returning output, run a self check and ensure there are zero dash or hyphen characters anywhere in the final post.
- Avoid bullet overuse
- Keep it readable and clean

---

# LENGTH

- Body text must be 150 to 175 words, excluding hashtags
- Easy to read on mobile

---

# FINAL EXPECTATION

The post should feel like:
- A real engineer sharing experience
- Not a content creator chasing engagement
- Not a tutorial

It should make the reader:
- Pause
- Relate
- Think
- Consider reaching out

---

Now generate ONE LinkedIn post following all the above instructions`;

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(html) {
  const headingMatches = [...String(html || "").matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
  return headingMatches
    .map((m) => stripHtml(m[1]))
    .filter(Boolean)
    .slice(0, 30);
}

function extractLinks(html) {
  const linkMatches = [...String(html || "").matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return linkMatches
    .map((m) => {
      const href = String(m[1] || "").trim();
      const label = stripHtml(m[2]);
      if (!href || !label) {
        return null;
      }
      if (/^javascript:/i.test(href) || href === "#") {
        return null;
      }
      return `${label} -> ${href}`;
    })
    .filter(Boolean)
    .slice(0, 60);
}

function extractArticleSummariesFromHtml(html) {
  const value = String(html || "");
  const headingPattern = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  const items = [];
  const seen = new Set();

  let headingMatch;
  while ((headingMatch = headingPattern.exec(value)) && items.length < 30) {
    const title = stripHtml(headingMatch[1]).replace(/\s+/g, " ").trim();
    if (!title || title.length < 8) {
      continue;
    }

    const sliceStart = headingPattern.lastIndex;
    const nearby = value.slice(sliceStart, sliceStart + 900);
    const paragraphMatch = nearby.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const excerpt = paragraphMatch
      ? stripHtml(paragraphMatch[1]).replace(/\s+/g, " ").trim().slice(0, 180)
      : "";

    const dedupeKey = `${title.toLowerCase()}::${excerpt.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    items.push({ title, excerpt });
  }

  return items;
}

function parseArticleSummariesFromCachedContext(content) {
  const value = String(content || "");
  const sectionMatch = value.match(/Older content titles and short excerpts:\n([\s\S]*?)\n\n(?:Page links\/articles|Plain text snapshot):/i);
  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(" :: "))
    .map((parts) => ({ title: String(parts[0] || "").trim(), excerpt: String(parts[1] || "").trim() }))
    .filter((item) => item.title);
}

function toSummaryLines(items, maxItems = 25) {
  return items
    .slice(0, maxItems)
    .map((item, idx) => {
      const title = String(item.title || "").replace(/\s+/g, " ").trim();
      const excerpt = String(item.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 180);
      return `${idx + 1}. Title: ${title} | Excerpt: ${excerpt || "(none)"}`;
    })
    .join("\n");
}

function buildPostSummaries(posts, maxItems = 30) {
  return posts.slice(0, maxItems).map((content) => {
    const value = String(content || "").replace(/\s+/g, " ").trim();
    const firstSentence = value.match(/^(.{20,120}?[.!?])\s/)?.[1] || value.slice(0, 90);
    return {
      title: firstSentence.trim(),
      excerpt: value.slice(0, 180),
    };
  });
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededShuffle(items, seedText) {
  const output = items.slice();
  let seed = hashString(seedText) || 1;

  for (let i = output.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }

  return output;
}

function getRotatedContentType(date = new Date()) {
  const dayKey = date.toISOString().slice(0, 10);
  const slotIndex = Math.floor(date.getHours() / 3) % CONTENT_TYPE_DEFS.length;
  const shuffled = seededShuffle(CONTENT_TYPE_DEFS, dayKey);
  return shuffled[slotIndex];
}

function splitBodyAndHashtags(text) {
  const lines = String(text || "").split("\n");
  const hashtagStart = lines.findIndex((line) => /(^\s*#)|(^\s*hashtag#)/i.test(line.trim()));
  if (hashtagStart === -1) {
    return {
      body: lines.join("\n").trim(),
      hashtags: "",
    };
  }

  return {
    body: lines.slice(0, hashtagStart).join("\n").trim(),
    hashtags: lines.slice(hashtagStart).join("\n").trim(),
  };
}

function countWords(text) {
  const words = String(text || "").trim().match(/\b[\w']+\b/g);
  return words ? words.length : 0;
}

function validateGeneratedPost(text) {
  const issues = [];
  const dashFound = /[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/.test(String(text || ""));
  if (dashFound) {
    issues.push("Contains dash or hyphen characters.");
  }

  const { body } = splitBodyAndHashtags(text);
  const bodyWords = countWords(body);
  if (bodyWords < 150 || bodyWords > 175) {
    issues.push(`Body word count is ${bodyWords}. Required range is 150 to 175 excluding hashtags.`);
  }

  return issues;
}

function clampBodyToWordLimit(text, maxWords = 175) {
  const { body, hashtags } = splitBodyAndHashtags(text);
  const tokens = String(body || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= maxWords) {
    return String(text || "").trim();
  }

  const trimmedBody = tokens.slice(0, maxWords).join(" ").replace(/[\s,;:]+$/, "").trim();
  return hashtags ? `${trimmedBody}\n\n${hashtags}` : trimmedBody;
}

async function fetchWorkContextForToday() {
  const sourceUrl = DEFAULT_WORK_URL;
  const today = getTodayDateString();

  const cached = getWebContextBySourceAndDate(sourceUrl, today);
  if (cached) {
    return {
      content: cached.content,
      articleSummaries: parseArticleSummariesFromCachedContext(cached.content),
    };
  }

  const response = await fetch(sourceUrl, {
    method: "GET",
    headers: {
      "User-Agent": "linkedin-bot/1.0 (+daily-context-scraper)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape ${sourceUrl}. HTTP ${response.status}`);
  }

  const html = await response.text();
  const plainText = stripHtml(html).slice(0, 8000);
  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const articleSummaries = extractArticleSummariesFromHtml(html);

  const content = [
    `Source: ${sourceUrl}`,
    `Fetched Date: ${today}`,
    "",
    "Headings:",
    headings.length ? headings.map((h) => `- ${h}`).join("\n") : "- (none parsed)",
    "",
    "Older content titles and short excerpts:",
    articleSummaries.length
      ? articleSummaries.map((item) => `- ${item.title} :: ${item.excerpt || "(none)"}`).join("\n")
      : "- (none parsed)",
    "",
    "Page links/articles:",
    links.length ? links.map((l) => `- ${l}`).join("\n") : "- (none parsed)",
    "",
    "Plain text snapshot:",
    plainText,
  ].join("\n");

  upsertWebContext({
    source_url: sourceUrl,
    fetched_date: today,
    content,
  });

  return {
    content,
    articleSummaries,
  };
}

function extractGeneratedText(responseData) {
  if (!responseData || typeof responseData !== "object") {
    return "";
  }

  if (typeof responseData.output_text === "string" && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }

  const textChunks = [];

  const outputItems = Array.isArray(responseData.output) ? responseData.output : [];
  for (const item of outputItems) {
    if (typeof item?.text === "string" && item.text.trim()) {
      textChunks.push(item.text.trim());
    }

    const contentItems = Array.isArray(item?.content) ? item.content : [];
    for (const contentPart of contentItems) {
      if (typeof contentPart?.text === "string" && contentPart.text.trim()) {
        textChunks.push(contentPart.text.trim());
      }
      if (typeof contentPart?.output_text === "string" && contentPart.output_text.trim()) {
        textChunks.push(contentPart.output_text.trim());
      }
    }
  }

  if (textChunks.length) {
    return textChunks.join("\n\n").trim();
  }

  if (Array.isArray(responseData.choices)) {
    for (const choice of responseData.choices) {
      const content = choice?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }
      if (Array.isArray(content)) {
        const merged = content
          .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
          .filter(Boolean)
          .join("\n\n")
          .trim();
        if (merged) {
          return merged;
        }
      }
    }
  }

  return "";
}

function sanitizeGeneratedPost(text) {
  let value = String(text || "").trim();

  // Replace all Unicode dash variants with natural separators.
  value = value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, ", ");

  // Replace spaced ASCII dashes used as punctuation.
  value = value.replace(/\s-\s/g, ", ");

  // Remove ASCII hyphens from hyphenated terms and any remaining occurrences.
  value = value.replace(/(\w)-(\w)/g, "$1 $2");
  value = value.replace(/-/g, " ");

  // Collapse excessive whitespace introduced by replacements.
  value = value.replace(/[ \t]+\n/g, "\n");
  value = value.replace(/\n{3,}/g, "\n\n");
  value = value.replace(/[ \t]{2,}/g, " ").trim();

  return value;
}

async function generateLinkedInPostWithMeta() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env before generating posts.");
  }

  const latestPost = getLatestPost();
  const recentPosts = listRecentPostContents(30);
  const { content: workContext, articleSummaries } = await fetchWorkContextForToday();
  const postSummaries = buildPostSummaries(recentPosts);
  const olderContent = [...articleSummaries, ...postSummaries].slice(0, 40);
  const selectedType = getRotatedContentType(new Date());
  let extraFeedback = "";

  let lastGenerated = "";
  let lastIssues = [];

  for (let generationAttempt = 1; generationAttempt <= 5; generationAttempt++) {
    const userPrompt = [
      BASE_PROMPT,
      "",
      "Content type for this exact timeslot (must follow this):",
      `${selectedType.name}: ${selectedType.prompt}`,
      "",
      "Additional constraints for this run:",
      "- Make this post different in angle from the latest post sample.",
      "- Use the work experience context to keep it relevant.",
      "- Avoid repeating topics already covered in previous posts and older site content.",
      "- Keep it technical, eye catching, and founder friendly.",
      "- Connection CTA must remain casual, not salesy.",
      "- Body must be between 150 and 175 words excluding hashtags.",
      "- Target 160 to 165 words for consistency.",
      extraFeedback,
      "",
      "Latest post sample (style reference only, DO NOT copy its opening line or first word):",
      latestPost ? latestPost.content : "(none)",
      "",
      "Recent post opening lines (DO NOT start your hook with any of these first words or phrases):",
      recentPosts.slice(0, 3).map((postContent, i) => `${i + 1}. ${String(postContent || "").split("\n")[0].trim()}`).filter(Boolean).join("\n") || "(none)",
      "",
      "Older content titles and short excerpts to avoid repeating:",
      olderContent.length ? toSummaryLines(olderContent) : "(none)",
      "",
      "Daily work experience context scraped from website:",
      workContext,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        input: userPrompt,
        temperature: generationAttempt >= 3 ? 0.7 : 0.9,
        max_output_tokens: 560,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const data = await response.json();
    const generated = sanitizeGeneratedPost(extractGeneratedText(data));
    lastGenerated = generated;

    if (!generated) {
      const status = data.status ? ` status=${data.status}` : "";
      const hasOutput = Array.isArray(data.output) ? ` output_items=${data.output.length}` : " output_items=0";
      throw new Error(`OpenAI returned no usable text.${status}${hasOutput}`);
    }

    const issues = validateGeneratedPost(generated);
    lastIssues = issues;
    if (!issues.length) {
      return {
        content: generated,
        contentType: selectedType,
      };
    }

    if (generationAttempt === 5) {
      const clamped = clampBodyToWordLimit(generated, 175);
      const clampedIssues = validateGeneratedPost(clamped);
      if (!clampedIssues.length) {
        return {
          content: clamped,
          contentType: selectedType,
        };
      }

      throw new Error(`Generated post failed validation: ${clampedIssues.join(" ")}`);
    }

    extraFeedback = `Previous attempt was invalid. Fix these issues exactly: ${issues.join(" ")}`;
  }

  throw new Error(`Post generation failed after retries. Last issues: ${lastIssues.join(" ") || "unknown"}.`);
}

async function generateLinkedInPost() {
  const generated = await generateLinkedInPostWithMeta();
  return generated.content;
}

async function ensurePendingPostFromOpenAI() {
  const generated = await generateLinkedInPostWithMeta();
  const result = addPost(generated.content, { sourcePipeline: WORK_CONTEXT_PIPELINE_KEY });
  const id = Number(result.lastInsertRowid);
  return {
    id,
    content: generated.content,
    status: "pending",
    contentType: generated.contentType,
    source_pipeline: WORK_CONTEXT_PIPELINE_KEY,
    source_reference: null,
  };
}

module.exports = {
  clampBodyToWordLimit,
  ensurePendingPostFromOpenAI,
  extractGeneratedText,
  fetchWorkContextForToday,
  generateLinkedInPost,
  sanitizeGeneratedPost,
  splitBodyAndHashtags,
  validateGeneratedPost,
};
