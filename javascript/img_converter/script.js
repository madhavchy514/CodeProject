const imageInput = document.getElementById('image-input');
const convertButton = document.getElementById('convert-button');
const outputFormatSelect = document.getElementById('output-format');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const downloadLink = document.getElementById('download-link');
const dropArea = document.getElementById('drop-area');
const realImageInput = document.getElementById('image-input');
dropArea.addEventListener('click', () => {
  realImageInput.click();
});
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});
dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('dragover');
});
dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
  realImageInput.files = e.dataTransfer.files;
  updateDropAreaText();
  });
realImageInput.addEventListener('change', () => {
  updateDropAreaText();
  });
function updateDropAreaText() {
  if (realImageInput.files && realImageInput.files.length === 1) {
    dropArea.querySelector('p').textContent = realImageInput.files[0].name;
  } else if (realImageInput.files && realImageInput.files.length > 1) {
    dropArea.querySelector('p').textContent = `${realImageInput.files.length} files selected`;
  } else {
    dropArea.querySelector('p').textContent = 'Drag & drop images here or click to select';
  }
}
function updateProgress(processedCount, totalImages, fileName) {
  document.getElementById("progress-bar").style.display = 'block';
  const percentage = (processedCount / totalImages) * 100;
  progressBar.style.width = percentage + '%';
  progressText.innerHTML = `
    Converted <span style='color: #000; font-weight: bold'>${fileName}</span>
    (${processedCount}/${totalImages}) - 
    ${percentage.toFixed(2)}%
  `;
}
function readFileAsBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Blob([reader.result], {
        type: file.type
      }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
function convertBlob(blob, outputFormat) {
  return new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((convertedBlob) => {
      if (convertedBlob) {
        resolve(convertedBlob);
      } else {
        reject(new Error('Failed to convert blob'));
      }
      URL.revokeObjectURL(img.src);
    }, outputFormat);
  };
  img.onerror = (error) => {
    URL.revokeObjectURL(img.src);
    reject(error);
  };
  const url = URL.createObjectURL(blob);
    img.src = url;
  });
}
async function processImages() {
  const files = Array.from(imageInput.files);
  const outputFormat = outputFormatSelect.value;
  const totalImages = files.length;
  let processedCount = 0;
  const zip = new JSZip();
  downloadLink.style.display = 'none';
  progressText.style.display = 'block';
  for (const file of files) {
    try {
      const blob = await readFileAsBlob(file);
      const convertedBlob = await convertBlob(blob, outputFormat);
      const fileExtension = outputFormat.split('/')[1];
      const fileName = `${file.name.split('.')[0]}_${Date.now()}.${fileExtension}`;
            const arrayBuffer = await convertedBlob.arrayBuffer();
      zip.file(fileName, arrayBuffer);
      processedCount++;
      updateProgress(processedCount, totalImages, file.name);
    } catch (error) {
      progressText.innerHTML = `<span style='color:red'>Error processing ${file.name}: ${error}</span>`;
    }
  }
  if (processedCount === 0) {
    progressText.innerHTML = "<span style='color:red'>No files were successfully converted.</span>";
    return;
  }
  progressText.innerHTML = ("Zipping...");
  const zipBlob = await zip.generateAsync({ type: "blob"});
  progressText.innerHTML = "Zipping completed!";
  await new Promise((res) => setTimeout(res, 1000));
  document.getElementById("progress-bar").style.display = 'none';
  const zipUrl = URL.createObjectURL(zipBlob);
  downloadLink.href = zipUrl;
  downloadLink.download = "converted_images.zip";
  downloadLink.style.display = "block";
  progressText.innerHTML = ("ALL DONE! Click the download link below!");
}
convertButton.addEventListener('click', processImages);