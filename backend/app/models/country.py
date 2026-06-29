"""Canonical ISO 3166-1 alpha-2 country reference table.

This is a read-only reference table seeded once. Groups and scholarships
reference these codes — never free-text country names.
"""
from sqlalchemy import Column, String
from app.db.session import Base


class Country(Base):
    __tablename__ = "countries"

    code = Column(String(2), primary_key=True)       # ISO 3166-1 alpha-2
    name = Column(String, nullable=False)             # display name
    iso3 = Column(String(3), nullable=True)           # ISO 3166-1 alpha-3
