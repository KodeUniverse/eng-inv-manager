from pathlib import Path

import pandas as pd

raw_data = pd.read_csv(Path(__file__).parent / "data" / "data.csv", encoding="ISO-8859-1")

print(raw_data.describe(include="all"))
