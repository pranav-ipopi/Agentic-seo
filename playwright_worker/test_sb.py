import json
from seleniumbase import SB
def test():
    try:
        with SB(uc=True, headless=True) as sb:
            sb.get('https://google.com')
            
            # Let's see what is actually available!
            import inspect
            print(dir(sb))
    except Exception as e:
        print(str(e))
test()
