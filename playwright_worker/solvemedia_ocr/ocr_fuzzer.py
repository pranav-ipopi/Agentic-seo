import os
import re
import easyocr
from rapidfuzz import process, fuzz
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
    
    # Extract phrases using regex (matches strings inside double quotes)
    phrases = re.findall(r'"([^"]+)"', content)
    phrases = [p for p in phrases if p.strip()]
    return phrases

DICT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'solvemedia.txt')

# Pre-load dictionary at startup so it's in memory (still reloaded per request to
# pick up any new phrases added by _add_to_solvemedia_dict)
_cached_dict: list = []

def _best_score(ocr_text: str, phrase: str) -> float:
    """
    Return the best fuzzy score across multiple scorers.

    - token_sort_ratio: sorts tokens before comparing, handles word-order
      noise and joined words well (e.g. "drawa blank" vs "draw a blank" → ~95)
    - partial_ratio: best substring match, handles cases where OCR dropped
      a word entirely (e.g. "draw blank" vs "draw a blank" → ~90)

    Taking the max means a correct phrase only needs ONE scorer to recognise it,
    greatly reducing false-low scores from minor OCR noise.
    """
    return max(
        fuzz.token_sort_ratio(ocr_text, phrase),
        fuzz.partial_ratio(ocr_text, phrase),
    )


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

        # Reject trivially short OCR results outright — single characters or
        # fragments like "i", "a", "do" can never be valid solvemedia phrases
        if len(detected_text) < 3:
            print(f"[REJECT] OCR result too short to match: '{detected_text}'")
            return {"text": "", "score": 0.0}
            
        # Load dictionary dynamically to pick up any new additions
        current_dict = load_dictionary(DICT_PATH)
        if not current_dict:
            return {"text": detected_text, "score": 0.0}

        # Score every dictionary entry using the best of token_sort_ratio and
        # partial_ratio, then pick the top match.
        best_match = None
        best_score = 0.0
        for phrase in current_dict:
            score = _best_score(detected_text, phrase)
            if score > best_score:
                best_score = score
                best_match = phrase

        if best_match is None:
            return {"text": "", "score": 0.0}

        # Hard threshold — anything below 80 is not a confident match.
        # The combined scorer means a genuine phrase almost always hits ≥ 80
        # even with minor OCR noise; below that we'd rather refresh and retry.
        MIN_SCORE = 80.0
        if best_score < MIN_SCORE:
            print(f"[REJECT] Best match '{best_match}' scored {best_score:.1f} < {MIN_SCORE} threshold")
            return {"text": "", "score": float(best_score)}

        # Dictionary membership guard — verify the returned phrase actually
        # exists in the list (guards against any edge case where the scorer
        # fabricates a near-match not in the dictionary)
        if best_match not in current_dict:
            print(f"[REJECT] Match '{best_match}' not found in dictionary")
            return {"text": "", "score": 0.0}

        print(f"[MATCH] '{best_match}' (score={best_score:.1f}, ocr='{detected_text}')")
        return {
            "text": best_match,
            "score": float(best_score)
        }
    except Exception as e:
        print(f"OCR Error: {e}")
        return {"text": "", "score": 0.0}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
