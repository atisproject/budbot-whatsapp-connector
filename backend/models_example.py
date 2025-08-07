"""
Example Models for BudBot WhatsApp Connector v5.0 Integration
Compatible with PostgreSQL schema
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from flask_sqlalchemy import SQLAlchemy
import pytz

# Timezone configuration
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

# Example model definitions (add to your existing models.py)

class Lead(db.Model):
    """Modelo de lead/cliente"""
    __tablename__ = 'leads'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=False)
    email = Column(String(120), nullable=True)
    status = Column(String(20), default='novo', nullable=False)  # novo, contato, interessado, proposta, fechado, perdido
    notes = Column(Text, nullable=True)
    assigned_to = Column(Integer, ForeignKey('users.id'), nullable=True)
    last_contact = Column(DateTime, nullable=True)  # Add this field for WhatsApp integration
    created_at = Column(DateTime, default=lambda: datetime.now(BRAZIL_TZ))
    updated_at = Column(DateTime, default=lambda: datetime.now(BRAZIL_TZ), onupdate=lambda: datetime.now(BRAZIL_TZ))
    
    # Relacionamentos
    messages = relationship('Message', backref='lead', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Lead {self.name} ({self.phone})>'

class Message(db.Model):
    """Modelo de mensagem - COMPATIBLE WITH POSTGRESQL"""
    __tablename__ = 'messages'
    
    id = Column(Integer, primary_key=True)
    lead_id = Column(Integer, ForeignKey('leads.id'), nullable=False)
    sender = Column(String(255), nullable=True)  # Nome de quem enviou
    content = Column(Text, nullable=False)  # Conteúdo da mensagem
    message_type = Column(String(50), nullable=True)  # text, image, document, etc.
    is_read = Column(Boolean, default=False, nullable=True)  # Mensagem foi lida?
    
    # IMPORTANT: Only use created_at, NOT timestamp
    # The PostgreSQL database doesn't have a 'timestamp' column
    created_at = Column(DateTime, default=lambda: datetime.now(BRAZIL_TZ))
    
    def __repr__(self):
        direction = "from" if self.sender else "to"
        lead_info = f"Lead {self.lead_id}" if self.lead_id else "Unknown Lead"
        content_preview = self.content[:50] if self.content else "No content"
        return f'<Message {direction} {lead_info}: {content_preview}...>'

class User(db.Model):
    """Modelo de usuário do sistema"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    nome = Column(String(100), nullable=False)  # Note: 'nome' not 'name'
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default='user', nullable=False)  # admin, user
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(BRAZIL_TZ))
    last_login = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f'<User {self.nome} ({self.email})>'

# Database extensions setup (add to your extensions.py)
"""
# backend/extensions.py
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
"""