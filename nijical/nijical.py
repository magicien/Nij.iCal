import arrow
import pandas as pd
from .calendar import Calendar
from .event import Event
from .talent import Talent
from .ticket import Ticket


class NijiCal:
    talent_data_path: str
    event_data_path: str
    ticket_data_path: str

    def __init__(
        self, talent_data_path: str, event_data_path: str, ticket_data_path: str
    ) -> None:
        self.talent_data_path = talent_data_path
        self.event_data_path = event_data_path
        self.ticket_data_path = ticket_data_path

    def generate_all(self) -> int:
        talents = self.fetch_talents()
        tickets = self.fetch_tickets()
        live_events = self.fetch_events(talents, tickets)
        talent_events = self.generate_talent_events(talents)
        talent_events.append(self.generate_nijisanji_day_event(talents))

        # generate live event calendar
        live_calendar = Calendar(events=live_events)
        data = live_calendar.generate_ical(name="にじさんじイベント", is_english=False)
        with open("docs/ja/events.ics", mode="w", encoding="utf_8") as file:
            file.write(data)

        data = live_calendar.generate_ical(name="Nijisanji Events", is_english=True)
        with open("docs/en/events.ics", mode="w", encoding="utf_8") as file:
            file.write(data)

        # generate birthday & anniversary calendar
        birthday_calendar = Calendar(events=talent_events)
        data = birthday_calendar.generate_ical(
            name="にじさんじ誕生日", is_english=False
        )
        with open("docs/ja/birthdays.ics", mode="w", encoding="utf_8") as file:
            file.write(data)

        data = birthday_calendar.generate_ical(
            name="Nijisanji Birthdays", is_english=True
        )
        with open("docs/en/birthdays.ics", mode="w", encoding="utf_8") as file:
            file.write(data)

        # generate talent individual calendars
        all_calendar = Calendar(events=live_events + talent_events)
        for talent in talents.values():
            if talent.name == "にじさんじ":
                continue

            file_name = talent.eng_name.lower().replace(" ", "_") + ".ics"

            data = all_calendar.generate_ical(
                name=talent.name, is_english=False, talent=talent.name
            )
            with open(f"docs/ja/{file_name}", mode="w", encoding="utf_8") as file:
                file.write(data)

            data = all_calendar.generate_ical(
                name=talent.eng_name, is_english=True, talent=talent.name
            )
            with open(f"docs/en/{file_name}", mode="w", encoding="utf_8") as file:
                file.write(data)

        # generate calender list for GitHub Pages
        sorted_talents = sorted(
            talents.values(), key=lambda talent: talent.first_tweet_datetime
        )
        with open("docs/ja/calendars.md", mode="w", encoding="utf_8_sig") as ja_file:
            with open(
                "docs/en/calendars.md", mode="w", encoding="utf_8_sig"
            ) as en_file:
                url_prefix = "webcal://magicien.github.io/Nij.iCal"

                ja_file.write(
                    "<form action='#' class='search-form' onsubmit='return false;'><input id='liver-filter-input' placeholder='検索'/></form>\n"
                )
                en_file.write(
                    "<form action='#' class='search-form' onsubmit='return false;'><input id='liver-filter-input' placeholder='Search' /></form>\n"
                )

                ja_file.write(
                    "<div class='calendar-list-container'>"
                    + "<table><thead><tr><th>名前</th><th>日本語</th><th>英語</th></tr></thead><tbody>\n"
                )
                en_file.write(
                    "<div class='calendar-list-container'>"
                    + "<table><thead><tr><th>Name</th><th>English</th><th>Japanese</th></tr></thead><tbody>\n"
                )

                for talent in sorted_talents:
                    if talent.name == "にじさんじ":
                        continue

                    file_name = talent.eng_name.lower().replace(" ", "_") + ".ics"
                    ja_url = f"{url_prefix}/ja/{file_name}"
                    en_url = f"{url_prefix}/en/{file_name}"
                    row = f"<tr class='liver-item' tags='{talent.name},{talent.eng_name.lower()},{talent.furigana}'>"
                    ja_file.write(
                        row
                        + f"<td>{talent.name}</td>"
                        + f"<td><a href='{ja_url}'>日本語</a></td>"
                        + f"<td><a href='{en_url}'>英語</a></td>"
                        + "</tr>\n"
                    )
                    en_file.write(
                        row
                        + f"<td>{talent.eng_name}</td>"
                        + f"<td><a href='{en_url}'>English</a></td>"
                        + f"<td><a href='{ja_url}'>Japanese</a></td>"
                        + "</tr>\n"
                    )

                ja_file.write("</tbody></table></div>\n")
                en_file.write("</tbody></table></div>\n")

        return 0

    def fetch_talents(self) -> dict[str, Talent]:
        data = pd.read_csv(self.talent_data_path, encoding="utf_8_sig")
        tzinfo = "+09:00"

        talents: dict[str, Talent] = {}
        for row in data.itertuples():
            timestamp = arrow.get(row[3], "YYYY/MM/DD HH:mm:ss", tzinfo=tzinfo)
            first_tweet_datetime = arrow.get(row[9], "YYYY/MM/DD HH:mm", tzinfo=tzinfo)
            first_stream_datetime = arrow.get(
                row[10], "YYYY/MM/DD HH:mm", tzinfo=tzinfo
            )

            birthday: arrow.Arrow | None = None
            if type(row[6]) is str:
                if row[6] == "2/29":
                    birthday = arrow.get(2020, 2, 29, tzinfo=tzinfo)
                else:
                    birthday = arrow.get(row[6], "M/D", tzinfo=tzinfo)
                    birthday = arrow.get(
                        first_tweet_datetime.year,
                        birthday.month,
                        birthday.day,
                        tzinfo=tzinfo,
                    )

                    # Adjust the first birthday to make it after the first tweet date
                    if birthday < first_tweet_datetime:
                        birthday = birthday.shift(years=1)

            graduation_date: arrow.Arrow | None = None
            if type(row[15]) is str:
                graduation_date = arrow.get(row[15], "YYYY/MM/DD", tzinfo=tzinfo)

            talent = Talent(
                uid=row[2],
                name=row[1],
                eng_name=row[4],
                furigana=row[5],
                birthday=birthday,
                birthday_label=row[7],
                eng_birthday_label=row[8],
                first_tweet_datetime=first_tweet_datetime,
                first_stream_datetime=first_stream_datetime,
                youtube_url=row[11],
                twitter_url=row[12],
                description=row[13],
                eng_description=row[14],
                graduation_date=graduation_date,
                timestamp=timestamp,
            )
            talents[talent.name] = talent

        return talents

    def fetch_events(
        self, talents: dict[str, Talent], tickets: dict[str, list[Ticket]]
    ) -> list[Event]:
        data = pd.read_csv(self.event_data_path, encoding="utf_8_sig")
        tzinfo = "+09:00"

        events: list[Event] = []
        for row in data.itertuples():
            uid = row[2]
            timestamp = arrow.get(row[3], "YYYY/MM/DD HH:mm:ss", tzinfo=tzinfo)
            begin = arrow.get(row[5], "YYYY/MM/DD HH:mm", tzinfo=tzinfo)
            end = arrow.get(row[6], "YYYY/MM/DD HH:mm", tzinfo=tzinfo)
            talent_names = list(name.strip() for name in row[13].split(","))

            event_talents: list[Talent] = []
            for talent_name in talent_names:
                event_talents.append(talents[talent_name])

            event_tickets: list[Ticket] = []
            if uid in tickets:
                event_tickets = tickets[uid]

            event = Event(
                uid=uid,
                timestamp=timestamp,
                begin=begin,
                end=end,
                all_day=False,
                yearly=False,
                repeat_until=None,
                summary=row[1],
                eng_summary=row[4],
                location=row[7],
                eng_location=row[8],
                geo=row[9],
                description=row[10],
                eng_description=row[11],
                url=row[12],
                talents=event_talents,
                tickets=event_tickets,
            )
            events.append(event)

            for ticket in event_tickets:
                events += self.generate_ticket_events(event, ticket)

        return events

    def generate_ticket_events(self, event: Event, ticket: Ticket) -> list[Event]:
        ticket_events: list[Event] = []

        description = ""
        eng_description = ""
        if type(ticket.url) is str:
            description += f"チケット:\n{ticket.url}\n\n"
            eng_description += f"Ticket:\n{ticket.url}\n\n"
        description += f"イベント:\n{event.url}\n"
        eng_description += f"Event:\n{event.url}\n"

        if type(ticket.begin) is arrow.Arrow:
            uid = ticket.uid[:-1] + "1"
            summary = f"[チケット]{event.summary}: {ticket.summary} 開始"
            eng_summary = f"[Ticket]{event.eng_summary}: {ticket.eng_summary} starts"

            begin_event = Event(
                uid=uid,
                timestamp=ticket.timestamp,
                begin=ticket.begin,
                end=ticket.begin.shift(minutes=30),
                all_day=False,
                yearly=False,
                repeat_until=None,
                summary=summary,
                eng_summary=eng_summary,
                location=None,
                eng_location=None,
                geo=None,
                description=description,
                eng_description=eng_description,
                url=ticket.url,
                talents=event.talents,
                tickets=[],
            )
            ticket_events.append(begin_event)

        if type(ticket.end) is arrow.Arrow:
            uid = ticket.uid[:-1] + "2"
            summary = f"[チケット]{event.summary}: {ticket.summary} 終了"
            eng_summary = f"[Ticket]{event.eng_summary}: {ticket.eng_summary} ends"

            end_event = Event(
                uid=uid,
                timestamp=ticket.timestamp,
                begin=ticket.end,
                end=ticket.end.shift(minutes=30),
                all_day=False,
                yearly=False,
                repeat_until=None,
                summary=summary,
                eng_summary=eng_summary,
                location=None,
                eng_location=None,
                geo=None,
                description=description,
                eng_description=eng_description,
                url=ticket.url,
                talents=event.talents,
                tickets=[],
            )
            ticket_events.append(end_event)

        return ticket_events

    def fetch_tickets(self) -> dict[str, list[Ticket]]:
        data = pd.read_csv(self.ticket_data_path, encoding="utf_8_sig")
        tzinfo = "+09:00"

        tickets: dict[str, list[Talent]] = {}
        for row in data.itertuples():
            event_uid = row[5]
            timestamp = arrow.get(row[3], "YYYY/MM/DD HH:mm:ss", tzinfo=tzinfo)

            begin: arrow.Arrow | None = None
            if type(row[7]) is str:
                begin = arrow.get(row[7], "YYYY/MM/DD HH:mm", tzinfo=tzinfo)

            end: arrow.Arrow | None = None
            if type(row[8]) is str:
                end = arrow.get(row[8], "YYYY/MM/DD HH:mm", tzinfo=tzinfo)

            if begin is None and end is None:
                continue

            ticket = Ticket(
                uid=row[2],
                timestamp=timestamp,
                event_uid=event_uid,
                begin=begin,
                end=end,
                summary=row[1],
                eng_summary=row[4],
                url=row[9],
            )

            if event_uid not in tickets:
                tickets[event_uid] = []

            tickets[event_uid].append(ticket)

        return tickets

    def generate_talent_events(self, talents) -> list[Event]:
        events: list[Event] = []

        for talent in talents.values():
            if talent.name == "にじさんじ":
                continue

            birthday_event = self.generate_birthday_event(talent)
            if birthday_event is not None:
                events.append(birthday_event)
            events += self.generate_anniversary_events(talent)

            graduation_event = self.generate_graduation_event(talent)
            if graduation_event is not None:
                events.append(graduation_event)

        return events

    def generate_birthday_event(self, talent: Talent) -> Event:
        if talent.birthday is None:
            return

        uid = talent.uid[:-6] + "01" + talent.birthday.format("YYYY")

        label = (
            talent.birthday_label if type(talent.birthday_label) is str else "誕生日"
        )
        title = f"{talent.name} {label}"
        eng_label = (
            talent.eng_birthday_label
            if type(talent.eng_birthday_label) is str
            else "Birthday"
        )
        eng_title = f"{talent.eng_name} {eng_label}"
        # repeat_until = talent.graduation_date if talent.graduation_date is not None else None
        repeat_until = None  # This shows graduated livers' birthdays

        return Event(
            uid=uid,
            timestamp=talent.timestamp,
            begin=talent.birthday,
            end=talent.birthday.shift(days=1),
            all_day=True,
            yearly=True,
            repeat_until=repeat_until,
            summary=title,
            eng_summary=eng_title,
            location=None,
            eng_location=None,
            geo=None,
            description=title,
            eng_description=eng_title,
            url=talent.youtube_url,
            talents=[talent],
        )

    def generate_anniversary_events(self, talent: Talent) -> list[Event]:
        events: list[Event] = []

        # debut: first tweet
        uid = (
            talent.uid[:-6]
            + "02"
            + talent.first_tweet_datetime.to("utc").format("YYYY")
        )
        title = f"{talent.name} 活動開始"
        eng_title = f"{talent.eng_name} Debut"

        events.append(
            Event(
                uid=uid,
                timestamp=talent.timestamp,
                begin=talent.first_tweet_datetime,
                end=talent.first_tweet_datetime.shift(minutes=30),
                all_day=False,
                yearly=False,
                repeat_until=None,
                summary=title,
                eng_summary=eng_title,
                location=None,
                eng_location=None,
                geo=None,
                description=title,
                eng_description=eng_title,
                url=talent.youtube_url,
                talents=[talent],
            )
        )

        # debut stream
        uid = (
            talent.uid[:-6]
            + "03"
            + talent.first_stream_datetime.to("utc").format("YYYY")
        )
        title = f"{talent.name} 初配信"
        eng_title = f"{talent.eng_name} Debut stream"

        events.append(
            Event(
                uid=uid,
                timestamp=talent.timestamp,
                begin=talent.first_stream_datetime,
                end=talent.first_stream_datetime.shift(minutes=30),
                all_day=False,
                yearly=False,
                repeat_until=None,
                summary=title,
                eng_summary=eng_title,
                location=None,
                eng_location=None,
                geo=None,
                description=title,
                eng_description=eng_title,
                url=talent.youtube_url,
                talents=[talent],
            )
        )

        # anniversaries
        event_date = talent.first_tweet_datetime.to("utc").shift(years=1)
        start_year = event_date.year
        end_year = arrow.utcnow().year + 10  # generate events until 10 years later
        if talent.graduation_date is not None:
            end_year = talent.graduation_date.year
            end_date = arrow.get(
                end_year, event_date.month, event_date.day, tzinfo="utc"
            )
            if talent.graduation_date < end_date:
                end_year -= 1

        first_tweet = talent.first_tweet_datetime.format("YYYY/MM/DD HH:mm")
        first_stream = talent.first_stream_datetime.format("YYYY/MM/DD HH:mm")
        description_append = (
            f"初ツイート：{first_tweet} （日本時間）\n"
            + f"初配信：{first_stream} （日本時間）\n"
        )

        eng_first_tweet = talent.first_tweet_datetime.format("MMM D, YYYY, H:mm")
        eng_first_stream = talent.first_stream_datetime.format("MMM D, YYYY, H:mm")
        eng_description_append = (
            f"First tweet: {eng_first_tweet} (JST)\n"
            + f"First stream: {eng_first_stream} (JST)\n"
        )

        debut_year = start_year - 1
        for year in range(start_year, end_year + 1):
            uid = talent.uid[:-6] + f"02{year}"
            years = year - debut_year
            title = f"{talent.name} {years}周年"
            description = f"{title}\n\n{description_append}"
            eng_title = f"{talent.eng_name} {self.generate_ordinal(years)} Anniversary"
            eng_description = f"{eng_title}\n\n{eng_description_append}"

            events.append(
                Event(
                    uid=uid,
                    timestamp=talent.timestamp,
                    begin=event_date,
                    end=event_date.shift(seconds=1),
                    all_day=False,
                    yearly=False,
                    repeat_until=None,
                    summary=title,
                    eng_summary=eng_title,
                    location=None,
                    eng_location=None,
                    geo=None,
                    description=description,
                    eng_description=eng_description,
                    url=talent.youtube_url,
                    talents=[talent],
                )
            )

            event_date = event_date.shift(years=1)

        return events

    def generate_graduation_event(self, talent: Talent) -> Event | None:
        if talent.graduation_date is None:
            return None

        uid = talent.uid[:-6] + "99" + talent.graduation_date.format("YYYY")
        title = f"{talent.name} 卒業"
        eng_title = f"{talent.eng_name} Graduation"

        return Event(
            uid=uid,
            timestamp=talent.timestamp,
            begin=talent.graduation_date,
            end=talent.graduation_date.shift(days=1),
            all_day=True,
            yearly=False,
            repeat_until=None,
            summary=title,
            eng_summary=eng_title,
            location=None,
            eng_location=None,
            geo=None,
            description=title,
            eng_description=eng_title,
            url=talent.youtube_url,
            talents=[talent],
        )

    def generate_nijisanji_day_event(self, talents: list[Talent]) -> Event:
        nijisanji = talents["にじさんじ"]
        uid = nijisanji.uid[:-6] + "012019"
        title = "にじさんじの日"
        eng_title = "Nijisanji Day"

        return Event(
            uid=uid,
            timestamp=nijisanji.timestamp,
            begin=arrow.get(2019, 2, 3),
            end=arrow.get(2019, 2, 3),
            all_day=True,
            yearly=True,
            repeat_until=None,
            summary=title,
            eng_summary=eng_title,
            location=None,
            eng_location=None,
            geo=None,
            description=title,
            eng_description=eng_title,
            url=nijisanji.youtube_url,
            talents=[nijisanji],
        )

    def generate_ordinal(self, num: int) -> str:
        ordinals = {1: "st", 2: "nd", 3: "rd"}
        q, mod = divmod(num, 10)
        suffix = q % 10 != 1 and ordinals.get(mod) or "th"
        return f"{num}{suffix}"

    def generate_tweet_for_date(self, date: arrow.Arrow) -> (str, str):
        talents = self.fetch_talents()
        tickets = self.fetch_tickets()
        live_events = self.fetch_events(talents, tickets)
        talent_events = self.generate_talent_events(talents)
        talent_events.append(self.generate_nijisanji_day_event(talents))

        live_events_of_day = self.filter_event_for_date(live_events, date)
        talent_events_of_day = self.filter_event_for_date(talent_events, date)

        sorted_live_events = sorted(live_events_of_day, key=lambda ev: ev.begin)
        sorted_talent_events = sorted(talent_events_of_day, key=lambda ev: ev.begin)

        ja_text = ""
        en_text = ""
        for ev in sorted_live_events:
            duration = ev.end - ev.begin
            if not ev.all_day and duration.days < 1 and ev.begin.day == date.day:
                ja_text += f"{ev.begin.format('HH:mm')} {ev.summary}\n"
                en_text += f"{ev.begin.format('HH:mm')} JST {ev.eng_summary}\n"
            else:
                ja_text += f"{ev.summary}\n"
                en_text += f"{ev.eng_summary}\n"

            if type(ev.url) is str:
                ja_text += f"{ev.url}\n"
                en_text += f"{ev.url}\n"
            ja_text += "\n"
            en_text += "\n"

        for ev in sorted_talent_events:
            ja_text += f"{ev.summary}\n"
            en_text += f"{ev.eng_summary}\n"
            if type(ev.url) is str:
                ja_text += f"{ev.url}\n"
                en_text += f"{ev.url}\n"
            ja_text += "\n"
            en_text += "\n"

        return (ja_text, en_text)

    def filter_event_for_date(
        self, events: list[Event], date: arrow.Arrow
    ) -> list[Event]:
        return filter(lambda ev: self.check_event_date(ev, date), events)

    def check_event_date(self, event: Event, date: arrow.Arrow) -> bool:
        tzinfo = "+09:00"
        date_begin = arrow.get(date.year, date.month, date.day, 0, 0, 0, tzinfo=tzinfo)
        date_end = arrow.get(date.year, date.month, date.day, 23, 59, 59, tzinfo=tzinfo)

        if date_begin.shift(days=1) < event.begin:
            return False

        if not event.all_day:
            intersect_begin = max(event.begin, date_begin)
            intersect_end = min(event.end, date_end)
            return intersect_begin < intersect_end

        if not event.yearly:
            if event.begin.year != date.year:
                return False

        if type(event.repeat_until) is arrow.Arrow:
            if event.repeat_until < date:
                return False

        return event.begin.month == date.month and event.begin.day == date.day
