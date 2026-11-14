/**
 * CSV Helper for admin panel.
 * Handles RFC-4180 compliant CSV export and import parsing.
 */
class CSVHelper {
  /**
   * Export articles array to CSV string.
   *
   * @param {Array} articles - Array of article objects { filename, title, date, categories, tags, description }
   * @returns {string} RFC-4180 CSV string
   */
  static exportToCSV(articles) {
    const headers = ['Filename', 'Title', 'Date', 'Categories', 'Tags', 'Description'];
    const rows = [headers];

    for (const art of articles) {
      rows.push([
        art.filename || '',
        art.title || '',
        art.date || '',
        (art.categories || []).join(', '),
        (art.tags || []).join(', '),
        art.description || ''
      ]);
    }

    return rows.map(row => row.map(val => this.escapeCSVField(val)).join(',')).join('\r\n');
  }

  /**
   * Parse CSV string back into array of objects.
   *
   * @param {string} csvText - Raw CSV text
   * @returns {Array} Array of { filename, title, date, categories, tags, description }
   */
  static parseCSV(csvText) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let inQuotes = false;

    // Normalize newlines
    const text = csvText.replace(/\r\n/g, '\n');

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote
            currentField += '"';
            i++; // skip next quote
          } else {
            // End of quotes
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentLine.push(currentField);
          currentField = '';
        } else if (char === '\n') {
          currentLine.push(currentField);
          lines.push(currentLine);
          currentLine = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }

    // Push last field and line if text didn't end with a newline
    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField);
      lines.push(currentLine);
    }

    if (lines.length === 0) return [];

    const headers = lines[0].map(h => h.trim().toLowerCase());
    const articles = [];

    // Map headers to column indices
    const filenameIdx = headers.indexOf('filename');
    const titleIdx = headers.indexOf('title');
    const dateIdx = headers.indexOf('date');
    const categoriesIdx = headers.indexOf('categories');
    const tagsIdx = headers.indexOf('tags');
    const descriptionIdx = headers.indexOf('description');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 2 || (line.length === 1 && !line[0])) continue; // Skip empty rows

      const getField = (idx) => (idx !== -1 && line[idx] !== undefined) ? line[idx].trim() : '';

      const categoriesStr = getField(categoriesIdx);
      const tagsStr = getField(tagsIdx);

      articles.push({
        filename: getField(filenameIdx),
        title: getField(titleIdx),
        date: getField(dateIdx),
        categories: categoriesStr ? categoriesStr.split(',').map(s => s.trim()).filter(Boolean) : [],
        tags: tagsStr ? tagsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
        description: getField(descriptionIdx)
      });
    }

    return articles;
  }

  /**
   * Helper to escape special characters in CSV field according to RFC-4180.
   */
  static escapeCSVField(val) {
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    }
    return str;
  }
}
