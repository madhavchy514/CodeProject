const pxToMm = px => px * 0.264583;
const { jsPDF } = window.jspdf;
async function generatePDF() {
  const files = document.getElementById('imageInput').files;
  const progressBar = document.getElementById('progress-bar');
  const status = document.getElementById('status');
  if (!files.length) {
    alert("Please select image files first.");
    return;
  }
  const fixedPageHeight = 297;
  const maxPageWidth = 210;
  const minPageWidth = 100;
  let pdf;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dataURL = await readFileAsDataURL(file);
    const img = await loadImage(dataURL);
    const imgHeightMm = pxToMm(img.height);
    const imgWidthMm = pxToMm(img.width);
    const scale = fixedPageHeight / imgHeightMm;
    let scaledWidth = imgWidthMm * scale;
    let scaledHeight = fixedPageHeight;
    if (scaledWidth > maxPageWidth) {
      scaledWidth = maxPageWidth;
      scaledHeight = imgHeightMm * (maxPageWidth / imgWidthMm);
    }
    if (scaledWidth < minPageWidth) {
      scaledWidth = minPageWidth;
      scaledHeight = imgHeightMm * (minPageWidth / imgWidthMm);
    }
    if (i === 0) {
      pdf = new jsPDF({
        orientation: scaledWidth > scaledHeight ? 'l' : 'p',
        unit: 'mm',
        format: [scaledWidth, scaledHeight]
      });
    } else {
      pdf.addPage([scaledWidth, scaledHeight], scaledWidth > scaledHeight ? 'l' : 'p');
    }
    pdf.addImage(dataURL, 'JPEG', 0, 0, scaledWidth, scaledHeight);
    const percent = ((i + 1) / files.length) * 100;
    progressBar.style.width = `${percent}%`;
    status.textContent = `Processed ${i + 1} of ${files.length}`;
  }
  pdf.save("images_fixed_height.pdf");
  status.textContent = "PDF created successfully!";
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}