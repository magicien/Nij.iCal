import arrow
from dataclasses import dataclass


@dataclass(frozen=True)
class Ticket:
    uid: str
    timestamp: arrow.Arrow
    event_uid: str
    begin: arrow.Arrow | None
    end: arrow.Arrow | None
    summary: str
    eng_summary: str
    url: str | None
