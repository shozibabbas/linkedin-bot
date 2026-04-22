const dotenv = require("dotenv");

const {
  addPost,
  getLatestPost,
  getPostBySourceReference,
  listRecentPostContents,
} = require("./db");
const {
  clampBodyToWordLimit,
  extractGeneratedText,
  fetchWorkContextForToday,
  sanitizeGeneratedPost,
  validateGeneratedPost,
} = require("./content-generator");

dotenv.config();

const DEFAULT_REVIEW_FEED_URL = process.env.REVIEW_RSS_FEED_URL || "https://dev.to/feed";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const RSS_REVIEW_PIPELINE_KEY = "rss_review";

const STOPWORDS = new Set([
  "about", "after", "again", "almost", "also", "among", "because", "being", "between", "build",
  "built", "could", "every", "first", "found", "from", "have", "into", "just", "more", "most",
  "other", "over", "really", "should", "some", "than", "that", "their", "there", "these", "they",
  "this", "through", "using", "very", "what", "when", "which", "while", "with", "would", "your",
]);

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .trim();
}

function stripHtml(html) {
  return decodeXmlEntities(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlEntities(match[1]) : "";
}

function parseRssFeedItems(xml) {
  const items = [];
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match;
  while ((match = itemPattern.exec(String(xml || ""))) && items.length < 40) {
    const itemXml = match[1];
    const title = stripHtml(getTagValue(itemXml, "title"));
    const link = stripHtml(getTagValue(itemXml, "link"));
    const guid = stripHtml(getTagValue(itemXml, "guid")) || link;
    const creator = stripHtml(getTagValue(itemXml, "dc:creator"));
    const pubDate = stripHtml(getTagValue(itemXml, "pubDate"));
    const descriptionHtml = getTagValue(itemXml, "description");
    const description = stripHtml(descriptionHtml).slice(0, 800);

    if (!title || !link) {
      continue;
    }

    items.push({
      title,
      link,
      guid,
      creator,
      pubDate,
      description,
    });
  }

  return items;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g)
    ?.filter((token) => !STOPWORDS.has(token)) || [];
}

function scoreFeedItemAgainstContext(item, contextTokens) {
  const itemTokens = tokenize(`${item.title} ${item.description}`);
  if (!itemTokens.length || !contextTokens.size) {
    return 0;
  }

  let score = 0;
  for (const token of itemTokens) {
    if (contextTokens.has(token)) {
      score += item.title.toLowerCase().includes(token) ? 3 : 1;
    }
  }

  return score;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    const jsonMatch = String(value || "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_innerError) {
      return null;
    }
  }
}

function sanitizeReviewGeneratedPost(text, articleUrl) {
  const value = String(text || "");
  const url = String(articleUrl || "").trim();
  if (!url) {
    return sanitizeGeneratedPost(value);
  }

  const placeholder = "URLTOKENPLACEHOLDER";
  const protectedText = value.replaceAll(url, placeholder);
  const sanitized = sanitizeGeneratedPost(protectedText);
  return sanitized.replaceAll(placeholder, url);
}

function validateReviewGeneratedPost(text, articleUrl) {
  const value = String(text || "");
  const url = String(articleUrl || "").trim();
  if (!url) {
    return validateGeneratedPost(value);
  }

  const issues = [];
  if (!value.includes(url)) {
    issues.push("Must include the exact article URL once in the post.");
  }

  const placeholder = "URLTOKENPLACEHOLDER";
  const protectedText = value.replaceAll(url, placeholder);
  const baseIssues = validateGeneratedPost(protectedText)
    .filter((issue) => issue !== "Contains dash or hyphen characters.");

  // Custom dash check that ignores the URL itself.
  const dashFoundOutsideUrl = /[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/.test(protectedText);
  if (dashFoundOutsideUrl) {
    issues.push("Contains dash or hyphen characters outside the required URL.");
  }

  return [...issues, ...baseIssues];
}

async function chooseMostRelevantFeedItem(feedItems, workContext, recentPosts) {
  const apiKey = process.env.OPENAI_API_KEY;
  const contextTokens = new Set(tokenize(workContext));
  const ranked = feedItems
    .map((item) => ({ item, score: scoreFeedItemAgainstContext(item, contextTokens) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  if (!ranked.length) {
    return null;
  }

  if (!apiKey) {
    return ranked[0].item;
  }

  const selectionPrompt = [
    "Choose the single RSS article that is most relevant for a LinkedIn review post.",
    "Return JSON only in this shape:",
    '{"selected_index": 1, "reason": "short reason"}',
    "",
    "Selection criteria:",
    "- Strong overlap with the work context",
    "- Likely useful to founders, product builders, and engineers",
    "- Avoid articles that feel too repetitive compared with recent posts",
    "",
    "Work context summary:",
    String(workContext || "").slice(0, 5000),
    "",
    "Recent post excerpts:",
    recentPosts.slice(0, 6).map((post, idx) => `${idx + 1}. ${String(post || "").replace(/\s+/g, " ").slice(0, 180)}`).join("\n") || "(none)",
    "",
    "Candidate articles:",
    ranked
      .map(({ item }, idx) => `${idx + 1}. ${item.title} | Author: ${item.creator || "Unknown"} | Published: ${item.pubDate || "Unknown"} | Summary: ${item.description.slice(0, 280)}`)
      .join("\n"),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      input: selectionPrompt,
      temperature: 0.2,
      max_output_tokens: 180,
    }),
  });

  if (!response.ok) {
    return ranked[0].item;
  }

  const data = await response.json();
  const parsed = safeJsonParse(extractGeneratedText(data));
  const selectedIndex = Number(parsed?.selected_index);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > ranked.length) {
    return ranked[0].item;
  }

  return ranked[selectedIndex - 1].item;
}

async function fetchArticleSnapshot(url) {
  if (!url) {
    return "";
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "linkedin-bot/1.0 (+rss-review-pipeline)",
      },
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    return stripHtml(html).slice(0, 7000);
  } catch (_error) {
    return "";
  }
}

async function fetchReviewFeedItems() {
  const response = await fetch(DEFAULT_REVIEW_FEED_URL, {
    method: "GET",
    headers: {
      "User-Agent": "linkedin-bot/1.0 (+rss-review-pipeline)",
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed ${DEFAULT_REVIEW_FEED_URL}. HTTP ${response.status}`);
  }

  const xml = await response.text();
  return parseRssFeedItems(xml);
}

async function generateReviewLinkedInPostWithMeta() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env before generating posts.");
  }

  const latestPost = getLatestPost();
  const recentPosts = listRecentPostContents(30);
  const { content: workContext } = await fetchWorkContextForToday();
  const feedItems = await fetchReviewFeedItems();
  const unseenItems = feedItems.filter((item) => !getPostBySourceReference(RSS_REVIEW_PIPELINE_KEY, item.guid || item.link));

  if (!unseenItems.length) {
    return null;
  }

  const selectedItem = await chooseMostRelevantFeedItem(unseenItems, workContext, recentPosts);
  if (!selectedItem) {
    return null;
  }

  const articleSnapshot = await fetchArticleSnapshot(selectedItem.link);
  let extraFeedback = "";
  let lastIssues = [];

  for (let generationAttempt = 1; generationAttempt <= 5; generationAttempt++) {
    const prompt = [
      "You are an expert LinkedIn writer reviewing a technical article for founders, engineers, and product builders.",
      "Write one LinkedIn post that reviews the article, connects it to real product or systems work, and shows informed judgment.",
      "",
      "Goals:",
      "- Sound like a practitioner, not a content creator",
      "- Explain what the article gets right",
      "- Add one nuanced caveat, tradeoff, or practical limitation",
      "- Connect the takeaway to shipping real products",
      "- Mention the article title and author naturally once",
      "- Invite thoughtful conversation at the end without sounding salesy",
      "",
      "Rules:",
      "- Include the exact article URL once in the body text so readers know what you reviewed",
      "- Weave the URL naturally into a sentence that sounds senior and informed",
      "- Do not use emojis",
      "- Do not use hyphens, dash punctuation, or ellipsis outside the required URL",
      "- Keep the body between 150 and 175 words excluding hashtags",
      "- Use 8 to 12 relevant hashtags",
      "- Start with a fresh hook that does not reuse the same first word or phrase as recent posts",
      "- Do not start with the word If",
      extraFeedback,
      "",
      "Article to review:",
      `Title: ${selectedItem.title}`,
      `Author: ${selectedItem.creator || "Unknown"}`,
      `Published: ${selectedItem.pubDate || "Unknown"}`,
      `URL: ${selectedItem.link}`,
      `Feed summary: ${selectedItem.description || "(none)"}`,
      "",
      "Article snapshot:",
      articleSnapshot || "(Could not fetch article page, use the feed summary only.)",
      "",
      "Relevant work context:",
      String(workContext || "").slice(0, 5000),
      "",
      "Latest post sample for style reference only:",
      latestPost ? latestPost.content : "(none)",
      "",
      "Recent post opening lines to avoid:",
      recentPosts.slice(0, 4).map((post, idx) => `${idx + 1}. ${String(post || "").split("\n")[0].trim()}`).filter(Boolean).join("\n") || "(none)",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_OPENAI_MODEL,
        input: prompt,
        temperature: generationAttempt >= 3 ? 0.65 : 0.85,
        max_output_tokens: 560,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const data = await response.json();
    const generated = sanitizeReviewGeneratedPost(extractGeneratedText(data), selectedItem.link);
    if (!generated) {
      throw new Error("OpenAI returned no usable review text.");
    }

    const issues = validateReviewGeneratedPost(generated, selectedItem.link);
    lastIssues = issues;
    if (!issues.length) {
      return {
        content: generated,
        reviewedItem: selectedItem,
      };
    }

    if (generationAttempt === 5) {
      const clampTargets = [175, 172, 170, 168, 165, 160];
      for (const maxWords of clampTargets) {
        const clamped = clampBodyToWordLimit(generated, maxWords);
        const clampedIssues = validateReviewGeneratedPost(clamped, selectedItem.link);
        if (!clampedIssues.length) {
          return {
            content: clamped,
            reviewedItem: selectedItem,
          };
        }
      }

      const finalIssues = validateReviewGeneratedPost(generated, selectedItem.link);
      throw new Error(`Generated review post failed validation: ${finalIssues.join(" ")}`);
    }

    extraFeedback = `Previous attempt was invalid. Fix these issues exactly: ${issues.join(" ")}`;
  }

  throw new Error(`Review post generation failed after retries. Last issues: ${lastIssues.join(" ") || "unknown"}.`);
}

async function ensurePendingReviewPostFromFeed() {
  const generated = await generateReviewLinkedInPostWithMeta();
  if (!generated) {
    return null;
  }

  const reference = generated.reviewedItem.guid || generated.reviewedItem.link;
  const result = addPost(generated.content, {
    sourcePipeline: RSS_REVIEW_PIPELINE_KEY,
    sourceReference: reference,
  });
  const id = Number(result.lastInsertRowid);

  return {
    id,
    content: generated.content,
    status: "pending",
    source_pipeline: RSS_REVIEW_PIPELINE_KEY,
    source_reference: reference,
    reviewedItem: generated.reviewedItem,
  };
}

module.exports = {
  ensurePendingReviewPostFromFeed,
  fetchReviewFeedItems,
  generateReviewLinkedInPostWithMeta,
};