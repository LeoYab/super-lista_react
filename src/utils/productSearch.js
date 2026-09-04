// Word-based fuzzy matching shared by Supermercados.js and Comparador.js:
// every whitespace-separated word in the search term must appear somewhere
// in the combined searchable text (order-independent, substring match).

export const textMatchesAllWords = (text, term) => {
  if (!term || !term.trim()) return false;
  const words = term.toLowerCase().trim().split(/\s+/);
  const target = text.toLowerCase();
  return words.every((word) => target.includes(word));
};

export const filterProductsByTerm = (products, term, fields = ['nombre', 'marca_producto']) => {
  if (!term || !term.trim()) return [];
  return products.filter((product) => {
    const combined = fields.map((field) => String(product[field] ?? '')).join(' ');
    return textMatchesAllWords(combined, term);
  });
};
