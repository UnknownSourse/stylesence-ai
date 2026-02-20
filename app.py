import os
import cv2
import numpy as np
import json
from flask import Flask, render_template, request, jsonify
from datetime import datetime
from werkzeug.utils import secure_filename
from groq import Groq
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

app = Flask(__name__)
# Set maximum upload size to 10MB as specified in the configuration parameters
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 
app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Initialize Groq Client
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY)

# Use the model specified in the document parameters
GROQ_MODEL = "llama-3.3-70b-versatile" 

# Ensure necessary directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)

def detect_skin_tone(image_path):
    """
    Analyzes the user's photo using OpenCV to detect skin tone category.
    """
    try:
        # Load the uploaded image
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Extract a center crop (assuming the user's face is centered)
        h, w, _ = img.shape
        center_crop = img_rgb[int(h*0.3):int(h*0.7), int(w*0.3):int(w*0.7)]
        
        # Calculate the average color
        avg_color_per_row = np.average(center_crop, axis=0)
        avg_color = np.average(avg_color_per_row, axis=0)
        
        # Map average RGB to luminance for a basic categorization
        r, g, b = avg_color
        luminance = (0.299*r + 0.587*g + 0.114*b)
        
        # Categorize into Fair, Medium, Olive, Deep
        if luminance > 180:
            return "Fair"
        elif luminance > 120:
            return "Medium"
        elif luminance > 80:
            return "Olive"
        else:
            return "Deep"
    except Exception as e:
        print(f"Image analysis error: {e}")
        return "Medium" # Fallback tone

def get_styling_recommendations(skin_tone, gender, occasion): # Added occasion parameter
    prompt = f"""
    You are an expert personal fashion stylist. 
    A {gender} user with a '{skin_tone}' skin tone has asked for styling recommendations for a '{occasion}' occasion.
    
    Provide a JSON-formatted response with the following keys:
    - "outfit_description": A detailed, descriptive paragraph of the ideal outfit for this occasion.
    - "shopping_terms": A list of 3-4 short, highly searchable e-commerce terms for the main clothing items (e.g., ["emerald green shirt", "brown chinos", "tan loafers"]). Keep these under 4 words each!
    - "color_palette": A dictionary with keys "primary", "secondary", and "accent".
    - "accessories": A list of 2-3 recommended accessories.
    - "hairstyle": A brief hairstyle recommendation.
    - "why_it_works": A detailed explanation of why these recommendations work for their skin tone and the occasion.
    
    Return ONLY valid JSON. Do not include introductory text or markdown tags.
    """
    
    # ... (Keep the rest of the groq_client.chat.completions.create code exactly the same)
    
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": "You are a backend API that only responds in valid JSON format."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model=GROQ_MODEL,
            temperature=0.7, # Controls creativity
            max_tokens=1200, # Matches the document's configuration parameter
        )
        
        return chat_completion.choices[0].message.content
    except Exception as e:
        print(f"Groq Inference Error: {e}")
        return None

@app.route('/')
def home():
    # Serve the frontend interface
    if os.path.exists('templates/index.html'):
        return render_template('index.html')
    return "<h1>Server Running</h1><p>Please place index.html in the templates folder.</p>"

@app.route('/predict', methods=['POST'])
def predict():
    # 1. Validate the incoming request
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part in request'}), 400
    
    file = request.files['file']
    gender = request.form.get('gender', 'Female') # Capture gender preference from frontend
    occasion = request.form.get('occasion', 'Casual') # Capture occasion from frontend
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
        
    try:
        # 2. Save the image to the static/uploads directory
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # 3. Detect Skin Tone via OpenCV
        skin_tone = detect_skin_tone(filepath)
        if not skin_tone:
             return jsonify({'success': False, 'error': 'Image processing failed'}), 500
             
        # 4. Trigger Groq API (LLaMA 3.3 70B)
        ai_response_json = get_styling_recommendations(skin_tone, gender,occasion)
        if not ai_response_json:
            return jsonify({'success': False, 'error': 'AI failed to generate styling advice'}), 500
            
        # Parse LLaMA's string response into an actual Python dictionary
        try:
            # CLEANUP: Remove markdown code blocks if the AI added them
            clean_json_string = ai_response_json.strip()
            if clean_json_string.startswith("```json"):
                clean_json_string = clean_json_string[7:]
            elif clean_json_string.startswith("```"):
                clean_json_string = clean_json_string[3:]
                
            if clean_json_string.endswith("```"):
                clean_json_string = clean_json_string[:-3]
                
            clean_json_string = clean_json_string.strip()

            recommendations = json.loads(clean_json_string)
            
        except json.JSONDecodeError as e:
            # Print the exact AI output to the terminal so we can see what went wrong
            print(f"\n--- JSON PARSE ERROR ---")
            print(f"Raw AI Output:\n{ai_response_json}")
            print(f"------------------------\n")
            return jsonify({'success': False, 'error': 'AI output formatting error (Check terminal)'}), 500

        # 5. Return success payload to the frontend
        return jsonify({
            'success': True,
            'skin_tone': skin_tone,
            'gender': gender,
            'recommendations': recommendations,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("="*70)
    print(" STARTING AI STYLING PLATFORM ")
    print(f" Model Selected: {GROQ_MODEL}")
    print(" Local Server: http://127.0.0.1:5000")
    print("="*70)
    app.run(debug=True, host='127.0.0.1', port=5000, use_reloader=False)