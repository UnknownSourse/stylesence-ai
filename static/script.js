document.addEventListener('DOMContentLoaded', () => {
    // --- Variables ---
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultsSection = document.getElementById('results');
    const uploadSection = document.querySelector('.upload-section');
    const resetBtn = document.getElementById('resetBtn');
    let selectedFile = null;

    // --- Click to Browse Logic ---
    if (browseBtn && fileInput) {
        browseBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            fileInput.click();
        });
    }

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', (e) => {
            if (e.target.id !== 'browseBtn' && e.target.id !== 'fileInput') {
                fileInput.click();
            }
        });
    }

    // --- Drag and Drop Logic ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    if (uploadArea) {
        uploadArea.addEventListener('dragenter', () => uploadArea.classList.add('dragover'));
        uploadArea.addEventListener('dragover', () => uploadArea.classList.add('dragover'));
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

        uploadArea.addEventListener('drop', (e) => {
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function handleFileSelect(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert('Please upload a valid image file (JPG, PNG, WEBP).');
            return;
        }
        selectedFile = file;
        uploadArea.querySelector('h3').innerText = `Selected: ${file.name}`;
        submitBtn.disabled = false;
    }

    // --- Form Submission & API Fetch ---
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedFile) return;

            const gender = document.querySelector('input[name="gender"]:checked').value;
            const occasion = document.getElementById('occasionSelect').value;

            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('gender', gender);
            formData.append('occasion', occasion);

            submitBtn.style.display = 'none';
            loadingSpinner.style.display = 'block';

            try {
                const response = await fetch('/predict', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                
                if (data.success) {
                    displayResults(data);
                } else {
                    alert(`Error: ${data.error}`);
                    resetUI();
                }
            } catch (error) {
                console.error('Fetch error:', error);
                alert('An error occurred. Please ensure your Python Flask server is running.');
                resetUI();
            }
        });
    }

    // --- Render Results ---
    function displayResults(data) {
        uploadSection.style.display = 'none';
        resultsSection.style.display = 'block';

        const recs = data.recommendations;
        
        document.getElementById('skinToneResult').innerHTML = `<strong>Detected Tone:</strong> ${data.skin_tone} <br> <strong>Styling for:</strong> ${data.gender} (${document.getElementById('occasionSelect').value})`;
        document.getElementById('outfitResult').innerText = recs.outfit_description || recs.outfit;
        
        document.getElementById('colorResult').innerHTML = `
            <strong>Primary:</strong> ${recs.color_palette.primary} <br>
            <strong>Secondary:</strong> ${recs.color_palette.secondary} <br>
            <strong>Accent:</strong> ${recs.color_palette.accent}
        `;
        document.getElementById('accResult').innerHTML = `
            <strong>Hair:</strong> ${recs.hairstyle} <br><br>
            <strong>Accessories:</strong><br> - ${recs.accessories.join('<br> - ')}
        `;
        document.getElementById('reasonResult').innerText = recs.why_it_works;

        // --- SHOPPING LINKS GENERATION ---
        const shoppingGrid = document.getElementById('shoppingGrid');
        shoppingGrid.innerHTML = ''; 

        // Get shopping terms from AI
        let shoppingItems = recs.shopping_terms || [];
        
        // Add the first accessory to the shopping list
        if (recs.accessories && recs.accessories.length > 0) {
            shoppingItems.push(recs.accessories[0]); 
        }

        shoppingItems.forEach(item => {
            let cleanItem = item.replace(/<[^>]*>?/gm, '').trim(); 
            if(cleanItem.length > 2) {
                let baseSearchTerm = `${cleanItem} for ${data.gender.toLowerCase()}`;
                
                let amazonQuery = encodeURIComponent(baseSearchTerm);
                let amazonUrl = `https://www.amazon.in/s?k=${amazonQuery}`;

                let myntraQuery = baseSearchTerm.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
                let myntraUrl = `https://www.myntra.com/${myntraQuery}?rawQuery=${myntraQuery}`;
                
                let card = document.createElement('div');
                card.style.cssText = "background: white; padding: 20px; border-radius: 12px; border: 1px solid #eee; box-shadow: 0 4px 6px rgba(0,0,0,0.05); flex: 1; min-width: 200px; text-align: center;";
                
                card.innerHTML = `
                    <h4 style="font-size: 0.95em; color: #333; margin-bottom: 15px; height: 40px; overflow: hidden; text-transform: capitalize;">${cleanItem}</h4>
                    <a href="${myntraUrl}" target="_blank" style="display: block; background: #d81b60; color: white; text-decoration: none; padding: 10px; border-radius: 25px; font-size: 0.9em; margin-bottom: 10px; transition: 0.3s;">
                        <i class="fas fa-shopping-cart"></i> Shop Myntra
                    </a>
                    <a href="${amazonUrl}" target="_blank" style="display: block; background: #232F3E; color: white; text-decoration: none; padding: 10px; border-radius: 25px; font-size: 0.9em; transition: 0.3s;">
                        <i class="fab fa-amazon"></i> Shop Amazon
                    </a>
                `;
                shoppingGrid.appendChild(card);
            }
        });
    }

    // --- Reset UI ---
    if (resetBtn) {
        resetBtn.addEventListener('click', resetUI);
    }

    function resetUI() {
        selectedFile = null;
        if (fileInput) fileInput.value = '';
        if (uploadArea) uploadArea.querySelector('h3').innerText = 'Drag & Drop Your Photo';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.display = 'inline-block';
        }
        if (loadingSpinner) loadingSpinner.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'none';
        if (uploadSection) uploadSection.style.display = 'block';
    }
}); // <-- This is the final bracket that was causing the issue!