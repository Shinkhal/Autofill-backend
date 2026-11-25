import { PDFParse } from 'pdf-parse';
import { HttpError } from '../utils/http-error.js';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Invalid PDF file');
  const parser = new PDFParse({ data: buffer, isEvalSupported: false });
  try {
    const result = await parser.getText({ first: 30 });
    const text = result.text.trim();
    if (!text) throw new HttpError(422, 'PDF contains no extractable text');
    return text.slice(0, 60000);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Unable to read PDF');
  } finally {
    await parser.destroy();
  }
}
