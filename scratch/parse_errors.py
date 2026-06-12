from bs4 import BeautifulSoup

def main():
    filepath = "C:/Users/IPOPI/Desktop/Agentic-seo/scratch/failed_page.html"
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            html = f.read()
            
        soup = BeautifulSoup(html, 'html.parser')
        
        # Look for typical alert classes, message classes, or errors
        error_classes = [
            'error', 'alert', 'warning', 'danger', 'msg', 'message', 
            'submitpro-error', 'submitpro-message', 'validation', 
            'wpcf7-mail-sent', 'notice', 'form-error'
        ]
        
        print("--- EXTRACTING ALL APPARENT ERROR/ALERT MESSAGES ---")
        for cls in error_classes:
            elements = soup.find_all(class_=lambda x: x and any(c in x.lower() for c in [cls]))
            for el in elements:
                text = el.get_text(strip=True)
                if text and len(text) < 500: # avoid print massive blocks
                    print(f"Class matches '{cls}': {text}")
                    
        # Look for ids containing error, alert, warning
        print("\n--- EXTRACTING ELEMENTS WITH ID CONTAINING ERROR/ALERT/WARNING ---")
        elements = soup.find_all(id=lambda x: x and any(term in x.lower() for term in ['error', 'alert', 'warning']))
        for el in elements:
            text = el.get_text(strip=True)
            if text:
                print(f"ID matches: {el.get('id')} => {text}")
                
        # Print visible text in form wrapper
        print("\n--- SUBMIT FORM CONTAINER TEXT ---")
        form_container = soup.find(id='submit-article') or soup.find(class_='submit-article') or soup.find('form')
        if form_container:
            # print first 1000 chars of form container text
            print(form_container.get_text(separator=' | ', strip=True)[:1500])
        else:
            print("No form or submit-article container found.")
            
    except Exception as e:
        print(f"Error parsing HTML: {e}")

if __name__ == '__main__':
    main()
