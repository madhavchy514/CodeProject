const { PDFDocument } = PDFLib; 

const pdfInput = document.getElementById('pdfInput');
const startPageInput = document.getElementById('startPageInput');
const endPageInput = document.getElementById('endPageInput');
const processButton = document.getElementById('processButton');
const statusDiv = document.getElementById('status');
let totalPages = 0;

pdfInput.addEventListener('change', async () => {
  if (!pdfInput.files.length) {
    processButton.disabled = true;
    totalPages = 0;
    statusDiv.textContent = 'Please select a file.';
    return;
  }
  
  const file = pdfInput.files[0];
  statusDiv.textContent = `Analyzing ${file.name}...`;
  
  try {
    const pdfBytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    totalPages = pdfDoc.getPageCount();
    
    startPageInput.max = totalPages;
    endPageInput.max = totalPages;
    endPageInput.value = totalPages;                 
    statusDiv.textContent = `PDF Loaded: ${totalPages} pages total. Ready to split.`;
    processButton.disabled = false;
  } catch (e) {
    console.error(e);
    statusDiv.textContent = `❌ Error loading PDF: ${e.message}`;
    processButton.disabled = true;
    totalPages = 0;
  }
});
async function processPdfFile() {
  const file = pdfInput.files[0];
  const startPage = parseInt(startPageInput.value, 10);
  const endPage = parseInt(endPageInput.value, 10);
  if (!file) {
    statusDiv.textContent = 'Please select a PDF file first.';
    return;
  }
  if (startPage < 1 || endPage > totalPages || startPage > endPage) {
    statusDiv.textContent = 
    `❌ Invalid page range. Must be between 1 and ${totalPages}, and Start Page must be less than or equal to End Page.`;
    return;
  }
  statusDiv.textContent = `Splitting pages ${startPage} to ${endPage}...`;
  processButton.disabled = true;
  
  try {
    const existingPdfBytes = await file.arrayBuffer();
    
    const pdfBytes = await splitPdf(existingPdfBytes, startPage, endPage);
    
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    const originalFileName = file.name.replace(/\.pdf$/i, '');
    const outputFileName = `${originalFileName}_pages_${startPage}_${endPage}.pdf`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    statusDiv.textContent = `✅ Done! Created new PDF with ${endPage - startPage + 1} pages. Download started.`;
    processButton.disabled = false;
    
  } catch (error) {
    console.error(error);
    statusDiv.textContent = `❌ An error occurred: ${error.message}`;
    processButton.disabled = false;
  }
}
async function splitPdf(existingPdfBytes, startPage, endPage) {
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const newPdf = await PDFDocument.create();
  
  const pagesToCopy = [];
  for (let i = startPage - 1; i <= endPage - 1; i++) {
    pagesToCopy.push(i);
  }
  
  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
  
  copiedPages.forEach(page => newPdf.addPage(page));
  
  return newPdf.save();
}