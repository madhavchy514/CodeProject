const fileInput = document.getElementById('fileInput');
const uploadBox = document.getElementById('uploadBox');
const extractButton = document.getElementById('extractButton');
const fileInfo = document.getElementById('fileInfo');
const progressBar = document.getElementById('progressbar');
const progressLabel = document.getElementById('progressbar-label');
const progressBarContainer = document.getElementById('progressbar-container');
const progressText = document.getElementById('progressInfo');
const imageContainer = document.getElementById('imageContainer');

let selectedFile = null;
let totalPages = 0;

uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
});
uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('dragover'));
uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
    }
});

async function handleFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please upload a valid PDF file.');
        return;
    }
    selectedFile = file;
    fileInfo.innerHTML = `📄 <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)<br>Status: Loading file details...`;     extractButton.setAttribute('disabled', 'disabled');

    const reader = new FileReader();
    reader.onload = async function (e) {
        const pdfData = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument(pdfData).promise;
        totalPages = pdf.numPages;
        fileInfo.innerHTML = `📄 <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)<br>Total Pages: ${totalPages}`;
    };
    reader.readAsArrayBuffer(selectedFile);
    extractButton.removeAttribute('disabled');
}

extractButton.addEventListener('click', () => {
    if (!selectedFile) {
        alert('Please select a PDF file first.');
        return;
    }

    const reader = new FileReader();
    const scaleValue = parseFloat(document.getElementById('scale').value);

    reader.onload = async function (e) {
        const pdfData = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument(pdfData).promise;

        const zip = new JSZip();
        imageContainer.innerHTML = '';
        progressText.innerHTML = '';
        progressBar.style.width = `0%`;
        progressBarContainer.style.display = 'block';

        const startTime = Date.now();
        let processedPages = 0;

        imageContainer.scrollTo({
            top: imageContainer.scrollHeight,
            behavior: 'smooth'
        });

        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: scaleValue });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: ctx, viewport }).promise;

            const dataUrl = canvas.toDataURL('image/png');
            const img = new Image();
            img.src = dataUrl;
            imageContainer.appendChild(img);
            zip.file(`page_${i}.png`, dataUrl.split(',')[1], { base64: true });

                                                
                                                
            processedPages = i;
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            const averageTimePerPage = processedPages > 0 ? elapsedTime / processedPages : 0;
            const remainingPages = totalPages - processedPages;
            const estimatedRemainingTime = remainingPages * averageTimePerPage;

            const progress = Math.round((i / pdf.numPages) * 100);
            progressBar.style.width = `${progress}%`;
            const remainingTimeString = formatTime(estimatedRemainingTime);
            progressLabel.textContent = `Page ${processedPages} of ${totalPages} (${progress}%) - Remaining: ${remainingTimeString}`;
        }

        function formatTime(milliseconds) {
            if (milliseconds < 0) {return "Calculating...";}
            const seconds = Math.floor((milliseconds / 1000) % 60);
            const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
            const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        
            const parts = [];
            if (hours > 0) {parts.push(`${hours}h`);}
            if (minutes > 0 || hours > 0) {parts.push(`${minutes}m`);}
            parts.push(`${seconds}s`);
        
            return parts.join(" ");
        }

        document.getElementById('loadingIndicator').style.display = 'flex';
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        document.getElementById('loadingIndicator').style.display = 'none';

        document.querySelector(".download-btn")?.remove();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'pdf_images.zip';
        link.className = 'download-btn';
        link.textContent = '⬇️ Download All as ZIP';
        document.getElementById("container").appendChild(link);
    };
    reader.readAsArrayBuffer(selectedFile);
});