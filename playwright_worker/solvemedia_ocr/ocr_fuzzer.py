import os
import re
import easyocr
from rapidfuzz import process
from fastapi import FastAPI, UploadFile, File
import uvicorn

app = FastAPI(title="OCR Fuzzer")

print("Loading EasyOCR model...")
reader = easyocr.Reader(['en'], gpu=False, verbose=False)

def load_dictionary(filepath):
    if not os.path.exists(filepath):
        print(f"[WARNING] Dictionary file not found: {filepath}")
        return []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract phrases using regex (matches strings inside double or single quotes)
    phrases = re.findall(r'["\'](.*?)["\']', content)
    phrases = [p for p in phrases if p.strip()]
    return phrases

DICT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'solvemedia.txt')

@app.post("/solve")
async def solve_captcha(file: UploadFile = File(...)):
    # Save the uploaded file temporarily
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())
        
    try:
        # Extract raw text from the image
        raw_ocr_result = reader.readtext(temp_path, detail=0)
        detected_text = " ".join(raw_ocr_result).strip()
        
        if not detected_text:
            return {"text": "", "score": 0.0}
            
        # Load dictionary dynamically to pick up any new additions
        current_dict = load_dictionary(DICT_PATH)
        if not current_dict:
            return {"text": detected_text, "score": 0.0}
            
        # Fuzzy match the detected text against the dictionary
        best_match, confidence_score, _ = process.extractOne(detected_text, current_dict)
        
        return {
            "text": best_match,
            "score": float(confidence_score)
        }
    except Exception as e:
        print(f"OCR Error: {e}")
        return {"text": "", "score": 0.0}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
