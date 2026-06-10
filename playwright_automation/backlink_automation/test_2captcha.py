import os
from twocaptcha import TwoCaptcha
from dotenv import load_dotenv

load_dotenv()

def test_2captcha():
    api_key = os.environ.get('TWOCAPTCHA_API_KEY')
    print(f"Loaded API key: {api_key[:5]}...")
    
    solver = TwoCaptcha(api_key)
    sitekey = "0x4AAAAAAADnPIDROrmt1Wwj"
    url = "https://livebookmarking.com/submit"
    
    print("Testing solver.turnstile...")
    try:
        result = solver.turnstile(sitekey=sitekey, url=url)
        print(f"Turnstile success! Result: {result}")
    except Exception as e:
        print(f"Turnstile error: {e}")
        
    print("\nTesting solver.cloudflare...")
    try:
        # Some versions of 2captcha-python use cloudflare method
        result = solver.cloudflare(sitekey=sitekey, url=url)
        print(f"Cloudflare success! Result: {result}")
    except Exception as e:
        print(f"Cloudflare error: {e}")

if __name__ == "__main__":
    test_2captcha()
