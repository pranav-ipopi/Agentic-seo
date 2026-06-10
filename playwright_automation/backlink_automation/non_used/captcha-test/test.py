# https://github.com/2captcha/2captcha-python

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))

from twocaptcha import TwoCaptcha

api_key = '20205071fed24f4c1418d43380555585'

solver = TwoCaptcha(api_key)

try:
  result = solver.normal('./captcha.png')

except Exception as e:
  sys.exit(e)

else:
  sys.exit('solved: ' + str(result))