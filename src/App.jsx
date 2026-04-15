import React, { useEffect, useState } from "react";

const emptyForm = {
  content: "",
  status: "pending",
  posted_at: "",
  error: "",
};

const statusOptions = ["pending", "posted", "failed"];

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function toInputDateTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export default function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function loadPosts() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/posts");
      setPosts(data.posts);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosts();
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  function startEdit(post) {
    setEditingId(post.id);
    setForm({
      content: post.content,
      status: post.status,
      posted_at: toInputDateTime(post.posted_at),
      error: post.error || "",
    });
    setError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const body = {
      content: form.content,
      status: form.status,
      posted_at: form.posted_at ? new Date(form.posted_at).toISOString() : null,
      error: form.error || null,
    };

    try {
      if (editingId === null) {
        await apiRequest("/api/posts", {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest(`/api/posts/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }

      startCreate();
      await loadPosts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(`Delete post #${id}?`);
    if (!confirmed) {
      return;
    }

    setError("");
    try {
      await apiRequest(`/api/posts/${id}`, { method: "DELETE" });
      await loadPosts();
      if (editingId === id) {
        startCreate();
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const pendingCount = posts.filter((post) => post.status === "pending").length;
  const postedCount = posts.filter((post) => post.status === "posted").length;
  const failedCount = posts.filter((post) => post.status === "failed").length;

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LinkedIn Bot</p>
          <h1>Post Queue Control Room</h1>
          <p className="lede">Review, edit, insert, and remove queued LinkedIn posts backed by the same SQLite database used by the scheduler.</p>
        </div>
        <div className="stats">
          <div>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </div>
          <div>
            <span>Posted</span>
            <strong>{postedCount}</strong>
          </div>
          <div>
            <span>Failed</span>
            <strong>{failedCount}</strong>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel form-panel">
          <div className="panel-head">
            <h2>{editingId === null ? "Create post" : `Edit post #${editingId}`}</h2>
            <button type="button" className="ghost-button" onClick={startCreate}>New</button>
          </div>

          <form onSubmit={handleSubmit} className="editor">
            <label>
              Content
              <textarea
                name="content"
                rows="8"
                value={form.content}
                onChange={handleChange}
                placeholder="Write your LinkedIn post here"
                required
              />
            </label>

            <div className="form-grid">
              <label>
                Status
                <select name="status" value={form.status} onChange={handleChange}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label>
                Posted at
                <input
                  type="datetime-local"
                  name="posted_at"
                  value={form.posted_at}
                  onChange={handleChange}
                />
              </label>
            </div>

            <label>
              Error
              <input
                type="text"
                name="error"
                value={form.error}
                onChange={handleChange}
                placeholder="Optional failure detail"
              />
            </label>

            {error ? <p className="error-banner">{error}</p> : null}

            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : editingId === null ? "Create post" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="panel list-panel">
          <div className="panel-head">
            <h2>Posts</h2>
            <button type="button" className="ghost-button" onClick={loadPosts}>Refresh</button>
          </div>

          {loading ? <p className="muted">Loading posts...</p> : null}
          {!loading && posts.length === 0 ? <p className="muted">No posts in the database yet.</p> : null}

          <div className="post-list">
            {posts.map((post) => (
              <article key={post.id} className="post-card">
                <div className="post-meta">
                  <span className={`badge badge-${post.status}`}>{post.status}</span>
                  <span>#{post.id}</span>
                  <span>Created {formatTimestamp(post.created_at)}</span>
                </div>
                <p className="post-content">{post.content}</p>
                <dl className="post-details">
                  <div>
                    <dt>Posted at</dt>
                    <dd>{formatTimestamp(post.posted_at)}</dd>
                  </div>
                  <div>
                    <dt>Error</dt>
                    <dd>{post.error || "-"}</dd>
                  </div>
                </dl>
                <div className="post-actions">
                  <button type="button" className="ghost-button" onClick={() => startEdit(post)}>Edit</button>
                  <button type="button" className="danger-button" onClick={() => handleDelete(post.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
