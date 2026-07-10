"""Recall-oriented regex prefilter: which reviews are worth an LLM call?

A candidate review mentions BOTH
  (a) a duration/time expression, and
  (b) failure language OR longevity language.
Pure functions on strings — field mapping happens in the caller.
"""

import re

TIME = re.compile(
    r"""
    \b\d+(\.\d+)?\s*[- ]?\s*(day|week|month|year|yr)s?\b
    | \b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple\s+of|few)\s+
      (day|week|month|year|yr)s?\b
    | \bhalf\s+a\s+year\b
    | \b(day|week|month|year)\s*\#?\s*\d+\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

FAILURE = re.compile(
    r"""
    \b(stopp?ed|quit|died|dead|broke(n)?|failed|failure|fail(s|ing)?
    | defect(ive)?|malfunction\w*|leak(s|ed|ing)?|crack(ed|ing)?
    | burn(ed|t)?\s*(out|up)|rust(ed|ing)?|(no|not)\s+longer\s+work\w*
    | wore\s+out|worn\s+out|gave\s+out|(went|gone)\s+out|fell\s+apart
    | won'?t\s+(turn|power|start|heat|cool|spin|work)
    | doesn'?t\s+(work|heat|cool|spin|turn)\s*(on|anymore|any\s+more)?
    | out\s+of\s+(order|service)|junk(ed)?|garbage|lemon
    | replac(e|ed|ing|ement)|return(ed|ing)?|refund(ed)?|warranty)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

LONGEVITY = re.compile(
    r"""
    \b(still\s+(work(s|ing)?|going|running|strong|kicking|use|using)
    | (works?|going|running)\s+(great|fine|well|perfectly|strong)
    | no\s+(problems?|issues?)\s*(so\s+far|yet|at\s+all)?
    | (year|month)s?\s+(later|on|in|of\s+(daily\s+)?use)
    | so\s+far\s+so\s+good|holding\s+up|lasted?|has\s+lasted)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def is_candidate(text: str) -> bool:
    """True if this review text likely contains a survival observation."""
    if not text or len(text) < 20:
        return False
    return bool(TIME.search(text)) and bool(FAILURE.search(text) or LONGEVITY.search(text))
