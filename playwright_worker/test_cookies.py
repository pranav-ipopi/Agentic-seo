import json
from seleniumbase import SB
def test():
    try:
        with SB(uc=True, headless=True) as sb:
            sb.get('https://google.com')
            cookies = sb.get_cookies()
            print(json.dumps({'status': 'success', 'cookies': cookies}))
    except Exception as e:
        print(str(e))
test()
