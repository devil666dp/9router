"""Bundle display-only registry metadata. No backend credentials or executable JS shipped."""
import json
import re
import sys
from pathlib import Path

TOKEN = re.compile(r'''//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[{}\[\]():,]|[^\s{}\[\]():,]+''', re.S)

def fields(source):
    tokens = [m.group() for m in TOKEN.finditer(source) if not m.group().startswith(('//', '/*'))]
    start = tokens.index('{')
    depth = 0
    result = {}
    i = start + 1
    while i < len(tokens):
        if tokens[i] == '}':
            break
        key = tokens[i].strip('\"\'')
        if i + 1 >= len(tokens) or tokens[i + 1] != ':':
            i += 1
            continue
        i += 2
        begin = i
        depth = 0
        while i < len(tokens):
            t = tokens[i]
            if depth == 0 and t in (',', '}'):
                break
            if t in ('{', '[', '('): depth += 1
            if t in ('}', ']', ')'): depth -= 1
            i += 1
        result[key] = ' '.join(tokens[begin:i])
        if i < len(tokens) and tokens[i] == ',': i += 1
    return result

def literal(value, default=None):
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        if value and value.startswith("'") and value.endswith("'"):
            return value[1:-1]
        return default

def entry(source):
    # Imports may contain braces: only parse the exported registry object.
    source = source.split('export default', 1)[1]
    f = fields(source)
    display = fields(f.get('display', '{}'))
    id_ = literal(f.get('id'))
    name = literal(display.get('name'))
    category = literal(f.get('category'))
    if not all(isinstance(v, str) and v for v in (id_, name, category)):
        raise ValueError('Registry entry must have literal id, display.name and category')
    if literal(f.get('hidden'), False): return None
    if 'llm' not in literal(f.get('serviceKinds'), ['llm']): return None
    auth = literal(f.get('authType'), '')
    native = (category == 'apikey' or auth == 'apikey') and not any(k in f for k in ('hasProviderSpecificData', 'regions', 'noAuth'))
    return dict(id=id_, name=name, category=category, nativeKey=native)

def main(root, output):
    registry = root / 'open-sse/providers/registry'
    imports = re.findall(r'^import\s+\w+\s+from\s+"\./([^"/]+\.js)";', (registry / 'index.js').read_text(), re.M)
    result = []
    for file in imports:
        try:
            item = entry((registry / file).read_text())
        except Exception as e:
            raise ValueError(f'{file}: {e}') from e
        if item: result.append(item)
    assert result and len({x['id'] for x in result}) == len(result), 'Empty/duplicate catalogue'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'providers': result}, indent=2) + '\n')
    print(f'Bundled {len(result)} public provider labels (no credentials).')

if __name__ == '__main__':
    main(Path(__file__).resolve().parents[2], Path(sys.argv[1]))
