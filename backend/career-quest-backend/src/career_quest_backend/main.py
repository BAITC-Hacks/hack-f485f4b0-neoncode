from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def main_page():
    pass

@app.get("/health")
async def check_api():
    return {"message": "API Works"}