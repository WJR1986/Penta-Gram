from wordfreq import top_n_list

# get the top N English words (you can change 50000 to 80000 etc)
words = top_n_list("en", 50000)

five_letter = []

for w in words:
    w = w.lower()
    if len(w) == 5 and w.isalpha():
        five_letter.append(w)

# remove obvious duplicates while preserving order
seen = set()
clean = []
for w in five_letter:
    if w not in seen:
        seen.add(w)
        clean.append(w)

print(f"Total 5-letter words: {len(clean)}")

# Write to JSON
import json
with open("allowed-guesses.json", "w", encoding="utf-8") as f:
    json.dump(clean, f, ensure_ascii=False, indent=2)
