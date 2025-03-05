import csv

with open("events.csv") as f:
    reader = csv.reader(f)
    for row in reader:
        print(row[5])
