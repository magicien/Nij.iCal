import sys
from nijical import NijiCal
from settings import url_prefix

def main() -> int:
    talent_file = sys.argv[1]
    event_file = sys.argv[2]
    ticket_file = sys.argv[3]
    instance = NijiCal(talent_file, event_file, ticket_file, url_prefix)
    return instance.generate_all()

if __name__ == "__main__":
    sys.exit(main())
