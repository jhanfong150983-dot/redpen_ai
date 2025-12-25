from pathlib import Path
text = Path('src/lib/gemini.ts').read_text()
start = text.index('export async function gradeSubmission(')
end = text.index('\n/**\n * 批改多份作業', start)
print('start', start)
print('end', end)
fx = text[start:start+40]
print('snippet', repr(fx))
