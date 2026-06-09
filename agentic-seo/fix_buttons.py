import os
import re

def fix_buttons(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        cls_str = match.group(1)
        if 'bg-indigo-' in cls_str or 'from-indigo-' in cls_str or 'bg-blue-' in cls_str:
            # Revert text-gray-900 dark:text-white back to text-white
            cls_str = cls_str.replace('text-gray-900 dark:text-white', 'text-white')
        return 'className="' + cls_str + '"'

    new_content = re.sub(r'className="([^"]+)"', replacer, content)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed {filepath}")

for root, _, files in os.walk('.'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts') or file.endswith('.jsx') or file.endswith('.js'):
            if 'node_modules' not in root and '.next' not in root:
                fix_buttons(os.path.join(root, file))
