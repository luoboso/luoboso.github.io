/**
 * GitHub API wrapper for the admin interface.
 * All operations use the GitHub REST API with a Personal Access Token.
 */
class GitHubAPI {
  constructor(token) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
    this.owner = CONFIG.github.owner;
    this.repo = CONFIG.github.repo;
    this.branch = CONFIG.github.branch;
  }

  /**
   * Make an authenticated API request.
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`GitHub API ${res.status}: ${err.message || res.statusText}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * Verify the token is valid by getting the authenticated user.
   */
  async verifyToken() {
    const user = await this.request('/user');
    return user;
  }

  /**
   * List all draft JSON files from the drafts directory.
   */
  async listDrafts() {
    try {
      const items = await this.request(
        `/repos/${this.owner}/${this.repo}/contents/${CONFIG.github.draftsPath}?ref=${this.branch}`
      );
      return items.filter(item => item.name.endsWith('.json'));
    } catch (err) {
      if (err.message.includes('404')) return [];
      throw err;
    }
  }

  /**
   * Fetch a single draft file content.
   */
  async getDraft(filePath) {
    const item = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}`
    );
    const content = decodeURIComponent(escape(atob(item.content.replace(/\s/g, ''))));
    return {
      data: JSON.parse(content),
      sha: item.sha,
      path: item.path,
    };
  }

  /**
   * Fetch a private image content and return an Object URL.
   */
  async getPrivateImage(filePath) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3.raw',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${res.statusText}`);
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  /**
   * Fetch all drafts content.
   */
  async getAllDrafts() {
    const files = await this.listDrafts();
    
    const promises = files.map(async (file) => {
      try {
        return await this.getDraft(file.path);
      } catch (err) {
        console.warn(`Failed to load draft ${file.name}:`, err);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  /**
   * Get the latest commit SHA on the branch.
   */
  async getLatestCommitSha() {
    const ref = await this.request(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`
    );
    return ref.object.sha;
  }

  /**
   * Create a new branch from the current branch head.
   */
  async createBranch(branchName) {
    const sha = await this.getLatestCommitSha();
    await this.request(
      `/repos/${this.owner}/${this.repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: sha,
        }),
      }
    );
    return sha;
  }

  /**
   * Create or update a file on a branch.
   */
  async createOrUpdateFile(branchName, filePath, content, message, existingSha = null) {
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branchName,
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    return this.request(
      `/repos/${this.owner}/${this.repo}/contents/${filePath}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
  }

  /**
   * Commit multiple changes in a single commit using the Git Data API.
   * @param {string} commitMessage - Commit message
   * @param {Array<{path: string, content: string}>} files - Files to create/update
   */
  async commitChanges(commitMessage, files) {
    // 1. Get reference to current branch head commit
    const latestCommitSha = await this.getLatestCommitSha();

    // 2. Get latest commit details to retrieve the tree SHA
    const commitDetails = await this.request(
      `/repos/${this.owner}/${this.repo}/git/commits/${latestCommitSha}`
    );
    const baseTreeSha = commitDetails.tree.sha;

    // 3. Create a new Tree containing the file modifications
    const treeItems = files.map(file => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      content: file.content
    }));

    const newTree = await this.request(
      `/repos/${this.owner}/${this.repo}/git/trees`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems
        })
      }
    );

    // 4. Create a new Commit pointing to the new tree and parent commit
    const newCommit = await this.request(
      `/repos/${this.owner}/${this.repo}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: commitMessage,
          tree: newTree.sha,
          parents: [latestCommitSha]
        })
      }
    );

    // 5. Update the reference heads/blog to point to the new commit
    await this.request(
      `/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false
        })
      }
    );

    return newCommit;
  }

  /**
   * Publish posts directly to the target branch in a single commit.
   *
   * @param {Array} posts - Array of { draft, title, categories, tags, description }
   * @returns {Object} The created commit object
   */
  async publishPosts(posts) {
    const filesToCommit = [];

    // 1. Add new .md files
    for (const post of posts) {
      const markdown = MarkdownGenerator.generate(post);
      const fileName = MarkdownGenerator.generateFileName(post);
      const filePath = `${CONFIG.github.postsPath}/${fileName}`;

      filesToCommit.push({
        path: filePath,
        content: markdown
      });
    }

    // 2. Add updated draft .json files
    for (const post of posts) {
      const updatedDraft = { ...post.draft.data, status: 'published', published_at: new Date().toISOString() };
      filesToCommit.push({
        path: post.draft.path,
        content: JSON.stringify(updatedDraft, null, 2)
      });
    }

    // 3. Create the commit message
    const commitMessage = `📝 Facebook sync: ${posts.length} post${posts.length > 1 ? 's' : ''} published`;

    // 4. Commit directly to the branch
    const commit = await this.commitChanges(commitMessage, filesToCommit);
    return commit;
  }

  /**
   * Update a draft's status (e.g., reject).
   */
  async updateDraftStatus(draft, newStatus) {
    const updatedData = {
      ...draft.data,
      status: newStatus,
      [`${newStatus}_at`]: new Date().toISOString(),
    };

    await this.createOrUpdateFile(
      this.branch,
      draft.path,
      JSON.stringify(updatedData, null, 2),
      `${newStatus === 'rejected' ? '❌' : '↩️'} ${newStatus}: ${draft.data.fb_id}`,
      draft.sha
    );

    // Update local sha
    draft.data = updatedData;
  }

  /**
   * Generate PR description body.
   */
  _generatePRBody(posts) {
    let body = `## 📋 Facebook 同步發布\n\n`;
    body += `發布 ${posts.length} 篇文章\n\n`;
    body += `| 標題 | 分類 | 日期 |\n`;
    body += `|------|------|------|\n`;

    for (const post of posts) {
      const date = post.draft.data.created_time.split('T')[0];
      const cats = post.categories.join(' > ');
      body += `| ${post.title} | ${cats} | ${date} |\n`;
    }

    body += `\n---\n*自動產生自 [Facebook 同步管理介面](https://${this.owner}.github.io/fb-admin/)*`;
    return body;
  }

  /**
   * List all article Markdown files from source/_posts directory.
   */
  async listArticles() {
    try {
      const items = await this.request(
        `/repos/${this.owner}/${this.repo}/contents/${CONFIG.github.postsPath}?ref=${this.branch}`
      );
      return items.filter(item => item.name.endsWith('.md'));
    } catch (err) {
      if (err.message.includes('404')) return [];
      throw err;
    }
  }

  /**
   * Fetch a single article content.
   */
  async getArticle(filePath) {
    const item = await this.request(
      `/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}`
    );

    // If the API returned an array (directory listing), pick the matching file
    const fileItem = Array.isArray(item)
      ? item.find(f => f.path === filePath || f.name === filePath.split('/').pop())
      : item;

    if (!fileItem) {
      throw new Error(`找不到檔案: ${filePath}`);
    }

    let content;
    if (fileItem.content != null && fileItem.content !== '') {
      // Normal case: base64 content is present (files < 1MB)
      content = decodeURIComponent(escape(atob(fileItem.content.replace(/\s/g, ''))));
    } else if (fileItem.download_url) {
      // Large file or >1000 files dir: fetch via download_url
      const res = await fetch(fileItem.download_url);
      if (!res.ok) throw new Error(`下載檔案失敗: ${res.status}`);
      content = await res.text();
    } else if (fileItem.git_url) {
      // Fallback: fetch content via git blob API
      const blob = await this.request(fileItem.git_url);
      if (blob && blob.content) {
        content = decodeURIComponent(escape(atob(blob.content.replace(/\s/g, ''))));
      } else {
        throw new Error(`Git blob API 未返回內容: ${filePath}`);
      }
    } else {
      // Last resort: try raw URL
      const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${filePath}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`無法取得文章內容: ${filePath} (HTTP ${res.status})`);
      content = await res.text();
    }

    return {
      content,
      sha: fileItem.sha,
      path: fileItem.path || filePath,
      name: fileItem.name || filePath.split('/').pop()
    };
  }

  /**
   * Update or create an article file.
   */
  async updateArticle(filePath, content, sha, commitMessage) {
    const body = {
      message: commitMessage || `📝 Update article: ${filePath.split('/').pop()}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: this.branch,
    };
    if (sha) {
      body.sha = sha;
    }
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${filePath}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update multiple articles/files in a single tree commit.
   * @param {Array<{path: string, content: string}>} files - Array of path and content
   * @param {string} commitMessage - Commit message
   */
  async updateArticles(files, commitMessage) {
    return this.commitChanges(commitMessage, files);
  }
}
