#!/bin/bash

# Test script to generate tweet text for a specific date
# Usage: ./test_tweet_for_date.sh <date>
#   date format: YYYY/MM/DD (e.g., 2024/12/25)

if [ $# -eq 0 ]; then
    echo "Usage: $0 <date>"
    echo "  date format: YYYY/MM/DD (e.g., 2024/12/25)"
    exit 1
fi

DATE=$1

poetry run python tweet_todays_events.py docs/data/talents.csv docs/data/events.csv docs/data/tickets.csv "$DATE"
