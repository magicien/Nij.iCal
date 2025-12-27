import arrow
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import quote
from .talent import Talent
from .ticket import Ticket


class EventType(Enum):
    EVENT = 1
    BIRTHDAY = 2
    ANNIVERSARY = 3
    DEBUT = 4
    GRADUATION = 5
    TICKET_BEGIN = 6
    TICKET_END = 7
    UNKNOWN = 0

    @classmethod
    def _missing_(cls, value):
        return cls.UNKNOWN


@dataclass(frozen=True)
class Event:
    uid: str
    timestamp: arrow.Arrow
    begin: arrow.Arrow
    end: arrow.Arrow
    all_day: bool
    yearly: bool
    repeat_until: arrow.Arrow | None
    summary: str
    eng_summary: str
    location: str | None
    eng_location: str | None
    geo: str | None
    description: str
    eng_description: str
    url: str | None
    hashtag: str | None = None
    talents: list[Talent] = field(default_factory=list)
    tickets: list[Ticket] = field(default_factory=list)
    event_type: EventType = EventType.UNKNOWN

    def generate_ical(self, is_english: bool = False) -> str:
        datetime_format = "YYYYMMDDTHHmmss[Z]"
        date_format = "YYYYMMDD"

        result = self.param("BEGIN", "VEVENT")
        result += self.param("UID", self.uid)
        result += self.param(
            "DTSTAMP", self.timestamp.to("utc").format(datetime_format)
        )

        if self.all_day:
            result += self.param("DTSTART;VALUE=DATE", self.begin.format(date_format))
            if self.begin != self.end:
                result += self.param("DTEND;VALUE=DATE", self.end.format(date_format))
        else:
            result += self.param(
                "DTSTART", self.begin.to("utc").format(datetime_format)
            )
            result += self.param("DTEND", self.end.to("utc").format(datetime_format))

        if self.yearly:
            param = "FREQ=YEARLY"
            if self.repeat_until is not None:
                until = self.repeat_until.to("utc").format(datetime_format)
                param += f";UNTIL={until}"
            result += self.param("RRULE", param)

        result += self.param("TRANSP", "TRANSPARENT")

        if is_english:
            result += self.param("SUMMARY", self.eng_summary)

            if type(self.eng_location) is str:
                result += self.param("LOCATION", self.eng_location)

            if type(self.geo) is str:
                result += f'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE="{self.eng_location}":geo:{self.geo}\r\n'

            result += self.param(
                "DESCRIPTION",
                self.eng_description
                + self.generate_hashtag_description(is_english=True)
                + self.generate_ticket_description(is_english=True)
                + self.generate_talent_description(is_english=True),
            )

        else:
            result += self.param("SUMMARY", self.summary)

            if type(self.location) is str:
                result += self.param("LOCATION", self.location)

            if type(self.geo) is str:
                result += f'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-TITLE="{self.location}":geo:{self.geo}\r\n'

            result += self.param(
                "DESCRIPTION",
                self.description
                + self.generate_hashtag_description(is_english=False)
                + self.generate_ticket_description(is_english=False)
                + self.generate_talent_description(is_english=False),
            )

        if type(self.url) is str:
            result += self.param("URL", self.url)

        result += self.param("END", "VEVENT")

        return result

    def has_talent(self, target: Talent) -> bool:
        if any(talent.name == "にじさんじ" for talent in self.talents):
            if (
                type(target.graduation_date) is arrow.Arrow
                and target.graduation_date < self.begin
            ):
                # It won't include the event if it's later than their graduation
                pass
            elif self.begin > target.first_tweet_datetime:
                return True

        return any(True for talent in self.talents if talent.name == target.name)

    def param(self, name: str, value: str) -> str:
        value_text = value.replace("\n", "\\n")
        param = f"{name}:{value_text}"
        return f"{param}\r\n"

        # Line folding seems to not work in Google Calendar
        # encoding = "utf-8"
        # max_line_len = 75

        # text_data = param
        # byte_data = param.encode(encoding)
        # if len(byte_data) <= max_line_len:
        #     return f"{param}\r\n"

        # # fold param text
        # result = ""
        # while len(byte_data) > 0:
        #     this_line = byte_data[:max_line_len].decode(encoding, errors="ignore")
        #     next_line = text_data[len(this_line) :]

        #     # Avoid the next line from starting with a space
        #     while len(next_line) > 0 and next_line[0] == " ":
        #         next_line = this_line[-1] + next_line
        #         this_line = this_line[:-1]

        #     if result != "":
        #         result += " "

        #     result += f"{this_line}\r\n"
        #     text_data = next_line
        #     byte_data = next_line.encode(encoding)

        # return result

    def generate_hashtag_description(self, is_english: bool = False) -> str:
        if self.hashtag is None or (
            type(self.hashtag) is str and len(self.hashtag.strip()) == 0
        ):
            return ""

        hashtag_value = self.hashtag.strip()
        encoded_hashtag = quote(hashtag_value)

        if is_english:
            return f"\n\nHashtag: #{hashtag_value}\nhttps://x.com/search?q={encoded_hashtag}"
        else:
            return f"\n\nハッシュタグ：#{hashtag_value}\nhttps://x.com/search?q={encoded_hashtag}"

    def generate_ticket_description(self, is_english: bool) -> str:
        if len(self.tickets) <= 0:
            return ""

        result = ""
        if is_english:
            result = "\n\n==========\nTicket Info:\n\n"
        else:
            result = "\n\n==========\nチケット情報：\n\n"

        for ticket in self.tickets:
            ticket_date = ""
            if is_english:
                if type(ticket.begin) is arrow.Arrow:
                    # April 22, 2025, 12:00 PM
                    ticket_date += "from " + ticket.begin.format("MMM D, YYYY, H:mm")
                    if type(ticket.end) is arrow.Arrow:
                        ticket_date += " until " + ticket.end.format(
                            "MMM D, YYYY, H:mm"
                        )
                else:
                    ticket_date += "until " + ticket.end.format("MMM D, YYYY, H:mm")
            else:
                if type(ticket.begin) is arrow.Arrow:
                    ticket_date += ticket.begin.format("YYYY/M/D H:mm")

                ticket_date += "〜"
                if type(ticket.end) is arrow.Arrow:
                    ticket_date += ticket.end.format("YYYY/M/D H:mm")

            result += f"{ticket.eng_summary if is_english else ticket.summary} ({ticket_date})\n"
            if type(ticket.url) is str:
                result += f"{ticket.url}\n"
            result += "\n"

        return result

    def generate_talent_description(self, is_english: bool) -> str:
        if len(self.talents) <= 0:
            return ""

        result = "\n\n==========\n"

        for talent in self.talents:
            result += f"【{talent.eng_name if is_english else talent.name}】\n"
            result += f"YouTube: {talent.youtube_url}\n"
            if type(talent.twitter_url) is str:
                result += f"X: {talent.twitter_url}\n"
            result += "\n"

        return result
