from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return [
        {"path": route.path, "name": route.name, "methods": sorted(route.methods)}
        for route in app.routes
        if hasattr(route, "methods")
    ]

@app.get("/health")
def health():
    return "Healthy!"


