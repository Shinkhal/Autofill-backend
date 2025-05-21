// services/pdfParser.js
import pdf from 'pdf-parse/lib/pdf-parse.js';


export const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (err) {
    console.error("PDF parsing failed:", err.message);
    throw err;
  }
};
