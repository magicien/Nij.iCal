import arrow
from dataclasses import dataclass, field
from .talent import Talent


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
    description: str
    eng_description: str
    url: str | None
    talents: list[Talent] = field(default_factory=list)

    def generate_ical(self, is_english: bool = False) -> str:
        datetime_format = "YYYYMMDDTHHmmss[Z]"
        date_format = "YYYYMMDD"

        result = self.param("BEGIN", "VEVENT")
        result += self.param("UID", self.uid)
        result += self.param(
            "DTSTAMP", self.timestamp.to("utc").format(datetime_format)
        )

        if self.all_day:
            result += self.param("DTSTART", self.begin.format(date_format))
            result += self.param("DTEND", self.end.format(date_format))
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

            if self.eng_location is not None:
                result += self.param("LOCATION", self.eng_location)

            result += self.param(
                "DESCRIPTION",
                self.eng_description
                + self.generate_talent_description(is_english=True),
            )

        else:
            result += self.param("SUMMARY", self.summary)

            if self.location is not None:
                result += self.param("LOCATION", self.location)

            result += self.param(
                "DESCRIPTION",
                self.description + self.generate_talent_description(is_english=False),
            )

        if self.url is not None:
            result += self.param("URL", self.url)

        result += self.param("END", "VEVENT")

        return result

    def has_talent(self, name: str) -> bool:
        return any(
            True
            for talent in self.talents
            if talent.name == name or talent.name == "にじさんじ"
        )

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

    def generate_talent_description(self, is_english: bool) -> str:
        result = "\n\n==========\n"

        for talent in self.talents:
            result += f"【{talent.eng_name if is_english else talent.name}】\n"
            result += f"YouTube: {talent.youtube_url}\n"
            if talent.twitter_url is not None:
                result += f"X: {talent.twitter_url}\n"
            result += "\n"

        return result
