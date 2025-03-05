import arrow
from dataclasses import dataclass


@dataclass(frozen=True)
class Talent:
    uid: str
    name: str
    eng_name: str
    birthday: arrow.Arrow | None
    birthday_label: str | None
    eng_birthday_label: str | None
    first_tweet_datetime: arrow.Arrow
    first_stream_datetime: arrow.Arrow
    youtube_url: str
    twitter_url: str | None
    description: str
    eng_description: str
    graduation_date: arrow.Arrow | None
    timestamp: arrow.Arrow
