const { PDFDocument, degrees } = PDFLib;
const pdfInput = document.getElementById('pdfInput');
const processButton = document.getElementById('processButton');
const statusDiv = document.getElementById('status');
pdfInput.addEventListener('change', () => {
  processButton.disabled = !pdfInput.files.length;
  statusDiv.textContent = pdfInput.files.length ? `Ready to process: ${pdfInput.files[0].name}` : 'Please select a file.';
});
async function processPdfFile() {
  const file = pdfInput.files[0];
  if (!file) {
    statusDiv.textContent = 'Please select a PDF file first.';
    return;
  }
  statusDiv.textContent = 'Processing... Please wait.';
  processButton.disabled = true;
  try {
    const existingPdfBytes = await file.arrayBuffer();
    const pdfBytes = await combineAndRotatePages(existingPdfBytes);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `processed_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    statusDiv.textContent = `✅ Done! The processed PDF download has started.`;
    processButton.disabled = false;
  } catch (error) {
    console.error(error);
    statusDiv.textContent = `❌ An error occurred: ${error.message}`;
    processButton.disabled = false;
  }
}
async function combineAndRotatePages(existingPdfBytes) {
  const srcPdf = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();
  const totalPages = srcPdf.getPageCount();
  for (let i = 0; i < totalPages; i += 2) {
    const indices = [i];
    if (i + 1 < totalPages) indices.push(i + 1);
    const pagesToEmbed = indices.map(idx => srcPdf.getPage(idx));
    const embeddedPages = await newPdf.embedPages(pagesToEmbed);
    const pageDims = indices.map(idx => {
      const p = srcPdf.getPage(idx);
      return { width: p.getWidth(), height: p.getHeight() };
    });
    const rotatedDims = pageDims.map(({ width, height }) => ({ width: height, height: width }));
    const combinedWidth = Math.max(...rotatedDims.map(d => d.width));
    const combinedHeight = rotatedDims.reduce((sum, d) => sum + d.height, 0);         
    const newPage = newPdf.addPage([combinedWidth, combinedHeight]);
    let currentY = combinedHeight;
    for (let j = embeddedPages.length - 1; j >= 0; j--) {
      const ep = embeddedPages[j];
      const { width: origWidth, height: origHeight } = pageDims[j];           
      const { width, height } = rotatedDims[j];           
      currentY -= height; 
      newPage.drawPage(ep, { x: origHeight, y: currentY, rotate: degrees(90) });
    }
  }
  return newPdf.save();
}