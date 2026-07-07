import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function run() {
  try {
    const pdfBytes = fs.readFileSync('OMSE 2026.pdf');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    console.log("Fields found:", fields.length);
    fields.forEach(field => {
      console.log(field.getName(), field.constructor.name);
    });
  } catch (e) {
    console.error(e);
  }
}
run();
