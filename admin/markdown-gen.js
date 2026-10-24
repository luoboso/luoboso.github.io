/**
 * Markdown generator for Hexo blog posts.
 * Converts draft JSON data into Hexo-compatible Markdown files.
 */
class MarkdownGenerator {
  /**
   * Generate a complete Hexo markdown file with front matter.
   *
   * @param {Object} post - { draft, title, categories, tags, description }
   * @returns {string} Complete markdown content
   */
  static generate(post) {
    const frontMatter = this.generateFrontMatter(post);
    const content = this.formatContent(post.draft.data.message, post.draft.data.images);
    return `${frontMatter}\n${content}\n`;
  }

  /**
   * Generate YAML front matter.
   */
  static generateFrontMatter(post) {
    const date = this.formatDate(post.draft.data.created_time);
    const categories = post.categories.map(c => `'${c}'`).join(', ');
    const tags = post.tags.map(t => `'${t}'`).join(', ');

    let fm = `---\n`;
    fm += `title: ${this.escapeYaml(post.title)}\n`;
    fm += `date: ${date}\n`;
    fm += `categories: [${categories}]\n`;
    fm += `tags: [${tags}]\n`;

    if (post.description) {
      fm += `description: ${this.escapeYaml(post.description)}\n`;
    }

    if (post.post_type) {
      fm += `post_type: ${post.post_type}\n`;
    }

    if (post.featured) {
      fm += `featured: true\n`;
    }

    // SEO: Open Graph
    if (post.draft.data.images && post.draft.data.images.length > 0) {
      fm += `cover: ${post.draft.data.images[0]}\n`;
    }

    fm += `---`;
    return fm;
  }

  /**
   * Format the post content from Facebook message to Markdown.
   */
  static formatContent(message, images) {
    if (!message) return '';

    let content = message;

    // Convert Facebook hashtags to inline style (keep as-is for now)
    // They'll display as regular text in the blog

    // Remove excessive blank lines (more than 2 consecutive)
    content = content.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace
    content = content.trim();

    // Append images at the end
    if (images && images.length > 0) {
      content += '\n\n';
      for (const img of images) {
        content += `![](${img})\n`;
      }
    }

    return content;
  }

  /**
   * Format ISO date to Hexo-compatible date string.
   */
  static formatDate(isoDate) {
    const d = new Date(isoDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Escape special YAML characters in a string.
   */
  static escapeYaml(str) {
    if (!str) return '""';
    // If contains special chars, wrap in quotes
    if (/[:#\[\]{}|>!@%&*?,]/.test(str) || str.includes("'")) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }

  /**
   * Generate a filename for the post.
   * Pattern matches existing blog posts.
   */
  static generateFileName(post) {
    const title = post.title
      .replace(/[\\/:*?"<>|]/g, '')  // Remove invalid filename chars
      .replace(/\s+/g, ' ')
      .trim();
    return `${title}.md`;
  }

  /**
   * Calculate SEO score for a post.
   *
   * @param {Object} post - { title, description, categories, tags, message }
   * @returns {Array} Array of { label, status: 'pass'|'warn'|'fail', detail }
   */
  static calculateSEOScore(post) {
    const checks = [];
    const { seo } = CONFIG;

    // Title length
    const titleLen = (post.title || '').length;
    if (titleLen >= seo.titleOptimalLength.min && titleLen <= seo.titleOptimalLength.max) {
      checks.push({ label: '標題長度適中', status: 'pass', detail: `${titleLen} 字` });
    } else if (titleLen >= seo.titleMinLength && titleLen <= seo.titleMaxLength) {
      checks.push({ label: '標題長度可接受', status: 'warn', detail: `${titleLen} 字，建議 ${seo.titleOptimalLength.min}-${seo.titleOptimalLength.max} 字` });
    } else {
      checks.push({ label: '標題長度需調整', status: 'fail', detail: `${titleLen} 字，建議 ${seo.titleOptimalLength.min}-${seo.titleOptimalLength.max} 字` });
    }

    // Description
    const descLen = (post.description || '').length;
    if (descLen >= seo.descriptionMinLength && descLen <= seo.descriptionMaxLength) {
      checks.push({ label: '摘要長度適中', status: 'pass', detail: `${descLen} 字` });
    } else if (descLen > 0) {
      checks.push({ label: '摘要長度可調整', status: 'warn', detail: `${descLen} 字，建議 ${seo.descriptionMinLength}-${seo.descriptionMaxLength} 字` });
    } else {
      checks.push({ label: '建議新增摘要', status: 'warn', detail: '有助於搜尋引擎和社群分享' });
    }

    // Categories
    if (post.categories && post.categories.length > 0 && post.categories[0]) {
      checks.push({ label: '已設定分類', status: 'pass', detail: post.categories.join(' > ') });
    } else {
      checks.push({ label: '未設定分類', status: 'fail', detail: '分類有助於網站結構' });
    }

    // Tags
    if (post.tags && post.tags.length > 0 && post.tags[0]) {
      checks.push({ label: '已設定標籤', status: 'pass', detail: `${post.tags.length} 個` });
    } else {
      checks.push({ label: '建議新增標籤', status: 'warn', detail: '標籤有助於相關文章推薦' });
    }

    // Images
    const hasImages = post.images && post.images.length > 0;
    if (hasImages) {
      checks.push({ label: '包含圖片', status: 'pass', detail: `${post.images.length} 張` });
    } else {
      checks.push({ label: '無圖片', status: 'warn', detail: '有圖片的文章點閱率更高' });
    }

    // Content length
    const contentLen = (post.message || '').length;
    if (contentLen > 200) {
      checks.push({ label: '內容豐富', status: 'pass', detail: `${contentLen} 字` });
    } else if (contentLen > 50) {
      checks.push({ label: '內容長度可', status: 'warn', detail: `${contentLen} 字` });
    } else {
      checks.push({ label: '內容較短', status: 'fail', detail: `${contentLen} 字` });
    }

    return checks;
  }

  /**
   * Parse Hexo markdown file content.
   * Extracts YAML front matter and body content.
   *
   * @param {string} markdownContent - Full raw markdown text
   * @returns {Object} { title, date, categories, tags, description, content }
   */
  static parse(markdownContent) {
    const match = markdownContent.match(/^---(\r?\n[\s\S]*?\r?\n)---(\r?\n[\s\S]*)$/);
    if (!match) {
      return {
        title: '無標題',
        content: markdownContent.trim(),
        categories: [],
        tags: [],
        date: '',
        description: ''
      };
    }

    const fm = match[1];
    const body = match[2].trim();
    const result = {
      title: '',
      date: '',
      categories: [],
      tags: [],
      description: '',
      post_type: '',
      featured: false,
      content: body
    };

    const lines = fm.split(/\r?\n/);
    let currentKey = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        let val = kvMatch[2].trim();
        currentKey = key;

        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }

        if (key === 'title') result.title = val;
        else if (key === 'date') result.date = val;
        else if (key === 'description') result.description = val;
        else if (key === 'post_type') result.post_type = val;
        else if (key === 'featured') result.featured = (val === 'true' || val === '1');
        else if (key === 'categories') {
          if (val.startsWith('[') && val.endsWith(']')) {
            result.categories = val.slice(1, -1).split(',').map(s => {
              s = s.trim();
              if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
              return s;
            }).filter(Boolean);
            currentKey = null;
          } else {
            result.categories = [];
          }
        }
        else if (key === 'tags') {
          if (val.startsWith('[') && val.endsWith(']')) {
            result.tags = val.slice(1, -1).split(',').map(s => {
              s = s.trim();
              if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
              return s;
            }).filter(Boolean);
            currentKey = null;
          } else {
            result.tags = [];
          }
        }
      } else if (trimmed.startsWith('-')) {
        let item = trimmed.slice(1).trim();
        if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
          item = item.slice(1, -1);
        }
        if (currentKey === 'categories') {
          result.categories.push(item);
        } else if (currentKey === 'tags') {
          result.tags.push(item);
        }
      }
    }

    return result;
  }

  /**
   * Generate Markdown file content from standard fields.
   */
  static generateFromFields({ title, date, categories, tags, description, post_type, featured, content }) {
    const categoriesStr = categories.map(c => `'${c}'`).join(', ');
    const tagsStr = tags.map(t => `'${t}'`).join(', ');

    let fm = `---\n`;
    fm += `title: ${this.escapeYaml(title)}\n`;
    fm += `date: ${date}\n`;
    fm += `categories: [${categoriesStr}]\n`;
    fm += `tags: [${tagsStr}]\n`;

    if (description) {
      fm += `description: ${this.escapeYaml(description)}\n`;
    }

    if (post_type) {
      fm += `post_type: ${post_type}\n`;
    }

    if (featured) {
      fm += `featured: true\n`;
    }

    fm += `---\n${content}\n`;
    return fm;
  }
}
