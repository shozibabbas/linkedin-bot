import React, { useEffect, useMemo, useState } from "react";

export default function PostsModule() {
  const [posts, setPosts] = useState([]);
  const [mode, setMode] = useState("manual");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generatedPostId, setGeneratedPostId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleContext, setScheduleContext] = useState({ postId: null, content: "", useGeneratedDraft: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadPosts();
  }, []);

  const sortedPosts = useMemo(() => {
    return [...posts].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [posts]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const allPosts = await window.electronAPI?.listPosts();
      setPosts(allPosts || []);
    } catch (e) {
      setError(`Failed to load posts: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetComposer = () => {
    setMode("manual");
    setContent("");
    setSourceUrl("");
    setSourceText("");
    setGeneratedContent("");
    setGeneratedPostId(null);
  };

  const openComposer = () => {
    setError("");
    setNotice("");
    resetComposer();
    setShowComposerModal(true);
  };

  const closeComposer = () => {
    setShowComposerModal(false);
    resetComposer();
  };

  const handleGenerateFromUrl = async () => {
    if (!sourceUrl.trim()) {
      setError("Please enter a source URL.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setNotice("");

    try {
      const post = await window.electronAPI?.generatePostFromUrl(sourceUrl.trim());
      if (!post?.id) {
        throw new Error("Generation returned an invalid post object.");
      }
      setGeneratedPostId(post.id);
      setGeneratedContent(post.content || "");
      setNotice("Draft generated from URL. Review and schedule or post now.");
      await loadPosts();
    } catch (e) {
      setError(`Generation failed: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFromText = async () => {
    if (!sourceText.trim()) {
      setError("Please provide source text for AI generation.");
      return;
    }

    setIsGenerating(true);
    setError("");
    setNotice("");

    try {
      const post = await window.electronAPI?.generatePostFromText(sourceText.trim());
      if (!post?.id) {
        throw new Error("Generation returned an invalid post object.");
      }
      setGeneratedPostId(post.id);
      setGeneratedContent(post.content || "");
      setNotice("Draft generated from your text. Review and schedule or post now.");
      await loadPosts();
    } catch (e) {
      setError(`Generation failed: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostNow = async ({ postId = null, postContent = "", useGeneratedDraft = false }) => {
    setError("");
    setNotice("");

    try {
      let targetPostId = postId;

      if (targetPostId && useGeneratedDraft && generatedContent.trim()) {
        await window.electronAPI?.updatePost(targetPostId, { content: generatedContent.trim() });
      }

      if (!targetPostId) {
        const text = postContent.trim();
        if (!text) {
          setError("Post content cannot be empty.");
          return;
        }
        const created = await window.electronAPI?.createPost(text);
        targetPostId = created?.id;
      }

      if (!targetPostId) {
        throw new Error("Could not determine post id.");
      }

      await window.electronAPI?.postNow(targetPostId);
      setNotice("Post queued successfully for near-term publishing.");
      setShowComposerModal(false);
      resetComposer();
      await loadPosts();
    } catch (e) {
      setError(`Post now failed: ${e.message}`);
    }
  };

  const openScheduleModal = ({ postId = null, postContent = "", useGeneratedDraft = false }) => {
    setScheduleContext({ postId, content: postContent, useGeneratedDraft });
    setShowScheduleModal(true);
    setScheduleTime("");
  };

  const confirmSchedule = async () => {
    setError("");
    setNotice("");

    if (!scheduleTime) {
      setError("Please select a schedule date and time.");
      return;
    }

    try {
      let targetPostId = scheduleContext.postId;
      if (targetPostId && scheduleContext.useGeneratedDraft && generatedContent.trim()) {
        await window.electronAPI?.updatePost(targetPostId, { content: generatedContent.trim() });
      }

      if (!targetPostId) {
        const text = String(scheduleContext.content || "").trim();
        if (!text) {
          setError("Post content cannot be empty.");
          return;
        }
        const created = await window.electronAPI?.createPost(text);
        targetPostId = created?.id;
      }

      if (!targetPostId) {
        throw new Error("Could not determine post id.");
      }

      await window.electronAPI?.scheduleForLater(targetPostId, new Date(scheduleTime).toISOString());
      setShowScheduleModal(false);
      setShowComposerModal(false);
      setNotice("Post scheduled successfully.");
      resetComposer();
      await loadPosts();
    } catch (e) {
      setError(`Scheduling failed: ${e.message}`);
    }
  };

  const handleDeletePost = async (id) => {
    try {
      await window.electronAPI?.deletePost(id);
      setNotice("Post deleted.");
      await loadPosts();
    } catch (e) {
      setError(`Delete failed: ${e.message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <p className="page-kicker">Publishing Engine</p>
        <h1 className="page-title">Posts</h1>
        <p className="page-subtitle">All posts are listed below. Use Create Post to open the composer dialog.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <section className="panel" style={{ marginBottom: "18px" }}>
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="panel-title" style={{ margin: 0 }}>All Posts</h2>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={openComposer}>Create Post</button>
            <button className="btn btn-ghost" onClick={loadPosts}>Refresh List</button>
          </div>
        </div>
      </section>

      <section className="panel">
        {loading ? (
          <p className="empty-state">Loading posts...</p>
        ) : sortedPosts.length === 0 ? (
          <p className="empty-state">No posts yet. Click Create Post to add your first post.</p>
        ) : (
          <div className="list">
            {sortedPosts.map((post) => (
              <article key={post.id} className="list-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", gap: "10px" }}>
                  <div className="btn-row" style={{ gap: "8px" }}>
                    <span className={`chip ${post.status}`}>{post.status}</span>
                    <span className="chip">{post.type}</span>
                  </div>
                  <span className="page-subtitle" style={{ margin: 0, fontSize: "14px" }}>#{post.id}</span>
                </div>
                <p style={{ margin: "8px 0 10px", whiteSpace: "pre-wrap" }}>{post.content || ""}</p>
                <div className="page-subtitle" style={{ marginTop: 0 }}>
                  Created: {post.created_at ? new Date(post.created_at).toLocaleString() : "N/A"}
                </div>
                {post.scheduled_at && (
                  <div className="page-subtitle" style={{ marginTop: "4px" }}>
                    Scheduled: {new Date(post.scheduled_at).toLocaleString()}
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: "10px" }}>
                  {post.status !== "posted" && (
                    <button className="btn btn-primary" onClick={() => handlePostNow({ postId: post.id, useGeneratedDraft: false })}>Post Now</button>
                  )}
                  {post.status !== "posted" && (
                    <button className="btn btn-ghost" onClick={() => openScheduleModal({ postId: post.id, useGeneratedDraft: false })}>Reschedule</button>
                  )}
                  <button className="btn btn-ghost" onClick={() => handleDeletePost(post.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showComposerModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: "min(760px, 94vw)" }}>
            <h2 className="panel-title">Create Post</h2>

            <div className="btn-row" style={{ marginBottom: "12px" }}>
              <button className={`btn ${mode === "manual" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("manual")}>Manual</button>
              <button className={`btn ${mode === "url" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("url")}>AI via URL</button>
              <button className={`btn ${mode === "text" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMode("text")}>AI via Text</button>
            </div>

            {mode === "manual" && (
              <>
                <div className="form-row">
                  <label>Post Content</label>
                  <textarea
                    placeholder="Write your LinkedIn post here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={() => openScheduleModal({ postContent: content })}>Schedule</button>
                  <button className="btn btn-ghost" onClick={() => handlePostNow({ postContent: content })}>Post Now</button>
                </div>
              </>
            )}

            {mode === "url" && (
              <>
                <div className="form-row">
                  <label>Source URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </div>
                <div className="btn-row" style={{ marginBottom: generatedContent ? "12px" : 0 }}>
                  <button className="btn btn-primary" onClick={handleGenerateFromUrl} disabled={isGenerating}>
                    {isGenerating ? "Generating..." : "Generate Draft"}
                  </button>
                </div>

                {generatedContent && (
                  <>
                    <div className="form-row">
                      <label>Generated Draft</label>
                      <textarea value={generatedContent} onChange={(e) => setGeneratedContent(e.target.value)} />
                    </div>
                    <div className="btn-row">
                      <button className="btn btn-primary" onClick={() => openScheduleModal({ postId: generatedPostId, useGeneratedDraft: true })}>Schedule</button>
                      <button className="btn btn-ghost" onClick={() => handlePostNow({ postId: generatedPostId, useGeneratedDraft: true })}>Post Now</button>
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "text" && (
              <>
                <div className="form-row">
                  <label>Your Source Text</label>
                  <textarea
                    placeholder="Paste context or ideas. AI will generate a polished LinkedIn post from this text."
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                  />
                </div>
                <div className="btn-row" style={{ marginBottom: generatedContent ? "12px" : 0 }}>
                  <button className="btn btn-primary" onClick={handleGenerateFromText} disabled={isGenerating}>
                    {isGenerating ? "Generating..." : "Generate Draft"}
                  </button>
                </div>

                {generatedContent && (
                  <>
                    <div className="form-row">
                      <label>Generated Draft</label>
                      <textarea value={generatedContent} onChange={(e) => setGeneratedContent(e.target.value)} />
                    </div>
                    <div className="btn-row">
                      <button className="btn btn-primary" onClick={() => openScheduleModal({ postId: generatedPostId, useGeneratedDraft: true })}>Schedule</button>
                      <button className="btn btn-ghost" onClick={() => handlePostNow({ postId: generatedPostId, useGeneratedDraft: true })}>Post Now</button>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="btn-row" style={{ marginTop: "14px" }}>
              <button className="btn btn-ghost" onClick={closeComposer}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="panel-title">Schedule Post</h2>
            <div className="form-row">
              <label>Date & Time</label>
              <input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={confirmSchedule}>Confirm Schedule</button>
              <button className="btn btn-ghost" onClick={() => setShowScheduleModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
