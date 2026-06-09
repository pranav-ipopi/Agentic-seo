import os
import re

mapping = {
    'bg-gray-950': 'bg-gray-50 dark:bg-gray-950',
    'bg-gray-900': 'bg-white dark:bg-gray-900',
    'bg-gray-800': 'bg-gray-100 dark:bg-gray-800',
    'bg-gray-700': 'bg-gray-200 dark:bg-gray-700',
    'bg-gray-600': 'bg-gray-300 dark:bg-gray-600',
    'bg-gray-500': 'bg-gray-400 dark:bg-gray-500',
    
    'text-white': 'text-gray-900 dark:text-white',
    'text-gray-100': 'text-gray-900 dark:text-gray-100',
    'text-gray-200': 'text-gray-800 dark:text-gray-200',
    'text-gray-300': 'text-gray-700 dark:text-gray-300',
    'text-gray-400': 'text-gray-600 dark:text-gray-400',
    'text-gray-500': 'text-gray-500 dark:text-gray-500',
    'text-gray-600': 'text-gray-400 dark:text-gray-600',
    
    'border-gray-900': 'border-gray-200 dark:border-gray-900',
    'border-gray-800': 'border-gray-200 dark:border-gray-800',
    'border-gray-700': 'border-gray-300 dark:border-gray-700',
    'border-gray-600': 'border-gray-400 dark:border-gray-600',
}

def replace_classes(content):
    # Match classes, avoiding partial matches (e.g. text-white within something else)
    # This regex looks for boundaries, and avoiding matching when it's already part of 'dark:'
    # Actually, if we just do word boundaries \b, we might double replace if run multiple times, 
    # but we will only run it once.
    
    # Sort keys by length descending so we match bg-gray-950 before bg-gray-9
    for key in sorted(mapping.keys(), key=len, reverse=True):
        val = mapping[key]
        # Regex to match key but NOT if preceded by 'dark:' or 'hover:' or 'focus:'
        # Actually it's easier to just match standard class names. We should handle hover: and focus: too.
        # Let's match (\\b|hover:|focus:|^)key(\\b) and replace appropriately.
        
        # A simpler way: just split the class string inside className="..."
        pass
        
    return content

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        classes = match.group(1).split()
        new_classes = []
        for cls in classes:
            # Handle prefixes like hover:, focus:
            prefix = ""
            base_cls = cls
            if ":" in cls and not cls.startswith("dark:"):
                parts = cls.split(":")
                prefix = ":".join(parts[:-1]) + ":"
                base_cls = parts[-1]
            
            if base_cls in mapping:
                # the mapping val is like "bg-white dark:bg-gray-950"
                # If there's a prefix like hover:, it becomes "hover:bg-white dark:hover:bg-gray-950"
                mapped = mapping[base_cls].split()
                new_mapped = []
                for m in mapped:
                    if m.startswith("dark:"):
                        new_mapped.append(f"dark:{prefix}{m[5:]}")
                    else:
                        new_mapped.append(f"{prefix}{m}")
                new_classes.extend(new_mapped)
            else:
                new_classes.append(cls)
                
        # deduplicate while preserving order (hacky but works)
        seen = set()
        final_classes = []
        for c in new_classes:
            if c not in seen:
                final_classes.append(c)
                seen.add(c)
                
        return 'className="' + ' '.join(final_classes) + '"'

    # match className="something" or className={'something'}
    # just handling simple strings inside className for now
    # actually, cn(...) calls might be tricky. Let's just find any string literal containing these.
    
    # A generic regex for words might be safer?
    # No, matching all words in the file might replace things that aren't classes.
    # It's better to just regex replace the exact words.
    
    new_content = content
    for key in sorted(mapping.keys(), key=len, reverse=True):
        # We want to replace key with mapping[key].
        # To handle prefixes like hover:key -> hover:val1 dark:hover:val2
        # Let's write a regex that finds all instances of key, with optional prefixes.
        
        pattern = r'(?<![-a-zA-Z])((?:hover:|focus:|active:|md:|lg:|xl:|sm:|disabled:)*)(' + key + r')\b'
        
        def word_replacer(m):
            prefix = m.group(1)
            mapped_classes = mapping[key].split()
            result = []
            for mapped_class in mapped_classes:
                if mapped_class.startswith("dark:"):
                    result.append(f"dark:{prefix}{mapped_class[5:]}")
                else:
                    result.append(f"{prefix}{mapped_class}")
            return ' '.join(result)
            
        new_content = re.sub(pattern, word_replacer, new_content)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('.'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts') or file.endswith('.jsx') or file.endswith('.js'):
            if 'node_modules' not in root and '.next' not in root:
                process_file(os.path.join(root, file))
