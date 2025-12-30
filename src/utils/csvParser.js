export const fetchCSV = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      // If the file doesn't exist or other network error
      throw new Error(`Failed to fetch CSV from ${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.warn("fetchCSV Error:", error);
    // Return empty array instead of crashing, or rethrow? 
    // The calling code (Supermercados.js line 318) has a try/catch block, so throwing is fine.
    throw error;
  }
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/); // Handle CRLF or LF
  if (lines.length === 0) return [];

  // Parse headers
  // We assume headers are comma-separated. 
  const headers = lines[0].split(',').map(h => h.trim());

  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rowValues = [];
    let currentVal = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        // Handle escaped quotes if needed, though usually just toggling inQuotes is enough for simple cases.
        // If we see two quotes "", it's an escaped quote inside a quoted string.
        if (inQuotes && line[j + 1] === '"') {
          currentVal += '"';
          j++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        rowValues.push(currentVal);
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    // Push the last value
    rowValues.push(currentVal);

    // Map to object
    const obj = {};
    // Be lenient if row length doesn't match headers exactly, but try to match as much as possible
    headers.forEach((header, index) => {
      // Clean up quotes from the value if strictly needed, but our logic above kept content inside quotes.
      // We usually want to strip wrapping quotes if they exist? 
      // The logic above accumulates content *inside* quotes but also *includes* the characters if we aren't careful?
      // Actually my logic above `currentVal += char` would *exclude* the quote if I don't add it in the `if(char === '"')` block.
      // Wait, my logic `else { inQuotes = !inQuotes; }` does NOT add the quote to `currentVal`. 
      // So `currentVal` will allow the content to be clean of wrapping quotes.
      // This is good.

      let val = rowValues[index] || '';
      obj[header] = val.trim();
    });
    result.push(obj);
  }

  return result;
};
