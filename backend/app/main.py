from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api import scholarships, users, matches, saved, chat, reminders, auth

settings = get_settings()

app = FastAPI(
    title="ScholarshipRight API",
    description="AI-powered scholarship discovery platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scholarships.router, prefix="/api/scholarships", tags=["scholarships"])
app.include_router(users.router, prefix="/api/profile", tags=["profile"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(saved.router, prefix="/api/saved", tags=["saved"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"])


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "scholarshipright-api"}
