import arrow
from dataclasses import dataclass, field
from .event import Event
from .talent import Talent


@dataclass
class Calendar:
    prod_id: str = "-//magicien//NONSGML Nij.iCal//JA"
    method: str = "PUBLISH"
    version: str = "2.0"
    events: list[Event] = field(default_factory=list)

    def add(self, event: Event) -> None:
        self.events.append(event)

    def generate_ical(
        self, name: str, is_english: bool = False, talent: Talent | None = None,
    ) -> str:
        result = "BEGIN:VCALENDAR\r\n"
        result += f"PRODID:{self.prod_id}\r\n"
        result += f"METHOD:{self.method}\r\n"
        result += f"VERSION:{self.version}\r\n"
        result += f"X-WR-CALNAME:{name}\r\n"
        result += "X-WR-TIMEZONE:Asia/Tokyo\r\n"

        events = self.events
        if talent is not None:
            events = filter(lambda ev: ev.has_talent(talent), self.events)

        for event in events:
            result += event.generate_ical(is_english)

        result += "END:VCALENDAR\r\n"

        return result
