"""Contiguous source quotes; no fuzzy matching, omissions or paraphrases."""
import re
import unicodedata

def resolve_evidence_quote(source: str, excerpt: str) -> str | None:
    if not excerpt:
        return None
    if excerpt in source:
        return excerpt
    wanted=unicodedata.normalize('NFC',excerpt.strip()).split()
    tokens=list(re.finditer(r'\S+',source))
    if not wanted:
        return None
    for start in range(len(tokens)-len(wanted)+1):
        if all(unicodedata.normalize('NFC',tokens[start+index].group())==word for index,word in enumerate(wanted)):
            return source[tokens[start].start():tokens[start+len(wanted)-1].end()]
    return None
